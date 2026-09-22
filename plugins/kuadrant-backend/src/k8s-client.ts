import * as k8s from '@kubernetes/client-node';
import { RootConfigService } from '@backstage/backend-plugin-api';
import * as http from 'http';
import * as https from 'https';
import {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
} from 'http';

const MCP_PROXY_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_MCP_REQUEST_BYTES = 1024 * 1024;
const MCP_AUTHORIZATION_HEADER = 'x-kuadrant-mcp-authorization';
const MCP_ALLOWED_ORIGINS_CONFIG = 'backend.mcpProxy.allowedOrigins';
const MCP_ALLOW_INSECURE_AUTH_CONFIG = 'backend.mcpProxy.allowInsecureAuth';

export interface MCPProxyResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: IncomingMessage;
}

export class MCPProxyError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'MCPProxyError';
  }
}

export interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    [key: string]: any;
  };
  spec?: any;
  status?: any;
  data?: any;
  stringData?: any;
  [key: string]: any;
}

export interface K8sList {
  items: K8sResource[];
}

// one field:message pair from a validation failure, e.g.
// { field: 'spec.planTier', message: 'Unsupported value: "platinum"' }
export interface K8sStatusCause {
  field?: string;
  message?: string;
}

// the api server's Status.details. kind is what tells "no such object of a kind
// i know" apart from "no such kind", causes carry per-field validation
// feedback, and retryAfterSeconds comes back with a throttled request.
export interface K8sStatusDetails {
  kind?: string;
  name?: string;
  group?: string;
  causes?: K8sStatusCause[];
  retryAfterSeconds?: number;
}

/**
 * a kubernetes api failure, carrying the status the api server returned.
 *
 * the status is what tells a permission problem apart from a real fault, so it
 * has to survive the client: without it the router can only answer 500, and a
 * missing rbac rule reads as "server error" in the ui.
 *
 * reason and details survive alongside it because the status alone is
 * ambiguous: a 404 is either a missing object or a missing crd, and only
 * details tells them apart.
 */
export class K8sApiError extends Error {
  readonly statusCode?: number;
  readonly reason?: string;
  readonly details?: K8sStatusDetails;

  constructor(
    message: string,
    statusCode?: number,
    reason?: string,
    details?: K8sStatusDetails,
  ) {
    super(message);
    this.name = 'K8sApiError';
    this.statusCode = statusCode;
    this.reason = reason;
    this.details = details;
  }
}

// @kubernetes/client-node puts the status on error.response, older shapes carry
// it on the error itself, and the body holds the api server's own message.
function k8sApiError(operation: string, error: any): K8sApiError {
  const statusCode =
    error?.response?.statusCode ?? error?.statusCode ?? error?.body?.code;
  const body = error?.response?.body ?? error?.body;
  const message = body?.message ?? error?.message;
  const reason = body?.reason;
  const details = body?.details;

  return new K8sApiError(
    `failed to ${operation}: ${message}${reason ? ` (${reason})` : ''}`,
    typeof statusCode === 'number' ? statusCode : undefined,
    typeof reason === 'string' ? reason : undefined,
    details && typeof details === 'object' ? (details as K8sStatusDetails) : undefined,
  );
}

export interface MCPGatewayListener {
  name: string;
  hostname?: string;
  protocol: string;
  port: number;
}

export class KuadrantK8sClient {
  private kc: k8s.KubeConfig;
  private customApi: k8s.CustomObjectsApi;
  private coreApi: k8s.CoreV1Api;
  private readonly mcpAllowedOrigins: Set<string>;
  private readonly allowInsecureMCPAuth: boolean;

  constructor(config: RootConfigService) {
    this.mcpAllowedOrigins = new Set(
      (config.getOptionalStringArray(MCP_ALLOWED_ORIGINS_CONFIG) || []).map(
        normalizeMCPOrigin,
      ),
    );
    this.allowInsecureMCPAuth =
      config.getOptionalBoolean(MCP_ALLOW_INSECURE_AUTH_CONFIG) || false;
    this.kc = new k8s.KubeConfig();

    const hasK8sConfig = config.has('kubernetes');

    if (hasK8sConfig) {
      const clusterLocatorMethods = config.getOptionalConfigArray('kubernetes.clusterLocatorMethods') || [];

      // look for type: config with explicit cluster configuration
      const configLocator = clusterLocatorMethods.find(c => c.getString('type') === 'config');

      if (configLocator) {
        const clusters = configLocator.getOptionalConfigArray('clusters') || [];

        if (clusters.length > 0) {
          // use the first cluster config
          const clusterConfig = clusters[0];
          const clusterName = clusterConfig.getString('name');
          const clusterUrl = clusterConfig.getString('url');
          const authProvider = clusterConfig.getOptionalString('authProvider');
          const skipTLSVerify = clusterConfig.getOptionalBoolean('skipTLSVerify') || false;

          if (authProvider === 'serviceAccount') {
            const serviceAccountToken = clusterConfig.getString('serviceAccountToken');

            // configure kubeconfig manually with service account
            const cluster = {
              name: clusterName,
              server: clusterUrl,
              skipTLSVerify: skipTLSVerify,
            };

            const user = {
              name: `${clusterName}-service-account`,
              token: serviceAccountToken,
            };

            const context = {
              name: `${clusterName}-context`,
              cluster: clusterName,
              user: user.name,
            };

            this.kc.loadFromOptions({
              clusters: [cluster],
              users: [user],
              contexts: [context],
              currentContext: context.name,
            });

            console.log(`k8s client initialised with explicit cluster config`);
            console.log(`  cluster: ${clusterName}`);
            console.log(`  url: ${clusterUrl}`);
            console.log(`  auth: serviceAccount`);
            console.log(`  skipTLSVerify: ${skipTLSVerify}`);
          } else {
            // unsupported auth provider, fall back to default
            console.log(`unsupported authProvider: ${authProvider}, falling back to default`);
            this.kc.loadFromDefault();
          }
        } else {
          // no clusters defined, fall back to default
          this.kc.loadFromDefault();
          this.logDefaultConfig('no clusters defined');
        }
      } else {
        // no type: config locator, fall back to default
        this.kc.loadFromDefault();
        this.logDefaultConfig('no config locator found');
      }
    } else {
      // no kubernetes config, use default (in-cluster or local kubeconfig)
      this.kc.loadFromDefault();
      this.logDefaultConfig('no kubernetes config in app-config.yaml');
    }

    this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  private logDefaultConfig(reason: string): void {
    console.log(`k8s client initialised using default config (${reason})`);

    // determine if running in-cluster or using local kubeconfig
    const inClusterToken = process.env.KUBERNETES_SERVICE_HOST;

    if (inClusterToken) {
      console.log('  auth: in-cluster service account');
      console.log('  location: /var/run/secrets/kubernetes.io/serviceaccount/');
    } else {
      const kubeconfig = process.env.KUBECONFIG || '~/.kube/config';
      console.log('  auth: local kubeconfig');
      console.log(`  location: ${kubeconfig}`);
    }
  }

  async listCustomResources(
    group: string,
    version: string,
    plural: string,
    namespace?: string,
  ): Promise<K8sList> {
    try {
      const response = namespace
        ? await this.customApi.listNamespacedCustomObject(group, version, namespace, plural)
        : await this.customApi.listClusterCustomObject(group, version, plural);

      return response.body as K8sList;
    } catch (error: any) {
      throw k8sApiError(`list ${plural}`, error);
    }
  }

  async getCustomResource(
    group: string,
    version: string,
    namespace: string,
    plural: string,
    name: string,
  ): Promise<K8sResource> {
    try {
      const response = await this.customApi.getNamespacedCustomObject(
        group,
        version,
        namespace,
        plural,
        name,
      );
      return response.body as K8sResource;
    } catch (error: any) {
      throw k8sApiError(`get ${plural}/${name}`, error);
    }
  }

  async proxyMCPRequest(
    namespace: string,
    name: string,
    body: Buffer,
    headers: IncomingHttpHeaders,
  ): Promise<MCPProxyResponse> {
    if (body.length > MAX_MCP_REQUEST_BYTES) {
      throw new MCPProxyError('MCP request is too large', 413);
    }
    let envelope: { method?: unknown };
    try {
      envelope = JSON.parse(body.toString('utf8')) as { method?: unknown };
    } catch {
      throw new MCPProxyError('unsupported MCP request', 400);
    }
    if (
      typeof envelope.method !== 'string' ||
      !allowedMCPMethod(envelope.method)
    ) {
      throw new MCPProxyError('unsupported MCP request', 400);
    }

    const extension = await this.getCustomResource(
      'mcp.kuadrant.io',
      'v1',
      namespace,
      'mcpgatewayextensions',
      name,
    );
    if (!isMCPGatewayReady(extension)) {
      throw new MCPProxyError('MCPGatewayExtension is not ready', 409);
    }
    const targetRef = extension.spec?.targetRef;
    if (!targetRef?.name || (targetRef.kind && targetRef.kind !== 'Gateway')) {
      throw new Error('MCPGatewayExtension has an invalid Gateway target');
    }
    const gatewayNamespace = targetRef.namespace || namespace;
    const gateway = await this.getCustomResource(
      'gateway.networking.k8s.io',
      'v1',
      gatewayNamespace,
      'gateways',
      targetRef.name,
    );
    const endpoint = deriveMCPEndpoint(extension, gateway);
    const target = new URL(endpoint);
    const targetOrigin = normalizeMCPOrigin(target.origin);
    if (
      this.mcpAllowedOrigins.size > 0 &&
      !this.mcpAllowedOrigins.has(targetOrigin)
    ) {
      throw new MCPProxyError(
        'MCP gateway origin is not permitted by backend.mcpProxy.allowedOrigins',
        403,
      );
    }
    const requestHeaders = selectMCPRequestHeaders(headers);
    // A host-run Backstage cannot resolve Kubernetes service DNS names. Use
    // privateHost only when the backend itself is running in the cluster.
    const privateHost = process.env.KUBERNETES_SERVICE_HOST
      ? extension.spec?.privateHost
      : undefined;
    const dialTarget = getMCPGatewayDialTarget(gateway, target.hostname, privateHost);
    const mcpAuthorization = headers[MCP_AUTHORIZATION_HEADER];
    if (mcpAuthorization !== undefined) {
      const authorization = Array.isArray(mcpAuthorization)
        ? mcpAuthorization[0]
        : mcpAuthorization;
      if (authorization) {
        if (
          target.protocol !== 'https:' &&
          !this.allowInsecureMCPAuth
        ) {
          throw new MCPProxyError(
            'refusing to send MCP credentials over an insecure connection',
            400,
          );
        }
        requestHeaders.Authorization = authorization;
      }
    }
    requestHeaders['Content-Length'] = String(body.length);

    const requestOptions: http.RequestOptions = {
      protocol: target.protocol,
      hostname: dialTarget.hostname,
      port:
        dialTarget.port || target.port || (target.protocol === 'https:' ? 443 : 80),
      method: 'POST',
      path: `${target.pathname}${target.search}`,
      headers: {
        ...requestHeaders,
        Host: target.host,
      },
      timeout: MCP_PROXY_REQUEST_TIMEOUT_MS,
    };

    if (target.protocol === 'https:') {
      (requestOptions as https.RequestOptions).servername = target.hostname;
    }

    const requestModule = target.protocol === 'https:' ? https : http;

    return new Promise<MCPProxyResponse>((resolve, reject) => {
      const upstreamRequest = requestModule.request(
        requestOptions,
        (response) => {
          resolve({
            statusCode: response.statusCode || 502,
            headers: response.headers,
            body: response,
          });
        },
      );
      upstreamRequest.on('error', reject);
      upstreamRequest.on('timeout', () => {
        upstreamRequest.destroy(new Error('MCP proxy request timed out'));
      });
      upstreamRequest.end(body);
    });
  }

  async createSecret(namespace: string, secret: K8sResource): Promise<K8sResource> {
    try {
      const response = await this.coreApi.createNamespacedSecret(namespace, secret as k8s.V1Secret);
      return response.body as K8sResource;
    } catch (error: any) {
      throw k8sApiError('create secret', error);
    }
  }

  async getSecret(namespace: string, name: string): Promise<K8sResource> {
    try {
      const response = await this.coreApi.readNamespacedSecret(name, namespace);
      return response.body as K8sResource;
    } catch (error: any) {
      throw k8sApiError('get secret', error);
    }
  }

  async deleteSecret(namespace: string, name: string): Promise<void> {
    try {
      await this.coreApi.deleteNamespacedSecret(name, namespace);
    } catch (error: any) {
      throw k8sApiError('delete secret', error);
    }
  }

  async createCustomResource(
    group: string,
    version: string,
    namespace: string,
    plural: string,
    resource: K8sResource,
  ): Promise<K8sResource> {
    try {
      const response = await this.customApi.createNamespacedCustomObject(
        group,
        version,
        namespace,
        plural,
        resource as any,
      );
      return response.body as K8sResource;
    } catch (error: any) {
      // extract detailed error from kubernetes api response
      const statusCode = error.response?.statusCode || error.statusCode;
      const body = error.response?.body || error.body;
      const message = body?.message || error.message;
      const reason = body?.reason;
      const details = body?.details;

      console.error(`failed to create ${plural}:`, {
        statusCode,
        message,
        reason,
        details: JSON.stringify(details),
      });

      throw k8sApiError(`create ${plural}`, error);
    }
  }

  async deleteCustomResource(
    group: string,
    version: string,
    namespace: string,
    plural: string,
    name: string,
  ): Promise<void> {
    try {
      await this.customApi.deleteNamespacedCustomObject(
        group,
        version,
        namespace,
        plural,
        name,
      );
    } catch (error: any) {
      throw k8sApiError(`delete ${plural}/${name}`, error);
    }
  }

  async patchCustomResource(
    group: string,
    version: string,
    namespace: string,
    plural: string,
    name: string,
    patch: any,
  ): Promise<K8sResource> {
    try {
      const response = await this.customApi.patchNamespacedCustomObject(
        group,
        version,
        namespace,
        plural,
        name,
        patch,
        undefined,
        undefined,
        undefined,
        {
          headers: {
            'Content-Type': 'application/merge-patch+json',
          },
        }
      );
      return response.body as K8sResource;
    } catch (error: any) {
      throw k8sApiError(`patch ${plural}/${name}`, error);
    }
  }

  async getNamespace(name: string): Promise<K8sResource> {
    try {
      const response = await this.coreApi.readNamespace(name);
      return response.body as K8sResource;
    } catch (error: any) {
      throw k8sApiError(`get namespace/${name}`, error);
    }
  }

  async createNamespace(namespace: K8sResource): Promise<K8sResource> {
    try {
      const response = await this.coreApi.createNamespace(namespace as k8s.V1Namespace);
      return response.body as K8sResource;
    } catch (error: any) {
      throw k8sApiError('create namespace', error);
    }
  }
}

export function isMCPGatewayReady(extension: K8sResource): boolean {
  const generation = extension.metadata?.generation;
  return (extension.status?.conditions || []).some(
    (condition: any) =>
      condition.type === 'Ready' &&
      condition.status === 'True' &&
      (generation === undefined || condition.observedGeneration === generation),
  );
}

export function deriveMCPEndpoint(
  extension: K8sResource,
  gateway: K8sResource,
): string {
  const sectionName = extension.spec?.targetRef?.sectionName;
  const listener = (gateway.spec?.listeners || []).find(
    (candidate: MCPGatewayListener) => candidate.name === sectionName,
  ) as MCPGatewayListener | undefined;
  if (!listener) {
    throw new Error('MCPGatewayExtension target listener was not found');
  }

  let host = extension.spec?.publicHost || listener.hostname;
  if (typeof host !== 'string' || host.length === 0) {
    throw new Error('MCPGatewayExtension has an invalid public host');
  }
  if (host.startsWith('*.')) host = `mcp${host.slice(1)}`;
  if (host.includes('://') || /[/?#@]/.test(host)) {
    throw new Error('MCPGatewayExtension has an invalid public host');
  }
  if (host.includes(':')) {
    const hostParts = host.match(/^\[?([^\]]+)\]?:\d+$/);
    if (!hostParts) {
      throw new Error('MCPGatewayExtension has an invalid public host');
    }
    host = hostParts[1];
  }

  const protocol = listener.protocol.toUpperCase();
  if (protocol !== 'HTTP' && protocol !== 'HTTPS') {
    throw new Error('MCP Gateway listener must use HTTP or HTTPS');
  }
  if (
    !Number.isInteger(listener.port) ||
    listener.port < 1 ||
    listener.port > 65535
  ) {
    throw new Error('MCP Gateway listener has an invalid port');
  }
  const defaultPort = protocol === 'HTTPS' ? 443 : 80;
  const port = listener.port === defaultPort ? '' : `:${listener.port}`;
  return `${protocol.toLowerCase()}://${host}${port}/mcp`;
}

export interface MCPGatewayDialTarget {
  hostname: string;
  port?: number;
}

export function getMCPGatewayDialTarget(
  gateway: K8sResource,
  fallback: string,
  privateHost?: unknown,
): MCPGatewayDialTarget {
  if (privateHost !== undefined) {
    if (typeof privateHost !== 'string' || privateHost.trim().length === 0) {
      throw new Error('MCPGatewayExtension has an invalid private host');
    }
    try {
      const parsed = new URL(`http://${privateHost.trim()}`);
      if (
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash ||
        !parsed.hostname
      ) {
        throw new Error('invalid private host');
      }
      return {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
      };
    } catch {
      throw new Error('MCPGatewayExtension has an invalid private host');
    }
  }

  const address = gateway.status?.addresses?.find(
    (candidate: any) =>
      typeof candidate?.value === 'string' && candidate.value.length > 0,
  )?.value;
  return { hostname: address || fallback };
}

export function normalizeMCPOrigin(value: string): string {
  let origin: URL;
  try {
    origin = new URL(value.trim());
  } catch {
    throw new Error(
      'MCP origin must be an exact HTTP(S) origin without credentials, query or path',
    );
  }

  if (
    (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.hostname.length === 0 ||
    value.includes('*')
  ) {
    throw new Error(
      'MCP origin must be an exact HTTP(S) origin without credentials, query or path',
    );
  }

  const port = origin.port || (origin.protocol === 'https:' ? '443' : '80');
  return `${origin.protocol}//${origin.hostname.toLowerCase()}:${port}`;
}

export function allowedMCPMethod(method: string): boolean {
  return [
    'server/discover',
    'initialize',
    'notifications/initialized',
    'tools/list',
    'tools/call',
    'prompts/list',
    'prompts/get',
  ].includes(method);
}

export function selectMCPRequestHeaders(
  headers: IncomingHttpHeaders,
): OutgoingHttpHeaders {
  const result: OutgoingHttpHeaders = {};
  for (const name of [
    'content-type',
    'accept',
    'mcp-protocol-version',
    'mcp-session-id',
    'mcp-method',
    'mcp-name',
  ]) {
    const value = headers[name];
    if (value !== undefined) {
      result[name] = value;
    }
  }
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase().startsWith('mcp-param-')) {
      result[name] = headers[name];
    }
  }
  return result;
}

import * as k8s from '@kubernetes/client-node';
import { RootConfigService } from '@backstage/backend-plugin-api';

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

export class KuadrantK8sClient {
  private kc: k8s.KubeConfig;
  private customApi: k8s.CustomObjectsApi;
  private coreApi: k8s.CoreV1Api;

  constructor(config: RootConfigService) {
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

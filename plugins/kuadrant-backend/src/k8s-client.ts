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
      throw new Error(`failed to list ${plural}: ${error.message}`);
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
      throw new Error(`failed to get ${plural}/${name}: ${error.message}`);
    }
  }

  async createSecret(namespace: string, secret: K8sResource): Promise<K8sResource> {
    try {
      const response = await this.coreApi.createNamespacedSecret(namespace, secret as k8s.V1Secret);
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to create secret: ${error.message}`);
    }
  }

  async listSecrets(namespace: string): Promise<K8sList> {
    try {
      const response = await this.coreApi.listNamespacedSecret(namespace);
      return { items: (response.body.items || []) as unknown as K8sResource[] };
    } catch (error: any) {
      throw new Error(`failed to list secrets: ${error.message}`);
    }
  }

  async getSecret(namespace: string, name: string): Promise<K8sResource> {
    try {
      const response = await this.coreApi.readNamespacedSecret(name, namespace);
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to get secret: ${error.message}`);
    }
  }

  async deleteSecret(namespace: string, name: string): Promise<void> {
    try {
      await this.coreApi.deleteNamespacedSecret(name, namespace);
    } catch (error: any) {
      throw new Error(`failed to delete secret: ${error.message}`);
    }
  }

  async createConfigMap(namespace: string, configMap: K8sResource): Promise<K8sResource> {
    try {
      const response = await this.coreApi.createNamespacedConfigMap(namespace, configMap as k8s.V1ConfigMap);
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to create configmap: ${error.message}`);
    }
  }

  async listConfigMaps(namespace: string, labelSelector?: string): Promise<K8sList> {
    try {
      const response = await this.coreApi.listNamespacedConfigMap(namespace, undefined, undefined, undefined, undefined, labelSelector);
      return { items: (response.body.items || []) as unknown as K8sResource[] };
    } catch (error: any) {
      throw new Error(`failed to list configmaps: ${error.message}`);
    }
  }

  async getConfigMap(namespace: string, name: string): Promise<K8sResource> {
    try {
      const response = await this.coreApi.readNamespacedConfigMap(name, namespace);
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to get configmap: ${error.message}`);
    }
  }

  async updateConfigMap(namespace: string, name: string, configMap: K8sResource): Promise<K8sResource> {
    try {
      const response = await this.coreApi.replaceNamespacedConfigMap(name, namespace, configMap as k8s.V1ConfigMap);
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to update configmap: ${error.message}`);
    }
  }

  async deleteConfigMap(namespace: string, name: string): Promise<void> {
    try {
      await this.coreApi.deleteNamespacedConfigMap(name, namespace);
    } catch (error: any) {
      throw new Error(`failed to delete configmap: ${error.message}`);
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

      throw new Error(`failed to create ${plural}: ${message}${reason ? ` (${reason})` : ''}`);
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
      throw new Error(`failed to delete ${plural}/${name}: ${error.message}`);
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
      );
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to patch ${plural}/${name}: ${error.message}`);
    }
  }

  async patchCustomResourceStatus(
    group: string,
    version: string,
    namespace: string,
    plural: string,
    name: string,
    status: any,
  ): Promise<K8sResource> {
    try {
      // get the existing resource first
      const existing = await this.getCustomResource(group, version, namespace, plural, name);

      // replace the entire resource with updated status
      const updated = {
        ...existing,
        status,
      };

      const response = await this.customApi.replaceNamespacedCustomObjectStatus(
        group,
        version,
        namespace,
        plural,
        name,
        updated,
      );
      return response.body as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to patch ${plural}/${name} status: ${error.message}`);
    }
  }
}


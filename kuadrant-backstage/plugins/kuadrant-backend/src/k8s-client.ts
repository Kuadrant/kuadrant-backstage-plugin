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

    // check if kubernetes config exists
    const hasK8sConfig = config.has('kubernetes');

    if (hasK8sConfig) {
      // check cluster locator method
      const clusterLocatorMethods = config.getOptionalConfigArray('kubernetes.clusterLocatorMethods') || [];
      const locatorTypes = clusterLocatorMethods.map(c => c.getString('type'));

      console.log('kubernetes cluster locator methods:', locatorTypes);

      // for now, we support loadFromDefault which handles both in-cluster and local kubeconfig
      // in the future, we can add support for parsing cluster config from app-config.yaml
      if (locatorTypes.includes('localKubectlProxy') || locatorTypes.length === 0) {
        // localKubectlProxy means kubectl proxy is running, but we use loadFromDefault
        // which will use local kubeconfig (same source as kubectl proxy)
        this.kc.loadFromDefault();
        console.log('k8s client initialised using local kubeconfig');
      } else {
        // fallback to default (in-cluster or local kubeconfig)
        this.kc.loadFromDefault();
        console.log('k8s client initialised using default config');
      }
    } else {
      // no kubernetes config, use default
      this.kc.loadFromDefault();
      console.log('k8s client initialised using default config (no kubernetes config in app-config.yaml)');
    }

    this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  async listCustomResources(
    group: string,
    version: string,
    plural: string,
    namespace?: string,
  ): Promise<K8sList> {
    try {
      const response = namespace
        ? await this.customApi.listNamespacedCustomObject({ group, version, namespace, plural })
        : await this.customApi.listClusterCustomObject({ group, version, plural });

      return response as any as K8sList;
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
      const response = await this.customApi.getNamespacedCustomObject({
        group,
        version,
        namespace,
        plural,
        name,
      });
      return response as any as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to get ${plural}/${name}: ${error.message}`);
    }
  }

  async createSecret(namespace: string, secret: K8sResource): Promise<K8sResource> {
    try {
      const response = await this.coreApi.createNamespacedSecret({ namespace, body: secret as k8s.V1Secret }) as any;
      return response as K8sResource;
    } catch (error: any) {
      throw new Error(`failed to create secret: ${error.message}`);
    }
  }

  async listSecrets(namespace: string): Promise<K8sList> {
    try {
      const response = await this.coreApi.listNamespacedSecret({ namespace }) as any;
      return { items: (response.items || []) as unknown as K8sResource[] };
    } catch (error: any) {
      throw new Error(`failed to list secrets: ${error.message}`);
    }
  }

  async deleteSecret(namespace: string, name: string): Promise<void> {
    try {
      await this.coreApi.deleteNamespacedSecret({ name, namespace });
    } catch (error: any) {
      throw new Error(`failed to delete secret: ${error.message}`);
    }
  }
}

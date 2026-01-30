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
  [key: string]: any;
}

export interface K8sList {
  items: K8sResource[];
}

/**
 * Kubernetes client for the catalog module.
 * This is a simplified version focused on reading APIProducts for catalog sync.
 */
export class CatalogK8sClient {
  private kc: k8s.KubeConfig;
  private customApi: k8s.CustomObjectsApi;

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

            console.log(`catalog k8s client initialised with explicit cluster config`);
          } else {
            this.kc.loadFromDefault();
          }
        } else {
          this.kc.loadFromDefault();
        }
      } else {
        this.kc.loadFromDefault();
      }
    } else {
      this.kc.loadFromDefault();
    }

    this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
  }

  async listCustomResources(
    group: string,
    version: string,
    plural: string,
  ): Promise<K8sList> {
    try {
      const response = await this.customApi.listClusterCustomObject(group, version, plural);
      return response.body as K8sList;
    } catch (error: any) {
      throw new Error(`failed to list ${plural}: ${error.message}`);
    }
  }
}

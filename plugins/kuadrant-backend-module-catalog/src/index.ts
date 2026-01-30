import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { APIProductEntityProvider } from './providers/APIProductEntityProvider';

// singleton instance for sharing provider between module and router
let apiProductProviderInstance: APIProductEntityProvider | null = null;

/**
 * Get the APIProduct entity provider instance.
 * @public
 */
export function getAPIProductEntityProvider(): APIProductEntityProvider | null {
  return apiProductProviderInstance;
}

/**
 * Backend module for APIProduct entity provider.
 * This module registers an entity provider that syncs APIProduct CRDs from Kubernetes
 * to the Backstage catalog as API entities.
 *
 * @public
 */
export const catalogModuleApiProductEntityProvider = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'kuadrant-apiproduct-provider',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ catalog, config, logger }) {
        logger.info('registering kuadrant apiproduct entity provider');
        const provider = new APIProductEntityProvider(config);
        apiProductProviderInstance = provider;
        catalog.addEntityProvider(provider);
        logger.info('apiproduct entity provider registered successfully');
      },
    });
  },
});

export default catalogModuleApiProductEntityProvider;

// Re-export the provider class for direct use if needed
export { APIProductEntityProvider } from './providers/APIProductEntityProvider';

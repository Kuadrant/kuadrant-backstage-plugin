import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import type { catalogProcessingExtensionPoint as catalogProcessingExtensionPointAlpha } from '@backstage/plugin-catalog-node/alpha';
import { APIProductEntityProvider } from './providers/APIProductEntityProvider';

type CatalogProcessingExtensionPoint = typeof catalogProcessingExtensionPointAlpha;

// catalog-node 2.2+ (RHDH 2.x) moved this off /alpha onto the main export.
// resolve at runtime so yarn dev (1.18 / alpha) and rhdh:next (2.2 / main)
// both work. the /alpha import above is type-only (erased at compile time),
// so both requires below are guarded here too - a future removal of the
// /alpha subpath can't crash module load before this function even runs.
let resolvedCatalogProcessingExtensionPointSource: 'main' | 'alpha' = 'alpha';

export function resolveCatalogProcessingExtensionPoint(): CatalogProcessingExtensionPoint {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalogNode = require('@backstage/plugin-catalog-node') as {
      catalogProcessingExtensionPoint?: CatalogProcessingExtensionPoint;
    };
    if (catalogNode.catalogProcessingExtensionPoint) {
      resolvedCatalogProcessingExtensionPointSource = 'main';
      return catalogNode.catalogProcessingExtensionPoint;
    }
  } catch (err) {
    // unexpected: the package itself failed to load, not just the export
    // being absent (older versions never had it on the main export).
    console.warn(
      `kuadrant-backend: @backstage/plugin-catalog-node require failed, falling back to /alpha: ${err}`,
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalogNodeAlpha = require('@backstage/plugin-catalog-node/alpha') as {
      catalogProcessingExtensionPoint: CatalogProcessingExtensionPoint;
    };
    resolvedCatalogProcessingExtensionPointSource = 'alpha';
    return catalogNodeAlpha.catalogProcessingExtensionPoint;
  } catch (err) {
    throw new Error(
      'kuadrant-backend: could not resolve catalogProcessingExtensionPoint ' +
        `from @backstage/plugin-catalog-node or its /alpha subpath: ${err}`,
    );
  }
}

const catalogProcessingExtensionPoint =
  resolveCatalogProcessingExtensionPoint();

// singleton instance for sharing provider between module and router
let apiProductProviderInstance: APIProductEntityProvider | null = null;

/**
 * get the apiproduct entity provider instance
 * @public
 */
export function getAPIProductEntityProvider(): APIProductEntityProvider | null {
  return apiProductProviderInstance;
}

/**
 * backend module for apiproduct entity provider
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
        logger.debug(
          `catalogProcessingExtensionPoint resolved from: ${resolvedCatalogProcessingExtensionPointSource}`,
        );
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


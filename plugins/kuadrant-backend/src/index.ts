import { createBackendFeatureLoader } from '@backstage/backend-plugin-api';
import { kuadrantPlugin } from './plugin';
import { catalogModuleApiProductEntityProvider } from './module';
import { kuadrantRbacModule } from './rbac-module';

// Export individual features for non-dynamic plugin usage
export { kuadrantPlugin } from './plugin';
export * from './permissions';
export {
  catalogModuleApiProductEntityProvider,
  getAPIProductEntityProvider,
} from './module';
export { kuadrantRbacModule } from './rbac-module';
export { APIProductEntityProvider } from './providers/APIProductEntityProvider';

/**
 * Backend feature loader that bundles:
 * - kuadrantPlugin: Main HTTP API router
 * - catalogModuleApiProductEntityProvider: Syncs APIProducts to Backstage catalog
 * - kuadrantRbacModule: Registers Kuadrant with RBAC plugin
 *
 * @public
 */
export default createBackendFeatureLoader({
  loader() {
    return [
      kuadrantPlugin,
      catalogModuleApiProductEntityProvider,
      kuadrantRbacModule,
    ];
  },
});
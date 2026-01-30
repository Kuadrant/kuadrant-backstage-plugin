import { createBackendModule } from '@backstage/backend-plugin-api';
import { pluginIdProviderExtensionPoint } from '@backstage-community/plugin-rbac-node';

/**
 * Backend module that registers kuadrant plugin id with RBAC.
 * This makes kuadrant permissions discoverable in the RBAC UI.
 *
 * @public
 */
export const kuadrantRbacModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'kuadrant-rbac-provider',
  register(env) {
    env.registerInit({
      deps: {
        pluginIdProvider: pluginIdProviderExtensionPoint,
      },
      async init({ pluginIdProvider }) {
        pluginIdProvider.addPluginIdProvider({
          getPluginIds: () => ['kuadrant'],
        });
      },
    });
  },
});

export default kuadrantRbacModule;
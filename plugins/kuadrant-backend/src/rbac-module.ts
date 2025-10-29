import { createBackendModule } from '@backstage/backend-plugin-api';
import { pluginIdProviderExtensionPoint } from '@backstage-community/plugin-rbac-node';

/**
 * backend module that registers kuadrant plugin id with rbac
 * this makes kuadrant permissions discoverable in the rbac ui
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

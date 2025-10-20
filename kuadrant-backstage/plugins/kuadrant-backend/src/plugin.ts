import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * kuadrantPlugin backend plugin
 *
 * @public
 */
export const kuadrantPlugin = createBackendPlugin({
  pluginId: 'kuadrant',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        permissions: coreServices.permissions,
      },
      async init({ httpAuth, userInfo, httpRouter, config, permissions }) {
        // allow unauthenticated access at HTTP router level
        // authorization is enforced in the router via:
        // 1. group-based checks (isAdmin from platform-engineers group)
        // 2. permission framework checks (when credentials available)
        // this allows the app to work in development mode with guest auth
        // while still providing proper authorization
        httpRouter.addAuthPolicy({
          path: '/',
          allow: 'unauthenticated',
        });

        httpRouter.use(
          await createRouter({
            httpAuth,
            userInfo,
            config,
            permissions,
          }),
        );
      },
    });
  },
});

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
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
      },
      async init({ httpAuth, httpRouter, config }) {
        // allow unauthenticated access to kuadrant resource endpoints
        httpRouter.addAuthPolicy({
          path: '/authpolicies',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/ratelimitpolicies',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/dnspolicies',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/tlspolicies',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/planpolicies',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/planpolicies/:namespace/:name',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/apikeys',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/apikeys/:namespace/:name',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/:kind/:namespace/:name',
          allow: 'unauthenticated',
        });

        httpRouter.use(
          await createRouter({
            httpAuth,
            config,
          }),
        );
      },
    });
  },
});

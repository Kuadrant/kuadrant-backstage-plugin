import {
  createPlugin,
  createRoutableExtension,
  createComponentExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef, resourceRouteRef } from './routes';

export const kuadrantPlugin = createPlugin({
  id: 'kuadrant',
  routes: {
    root: rootRouteRef,
    resource: resourceRouteRef,
  },
});

export const KuadrantPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'KuadrantPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);

export const EntityKuadrantApiAccessCard = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'EntityKuadrantApiAccessCard',
    component: {
      lazy: () =>
        import('./components/ApiAccessCard').then(m => m.ApiAccessCard),
    },
  }),
);

export const EntityKuadrantApiKeyManagementTab = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'EntityKuadrantApiKeyManagementTab',
    component: {
      lazy: () =>
        import('./components/ApiKeyManagementTab').then(m => m.ApiKeyManagementTab),
    },
  }),
);

// entity content extension for api keys tab
export const EntityKuadrantApiKeysContent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'EntityKuadrantApiKeysContent',
    component: {
      lazy: () =>
        import('./components/ApiKeyManagementTab').then(m => m.ApiKeyManagementTab),
    },
  }),
);

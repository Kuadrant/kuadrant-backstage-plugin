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
      import('./components/KuadrantPage').then(m => m.ApiProductsPage),
    mountPoint: rootRouteRef,
  }),
);

export const ApiProductsPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'ApiProductsPage',
    component: () =>
      import('./components/KuadrantPage').then(m => m.ApiProductsPage),
    mountPoint: rootRouteRef,
  }),
);

export const MyApiKeysPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'MyApiKeysPage',
    component: () =>
      import('./components/MyApiKeysPage').then(m => m.MyApiKeysPage),
    mountPoint: rootRouteRef,
  }),
);

export const ApiKeyApprovalPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'ApiKeyApprovalPage',
    component: () =>
      import('./components/ApiKeyApprovalPage').then(m => m.ApiKeyApprovalPage),
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

export const EntityKuadrantApiProductInfoContent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'EntityKuadrantApiProductInfoContent',
    component: {
      lazy: () =>
        import('./components/ApiProductInfoCard').then(m => m.ApiProductInfoCard),
    },
  }),
);

export const ApiKeyDetailPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'ApiKeyDetailPage',
    component: () =>
      import('./components/ApiKeyDetailPage').then(m => m.ApiKeyDetailPage),
    mountPoint: rootRouteRef,
  }),
);

export const EntityKuadrantApiApprovalTab = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'EntityKuadrantApiApprovalTab',
    component: {
      lazy: () =>
        import('./components/EntityApiApprovalTab').then(m => m.EntityApiApprovalTab),
    },
  }),
);

export const EntityKuadrantApiProductOpenApiAlert = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'EntityKuadrantApiProductOpenApiAlert',
    component: {
      lazy: () =>
        import('./components/ApiProductOpenApiAlert').then(m => m.ApiProductOpenApiAlert),
    },
  }),
);

export const ApiProductDetailPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'ApiProductDetailPage',
    component: () =>
      import('./components/ApiProductDetailPage').then(m => m.ApiProductDetailPage),
    mountPoint: rootRouteRef,
  }),
);

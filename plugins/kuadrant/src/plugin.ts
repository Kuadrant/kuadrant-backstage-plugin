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

// Keep the historical component export for existing dynamic-plugin configs.
export const KuadrantPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'KuadrantPageComponent',
    component: {
      lazy: () =>
        import('./components/KuadrantPage').then(m => m.ApiProductsPage),
    },
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

export const ApiProductsPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'ApiProductsPageComponent',
    component: {
      lazy: () =>
        import('./components/KuadrantPage').then(m => m.ApiProductsPage),
    },
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

export const MyApiKeysPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'MyApiKeysPageComponent',
    component: {
      lazy: () =>
        import('./components/MyApiKeysPage').then(m => m.MyApiKeysPage),
    },
  }),
);

export const ApiKeyApprovalPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'ApiKeyApprovalPage',
    component: () =>
      import('./components/ApiKeyApprovalPage').then(m => m.ApiKeyApprovalPageWithPermissions),
    mountPoint: rootRouteRef,
  }),
);

export const ApiKeyApprovalPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'ApiKeyApprovalPageComponent',
    component: {
      lazy: () =>
        import('./components/ApiKeyApprovalPage').then(
          m => m.ApiKeyApprovalPageWithPermissions,
        ),
    },
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

export const ApiKeyDetailPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'ApiKeyDetailPageComponent',
    component: {
      lazy: () =>
        import('./components/ApiKeyDetailPage').then(m => m.ApiKeyDetailPage),
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

export const ApiProductDetailPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'ApiProductDetailPageComponent',
    component: {
      lazy: () =>
        import('./components/ApiProductDetailPage').then(
          m => m.ApiProductDetailPage,
        ),
    },
  }),
);

export const McpOverviewPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'McpOverviewPage',
    component: () =>
      import('./components/McpOverviewPage').then(m => m.McpOverviewPage),
    mountPoint: rootRouteRef,
  }),
);

export const McpOverviewPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'McpOverviewPageComponent',
    component: {
      lazy: () =>
        import('./components/McpOverviewPage').then(m => m.McpOverviewPage),
    },
  }),
);

export const McpInspector = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'McpInspector',
    component: () =>
      import('./components/McpInspector').then(m => m.McpInspector),
    mountPoint: rootRouteRef,
  }),
);

export const McpInspectorComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'McpInspectorComponent',
    component: {
      lazy: () =>
        import('./components/McpInspector').then(m => m.McpInspector),
    },
  }),
);

export const McpGatewayExtensionDetailPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'McpGatewayExtensionDetailPage',
    component: () =>
      import('./components/McpGatewayExtensionDetailPage').then(m => m.McpGatewayExtensionDetailPage),
    mountPoint: rootRouteRef,
  }),
);

export const McpGatewayExtensionDetailPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'McpGatewayExtensionDetailPageComponent',
    component: {
      lazy: () =>
        import('./components/McpGatewayExtensionDetailPage').then(
          m => m.McpGatewayExtensionDetailPage,
        ),
    },
  }),
);
export const GatewayDetailPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'GatewayDetailPage',
    component: () =>
      import('./components/GatewayDetailPage').then(m => m.GatewayDetailPage),
    mountPoint: rootRouteRef,
  }),
);

export const McpServerRegistrationDetailPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'McpServerRegistrationDetailPage',
    component: () =>
      import('./components/McpServerRegistrationDetailPage').then(m => m.McpServerRegistrationDetailPage),
    mountPoint: rootRouteRef,
  }),
);

export const McpServerRegistrationDetailPageComponent = kuadrantPlugin.provide(
  createComponentExtension({
    name: 'McpServerRegistrationDetailPageComponent',
    component: {
      lazy: () =>
        import('./components/McpServerRegistrationDetailPage').then(
          m => m.McpServerRegistrationDetailPage,
        ),
    },
  }),
);

export const McpHTTPRouteExtensionDetailPage = kuadrantPlugin.provide(
  createRoutableExtension({
    name: 'McpHTTPRouteExtensionDetailPage',
    component: () =>
      import('./components/McpHTTPRouteExtensionDetailPage').then(m => m.McpHTTPRouteExtensionDetailPage),
    mountPoint: rootRouteRef,
  }),
);

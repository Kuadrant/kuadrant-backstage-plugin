import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'kuadrant',
});

export const resourceRouteRef = createSubRouteRef({
  id: 'kuadrant/resource',
  parent: rootRouteRef,
  path: '/:kind/:namespace/:name',
});

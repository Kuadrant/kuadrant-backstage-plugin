import {
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { kuadrantApiRef, KuadrantApiClient } from './api';

/**
 * API factory for the Kuadrant plugin
 * This factory creates and configures the KuadrantApiClient with required dependencies
 */
export const kuadrantApiFactory = createApiFactory({
  api: kuadrantApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    fetchApi: fetchApiRef,
    identityApi: identityApiRef,
  },
  factory: ({ discoveryApi, fetchApi, identityApi }) =>
    new KuadrantApiClient({ discoveryApi, fetchApi, identityApi }),
});

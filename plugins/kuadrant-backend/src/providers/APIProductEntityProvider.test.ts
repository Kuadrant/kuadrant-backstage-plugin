import { mockServices } from '@backstage/backend-test-utils';
import { APIProductEntityProvider } from './APIProductEntityProvider';
import { KuadrantK8sClient } from '../k8s-client';

jest.mock('../k8s-client');

// the kuadrant.io/auth-apikey annotation is presence-based: it is emitted only
// when the product has an api-key auth scheme. rhdh dynamic-plugin hasAnnotation
// conditions test presence, not value, so a 'false' value would be indistinguishable
// from 'true' and would wrongly show the api keys tab/card for oidc-only apis.
describe('APIProductEntityProvider auth-apikey annotation', () => {
  let mockK8sClient: jest.Mocked<KuadrantK8sClient>;
  let provider: APIProductEntityProvider;
  let applyMutation: jest.Mock;

  const product = (authentication?: Record<string, unknown>) => ({
    apiVersion: 'devportal.kuadrant.io/v1alpha1',
    kind: 'APIProduct',
    metadata: {
      name: 'test-api',
      namespace: 'test-ns',
      uid: 'uid-1',
      resourceVersion: '1',
      creationTimestamp: '2024-01-01T00:00:00Z',
      annotations: { 'backstage.io/owner': 'group:default/team-a' },
    },
    spec: {
      displayName: 'Test API',
      publishStatus: 'Published',
      approvalMode: 'manual',
      targetRef: { group: 'gateway.networking.k8s.io', kind: 'HTTPRoute', name: 'test' },
    },
    status: authentication
      ? { discoveredAuthScheme: { authentication } }
      : {},
  });

  const syncedEntity = async () => {
    await provider.refresh();
    expect(applyMutation).toHaveBeenCalledTimes(1);
    return applyMutation.mock.calls[0][0].entities[0].entity;
  };

  beforeEach(() => {
    applyMutation = jest.fn();
    mockK8sClient = {
      listCustomResources: jest.fn(),
    } as unknown as jest.Mocked<KuadrantK8sClient>;
    (KuadrantK8sClient as jest.Mock).mockImplementation(() => mockK8sClient);
    provider = new APIProductEntityProvider(mockServices.rootConfig());
    (provider as unknown as { connection: unknown }).connection = { applyMutation };
  });

  it('omits the annotation for an oidc-only product', async () => {
    mockK8sClient.listCustomResources.mockResolvedValue({
      items: [product({ 'oidc-users': { jwt: { issuerUrl: 'https://oidc.example.com' } } })],
    } as any);

    const entity = await syncedEntity();

    expect(entity.metadata.annotations?.['kuadrant.io/auth-apikey']).toBeUndefined();
  });

  it('sets the annotation to "true" for an api-key product', async () => {
    mockK8sClient.listCustomResources.mockResolvedValue({
      items: [product({ 'api-key-users': { apiKey: { selector: { matchLabels: {} } } } })],
    } as any);

    const entity = await syncedEntity();

    expect(entity.metadata.annotations?.['kuadrant.io/auth-apikey']).toBe('true');
  });

  it('sets the annotation to "true" for a mixed jwt + api-key product', async () => {
    mockK8sClient.listCustomResources.mockResolvedValue({
      items: [product({ oidc: { jwt: {} }, keys: { apiKey: {} } })],
    } as any);

    const entity = await syncedEntity();

    expect(entity.metadata.annotations?.['kuadrant.io/auth-apikey']).toBe('true');
  });

  it('omits the annotation when no auth scheme has been discovered', async () => {
    mockK8sClient.listCustomResources.mockResolvedValue({
      items: [product(undefined)],
    } as any);

    const entity = await syncedEntity();

    expect(entity.metadata.annotations?.['kuadrant.io/auth-apikey']).toBeUndefined();
  });
});

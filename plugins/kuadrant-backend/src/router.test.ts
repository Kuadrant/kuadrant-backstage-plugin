import { mockServices } from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { KuadrantK8sClient } from './k8s-client';

// Mock the k8s client
jest.mock('./k8s-client');

describe('createRouter', () => {
  let app: express.Express;
  let mockK8sClient: jest.Mocked<KuadrantK8sClient>;
  let mockAuthorizeFn: jest.Mock;

  const mockUserEntityRef = 'user:default/testuser';
  const mockOtherUserEntityRef = 'user:default/otheruser';

  beforeAll(async () => {
    // Create mock k8s client instance
    mockK8sClient = {
      getCustomResource: jest.fn(),
      patchCustomResource: jest.fn(),
      getSecret: jest.fn(),
      patchCustomResourceStatus: jest.fn(),
      listCustomResources: jest.fn(),
      createCustomResource: jest.fn(),
      deleteCustomResource: jest.fn(),
      createSecret: jest.fn(),
      deleteSecret: jest.fn(),
    } as any;

    // Mock the constructor to return our mock instance
    (KuadrantK8sClient as jest.Mock).mockImplementation(() => mockK8sClient);

    // Mock user info service with getUserInfo method
    const mockUserInfo = {
      getUserInfo: jest.fn().mockResolvedValue({
        userEntityRef: mockUserEntityRef,
        ownershipEntityRefs: [],
      }),
    } as any;

    // Create shared authorize mock function
    mockAuthorizeFn = jest.fn().mockResolvedValue([
      { result: AuthorizeResult.DENY },
    ]);

    // Mock permissions service with shared authorize function
    const mockPermissions = {
      authorize: mockAuthorizeFn,
      authorizeConditional: jest.fn(),
    } as any;

    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      userInfo: mockUserInfo,
      config: mockServices.rootConfig(),
      permissions: mockPermissions,
    });

    app = express().use(router);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /apikeys/:namespace/:name/secret', () => {
    const namespace = 'toystore';
    const name = 'testuser-toystore-api-abc123';
    const secretName = 'testuser-toystore-1234567890';
    const secretKey = 'api_key';
    const apiKeyValue = 'my-secret-api-key-value-abc123def456';

    const mockAPIKey = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKey',
      metadata: {
        name,
        namespace,
        creationTimestamp: '2024-12-02T10:00:00Z',
      },
      spec: {
        apiProductRef: {
          name: 'toystore-api',
        },
        planTier: 'gold',
        useCase: 'Testing API integration',
        requestedBy: {
          userId: mockUserEntityRef,
          email: 'testuser@example.com',
        },
      },
      status: {
        phase: 'Approved',
        reviewedBy: 'api-owner',
        reviewedAt: '2024-12-02T10:05:00Z',
        apiKey: apiKeyValue,
        apiHostname: 'toystore.apps.example.com',
        secretRef: {
          name: secretName,
          key: secretKey,
        },
        canReadSecret: true,
      },
    };

    const mockSecret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: secretName,
        namespace,
      },
      type: 'Opaque',
      data: {
        [secretKey]: Buffer.from(apiKeyValue).toString('base64'),
      },
    };

    it('returns secret on first read when canReadSecret is true', async () => {
      // Mock permission check - user has read own permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // readAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // readOwn allowed
      ]);

      // Mock k8s client responses
      mockK8sClient.getCustomResource.mockResolvedValue(mockAPIKey);
      mockK8sClient.getSecret.mockResolvedValue(mockSecret);
      mockK8sClient.patchCustomResourceStatus.mockResolvedValue({
        ...mockAPIKey,
        status: { ...mockAPIKey.status, canReadSecret: false },
      });

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(200);

      // Verify response contains the API key
      expect(response.body).toEqual({
        apiKey: apiKeyValue,
      });

      // Verify k8s client was called correctly
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
      );

      expect(mockK8sClient.getSecret).toHaveBeenCalledWith(
        namespace,
        secretName,
      );

      // Verify canReadSecret was updated to false
      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
        expect.objectContaining({
          canReadSecret: false,
        }),
      );
    });

    it('returns 403 when secret already read (canReadSecret is false)', async () => {
      // Mock permission check
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      // Mock APIKey with canReadSecret: false
      const alreadyReadAPIKey = {
        ...mockAPIKey,
        status: {
          ...mockAPIKey.status,
          canReadSecret: false,
        },
      };

      mockK8sClient.getCustomResource.mockResolvedValue(alreadyReadAPIKey);

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(403);

      expect(response.body).toEqual({
        error: 'secret has already been read and cannot be retrieved again',
      });

      // Verify secret was never fetched
      expect(mockK8sClient.getSecret).not.toHaveBeenCalled();

      // Verify canReadSecret was never updated
      expect(mockK8sClient.patchCustomResourceStatus).not.toHaveBeenCalled();
    });

    it('returns 403 when user does not own the API key', async () => {
      // Mock permission check - only has readOwn permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // readAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // readOwn allowed
      ]);

      // Mock APIKey owned by different user
      const otherUserAPIKey = {
        ...mockAPIKey,
        spec: {
          ...mockAPIKey.spec,
          requestedBy: {
            userId: mockOtherUserEntityRef,
            email: 'otheruser@example.com',
          },
        },
      };

      mockK8sClient.getCustomResource.mockResolvedValue(otherUserAPIKey);

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(403);

      expect(response.body).toEqual({
        error: 'you can only read your own api key secrets',
      });

      // Verify secret was never fetched
      expect(mockK8sClient.getSecret).not.toHaveBeenCalled();
    });

    it('allows admin to read any API key', async () => {
      // Mock permission check - user has readAll permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // readAll allowed
      ]);

      // Mock APIKey owned by different user
      const otherUserAPIKey = {
        ...mockAPIKey,
        spec: {
          ...mockAPIKey.spec,
          requestedBy: {
            userId: mockOtherUserEntityRef,
            email: 'otheruser@example.com',
          },
        },
      };

      mockK8sClient.getCustomResource.mockResolvedValue(otherUserAPIKey);
      mockK8sClient.getSecret.mockResolvedValue(mockSecret);
      mockK8sClient.patchCustomResourceStatus.mockResolvedValue({
        ...otherUserAPIKey,
        status: { ...otherUserAPIKey.status, canReadSecret: false },
      });

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(200);

      expect(response.body).toEqual({
        apiKey: apiKeyValue,
      });

      // Verify ownership check was skipped (admin can read all)
      expect(mockK8sClient.getSecret).toHaveBeenCalled();
    });

    it('returns 404 when secretRef is not set', async () => {
      // Mock permission check
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      // Mock APIKey without secretRef
      const noSecretRefAPIKey = {
        ...mockAPIKey,
        status: {
          ...mockAPIKey.status,
          secretRef: undefined,
        },
      };

      mockK8sClient.getCustomResource.mockResolvedValue(noSecretRefAPIKey);

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'secret reference not found in apikey status',
      });

      expect(mockK8sClient.getSecret).not.toHaveBeenCalled();
    });

    it('returns 404 when secret does not exist in Kubernetes', async () => {
      // Mock permission check
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      mockK8sClient.getCustomResource.mockResolvedValue(mockAPIKey);

      // Mock secret fetch to throw error (not found)
      mockK8sClient.getSecret.mockRejectedValue(
        new Error('secret not found in cluster'),
      );

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'secret not found',
      });

      // Verify canReadSecret was not updated
      expect(mockK8sClient.patchCustomResourceStatus).not.toHaveBeenCalled();
    });

    it('returns 403 when user has no read permissions', async () => {
      // Mock permission check - both denied
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // readAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // readOwn denied
      ]);

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(403);

      expect(response.body).toEqual({
        error: 'unauthorised',
      });

      // Verify no k8s calls were made
      expect(mockK8sClient.getCustomResource).not.toHaveBeenCalled();
      expect(mockK8sClient.getSecret).not.toHaveBeenCalled();
    });
  });

  describe('POST /requests/bulk-approve', () => {
    const namespace = 'toystore';
    const mockAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name: 'toystore-api',
        namespace,
        annotations: {
          'backstage.io/owner': mockUserEntityRef,
        },
      },
      spec: {},
    };

    const mockOtherAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name: 'other-api',
        namespace,
        annotations: {
          'backstage.io/owner': mockOtherUserEntityRef,
        },
      },
      spec: {},
    };

    const createMockAPIKey = (name: string, apiProductName: string) => ({
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKey',
      metadata: { name, namespace },
      spec: {
        apiProductRef: { name: apiProductName },
        planTier: 'gold',
        requestedBy: { userId: 'user:default/consumer' },
      },
      status: { phase: 'Pending' },
    });

    it('handles partial success when some API products do not exist', async () => {
      // Mock permission check - user has updateOwn permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Mock getCustomResource calls - interleaved APIKeys and APIProducts
      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - success
        // request-2
        .mockResolvedValueOnce(createMockAPIKey('request-2', 'missing-api')) // fetch APIKey
        .mockRejectedValueOnce(new Error('APIProduct not found')) // fetch APIProduct - fail
        // request-3
        .mockResolvedValueOnce(createMockAPIKey('request-3', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - success

      // Mock successful patch operations
      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any) // request-1 succeeds
        .mockResolvedValueOnce({} as any); // request-3 succeeds

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'APIProduct not found',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });
    });

    it('handles partial success when some API keys have no apiProductRef', async () => {
      // Mock permission check - user has updateOwn permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      const invalidAPIKey = {
        ...createMockAPIKey('request-2', ''),
        spec: { planTier: 'gold', requestedBy: { userId: 'user:default/consumer' } },
      };

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockResolvedValueOnce(invalidAPIKey); // fetch APIKey - no apiProductRef, stops here

      mockK8sClient.patchCustomResourceStatus.mockResolvedValueOnce({} as any);

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'API key has no associated API product.',
      });

      // Verify only request-1 was patched
      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(1);
    });

    it('handles partial success when user owns some but not all API products', async () => {
      // Mock permission check - user has updateOwn permission (not admin)
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - owned by current user
        // request-2
        .mockResolvedValueOnce(createMockAPIKey('request-2', 'other-api')) // fetch APIKey
        .mockResolvedValueOnce(mockOtherAPIProduct) // fetch APIProduct - owned by other user
        // request-3
        .mockResolvedValueOnce(createMockAPIKey('request-3', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - owned by current user

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'You can only approve requests for your own API products.',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });

      // Verify only owned products were patched
      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when patch operations fail', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any) // request-1 succeeds
        .mockRejectedValueOnce(new Error('Conflict: resource version mismatch')) // request-2 fails
        .mockResolvedValueOnce({} as any); // request-3 succeeds

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'Conflict: resource version mismatch',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });
    });

    it('allows admin to approve all requests regardless of ownership', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any); // request-1 succeeds
      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any); // request-2 succeeds

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: true,
      });

      // Verify ownership was never checked (admin bypass)
      expect(mockK8sClient.getCustomResource).not.toHaveBeenCalled();
      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(2);
    });

    it('returns 403 when user has no update permissions', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateOwn denied
      ]);

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests: [{ namespace: 'toystore', name: 'request-1' }] })
        .expect(403);

      expect(response.body).toEqual({ error: 'unauthorised' });
      expect(mockK8sClient.patchCustomResourceStatus).not.toHaveBeenCalled();
    });

    it('returns 500 when request body is invalid', async () => {
      await request(app)
        .post('/requests/bulk-approve')
        .send({ invalid: 'data' })
        .expect(500);

      // Schema validation throws InputError which is caught and returns 500
    });
  });

  describe('POST /requests/bulk-reject', () => {
    const namespace = 'toystore';
    const mockAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name: 'toystore-api',
        namespace,
        annotations: {
          'backstage.io/owner': mockUserEntityRef,
        },
      },
      spec: {},
    };

    const mockOtherAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name: 'other-api',
        namespace,
        annotations: {
          'backstage.io/owner': mockOtherUserEntityRef,
        },
      },
      spec: {},
    };

    const createMockAPIKey = (name: string, apiProductName: string) => ({
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKey',
      metadata: { name, namespace },
      spec: {
        apiProductRef: { name: apiProductName },
        planTier: 'gold',
        requestedBy: { userId: 'user:default/consumer' },
      },
      status: { phase: 'Pending' },
    });

    it('handles partial success when some API keys do not exist', async () => {
      // Mock permission check - user has updateOwn permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockRejectedValueOnce(new Error('APIKey not found')) // fetch APIKey - fail, stops here
        // request-3
        .mockResolvedValueOnce(createMockAPIKey('request-3', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'APIKey not found',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });

      // Verify only 2 patches happened
      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when some API products do not exist', async () => {
      // Mock permission check - user has updateOwn permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - success
        // request-2
        .mockResolvedValueOnce(createMockAPIKey('request-2', 'missing-api')) // fetch APIKey
        .mockRejectedValueOnce(new Error('APIProduct not found')); // fetch APIProduct - fail

      mockK8sClient.patchCustomResourceStatus.mockResolvedValueOnce({} as any);

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'APIProduct not found',
      });

      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(1);
    });

    it('handles partial success when user owns some but not all API products', async () => {
      // Mock permission check - user has updateOwn permission (not admin)
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - owned by current user
        // request-2
        .mockResolvedValueOnce(createMockAPIKey('request-2', 'other-api')) // fetch APIKey
        .mockResolvedValueOnce(mockOtherAPIProduct) // fetch APIProduct - owned by other user
        // request-3
        .mockResolvedValueOnce(createMockAPIKey('request-3', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - owned by current user

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'You can only reject requests for your own API products.',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });

      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when patch operations fail', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockResolvedValueOnce(createMockAPIKey('request-2', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-3
        .mockResolvedValueOnce(createMockAPIKey('request-3', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any) // request-1 succeeds
        .mockRejectedValueOnce(new Error('Network timeout')) // request-2 fails
        .mockResolvedValueOnce({} as any); // request-3 succeeds

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: false,
        error: 'Network timeout',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });
    });

    it('allows admin to reject all requests regardless of ownership', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKey('request-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockResolvedValueOnce(createMockAPIKey('request-2', 'other-api')) // fetch APIKey
        .mockResolvedValueOnce(mockOtherAPIProduct); // fetch APIProduct

      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any); // request-1 succeeds
      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any); // request-2 succeeds

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'request-1',
        success: true,
      });
      expect(response.body.results[1]).toEqual({
        namespace,
        name: 'request-2',
        success: true,
      });

      expect(mockK8sClient.patchCustomResourceStatus).toHaveBeenCalledTimes(2);
    });

    it('returns 403 when user has no update permissions', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateOwn denied
      ]);

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests: [{ namespace: 'toystore', name: 'request-1' }] })
        .expect(403);

      expect(response.body).toEqual({ error: 'unauthorised' });
      expect(mockK8sClient.patchCustomResourceStatus).not.toHaveBeenCalled();
    });

    it('returns proper response format with mixed results', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'success-1' },
        { namespace, name: 'fail-apikey-missing' },
        { namespace, name: 'fail-apiproduct-missing' },
        { namespace, name: 'success-2' },
        { namespace, name: 'fail-patch-error' },
      ];

      mockK8sClient.getCustomResource
        // success-1
        .mockResolvedValueOnce(createMockAPIKey('success-1', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - success
        // fail-apikey-missing
        .mockRejectedValueOnce(new Error('APIKey not found')) // fetch APIKey - fail, stops here
        // fail-apiproduct-missing
        .mockResolvedValueOnce(createMockAPIKey('fail-apiproduct-missing', 'missing-product')) // fetch APIKey
        .mockRejectedValueOnce(new Error('APIProduct not found')) // fetch APIProduct - fail
        // success-2
        .mockResolvedValueOnce(createMockAPIKey('success-2', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - success
        // fail-patch-error
        .mockResolvedValueOnce(createMockAPIKey('fail-patch-error', 'toystore-api')) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - success

      // Patch results
      mockK8sClient.patchCustomResourceStatus
        .mockResolvedValueOnce({} as any) // success-1
        .mockResolvedValueOnce({} as any) // success-2
        .mockRejectedValueOnce(new Error('Patch failed')); // fail-patch-error

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(5);

      // Verify exact response structure
      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'success-1',
        success: true,
      });
      expect(response.body.results[1]).toMatchObject({
        namespace,
        name: 'fail-apikey-missing',
        success: false,
        error: expect.any(String),
      });
      expect(response.body.results[2]).toMatchObject({
        namespace,
        name: 'fail-apiproduct-missing',
        success: false,
        error: expect.any(String),
      });
      expect(response.body.results[3]).toEqual({
        namespace,
        name: 'success-2',
        success: true,
      });
      expect(response.body.results[4]).toMatchObject({
        namespace,
        name: 'fail-patch-error',
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('PATCH /apiproducts/:namespace/:name', () => {
    const namespace = 'toystore';
    const name = 'toystore-api';

    const mockAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name,
        namespace,
        annotations: {
          'backstage.io/owner': mockUserEntityRef,
        },
      },
      spec: {
        displayName: 'Toystore API',
        description: 'API for toystore',
        publishStatus: 'Draft',
      },
    };

    it('allows owner to update their own API product', async () => {
      // Mock permission check - user has updateOwn permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY }, // updateAll denied
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateOwn allowed
      ]);

      // Mock k8s client responses
      mockK8sClient.getCustomResource.mockResolvedValue(mockAPIProduct);

      const updatedAPIProduct = {
        ...mockAPIProduct,
        spec: {
          ...mockAPIProduct.spec,
          displayName: 'Updated Toystore API',
          documentation: {
            openAPISpecURL: 'https://example.com',
          },
        },
      };

      mockK8sClient.patchCustomResource.mockResolvedValue(updatedAPIProduct);

      const patchData = {
        spec: {
          displayName: 'Updated Toystore API',
          documentation: {
            openAPISpecURL: 'https://example.com',
          },
        },
      };

      const response = await request(app)
        .patch(`/apiproducts/${namespace}/${name}`)
        .send(patchData)
        .expect(200);

      // Verify response
      expect(response.body.spec.displayName).toBe('Updated Toystore API');
      expect(response.body.spec.documentation.openAPISpecURL).toBe('https://example.com');

      // Verify k8s client was called correctly
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        name,
      );

      expect(mockK8sClient.patchCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        name,
        patchData,
      );
    });
  });
});

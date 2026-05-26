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
      getNamespace: jest.fn().mockResolvedValue({ metadata: { name: 'kuadrant-testuser-c7a65229' } }),
      createNamespace: jest.fn(),
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
        secretRef: {
          name: secretName,
        },
      },
      status: {
        phase: 'Approved',
        reviewedBy: 'api-owner',
        reviewedAt: '2024-12-02T10:05:00Z',
        apiKey: apiKeyValue,
        apiHostname: 'toystore.apps.example.com',
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

    it('returns secret when user has permission', async () => {
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
        spec: {
          ...mockAPIKey.spec,
          secretRef: undefined,
        },
      };

      mockK8sClient.getCustomResource.mockResolvedValue(noSecretRefAPIKey);

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'secretRef not found in APIKey spec',
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

  describe('POST /secrets', () => {
    it('should create secret in consumer namespace derived from user identity', async () => {
      // Mock permission check - user has create permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      // consumer namespace: kuadrant-{sanitized}-{8char sha256 of userEntityRef}
      const consumerNamespace = 'kuadrant-testuser-c7a65229';

      const mockSecret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: 'test-secret',
          namespace: consumerNamespace,
        },
        type: 'Opaque',
        data: {
          api_key: Buffer.from('test-key-123').toString('base64'),
        },
      };

      mockK8sClient.createSecret.mockResolvedValue(mockSecret);

      const response = await request(app)
        .post('/secrets')
        .send({
          name: 'test-secret',
          apiKeyValue: 'test-key-123',
        })
        .expect(201);

      expect(response.body.metadata.name).toBe('test-secret');
      expect(response.body.metadata.namespace).toBe(consumerNamespace);
      expect(mockK8sClient.createSecret).toHaveBeenCalledWith(
        consumerNamespace,
        expect.objectContaining({
          metadata: { name: 'test-secret', namespace: consumerNamespace },
          data: { api_key: Buffer.from('test-key-123').toString('base64') },
        }),
      );
    });

    it('should validate input schema', async () => {
      const response = await request(app)
        .post('/secrets')
        .send({ name: 'test-secret' }) // missing apiKeyValue
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should check permissions', async () => {
      // Mock permission check - user does not have create permission
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);

      await request(app)
        .post('/secrets')
        .send({ name: 'test-secret', apiKeyValue: 'test-key' })
        .expect(403);
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

    const createMockAPIKeyRequest = (name: string, apiProductName: string) => ({
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKeyRequest',
      metadata: {
        name,
        namespace,
        creationTimestamp: '2024-12-02T10:00:00Z',
      },
      spec: {
        apiProductRef: { name: apiProductName },
        apiKeyRef: { name: `${name}-apikey`, namespace: 'consumer-ns' },
        planTier: 'gold',
        useCase: 'Testing API integration',
        requestedBy: { userId: 'user:default/consumer', email: 'consumer@example.com' },
      },
      status: { conditions: [] },
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

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - success
        // request-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'missing-api')) // fetch APIKeyRequest
        .mockRejectedValueOnce(new Error('APIProduct not found')) // fetch APIProduct - fail
        // request-3
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - success

      mockK8sClient.createCustomResource
        .mockResolvedValueOnce({} as any) // request-1 approval created
        .mockResolvedValueOnce({} as any); // request-3 approval created

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

      // Verify APIKeyRequests were fetched from correct resource type
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io', 'v1alpha1', namespace, 'apikeyrequests', 'request-1',
      );

      // Verify APIKeyApprovals were created with correct spec
      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
      const firstApprovalCall = mockK8sClient.createCustomResource.mock.calls[0];
      expect(firstApprovalCall[0]).toBe('devportal.kuadrant.io');
      expect(firstApprovalCall[1]).toBe('v1alpha1');
      expect(firstApprovalCall[2]).toBe(namespace);
      expect(firstApprovalCall[3]).toBe('apikeyapprovals');
      expect(firstApprovalCall[4]).toMatchObject({
        apiVersion: 'devportal.kuadrant.io/v1alpha1',
        kind: 'APIKeyApproval',
        metadata: { namespace },
        spec: {
          apiKeyRequestRef: { name: 'request-1' },
          approved: true,
          reviewedBy: mockUserEntityRef,
        },
      });
    });

    it('handles partial success when some API key requests have no apiProductRef', async () => {
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

      const invalidAPIKeyRequest = {
        ...createMockAPIKeyRequest('request-2', ''),
        spec: { planTier: 'gold', requestedBy: { userId: 'user:default/consumer' } },
      };

      mockK8sClient.getCustomResource
        // request-1
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockResolvedValueOnce(invalidAPIKeyRequest); // fetch APIKeyRequest - no apiProductRef

      mockK8sClient.createCustomResource.mockResolvedValueOnce({} as any);

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
        error: 'API key request has no associated API product.',
      });

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(1);
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
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - owned by current user
        // request-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockOtherAPIProduct) // fetch APIProduct - owned by other user
        // request-3
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - owned by current user

      mockK8sClient.createCustomResource
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

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when approval creation fails', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      mockK8sClient.createCustomResource
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

      mockK8sClient.createCustomResource
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

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
      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
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
      expect(mockK8sClient.createCustomResource).not.toHaveBeenCalled();
    });

    it('returns 500 when request body is invalid', async () => {
      await request(app)
        .post('/requests/bulk-approve')
        .send({ invalid: 'data' })
        .expect(500);
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

    const createMockAPIKeyRequest = (name: string, apiProductName: string) => ({
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKeyRequest',
      metadata: {
        name,
        namespace,
        creationTimestamp: '2024-12-02T10:00:00Z',
      },
      spec: {
        apiProductRef: { name: apiProductName },
        apiKeyRef: { name: `${name}-apikey`, namespace: 'consumer-ns' },
        planTier: 'gold',
        useCase: 'Testing API integration',
        requestedBy: { userId: 'user:default/consumer', email: 'consumer@example.com' },
      },
      status: { conditions: [] },
    });

    it('handles partial success when some API key requests do not exist', async () => {
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
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockRejectedValueOnce(new Error('APIKeyRequest not found')) // fetch APIKeyRequest - fail
        // request-3
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct

      mockK8sClient.createCustomResource
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
        error: 'APIKeyRequest not found',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });

      // Verify APIKeyRequests were fetched from correct resource type
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io', 'v1alpha1', namespace, 'apikeyrequests', 'request-1',
      );

      // Verify APIKeyApprovals were created with approved=false
      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
      const firstApprovalCall = mockK8sClient.createCustomResource.mock.calls[0];
      expect(firstApprovalCall[0]).toBe('devportal.kuadrant.io');
      expect(firstApprovalCall[1]).toBe('v1alpha1');
      expect(firstApprovalCall[2]).toBe(namespace);
      expect(firstApprovalCall[3]).toBe('apikeyapprovals');
      expect(firstApprovalCall[4]).toMatchObject({
        apiVersion: 'devportal.kuadrant.io/v1alpha1',
        kind: 'APIKeyApproval',
        metadata: { namespace },
        spec: {
          apiKeyRequestRef: { name: 'request-1' },
          approved: false,
          reviewedBy: mockUserEntityRef,
        },
      });
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
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - success
        // request-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'missing-api')) // fetch APIKeyRequest
        .mockRejectedValueOnce(new Error('APIProduct not found')); // fetch APIProduct - fail

      mockK8sClient.createCustomResource.mockResolvedValueOnce({} as any);

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

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(1);
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
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct - owned by current user
        // request-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockOtherAPIProduct) // fetch APIProduct - owned by other user
        // request-3
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct - owned by current user

      mockK8sClient.createCustomResource
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

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when approval creation fails', async () => {
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
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-3
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct

      mockK8sClient.createCustomResource
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
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // request-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockOtherAPIProduct); // fetch APIProduct

      mockK8sClient.createCustomResource
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

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

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
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
      expect(mockK8sClient.createCustomResource).not.toHaveBeenCalled();
    });

    it('returns proper response format with mixed results', async () => {
      // Mock permission check - admin user
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW }, // updateAll allowed
      ]);

      const requests = [
        { namespace, name: 'success-1' },
        { namespace, name: 'fail-request-missing' },
        { namespace, name: 'fail-apiproduct-missing' },
        { namespace, name: 'success-2' },
        { namespace, name: 'fail-approval-error' },
      ];

      mockK8sClient.getCustomResource
        // success-1
        .mockResolvedValueOnce(createMockAPIKeyRequest('success-1', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // fail-request-missing
        .mockRejectedValueOnce(new Error('APIKeyRequest not found')) // fetch APIKeyRequest - fail
        // fail-apiproduct-missing
        .mockResolvedValueOnce(createMockAPIKeyRequest('fail-apiproduct-missing', 'missing-product')) // fetch APIKeyRequest
        .mockRejectedValueOnce(new Error('APIProduct not found')) // fetch APIProduct - fail
        // success-2
        .mockResolvedValueOnce(createMockAPIKeyRequest('success-2', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct) // fetch APIProduct
        // fail-approval-error
        .mockResolvedValueOnce(createMockAPIKeyRequest('fail-approval-error', 'toystore-api')) // fetch APIKeyRequest
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct

      mockK8sClient.createCustomResource
        .mockResolvedValueOnce({} as any) // success-1
        .mockResolvedValueOnce({} as any) // success-2
        .mockRejectedValueOnce(new Error('Create failed')); // fail-approval-error

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests })
        .expect(200);

      expect(response.body.results).toHaveLength(5);

      expect(response.body.results[0]).toEqual({
        namespace,
        name: 'success-1',
        success: true,
      });
      expect(response.body.results[1]).toMatchObject({
        namespace,
        name: 'fail-request-missing',
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
        name: 'fail-approval-error',
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('GET /requests', () => {
    const namespace = 'toystore';

    const createMockAPIKeyRequest = (name: string, apiProductName: string, status: string) => ({
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKeyRequest',
      metadata: { name, namespace, creationTimestamp: '2024-12-02T10:00:00Z' },
      spec: {
        apiProductRef: { name: apiProductName },
        apiKeyRef: { name: `${name}-apikey`, namespace: 'consumer-ns' },
        planTier: 'gold',
        useCase: 'Testing',
        requestedBy: { userId: 'user:default/consumer', email: 'consumer@example.com' },
      },
      status: {
        conditions: status === 'Approved' ? [{ type: 'Approved', status: 'True' }]
          : status === 'Denied' ? [{ type: 'Denied', status: 'True' }]
          : [],
      },
    });

    const mockAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name: 'toystore-api',
        namespace,
        annotations: { 'backstage.io/owner': mockUserEntityRef },
      },
      spec: {},
    };

    it('lists apikeyrequests with correct CRD and namespace', async () => {
      // readAll allowed
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources.mockResolvedValueOnce({
        items: [createMockAPIKeyRequest('req-1', 'toystore-api', 'Pending')],
      });

      const response = await request(app)
        .get(`/requests?namespace=${namespace}`)
        .expect(200);

      expect(mockK8sClient.listCustomResources).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        'apikeyrequests',
        namespace,
      );
      expect(response.body.items).toHaveLength(1);
    });

    it('lists all apikeyrequests cluster-wide when no namespace provided', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources.mockResolvedValueOnce({ items: [] });

      await request(app).get('/requests').expect(200);

      expect(mockK8sClient.listCustomResources).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        'apikeyrequests',
      );
    });

    it('filters by owned API products when user has readOwn permission', async () => {
      // readAll denied, readOwn allowed
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources
        .mockResolvedValueOnce({
          items: [
            createMockAPIKeyRequest('req-1', 'toystore-api', 'Pending'),
            createMockAPIKeyRequest('req-2', 'other-api', 'Pending'),
          ],
        })
        .mockResolvedValueOnce({
          items: [mockAPIProduct],
        });

      const response = await request(app).get('/requests').expect(200);

      // only req-1 returned (toystore-api owned by testuser)
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].metadata.name).toBe('req-1');
    });

    it('filters by status', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources.mockResolvedValueOnce({
        items: [
          createMockAPIKeyRequest('req-approved', 'toystore-api', 'Approved'),
          createMockAPIKeyRequest('req-pending', 'toystore-api', 'Pending'),
          createMockAPIKeyRequest('req-denied', 'toystore-api', 'Denied'),
        ],
      });

      const response = await request(app)
        .get('/requests?status=Approved')
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].metadata.name).toBe('req-approved');
    });

    it('returns 403 when user has no read permissions', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);

      const response = await request(app).get('/requests').expect(403);
      expect(response.body.error).toBe('unauthorised');
    });
  });

  describe('GET /requests/my', () => {
    const createMockAPIKey = (name: string, apiProductName: string, apiProductNamespace: string, userId: string) => ({
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKey',
      metadata: { name, namespace: 'kuadrant-testuser-c7a65229', creationTimestamp: '2024-12-02T10:00:00Z' },
      spec: {
        apiProductRef: { name: apiProductName, namespace: apiProductNamespace },
        planTier: 'gold',
        useCase: 'Testing',
        requestedBy: { userId, email: 'test@example.com' },
        secretRef: { name: `${name}-secret` },
      },
      status: { conditions: [] },
    });

    it('lists apikeys from derived consumer namespace with correct CRD', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources.mockResolvedValueOnce({
        items: [createMockAPIKey('key-1', 'toystore-api', 'toystore', mockUserEntityRef)],
      });

      const response = await request(app).get('/requests/my').expect(200);

      // verify correct CRD plural and derived consumer namespace (not a query param)
      const listCall = mockK8sClient.listCustomResources.mock.calls[0];
      expect(listCall[0]).toBe('devportal.kuadrant.io');
      expect(listCall[1]).toBe('v1alpha1');
      expect(listCall[2]).toBe('apikeys');
      expect(listCall[3]).toMatch(/^kuadrant-testuser-/);

      expect(response.body.items).toHaveLength(1);
    });

    it('filters items by authenticated user identity', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources.mockResolvedValueOnce({
        items: [
          createMockAPIKey('key-own', 'toystore-api', 'toystore', mockUserEntityRef),
          createMockAPIKey('key-other', 'toystore-api', 'toystore', mockOtherUserEntityRef),
        ],
      });

      const response = await request(app).get('/requests/my').expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].metadata.name).toBe('key-own');
    });

    it('filters by apiProductName and apiProductNamespace', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.listCustomResources.mockResolvedValueOnce({
        items: [
          createMockAPIKey('key-toystore', 'toystore-api', 'toystore', mockUserEntityRef),
          createMockAPIKey('key-petstore', 'petstore-api', 'petstore', mockUserEntityRef),
        ],
      });

      const response = await request(app)
        .get('/requests/my?apiProductName=toystore-api&apiProductNamespace=toystore')
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].metadata.name).toBe('key-toystore');
    });

    it('returns empty array when consumer namespace does not exist', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      const error404 = new Error('404 not found');
      mockK8sClient.listCustomResources.mockRejectedValueOnce(error404);

      const response = await request(app).get('/requests/my').expect(200);
      expect(response.body.items).toEqual([]);
    });

    it('returns 403 when user has no read permissions', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);

      const response = await request(app).get('/requests/my').expect(403);
      expect(response.body.error).toBe('unauthorised');
    });
  });

  describe('DELETE /requests/:namespace/:name', () => {
    const consumerNamespace = 'kuadrant-consumer-abc123';
    const apiKeyName = 'toystore-api-abc123';
    const ownerNamespace = 'toystore';

    const mockAPIKey = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIKey',
      metadata: {
        name: apiKeyName,
        namespace: consumerNamespace,
      },
      spec: {
        apiProductRef: {
          name: 'toystore-api',
          namespace: ownerNamespace,
        },
        planTier: 'gold',
        useCase: 'Testing API integration',
        requestedBy: {
          userId: mockUserEntityRef,
          email: 'testuser@example.com',
        },
        secretRef: {
          name: 'testuser-toystore-secret',
        },
      },
      status: { conditions: [] },
    };

    const mockOtherUserAPIKey = {
      ...mockAPIKey,
      spec: {
        ...mockAPIKey.spec,
        requestedBy: {
          userId: mockOtherUserEntityRef,
          email: 'otheruser@example.com',
        },
      },
    };

    const mockAPIProduct = {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: {
        name: 'toystore-api',
        namespace: ownerNamespace,
        annotations: {
          'backstage.io/owner': mockUserEntityRef,
        },
      },
      spec: {},
    };

    const mockOtherAPIProduct = {
      ...mockAPIProduct,
      metadata: {
        ...mockAPIProduct.metadata,
        annotations: {
          'backstage.io/owner': mockOtherUserEntityRef,
        },
      },
    };

    it('allows consumer to delete their own APIKey', async () => {
      // deleteAll denied, deleteOwn allowed
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      mockK8sClient.getCustomResource.mockResolvedValueOnce(mockAPIKey);
      mockK8sClient.deleteCustomResource.mockResolvedValueOnce({} as any);

      await request(app)
        .delete(`/requests/${consumerNamespace}/${apiKeyName}`)
        .expect(204);

      expect(mockK8sClient.deleteCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        consumerNamespace,
        'apikeys',
        apiKeyName,
      );
    });

    it('allows owner to delete APIKey for their own API product', async () => {
      // deleteAll denied, deleteOwn allowed
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      // APIKey belongs to other user, but testuser owns the API product
      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(mockOtherUserAPIKey) // fetch APIKey
        .mockResolvedValueOnce(mockAPIProduct); // fetch APIProduct — owned by testuser
      mockK8sClient.deleteCustomResource.mockResolvedValueOnce({} as any);

      await request(app)
        .delete(`/requests/${consumerNamespace}/${apiKeyName}`)
        .expect(204);

      expect(mockK8sClient.deleteCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        consumerNamespace,
        'apikeys',
        apiKeyName,
      );
    });

    it('allows admin to delete any APIKey', async () => {
      // deleteAll allowed
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      mockK8sClient.getCustomResource.mockResolvedValueOnce(mockOtherUserAPIKey);
      mockK8sClient.deleteCustomResource.mockResolvedValueOnce({} as any);

      await request(app)
        .delete(`/requests/${consumerNamespace}/${apiKeyName}`)
        .expect(204);

      expect(mockK8sClient.deleteCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io',
        'v1alpha1',
        consumerNamespace,
        'apikeys',
        apiKeyName,
      );

      // admin path should NOT fetch APIProduct for ownership
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when consumer tries to delete another users APIKey', async () => {
      // deleteAll denied, deleteOwn allowed
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      // APIKey belongs to other user, API product also owned by other user
      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(mockOtherUserAPIKey) // fetch APIKey
        .mockResolvedValueOnce(mockOtherAPIProduct); // fetch APIProduct — owned by otheruser

      const response = await request(app)
        .delete(`/requests/${consumerNamespace}/${apiKeyName}`)
        .expect(403);

      expect(response.body.error).toContain('you can only delete');
      expect(mockK8sClient.deleteCustomResource).not.toHaveBeenCalled();
    });

    it('returns 403 when user has no delete permissions', async () => {
      // deleteAll denied, deleteOwn denied
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);

      mockK8sClient.getCustomResource.mockResolvedValueOnce(mockAPIKey);

      const response = await request(app)
        .delete(`/requests/${consumerNamespace}/${apiKeyName}`)
        .expect(403);

      expect(response.body.error).toBe('unauthorised');
      expect(mockK8sClient.deleteCustomResource).not.toHaveBeenCalled();
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

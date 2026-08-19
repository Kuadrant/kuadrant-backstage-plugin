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

      // a genuine 404 from the api server: the referenced secret is gone
      mockK8sClient.getSecret.mockRejectedValue(
        Object.assign(
          new Error('failed to get secret: secrets "missing" not found'),
          { statusCode: 404 },
        ),
      );

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(404);

      expect(response.body).toEqual({
        error: 'secret not found',
      });
    });

    it('does not turn a non-404 secret failure into a 404', async () => {
      // a 403 is the backend's service account missing rbac, not a missing
      // secret. it must reach the mapper, which logs it and answers generically
      // rather than passing it off as not-found.
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.DENY },
      ]);
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      mockK8sClient.getCustomResource.mockResolvedValue(mockAPIKey);

      mockK8sClient.getSecret.mockRejectedValue(
        Object.assign(
          new Error('failed to get secret: secrets is forbidden'),
          { statusCode: 403 },
        ),
      );

      const response = await request(app)
        .get(`/apikeys/${namespace}/${name}/secret`)
        .expect(500);

      expect(response.body).toEqual({
        error: 'failed to read api key secret',
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

    it('does not leak the service account rbac detail on a create failure', async () => {
      // a 403 from the api server is this backend's service account missing an
      // rbac rule, and its message names the account, namespace and resource.
      // that belongs in the operator log, not the response body.
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      mockK8sClient.createSecret.mockRejectedValue(
        Object.assign(
          new Error(
            'failed to create secret: secrets is forbidden: User "system:serviceaccount:rhdh:rhdh" cannot create resource "secrets" in namespace "kuadrant-testuser-c7a65229"',
          ),
          { statusCode: 403 },
        ),
      );

      const response = await request(app)
        .post('/secrets')
        .send({ name: 'test-secret', apiKeyValue: 'test-key-123' })
        .expect(500);

      expect(response.body.error).toBe('failed to create secret');
      expect(response.body.error).not.toContain('serviceaccount');
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
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Per-request permission checks (verifyApiKeyUpdatePermission)
      // request-1: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-2: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-3: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.getCustomResource
        // request-1: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct)
        // request-2: fetch APIKeyRequest, then APIProduct fails (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'missing-api'))
        .mockRejectedValueOnce(new Error('APIProduct not found'))
        // request-3: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct);

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
        error: expect.stringContaining('missing-api'),
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
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      const invalidAPIKeyRequest = {
        ...createMockAPIKeyRequest('request-2', ''),
        spec: { planTier: 'gold', requestedBy: { userId: 'user:default/consumer' } },
      };

      // request-1: per-request permission checks
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-2: no permission calls - fails before reaching verifyApiKeyUpdatePermission

      mockK8sClient.getCustomResource
        // request-1: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct)
        // request-2: fetch APIKeyRequest - no apiProductRef, throws before permission check
        .mockResolvedValueOnce(invalidAPIKeyRequest);

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
        error: 'apiProductRef.name is required in APIKeyRequest spec',
      });

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(1);
    });

    it('handles partial success when user owns some but not all API products', async () => {
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Per-request permission checks (verifyApiKeyUpdatePermission)
      // request-1: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-2: updateAll DENY, updateOwn ALLOW (but ownership fails)
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-3: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.getCustomResource
        // request-1: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct) // owned by current user
        // request-2: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api'))
        .mockResolvedValueOnce(mockOtherAPIProduct) // owned by other user
        // request-3: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct); // owned by current user

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
        error: 'you can only update requests for your own api products',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when approval creation fails', async () => {
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Per-request permission checks - admin user
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-1
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-2
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-3

      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'toystore-api'))
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api'));

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
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      // Per-request permission checks - admin user
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-1
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-2

      // Admin still fetches APIKeyRequests (to get apiProductRef.name) but skips ownership check
      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api'));

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

      // Admin fetches APIKeyRequests but not APIProducts (no ownership check)
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledTimes(2);
      expect(mockK8sClient.getCustomResource).toHaveBeenCalledWith(
        'devportal.kuadrant.io', 'v1alpha1', namespace, 'apikeyrequests', 'request-1',
      );
      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
    });

    it('returns per-request failure when user has no update permissions', async () => {
      // Per-request permission check: updateAll DENY, updateOwn DENY
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);

      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'));

      const response = await request(app)
        .post('/requests/bulk-approve')
        .send({ requests: [{ namespace: 'toystore', name: 'request-1' }] })
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0]).toEqual({
        namespace: 'toystore',
        name: 'request-1',
        success: false,
        error: 'unauthorised',
      });
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
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Per-request permission checks (verifyApiKeyUpdatePermission)
      // request-1: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-2: fails before permission check (APIKeyRequest not found)
      // request-3: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.getCustomResource
        // request-1: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct)
        // request-2: fetch APIKeyRequest - fail
        .mockRejectedValueOnce(new Error('APIKeyRequest not found'))
        // request-3: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct);

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
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      // Per-request permission checks
      // request-1: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-2: updateAll DENY, updateOwn ALLOW (but APIProduct not found)
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.getCustomResource
        // request-1: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct)
        // request-2: fetch APIKeyRequest, then APIProduct fails (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'missing-api'))
        .mockRejectedValueOnce(new Error('APIProduct not found'));

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
        error: expect.stringContaining('missing-api'),
      });

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(1);
    });

    it('handles partial success when user owns some but not all API products', async () => {
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Per-request permission checks
      // request-1: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-2: updateAll DENY, updateOwn ALLOW (but ownership fails)
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      // request-3: updateAll DENY, updateOwn ALLOW
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);

      mockK8sClient.getCustomResource
        // request-1: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct) // owned by current user
        // request-2: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api'))
        .mockResolvedValueOnce(mockOtherAPIProduct) // owned by other user
        // request-3: fetch APIKeyRequest, then APIProduct (inside verifyApiKeyUpdatePermission)
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api'))
        .mockResolvedValueOnce(mockAPIProduct); // owned by current user

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
        error: 'you can only update requests for your own api products',
      });
      expect(response.body.results[2]).toEqual({
        namespace,
        name: 'request-3',
        success: true,
      });

      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
    });

    it('handles partial success when approval creation fails', async () => {
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
        { namespace, name: 'request-3' },
      ];

      // Per-request permission checks - admin user
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-1
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-2
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-3

      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'toystore-api'))
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-3', 'toystore-api'));

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
      const requests = [
        { namespace, name: 'request-1' },
        { namespace, name: 'request-2' },
      ];

      // Per-request permission checks - admin user
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-1
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // request-2

      // Admin still fetches APIKeyRequests but skips ownership check
      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'))
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-2', 'other-api'));

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

      expect(mockK8sClient.getCustomResource).toHaveBeenCalledTimes(2);
      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(2);
    });

    it('returns per-request failure when user has no update permissions', async () => {
      // Per-request permission check: updateAll DENY, updateOwn DENY
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.DENY }]);

      mockK8sClient.getCustomResource
        .mockResolvedValueOnce(createMockAPIKeyRequest('request-1', 'toystore-api'));

      const response = await request(app)
        .post('/requests/bulk-reject')
        .send({ requests: [{ namespace: 'toystore', name: 'request-1' }] })
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0]).toEqual({
        namespace: 'toystore',
        name: 'request-1',
        success: false,
        error: 'unauthorised',
      });
      expect(mockK8sClient.createCustomResource).not.toHaveBeenCalled();
    });

    it('returns proper response format with mixed results', async () => {
      const requests = [
        { namespace, name: 'success-1' },
        { namespace, name: 'fail-request-missing' },
        { namespace, name: 'fail-no-apiproductref' },
        { namespace, name: 'success-2' },
        { namespace, name: 'fail-approval-error' },
      ];

      const noApiProductRefRequest = {
        ...createMockAPIKeyRequest('fail-no-apiproductref', ''),
        spec: { planTier: 'gold', requestedBy: { userId: 'user:default/consumer' } },
      };

      // Per-request permission checks - admin user
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // success-1
      // fail-request-missing: fails before permission check
      // fail-no-apiproductref: fails before permission check (no apiProductRef)
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // success-2
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]); // fail-approval-error

      mockK8sClient.getCustomResource
        // success-1: fetch APIKeyRequest
        .mockResolvedValueOnce(createMockAPIKeyRequest('success-1', 'toystore-api'))
        // fail-request-missing: fetch APIKeyRequest - fail
        .mockRejectedValueOnce(new Error('APIKeyRequest not found'))
        // fail-no-apiproductref: fetch APIKeyRequest - no apiProductRef
        .mockResolvedValueOnce(noApiProductRefRequest)
        // success-2: fetch APIKeyRequest
        .mockResolvedValueOnce(createMockAPIKeyRequest('success-2', 'toystore-api'))
        // fail-approval-error: fetch APIKeyRequest
        .mockResolvedValueOnce(createMockAPIKeyRequest('fail-approval-error', 'toystore-api'));

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
        name: 'fail-no-apiproductref',
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
          namespace: 'toystore',
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

    it('allows consumer to delete their own APIKey', async () => {
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

    it('returns 403 when consumer tries to delete another users APIKey', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([
        { result: AuthorizeResult.ALLOW },
      ]);

      mockK8sClient.getCustomResource.mockResolvedValueOnce(mockOtherUserAPIKey);

      const response = await request(app)
        .delete(`/requests/${consumerNamespace}/${apiKeyName}`)
        .expect(403);

      expect(response.body.error).toContain('you can only delete');
      expect(mockK8sClient.deleteCustomResource).not.toHaveBeenCalled();
    });

    it('returns 403 when user has no delete permissions', async () => {
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
  describe('kubernetes error propagation', () => {
    // the status the api server returned has to survive the client, but only
    // the statuses that describe the caller's own request should reach them as
    // themselves. this backend talks to the api server as one service account
    // and never impersonates the caller, so anything about that account's own
    // access is the operator's problem, not the caller's.
    const k8sError = (
      statusCode: number,
      message: string,
      details?: Record<string, unknown>,
    ) => Object.assign(new Error(message), { statusCode, details });

    it('leaves a kubernetes 403 as 500 rather than blaming the caller', async () => {
      // the caller got this far, so backstage's own permission check allowed
      // them. a forbidden here is the backend's service account missing an rbac
      // rule; answering 403 makes the ui tell the caller they lack access to
      // the very thing they were just allowed to do.
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(403, 'failed to list apikeyrequests: apikeyrequests.devportal.kuadrant.io is forbidden'),
      );

      const response = await request(app).get('/requests').expect(500);

      expect(response.body.error).toBe('failed to fetch api key requests');
    });

    it('maps a kubernetes 404 for a missing object to 404', async () => {
      // details.kind means the api server knows the kind and simply has no such
      // object: a real not-found, and the caller's to see.
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(404, 'failed to list apikeyrequests: apikeyrequests.devportal.kuadrant.io "missing" not found', {
          group: 'devportal.kuadrant.io',
          kind: 'apikeyrequests',
          name: 'missing',
        }),
      );

      const response = await request(app).get('/requests').expect(404);

      expect(response.body.error).toBe('not found');
    });

    it('leaves a kubernetes 404 for a missing resource type as 500', async () => {
      // the generic "could not find the requested resource" with no details is
      // what the api server says when nothing serves the kind at all, i.e. the
      // crds are not installed. answering 404 dresses an absent operator up as
      // an ordinary empty result.
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(404, 'failed to list apikeyrequests: the server could not find the requested resource'),
      );

      const response = await request(app).get('/requests').expect(500);

      expect(response.body.error).toBe('failed to fetch api key requests');
    });

    it('maps a kubernetes 429 to 503 and passes on the retry delay', async () => {
      // the api server is throttling this backend's service account, not the
      // caller. transient and worth retrying, but not the caller's fault.
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(429, 'failed to list apikeyrequests: too many requests', {
          retryAfterSeconds: 7,
        }),
      );

      const response = await request(app).get('/requests').expect(503);

      expect(response.body.error).toBe('service temporarily unavailable');
      expect(response.headers['retry-after']).toBe('7');
    });

    it('maps a kubernetes 429 with no retry delay to a bare 503', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(429, 'failed to list apikeyrequests: too many requests'),
      );

      const response = await request(app).get('/requests').expect(503);

      expect(response.body.error).toBe('service temporarily unavailable');
      expect(response.headers['retry-after']).toBeUndefined();
    });

    it('surfaces per-field validation causes on a 422', async () => {
      // what the caller sent is theirs to see, and naming the field is the
      // whole point of answering rather than a bare "invalid request".
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(422, 'failed to list apikeyrequests: APIKeyRequest is invalid', {
          causes: [
            {
              field: 'spec.planTier',
              message: 'Unsupported value: "platinum": supported values: "bronze", "silver", "gold"',
            },
          ],
        }),
      );

      const response = await request(app).get('/requests').expect(422);

      expect(response.body.error).toBe(
        'spec.planTier: Unsupported value: "platinum": supported values: "bronze", "silver", "gold"',
      );
    });

    it('falls back to a generic message when a 400 carries no causes', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(400, 'failed to list apikeyrequests: bad request'),
      );

      const response = await request(app).get('/requests').expect(400);

      expect(response.body.error).toBe('invalid request');
    });

    it('maps a kubernetes 503 to a 503 and passes on the retry delay', async () => {
      // the api server itself is unavailable, not the caller's doing. transient
      // like a 429, and answered the same way.
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(503, 'failed to list apikeyrequests: the server is currently unable to handle the request', {
          retryAfterSeconds: 3,
        }),
      );

      const response = await request(app).get('/requests').expect(503);

      expect(response.body.error).toBe('service temporarily unavailable');
      expect(response.headers['retry-after']).toBe('3');
    });

    it('maps a kubernetes 503 with no retry delay to a bare 503', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(503, 'failed to list apikeyrequests: the server is currently unable to handle the request'),
      );

      const response = await request(app).get('/requests').expect(503);

      expect(response.body.error).toBe('service temporarily unavailable');
      expect(response.headers['retry-after']).toBeUndefined();
    });

    it('leaves an unmapped kubernetes status as 500', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(
        k8sError(502, 'failed to list apikeyrequests: bad gateway'),
      );

      const response = await request(app).get('/requests').expect(500);

      expect(response.body.error).toBe('failed to fetch api key requests');
    });

    it('leaves a failure carrying no status as 500', async () => {
      mockAuthorizeFn.mockResolvedValueOnce([{ result: AuthorizeResult.ALLOW }]);
      mockK8sClient.listCustomResources.mockRejectedValue(new Error('socket hang up'));

      const response = await request(app).get('/requests').expect(500);

      expect(response.body.error).toBe('failed to fetch api key requests');
    });
  });
});

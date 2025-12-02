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
});

import { HttpAuthService, RootConfigService, UserInfoService, PermissionsService } from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { createPermissionIntegrationRouter } from '@backstage/plugin-permission-node';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import cors from 'cors';
import { randomBytes } from 'crypto';
import { KuadrantK8sClient } from './k8s-client';
import {
  kuadrantPermissions,
  kuadrantApiKeyDeleteAllPermission,
  kuadrantPlanPolicyListPermission,
  kuadrantPlanPolicyReadPermission,
  kuadrantApiProductListPermission,
  kuadrantApiProductReadPermission,
  kuadrantApiProductCreatePermission,
  kuadrantApiProductDeletePermission,
  kuadrantApiKeyRequestCreatePermission,
  kuadrantApiKeyRequestReadOwnPermission,
  kuadrantApiKeyRequestUpdatePermission,
  kuadrantApiKeyRequestListPermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
  kuadrantApiKeyDeleteOwnPermission,
} from './permissions';

function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

async function getUserIdentity(req: express.Request, httpAuth: HttpAuthService, userInfo: UserInfoService): Promise<{
  userId: string;
  isPlatformEngineer: boolean;
  isApiOwner: boolean;
  isApiConsumer: boolean;
  groups: string[];
}> {
  try {
    // allow both user credentials and unauthenticated (guest) access
    const credentials = await httpAuth.credentials(req, { allow: ['user', 'none'] });

    if (!credentials || !credentials.principal || credentials.principal.type === 'none') {
      // no credentials or guest user - treat as api owner in development
      console.log('no user credentials, treating as guest api owner');
      return {
        userId: 'guest',
        isPlatformEngineer: false,
        isApiOwner: true, // allow guest as api owner in development
        isApiConsumer: true,
        groups: []
      };
    }

    // get user info from credentials
    const info = await userInfo.getUserInfo(credentials);

    // extract userId from entity ref (format: "user:default/alice" -> "alice")
    const userId = info.userEntityRef.split('/')[1] || 'guest';
    const groups = info.ownershipEntityRefs || [];

    // check user roles based on group membership
    const isPlatformEngineer = userId === 'guest' || groups.some((ref: string) =>
      ref === 'group:default/platform-engineers' ||
      ref === 'group:default/platform-admins'
    );

    const isApiOwner = userId === 'guest' || groups.some((ref: string) =>
      ref === 'group:default/api-owners' ||
      ref === 'group:default/app-developers'
    );

    const isApiConsumer = groups.some((ref: string) =>
      ref === 'group:default/api-consumers'
    );

    console.log(`user identity resolved: userId=${userId}, isPlatformEngineer=${isPlatformEngineer}, isApiOwner=${isApiOwner}, isApiConsumer=${isApiConsumer}, groups=${groups.join(',')}`);
    return { userId, isPlatformEngineer, isApiOwner, isApiConsumer, groups };
  } catch (error) {
    // if credentials fail to verify (e.g. JWT issues with guest auth), treat as guest api owner
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`failed to get user identity, defaulting to guest api owner: ${errorMsg}`);
    return {
      userId: 'guest',
      isPlatformEngineer: false,
      isApiOwner: true, // allow guest as api owner in development
      isApiConsumer: true,
      groups: []
    };
  }
}

export async function createRouter({
  httpAuth,
  userInfo,
  config,
  permissions,
}: {
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  config: RootConfigService;
  permissions: PermissionsService;
}): Promise<express.Router> {
  const router = Router();

  // enable cors for dev mode (allows frontend on :3000 to call backend on :7007)
  router.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
  }));

  router.use(express.json());

  const k8sClient = new KuadrantK8sClient(config);

  // apiproduct endpoints
  router.get('/apiproducts', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiProductListPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'apiproducts');
      res.json(data);
    } catch (error) {
      console.error('error fetching apiproducts:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch apiproducts' });
      }
    }
  });

  router.get('/apiproducts/:namespace/:name', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiProductReadPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { namespace, name } = req.params;
      const data = await k8sClient.getCustomResource('extensions.kuadrant.io', 'v1alpha1', namespace, 'apiproducts', name);
      res.json(data);
    } catch (error) {
      console.error('error fetching apiproduct:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch apiproduct' });
      }
    }
  });

  router.post('/apiproducts', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiProductCreatePermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { userId } = await getUserIdentity(req, httpAuth, userInfo);
      const apiProduct = req.body;
      const namespace = apiProduct.metadata?.namespace;
      const planPolicyRef = apiProduct.spec?.planPolicyRef;

      if (!namespace) {
        throw new InputError('namespace is required in metadata');
      }

      if (!planPolicyRef?.name || !planPolicyRef?.namespace) {
        throw new InputError('planPolicyRef with name and namespace is required');
      }

      // fetch the planpolicy to get plan details
      const planPolicy = await k8sClient.getCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        planPolicyRef.namespace,
        'planpolicies',
        planPolicyRef.name,
      );

      // extract plans from planpolicy
      const plans = planPolicy.spec?.plans || [];

      if (plans.length === 0) {
        throw new InputError('selected planpolicy has no plans defined');
      }

      // inject plans into apiproduct spec
      apiProduct.spec.plans = plans;

      // set the owner to the authenticated user
      if (!apiProduct.spec.contact) {
        apiProduct.spec.contact = {};
      }
      apiProduct.spec.contact.team = `user:default/${userId}`;

      const created = await k8sClient.createCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        apiProduct,
      );

      res.status(201).json(created);
    } catch (error) {
      console.error('error creating apiproduct:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else if (error instanceof InputError) {
        res.status(400).json({ error: error.message });
      } else {
        // pass the detailed error message to the frontend
        res.status(500).json({ error: errorMessage });
      }
    }
  });

  router.delete('/apiproducts/:namespace/:name', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiProductDeletePermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { namespace, name } = req.params;

      await k8sClient.deleteCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        name
      );

      res.status(204).send();
    } catch (error) {
      console.error('error deleting apiproduct:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to delete apiproduct' });
      }
    }
  });

  // planpolicy endpoints
  router.get('/planpolicies', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantPlanPolicyListPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'planpolicies');

      // filter to only return name and namespace to avoid leaking plan details
      const filtered = {
        items: (data.items || []).map((policy: any) => ({
          metadata: {
            name: policy.metadata.name,
            namespace: policy.metadata.namespace,
          },
        })),
      };

      res.json(filtered);
    } catch (error) {
      console.error('error fetching planpolicies:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch planpolicies' });
      }
    }
  });

  router.get('/planpolicies/:namespace/:name', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantPlanPolicyReadPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { namespace, name } = req.params;
      const data = await k8sClient.getCustomResource('extensions.kuadrant.io', 'v1alpha1', namespace, 'planpolicies', name);
      res.json(data);
    } catch (error) {
      console.error('error fetching planpolicy:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch planpolicy' });
      }
    }
  });

  // api key secret management (for viewing existing keys)
  router.get('/apikeys', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const userId = req.query.userId as string;
      const namespace = req.query.namespace as string;

      if (!namespace) {
        throw new InputError('namespace query parameter is required');
      }

      // if userId is provided, check for .own permission, otherwise .all permission
      const permission = userId ? kuadrantApiKeyReadOwnPermission : kuadrantApiKeyReadAllPermission;
      const decision = await permissions.authorize(
        [{ permission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const data = await k8sClient.listSecrets(namespace);

      let filteredItems = data.items || [];
      if (userId) {
        filteredItems = filteredItems.filter((secret: any) =>
          secret.metadata?.annotations?.['secret.kuadrant.io/user-id'] === userId
        );
      }

      filteredItems = filteredItems.filter((secret: any) =>
        secret.metadata?.annotations?.['secret.kuadrant.io/user-id']
      );

      res.json({ items: filteredItems });
    } catch (error) {
      console.error('error fetching api keys:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch api keys' });
      }
    }
  });

  router.delete('/apikeys/:namespace/:name', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const { userId } = await getUserIdentity(req, httpAuth, userInfo);
      const { namespace, name } = req.params;

      const secret = await k8sClient.getSecret(namespace, name);
      const secretUserId = secret.metadata?.annotations?.['secret.kuadrant.io/user-id'];

      // check if user can delete all keys or just their own
      const deleteAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyDeleteAllPermission }],
        { credentials }
      );

      const canDeleteAll = deleteAllDecision[0].result === AuthorizeResult.ALLOW;

      if (!canDeleteAll) {
        // check if user can delete their own keys
        const deleteOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyDeleteOwnPermission }],
          { credentials }
        );

        if (deleteOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership
        if (secretUserId !== userId) {
          throw new NotAllowedError('you can only delete your own api keys');
        }
      }

      await k8sClient.deleteSecret(namespace, name);
      res.status(204).send();
    } catch (error) {
      console.error('error deleting api key:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to delete api key' });
      }
    }
  });

  // apikeyrequest crud endpoints
  const requestSchema = z.object({
    apiName: z.string(),
    apiNamespace: z.string(),
    planTier: z.string(),
    useCase: z.string().optional(),
    userId: z.string(),
    userEmail: z.string().optional(),
    namespace: z.string(),
  });

  router.post('/requests', async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestCreatePermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { userId: authenticatedUserId, isPlatformEngineer, isApiOwner } = await getUserIdentity(req, httpAuth, userInfo);
      const { apiName, apiNamespace, planTier, useCase, userId, userEmail, namespace } = parsed.data;

      // validate userId matches authenticated user (platform engineers and api owners can create on behalf of others)
      const canCreateForOthers = isPlatformEngineer || isApiOwner;
      if (!canCreateForOthers && userId !== authenticatedUserId) {
        throw new NotAllowedError('you can only create api key requests for yourself');
      }
      const timestamp = new Date().toISOString();
      const randomSuffix = randomBytes(4).toString('hex');
      const requestName = `${userId}-${apiName}-${randomSuffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const requestedBy: any = { userId };
      if (userEmail) {
        requestedBy.email = userEmail;
      }

      const request = {
        apiVersion: 'extensions.kuadrant.io/v1alpha1',
        kind: 'APIKeyRequest',
        metadata: {
          name: requestName,
          namespace,
        },
        spec: {
          apiName,
          apiNamespace,
          planTier,
          useCase: useCase || '',
          requestedBy,
          requestedAt: timestamp,
        },
      };

      const created = await k8sClient.createCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        request,
      );

      res.status(201).json(created);
    } catch (error) {
      console.error('error creating api key request:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to create api key request' });
      }
    }
  });

  router.get('/requests', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestListPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const status = req.query.status as string;
      const namespace = req.query.namespace as string;

      let data;
      if (namespace) {
        data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'apikeyrequests', namespace);
      } else {
        data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'apikeyrequests');
      }

      let filteredItems = data.items || [];
      if (status) {
        filteredItems = filteredItems.filter((req: any) => {
          const phase = req.status?.phase || 'Pending';
          return phase === status;
        });
      }

      res.json({ items: filteredItems });
    } catch (error) {
      console.error('error fetching api key requests:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch api key requests' });
      }
    }
  });

  router.get('/requests/my', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestReadOwnPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const userId = req.query.userId as string;
      const namespace = req.query.namespace as string;

      if (!userId) {
        throw new InputError('userId query parameter is required');
      }

      let data;
      if (namespace) {
        data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'apikeyrequests', namespace);
      } else {
        data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'apikeyrequests');
      }

      const filteredItems = (data.items || []).filter(
        (req: any) => req.spec?.requestedBy?.userId === userId
      );

      res.json({ items: filteredItems });
    } catch (error) {
      console.error('error fetching user api key requests:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch user api key requests' });
      }
    }
  });

  const approveRejectSchema = z.object({
    comment: z.string().optional(),
  });

  router.post('/requests/:namespace/:name/approve', async (req, res) => {
    const parsed = approveRejectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const { userId, isApiOwner } = await getUserIdentity(req, httpAuth, userInfo);
      let canApprove = isApiOwner; // api owners can approve requests

      // if permissions are enabled, also check via permission framework
      if (!canApprove) {
        try {
          const credentials = await httpAuth.credentials(req, { allow: ['none'] });
          if (credentials) {
            const decision = await permissions.authorize(
              [{ permission: kuadrantApiKeyRequestUpdatePermission }],
              { credentials },
            );
            canApprove = decision[0].result === AuthorizeResult.ALLOW;
          }
        } catch (error) {
          // permission check failed, rely on group-based check
          console.warn('permission check failed, using group-based authorization:', error);
        }
      }

      if (!canApprove) {
        throw new NotAllowedError('you do not have permission to approve api key requests');
      }

      const { namespace, name } = req.params;
      const { comment } = parsed.data;
      const reviewedBy = `user:default/${userId}`;

      const request = await k8sClient.getCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        name,
      );

      const spec = request.spec as any;
      const apiKey = generateApiKey();
      const timestamp = Date.now();
      const secretName = `${spec.requestedBy.userId}-${spec.apiName}-${timestamp}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');

      const secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: secretName,
          namespace: spec.apiNamespace,
          labels: {
            app: spec.apiName,
          },
          annotations: {
            'secret.kuadrant.io/plan-id': spec.planTier,
            'secret.kuadrant.io/user-id': spec.requestedBy.userId,
          },
        },
        stringData: {
          api_key: apiKey,
        },
        type: 'Opaque',
      };

      await k8sClient.createSecret(spec.apiNamespace, secret);

      // try to get plan limits from apiproduct or planpolicy
      let planLimits: any = null;
      try {
        const products = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'apiproducts');
        const product = (products.items || []).find((p: any) =>
          p.metadata.name.includes(spec.apiName) || p.spec?.displayName?.toLowerCase().includes(spec.apiName.toLowerCase())
        );
        if (product) {
          const plan = product.spec?.plans?.find((p: any) => p.tier === spec.planTier);
          if (plan) {
            planLimits = plan.limits;
          }
        }
      } catch (e) {
        console.warn('could not fetch apiproduct for plan limits:', e);
      }

      if (!planLimits) {
        try {
          const policy = await k8sClient.getCustomResource(
            'extensions.kuadrant.io',
            'v1alpha1',
            spec.apiNamespace,
            'planpolicies',
            `${spec.apiName}-plan`,
          );
          const plan = policy.spec?.plans?.find((p: any) => p.tier === spec.planTier);
          if (plan) {
            planLimits = plan.limits;
          }
        } catch (e) {
          console.warn('could not fetch planpolicy for plan limits:', e);
        }
      }

      const status = {
        phase: 'Approved',
        reviewedBy,
        reviewedAt: new Date().toISOString(),
        reason: comment || 'approved',
        apiKey,
        apiHostname: `${spec.apiName}.apps.example.com`,
        apiBasePath: '/api/v1',
        apiDescription: `${spec.apiName} api`,
        planLimits,
      };

      await k8sClient.patchCustomResourceStatus(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        name,
        status,
      );

      res.json({ secretName });
    } catch (error) {
      console.error('error approving api key request:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to approve api key request' });
      }
    }
  });

  router.post('/requests/:namespace/:name/reject', async (req, res) => {
    const parsed = approveRejectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const { userId, isApiOwner } = await getUserIdentity(req, httpAuth, userInfo);
      let canReject = isApiOwner; // api owners can reject requests

      // if permissions are enabled, also check via permission framework
      if (!canReject) {
        try {
          const credentials = await httpAuth.credentials(req, { allow: ['none'] });
          if (credentials) {
            const decision = await permissions.authorize(
              [{ permission: kuadrantApiKeyRequestUpdatePermission }],
              { credentials },
            );
            canReject = decision[0].result === AuthorizeResult.ALLOW;
          }
        } catch (error) {
          // permission check failed, rely on group-based check
          console.warn('permission check failed, using group-based authorization:', error);
        }
      }

      if (!canReject) {
        throw new NotAllowedError('you do not have permission to reject api key requests');
      }

      const { namespace, name } = req.params;
      const { comment } = parsed.data;
      const reviewedBy = `user:default/${userId}`;

      const status = {
        phase: 'Rejected',
        reviewedBy,
        reviewedAt: new Date().toISOString(),
        reason: comment || 'rejected',
      };

      await k8sClient.patchCustomResourceStatus(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        name,
        status,
      );

      res.status(204).send();
    } catch (error) {
      console.error('error rejecting api key request:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to reject api key request' });
      }
    }
  });

  router.delete('/requests/:namespace/:name', async (req, res) => {
    try {
      const { userId, isPlatformEngineer, isApiOwner } = await getUserIdentity(req, httpAuth, userInfo);
      const { namespace, name } = req.params;

      // get request to verify ownership
      const request = await k8sClient.getCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        name,
      );

      const requestUserId = request.spec?.requestedBy?.userId;

      // platform engineers and api owners can delete any request, consumers can only delete their own
      const canDeleteAll = isPlatformEngineer || isApiOwner;
      if (!canDeleteAll && requestUserId !== userId) {
        throw new NotAllowedError('you can only delete your own api key requests');
      }

      await k8sClient.deleteCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        name,
      );
      res.status(204).send();
    } catch (error) {
      console.error('error deleting api key request:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to delete api key request' });
      }
    }
  });

  router.patch('/requests/:namespace/:name', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestUpdatePermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { namespace, name } = req.params;
      const patch = req.body;

      const updated = await k8sClient.patchCustomResource(
        'extensions.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeyrequests',
        name,
        patch,
      );

      res.json(updated);
    } catch (error) {
      console.error('error updating api key request:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to update api key request' });
      }
    }
  });

  // expose permissions for backstage permission framework
  router.use(createPermissionIntegrationRouter({
    permissions: kuadrantPermissions,
  }));

  return router;
}

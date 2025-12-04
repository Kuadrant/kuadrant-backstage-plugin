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
import { getAPIProductEntityProvider } from './module';
import {
  kuadrantPermissions,
  kuadrantPlanPolicyListPermission,
  kuadrantPlanPolicyReadPermission,
  kuadrantApiProductListPermission,
  kuadrantApiProductReadOwnPermission,
  kuadrantApiProductReadAllPermission,
  kuadrantApiProductCreatePermission,
  kuadrantApiProductUpdateOwnPermission,
  kuadrantApiProductUpdateAllPermission,
  kuadrantApiProductDeleteOwnPermission,
  kuadrantApiProductDeleteAllPermission,
  kuadrantApiKeyRequestCreatePermission,
  kuadrantApiKeyRequestReadOwnPermission,
  kuadrantApiKeyRequestReadAllPermission,
  kuadrantApiKeyRequestUpdateOwnPermission,
  kuadrantApiKeyRequestUpdateAllPermission,
  kuadrantApiKeyRequestDeleteOwnPermission,
  kuadrantApiKeyRequestDeleteAllPermission,
  kuadrantApiKeyReadOwnPermission,
  kuadrantApiKeyReadAllPermission,
} from './permissions';

const secretKey = 'api_key';

/**
 * Extract a kubernetes-safe name from entity ref
 * e.g., "user:default/alice" -> "alice"
 * e.g., "group:platform/api-owners" -> "api-owners"
 */
function extractNameFromEntityRef(entityRef: string): string {
  const parts = entityRef.split('/');
  return parts[parts.length - 1];
}

async function getUserIdentity(req: express.Request, httpAuth: HttpAuthService, userInfo: UserInfoService): Promise<{
  userEntityRef: string;
  groups: string[];
}> {
  const credentials = await httpAuth.credentials(req);

  if (!credentials || !credentials.principal) {
    throw new NotAllowedError('authentication required');
  }

  // get user info from credentials
  const info = await userInfo.getUserInfo(credentials);
  const groups = info.ownershipEntityRefs || [];

  console.log(`user identity resolved: userEntityRef=${info.userEntityRef}, groups=${groups.join(',')}`);
  return {
    userEntityRef: info.userEntityRef,
    groups
  };
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

      const listDecision = await permissions.authorize(
        [{ permission: kuadrantApiProductListPermission }],
        { credentials }
      );

      if (listDecision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
      const data = await k8sClient.listCustomResources('devportal.kuadrant.io', 'v1alpha1', 'apiproducts');

      // check if user has read all permission
      const readAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiProductReadAllPermission }],
        { credentials }
      );

      if (readAllDecision[0].result === AuthorizeResult.ALLOW) {
        // admin - return all apiproducts
        res.json(data);
      } else {
        // owner - check read own permission and filter
        const readOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiProductReadOwnPermission }],
          { credentials }
        );

        if (readOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // filter to only owned apiproducts
        const ownedItems = (data.items || []).filter((item: any) => {
          const owner = item.metadata?.annotations?.['backstage.io/owner'];
          return owner === userEntityRef;
        });

        res.json({ ...data, items: ownedItems });
      }
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
      const { namespace, name } = req.params;

      // try read all permission first (admin)
      const readAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiProductReadAllPermission }],
        { credentials }
      );

      if (readAllDecision[0].result !== AuthorizeResult.ALLOW) {
        // fallback to read own permission
        const readOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiProductReadOwnPermission }],
          { credentials }
        );

        if (readOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership
        const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
        const data = await k8sClient.getCustomResource('devportal.kuadrant.io', 'v1alpha1', namespace, 'apiproducts', name);
        const owner = data.metadata?.annotations?.['backstage.io/owner'];

        if (owner !== userEntityRef) {
          throw new NotAllowedError('you can only read your own api products');
        }

        res.json(data);
      } else {
        // admin - read any apiproduct
        const data = await k8sClient.getCustomResource('devportal.kuadrant.io', 'v1alpha1', namespace, 'apiproducts', name);
        res.json(data);
      }
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

      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
      const apiProduct = req.body;
      const targetRef = apiProduct.spec?.targetRef;

      if (!targetRef?.name || !targetRef?.kind || !targetRef?.namespace) {
        throw new InputError('targetRef with name, kind, and namespace is required');
      }

      // derive namespace from httproute - apiproduct lives in same namespace as httproute
      const namespace = targetRef.namespace;
      apiProduct.metadata.namespace = namespace;

      // set ownership annotation (backstage-specific metadata)
      // note: creationTimestamp is automatically set by kubernetes api server
      if (!apiProduct.metadata.annotations) {
        apiProduct.metadata.annotations = {};
      }
      apiProduct.metadata.annotations['backstage.io/owner'] = userEntityRef;

      const created = await k8sClient.createCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        apiProduct,
      );

      // trigger immediate catalog sync
      const provider = getAPIProductEntityProvider();
      if (provider) {
        await provider.refresh();
      }

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
      const { namespace, name } = req.params;

      // try delete all permission first (admin)
      const deleteAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiProductDeleteAllPermission }],
        { credentials }
      );

      if (deleteAllDecision[0].result !== AuthorizeResult.ALLOW) {
        // fallback to delete own permission
        const deleteOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiProductDeleteOwnPermission }],
          { credentials }
        );

        if (deleteOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership before deleting
        const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
        const existing = await k8sClient.getCustomResource('devportal.kuadrant.io', 'v1alpha1', namespace, 'apiproducts', name);
        const owner = existing.metadata?.annotations?.['backstage.io/owner'];

        if (owner !== userEntityRef) {
          throw new NotAllowedError('you can only delete your own api products');
        }
      }
      console.log(`cascading delete: finding apikeys for ${namespace}/${name}`);

      let allRequests;
      try {
        allRequests = await k8sClient.listCustomResources(
          'devportal.kuadrant.io',
          'v1alpha1',
          'apikeys',
          namespace
        );
      } catch (error) {
        console.warn('failed to list apikeys during cascade delete:', error);
        allRequests = { items: [] };
      }

      // filter requests that belong to this APIProduct
      const relatedRequests = (allRequests.items || []).filter((req: any) =>
        req.spec?.apiProductRef?.name === name
      );

      console.log(`found ${relatedRequests.length} apikeys to delete`);

      // delete each APIKey - controller's OwnerReference handles Secret cleanup
      const deletionResults = await Promise.allSettled(
        relatedRequests.map(async (request: any) => {
          const requestName = request.metadata.name;
          console.log(`deleting apikey: ${namespace}/${requestName}`);
          await k8sClient.deleteCustomResource(
            'devportal.kuadrant.io',
            'v1alpha1',
            namespace,
            'apikeys',
            requestName
          );
        })
      );

      const failures = deletionResults.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.warn(`${failures.length} apikeys failed to delete:`,
          failures.map((f: any) => f.reason)
        );
      }
      await k8sClient.deleteCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        name
      );

      // trigger immediate catalog sync
      const provider = getAPIProductEntityProvider();
      if (provider) {
        await provider.refresh();
      }

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

  // httproute endpoints
  router.get('/httproutes', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiProductListPermission }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const data = await k8sClient.listCustomResources('gateway.networking.k8s.io', 'v1', 'httproutes');

      res.json(data);
    } catch (error) {
      console.error('error fetching httproutes:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to fetch httproutes' });
      }
    }
  });

  router.patch('/apiproducts/:namespace/:name', async (req, res) => {
    // whitelist allowed fields for patching
    const patchSchema = z.object({
      spec: z.object({
        displayName: z.string().optional(),
        description: z.string().optional(),
        version: z.string().optional(),
        publishStatus: z.enum(['Draft', 'Published']).optional(),
        approvalMode: z.enum(['automatic', 'manual']).optional(),
        tags: z.array(z.string()).optional(),
        contact: z.object({
          email: z.string().optional(),
          team: z.string().optional(),
          slack: z.string().optional(),
        }).partial().optional(),
        documentation: z.object({
          docsURL: z.string().optional(),
          openAPISpec: z.string().optional(),
        }).partial().optional(),
      }).partial(),
    });

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid patch: ' + parsed.error.toString() });
    }

    try {
      const credentials = await httpAuth.credentials(req);

      if (!credentials || !credentials.principal) {
        throw new NotAllowedError('authentication required');
      }

      const { namespace, name } = req.params;

      // try update all permission first (admin)
      const updateAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiProductUpdateAllPermission }],
        { credentials }
      );

      if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
        // fallback to update own permission
        const updateOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiProductUpdateOwnPermission }],
          { credentials }
        );

        if (updateOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership
        const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
        const existing = await k8sClient.getCustomResource('devportal.kuadrant.io', 'v1alpha1', namespace, 'apiproducts', name);
        const owner = existing.metadata?.annotations?.['backstage.io/owner'];

        if (owner !== userEntityRef) {
          throw new NotAllowedError('you can only update your own api products');
        }
      }

      // prevent modification of ownership annotation
      if (req.body.metadata?.annotations) {
        delete req.body.metadata.annotations['backstage.io/owner'];
      }

      const updated = await k8sClient.patchCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        name,
        parsed.data,
      );

      // trigger immediate catalog sync
      const provider = getAPIProductEntityProvider();
      if (provider) {
        await provider.refresh();
      }

      return res.json(updated);
    } catch (error) {
      console.error('error updating apiproduct:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (error instanceof NotAllowedError) {
        return res.status(403).json({ error: error.message });
      } else if (error instanceof InputError) {
        return res.status(400).json({ error: error.message });
      } else {
        return res.status(500).json({ error: errorMessage });
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

      // only expose minimal info needed for UI association
      const filtered = {
        items: (data.items || []).map((policy: any) => ({
          metadata: {
            name: policy.metadata.name,
            namespace: policy.metadata.namespace,
          },
          // only expose targetRef to allow UI to match PlanPolicy -> HTTPRoute
          targetRef: policy.spec?.targetRef ? {
            kind: policy.spec.targetRef.kind,
            name: policy.spec.targetRef.name,
            namespace: policy.spec.targetRef.namespace,
          } : undefined,
          // only expose plan tier info, no other spec details
          plans: (policy.spec?.plans || []).map((plan: any) => ({
            tier: plan.tier,
            description: plan.description,
            limits: plan.limits,
          })),
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

  // apikey crud endpoints
  const requestSchema = z.object({
    apiProductName: z.string(), // name of the APIProduct
    namespace: z.string(), // namespace where both APIProduct and APIKey live
    planTier: z.string(),
    useCase: z.string().optional(),
    userEmail: z.string().optional(),
  });

  router.post('/requests', async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const credentials = await httpAuth.credentials(req);
      const { apiProductName, namespace, planTier, useCase, userEmail } = parsed.data;

      // extract userId from authenticated credentials, not from request body
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);

      // check permission with resource reference (per-apiproduct access control)
      const resourceRef = `apiproduct:${namespace}/${apiProductName}`;
      const decision = await permissions.authorize(
        [{
          permission: kuadrantApiKeyRequestCreatePermission,
          resourceRef,
        }],
        { credentials }
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError(`not authorised to request access to ${apiProductName}`);
      }
      const randomSuffix = randomBytes(4).toString('hex');
      const userName = extractNameFromEntityRef(userEntityRef);
      const requestName = `${userName}-${apiProductName}-${randomSuffix}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const requestedBy: any = { userId: userEntityRef };
      if (userEmail) {
        requestedBy.email = userEmail;
      }

      const request = {
        apiVersion: 'devportal.kuadrant.io/v1alpha1',
        kind: 'APIKey',
        metadata: {
          name: requestName,
          namespace,
        },
        spec: {
          apiProductRef: {
            name: apiProductName,
          },
          planTier,
          useCase: useCase || '',
          requestedBy,
        },
      };

      const created = await k8sClient.createCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        request,
      );

      // controller handles automatic approval and secret creation
      // we just create the APIKey resource and let the controller reconcile

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

      // check if user can read all requests or only own
      const readAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestReadAllPermission }],
        { credentials }
      );

      const canReadAll = readAllDecision[0].result === AuthorizeResult.ALLOW;

      if (!canReadAll) {
        // try read own permission
        const readOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyRequestReadOwnPermission }],
          { credentials }
        );

        if (readOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }
      }

      const status = req.query.status as string;
      const namespace = req.query.namespace as string;

      let data;
      if (namespace) {
        data = await k8sClient.listCustomResources('devportal.kuadrant.io', 'v1alpha1', 'apikeys', namespace);
      } else {
        data = await k8sClient.listCustomResources('devportal.kuadrant.io', 'v1alpha1', 'apikeys');
      }

      let filteredItems = data.items || [];

      // if user only has read.own permission, filter by api product ownership
      if (!canReadAll) {
        const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);

        // get all apiproducts owned by this user
        const apiproducts = await k8sClient.listCustomResources('devportal.kuadrant.io', 'v1alpha1', 'apiproducts');
        const ownedApiProducts = (apiproducts.items || [])
          .filter((product: any) => {
            const owner = product.metadata?.annotations?.['backstage.io/owner'];
            return owner === userEntityRef;
          })
          .map((product: any) => product.metadata.name);

        // filter requests to only those for owned api products
        filteredItems = filteredItems.filter((req: any) =>
          ownedApiProducts.includes(req.spec?.apiProductRef?.name)
        );
      }

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

      // extract userId from authenticated credentials, not from query params
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
      const namespace = req.query.namespace as string;

      let data;
      if (namespace) {
        data = await k8sClient.listCustomResources('devportal.kuadrant.io', 'v1alpha1', 'apikeys', namespace);
      } else {
        data = await k8sClient.listCustomResources('devportal.kuadrant.io', 'v1alpha1', 'apikeys');
      }

      const filteredItems = (data.items || []).filter(
        (req: any) => req.spec?.requestedBy?.userId === userEntityRef
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
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);

      const { namespace, name } = req.params;
      const reviewedBy = userEntityRef;

      const request = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
      );

      const spec = request.spec as any;
      const apiProductName = spec.apiProductRef?.name;

      if (!apiProductName) {
        throw new InputError('apiProductRef.name is required in APIKey spec');
      }

      // verify user owns/admins the apiproduct this request is for
      const apiProduct = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        apiProductName,
      );

      const owner = apiProduct.metadata?.annotations?.['backstage.io/owner'];

      // try update all permission first (admin)
      const updateAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestUpdateAllPermission }],
        { credentials },
      );

      if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
        // fallback to update own permission
        const updateOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyRequestUpdateOwnPermission }],
          { credentials },
        );

        if (updateOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership of the apiproduct
        if (owner !== userEntityRef) {
          throw new NotAllowedError('you can only approve requests for your own api products');
        }
      }

      // backend sets phase, controller reconciles and creates Secret
      const status = {
        phase: 'Approved',
        reviewedBy,
        reviewedAt: new Date().toISOString(),
      };

      await k8sClient.patchCustomResourceStatus(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
        status,
      );

      res.json({ success: true });
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
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);

      const { namespace, name } = req.params;
      const reviewedBy = userEntityRef;

      // fetch request to get apiproduct info
      const request = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
      );

      const spec = request.spec as any;
      const apiProductName = spec.apiProductRef?.name;

      if (!apiProductName) {
        throw new InputError('apiProductRef.name is required in APIKey spec');
      }

      // verify user owns/admins the apiproduct this request is for
      const apiProduct = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apiproducts',
        apiProductName,
      );

      const owner = apiProduct.metadata?.annotations?.['backstage.io/owner'];
        // owner is already in entity ref format

      // try update all permission first (admin)
      const updateAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestUpdateAllPermission }],
        { credentials },
      );

      if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
        // fallback to update own permission
        const updateOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyRequestUpdateOwnPermission }],
          { credentials },
        );

        if (updateOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership of the apiproduct
        if (owner !== userEntityRef) {
          throw new NotAllowedError('you can only reject requests for your own api products');
        }
      }

      const status = {
        phase: 'Rejected',
        reviewedBy,
        reviewedAt: new Date().toISOString(),
      };

      await k8sClient.patchCustomResourceStatus(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
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

  const bulkApproveSchema = z.object({
    requests: z.array(z.object({
      namespace: z.string(),
      name: z.string(),
    })),
    comment: z.string().optional(),
  });

  router.post('/requests/bulk-approve', async (req, res) => {
    const parsed = bulkApproveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestUpdateAllPermission }],
        { credentials },
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { requests } = parsed.data;
      const reviewedBy = userEntityRef;
      const results = [];

      for (const reqRef of requests) {
        try {
          // backend sets phase, controller reconciles and creates Secret
          const status = {
            phase: 'Approved',
            reviewedBy,
            reviewedAt: new Date().toISOString(),
          };

          await k8sClient.patchCustomResourceStatus(
            'devportal.kuadrant.io',
            'v1alpha1',
            reqRef.namespace,
            'apikeys',
            reqRef.name,
            status,
          );

          results.push({ namespace: reqRef.namespace, name: reqRef.name, success: true });
        } catch (error) {
          console.error(`error approving request ${reqRef.namespace}/${reqRef.name}:`, error);
          results.push({
            namespace: reqRef.namespace,
            name: reqRef.name,
            success: false,
            error: error instanceof Error ? error.message : 'unknown error'
          });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error('error in bulk approve:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to bulk approve api key requests' });
      }
    }
  });

  router.post('/requests/bulk-reject', async (req, res) => {
    const parsed = bulkApproveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);

      const decision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestUpdateAllPermission }],
        { credentials },
      );

      if (decision[0].result !== AuthorizeResult.ALLOW) {
        throw new NotAllowedError('unauthorised');
      }

      const { requests } = parsed.data;
      const reviewedBy = userEntityRef;
      const results = [];

      for (const reqRef of requests) {
        try {
          // fetch request to get apiproduct info
          const request = await k8sClient.getCustomResource(
            'devportal.kuadrant.io',
            'v1alpha1',
            reqRef.namespace,
            'apikeys',
            reqRef.name,
          );

          const spec = request.spec as any;

          // verify user owns/admins the apiproduct this request is for
          // apikey and apiproduct are in the same namespace
          const apiProduct = await k8sClient.getCustomResource(
            'devportal.kuadrant.io',
            'v1alpha1',
            reqRef.namespace,
            'apiproducts',
            spec.apiProductRef?.name,
          );

          const owner = apiProduct.metadata?.annotations?.['backstage.io/owner'];
        // owner is already in entity ref format

          // try update all permission first (admin)
          const updateAllDecision = await permissions.authorize(
            [{ permission: kuadrantApiProductUpdateAllPermission }],
            { credentials },
          );

          if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
            // fallback to update own permission
            const updateOwnDecision = await permissions.authorize(
              [{ permission: kuadrantApiProductUpdateOwnPermission }],
              { credentials },
            );

            if (updateOwnDecision[0].result !== AuthorizeResult.ALLOW) {
              throw new NotAllowedError('unauthorised');
            }

            // verify ownership of the apiproduct
            if (owner !== userEntityRef) {
              throw new NotAllowedError('you can only reject requests for your own api products');
            }
          }

          const status = {
            phase: 'Rejected',
            reviewedBy,
            reviewedAt: new Date().toISOString(),
          };

          await k8sClient.patchCustomResourceStatus(
            'devportal.kuadrant.io',
            'v1alpha1',
            reqRef.namespace,
            'apikeys',
            reqRef.name,
            status,
          );

          results.push({ namespace: reqRef.namespace, name: reqRef.name, success: true });
        } catch (error) {
          console.error(`error rejecting request ${reqRef.namespace}/${reqRef.name}:`, error);
          results.push({
            namespace: reqRef.namespace,
            name: reqRef.name,
            success: false,
            error: error instanceof Error ? error.message : 'unknown error'
          });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error('error in bulk reject:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to bulk reject api key requests' });
      }
    }
  });

  router.delete('/requests/:namespace/:name', async (req, res) => {
    try {
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
      const { namespace, name } = req.params;

      // get request to verify ownership
      const request = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
      );

      const requestUserId = request.spec?.requestedBy?.userId;

      // check if user can delete all requests or just their own
      const deleteAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestDeleteAllPermission }],
        { credentials }
      );

      const canDeleteAll = deleteAllDecision[0].result === AuthorizeResult.ALLOW;

      if (!canDeleteAll) {
        // check if user can delete their own requests
        const deleteOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyRequestDeleteOwnPermission }],
          { credentials }
        );

        if (deleteOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership
        if (requestUserId !== userEntityRef) {
          throw new NotAllowedError('you can only delete your own api key requests');
        }
      }

      // controller owns the Secret via OwnerReference - it will be garbage collected
      await k8sClient.deleteCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
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
    // whitelist allowed fields for patching
    const patchSchema = z.object({
      spec: z.object({
        useCase: z.string().optional(),
        planTier: z.string().optional(),
      }).partial(),
    });

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError('invalid patch: ' + parsed.error.toString());
    }

    try {
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
      const { namespace, name } = req.params;

      // get existing request to check ownership and status
      const existing = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
      );

      const requestUserId = existing.spec?.requestedBy?.userId;
      const currentPhase = existing.status?.phase || 'Pending';

      // only pending requests can be edited
      if (currentPhase !== 'Pending') {
        throw new NotAllowedError('only pending requests can be edited');
      }

      // check if user can update all requests or just their own
      const updateAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyRequestUpdateAllPermission }],
        { credentials }
      );

      if (updateAllDecision[0].result !== AuthorizeResult.ALLOW) {
        // check if user can update their own requests
        const updateOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyRequestUpdateOwnPermission }],
          { credentials }
        );

        if (updateOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }

        // verify ownership
        if (requestUserId !== userEntityRef) {
          throw new NotAllowedError('you can only update your own api key requests');
        }
      }

      // apply validated patch
      const updated = await k8sClient.patchCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
        parsed.data,
      );

      res.json(updated);
    } catch (error) {
      console.error('error updating api key request:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else if (error instanceof InputError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to update api key request' });
      }
    }
  });

  // get api key secret (show once)
  router.get('/apikeys/:namespace/:name/secret', async (req, res): Promise<void> => {
    try {
      const credentials = await httpAuth.credentials(req);
      const { userEntityRef } = await getUserIdentity(req, httpAuth, userInfo);
      const { namespace, name } = req.params;

      // check if user can read all api keys or only own
      const readAllDecision = await permissions.authorize(
        [{ permission: kuadrantApiKeyReadAllPermission }],
        { credentials }
      );

      const canReadAll = readAllDecision[0].result === AuthorizeResult.ALLOW;

      if (!canReadAll) {
        // try read own permission
        const readOwnDecision = await permissions.authorize(
          [{ permission: kuadrantApiKeyReadOwnPermission }],
          { credentials }
        );

        if (readOwnDecision[0].result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError('unauthorised');
        }
      }

      // get the apikey resource
      const apiKey = await k8sClient.getCustomResource(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
      );

      // verify ownership if not admin
      if (!canReadAll) {
        const requestUserId = apiKey.spec?.requestedBy?.userId;
        if (requestUserId !== userEntityRef) {
          throw new NotAllowedError('you can only read your own api key secrets');
        }
      }

      // check if secret can be read
      if (apiKey.status?.canReadSecret !== true) {
        res.status(403).json({
          error: 'secret has already been read and cannot be retrieved again',
        });
        return;
      }

      // check if secretRef is set
      if (!apiKey.status?.secretRef?.name || !apiKey.status?.secretRef?.key) {
        res.status(404).json({
          error: 'secret reference not found in apikey status',
        });
        return;
      }

      // get the secret
      const secretName = apiKey.status.secretRef.name;

      let secret;
      try {
        secret = await k8sClient.getSecret(namespace, secretName);
      } catch (error) {
        console.error('error fetching secret:', error);
        res.status(404).json({
          error: 'secret not found',
        });
        return;
      }

      // extract the api key value from secret
      const secretData = secret.data || {};
      const apiKeyValue = secretData[secretKey];

      if (!apiKeyValue) {
        res.status(404).json({
          error: `secret key '${secretKey}' not found in secret`,
        });
        return;
      }

      // decode base64
      const decodedApiKey = Buffer.from(apiKeyValue, 'base64').toString('utf-8');

      // update canReadSecret to false
      await k8sClient.patchCustomResourceStatus(
        'devportal.kuadrant.io',
        'v1alpha1',
        namespace,
        'apikeys',
        name,
        {
          ...apiKey.status,
          canReadSecret: false,
        },
      );

      res.json({
        apiKey: decodedApiKey,
      });
    } catch (error) {
      console.error('error reading api key secret:', error);
      if (error instanceof NotAllowedError) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'failed to read api key secret' });
      }
    }
  });

  router.use(createPermissionIntegrationRouter({
    permissions: kuadrantPermissions,
  }));

  return router;
}

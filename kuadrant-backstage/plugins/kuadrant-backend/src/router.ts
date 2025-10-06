import { HttpAuthService, RootConfigService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { randomBytes } from 'crypto';
import { KuadrantK8sClient } from './k8s-client';

function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

export async function createRouter({
  config,
}: {
  httpAuth: HttpAuthService;
  config: RootConfigService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const k8sClient = new KuadrantK8sClient(config);

  // kuadrant resource endpoints - no auth required for read-only access
  router.get('/authpolicies', async (_req, res) => {
    try {
      const data = await k8sClient.listCustomResources('kuadrant.io', 'v1', 'authpolicies');
      res.json(data);
    } catch (error) {
      console.error('error fetching authpolicies:', error);
      res.status(500).json({ error: 'failed to fetch authpolicies' });
    }
  });

  router.get('/ratelimitpolicies', async (_req, res) => {
    try {
      const data = await k8sClient.listCustomResources('kuadrant.io', 'v1', 'ratelimitpolicies');
      res.json(data);
    } catch (error) {
      console.error('error fetching ratelimitpolicies:', error);
      res.status(500).json({ error: 'failed to fetch ratelimitpolicies' });
    }
  });

  router.get('/dnspolicies', async (_req, res) => {
    try {
      const data = await k8sClient.listCustomResources('kuadrant.io', 'v1', 'dnspolicies');
      res.json(data);
    } catch (error) {
      console.error('error fetching dnspolicies:', error);
      res.status(500).json({ error: 'failed to fetch dnspolicies' });
    }
  });

  router.get('/tlspolicies', async (_req, res) => {
    try {
      const data = await k8sClient.listCustomResources('kuadrant.io', 'v1', 'tlspolicies');
      res.json(data);
    } catch (error) {
      console.error('error fetching tlspolicies:', error);
      res.status(500).json({ error: 'failed to fetch tlspolicies' });
    }
  });

  router.get('/planpolicies', async (_req, res) => {
    try {
      const data = await k8sClient.listCustomResources('extensions.kuadrant.io', 'v1alpha1', 'planpolicies');
      res.json(data);
    } catch (error) {
      console.error('error fetching planpolicies:', error);
      res.status(500).json({ error: 'failed to fetch planpolicies' });
    }
  });

  router.get('/planpolicies/:namespace/:name', async (req, res) => {
    try {
      const { namespace, name } = req.params;
      const data = await k8sClient.getCustomResource('extensions.kuadrant.io', 'v1alpha1', namespace, 'planpolicies', name);
      res.json(data);
    } catch (error) {
      console.error('error fetching planpolicy:', error);
      res.status(500).json({ error: 'failed to fetch planpolicy' });
    }
  });

  // api key management endpoints
  const apiKeySchema = z.object({
    apiName: z.string(),
    namespace: z.string(),
    userId: z.string(),
    planTier: z.string(),
  });

  router.post('/apikeys', async (req, res) => {
    const parsed = apiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    try {
      const { apiName, namespace, userId, planTier } = parsed.data;
      const apiKey = generateApiKey();
      const timestamp = Date.now();
      const secretName = `${userId}-${apiName}-${timestamp}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: secretName,
          namespace: namespace,
          labels: {
            app: apiName,
          },
          annotations: {
            'secret.kuadrant.io/plan-id': planTier,
            'secret.kuadrant.io/user-id': userId,
          },
        },
        stringData: {
          api_key: apiKey,
        },
        type: 'Opaque',
      };

      const data = await k8sClient.createSecret(namespace, secret);
      res.status(201).json(data);
    } catch (error) {
      console.error('error creating api key:', error);
      res.status(500).json({ error: 'failed to create api key' });
    }
  });

  router.get('/apikeys', async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const namespace = req.query.namespace as string;

      if (!namespace) {
        throw new InputError('namespace query parameter is required');
      }

      const data = await k8sClient.listSecrets(namespace);

      // filter secrets by user id annotation if provided
      let filteredItems = data.items || [];
      if (userId) {
        filteredItems = filteredItems.filter((secret: any) =>
          secret.metadata?.annotations?.['secret.kuadrant.io/user-id'] === userId
        );
      }

      // only return secrets that have the kuadrant annotation
      filteredItems = filteredItems.filter((secret: any) =>
        secret.metadata?.annotations?.['secret.kuadrant.io/user-id']
      );

      res.json({ items: filteredItems });
    } catch (error) {
      console.error('error fetching api keys:', error);
      res.status(500).json({ error: 'failed to fetch api keys' });
    }
  });

  router.delete('/apikeys/:namespace/:name', async (req, res) => {
    try {
      const { namespace, name } = req.params;
      await k8sClient.deleteSecret(namespace, name);
      res.status(204).send();
    } catch (error) {
      console.error('error deleting api key:', error);
      res.status(500).json({ error: 'failed to delete api key' });
    }
  });

  // individual resource endpoints
  router.get('/:kind/:namespace/:name', async (req, res) => {
    try {
      const { kind, namespace, name } = req.params;
      const data = await k8sClient.getCustomResource('kuadrant.io', 'v1', namespace, kind, name);
      res.json(data);
    } catch (error) {
      console.error('error fetching resource:', error);
      res.status(500).json({ error: 'failed to fetch resource' });
    }
  });

  return router;
}

import { ApiEntity } from '@backstage/catalog-model';
import { EntityProvider, EntityProviderConnection } from '@backstage/plugin-catalog-node';
import { RootConfigService } from '@backstage/backend-plugin-api';
import { KuadrantK8sClient } from '../k8s-client';

interface APIProduct {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    uid: string;
    resourceVersion: string;
    creationTimestamp: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec: {
    displayName?: string;
    description?: string;
    version?: string;
    tags?: string[];
    plans?: Array<{
      tier: string;
      description?: string;
      limits?: any;
    }>;
    planPolicyRef?: {
      name: string;
      namespace: string;
    };
    documentation?: {
      openAPISpec?: string;
      docsURL?: string;
      gitRepository?: string;
      techdocsRef?: string;
    };
    contact?: {
      team?: string;
      email?: string;
      slack?: string;
    };
  };
}

export class APIProductEntityProvider implements EntityProvider {
  private readonly k8sClient: KuadrantK8sClient;
  private connection?: EntityProviderConnection;
  private readonly providerId = 'kuadrant-apiproduct-provider';

  constructor(config: RootConfigService) {
    console.log('apiproduct provider: constructor called');
    this.k8sClient = new KuadrantK8sClient(config);
  }

  getProviderName(): string {
    return this.providerId;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    console.log('apiproduct provider: connect called');
    this.connection = connection;

    console.log('apiproduct provider: starting initial sync');
    // initial full sync
    await this.refresh();

    // schedule periodic refresh (every 30 seconds for development)
    // note: in production, consider 5-10 minutes to reduce api load
    console.log('apiproduct provider: scheduling periodic refresh every 30 seconds');
    setInterval(async () => {
      await this.refresh();
    }, 30 * 1000);
  }

  private async refresh(): Promise<void> {
    console.log('apiproduct provider: refresh called');
    if (!this.connection) {
      console.log('apiproduct provider: no connection, skipping refresh');
      return;
    }

    try {
      console.log('apiproduct provider: fetching apiproducts from kubernetes');
      // fetch all apiproducts from kubernetes
      const response = await this.k8sClient.listCustomResources(
        'extensions.kuadrant.io',
        'v1alpha1',
        'apiproducts'
      );

      const apiProducts = (response.items || []) as APIProduct[];
      console.log(`apiproduct provider: found ${apiProducts.length} apiproducts`);

      // transform apiproducts to backstage api entities
      const entities = apiProducts.map(product => this.transformToEntity(product));
      console.log(`apiproduct provider: transformed ${entities.length} entities`);

      // submit entities to catalog
      console.log('apiproduct provider: submitting entities to catalog');
      await this.connection.applyMutation({
        type: 'full',
        entities: entities.map(entity => ({
          entity,
          locationKey: `kuadrant-apiproduct:${entity.metadata.namespace}/${entity.metadata.name}`,
        })),
      });

      console.log(`apiproduct provider: synced ${entities.length} api products`);
    } catch (error) {
      console.error('error refreshing apiproduct entities:', error);
    }
  }

  private transformToEntity(product: APIProduct): ApiEntity {
    const namespace = product.metadata.namespace || 'default';
    const name = product.metadata.name;
    const displayName = product.spec.displayName || name;
    const description = product.spec.description || `api product: ${displayName}`;

    // determine lifecycle from labels or default to production
    const lifecycle = product.metadata.labels?.lifecycle || 'production';

    // determine owner from contact info or default to guests
    const owner = product.spec.contact?.team || 'guests';

    // build tags from product tags
    const tags = product.spec.tags || [];

    // create entity with proper backstage structure
    const entity: ApiEntity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'API',
      metadata: {
        name: `${name}`,
        namespace: 'default',
        title: displayName,
        description,
        annotations: {
          'backstage.io/managed-by-location': `kuadrant:${namespace}/${name}`,
          'backstage.io/managed-by-origin-location': `kuadrant:${namespace}/${name}`,
          'backstage.io/orphan-strategy': 'keep',
          'kuadrant.io/namespace': namespace,
          'kuadrant.io/apiproduct': name,
          // add httproute annotation if we can infer it (usually same as apiproduct name without -api suffix)
          'kuadrant.io/httproute': name.endsWith('-api') ? name.slice(0, -4) : name,
          ...(product.spec.documentation?.openAPISpec && {
            'kuadrant.io/openapi-spec-url': product.spec.documentation.openAPISpec,
          }),
          ...(product.spec.documentation?.docsURL && {
            'kuadrant.io/docs-url': product.spec.documentation.docsURL,
          }),
          ...(product.spec.documentation?.gitRepository && {
            'backstage.io/source-location': `url:${product.spec.documentation.gitRepository}`,
          }),
          ...(product.spec.documentation?.techdocsRef && {
            'backstage.io/techdocs-ref': product.spec.documentation.techdocsRef,
          }),
          ...(product.spec.contact?.email && {
            'kuadrant.io/contact-email': product.spec.contact.email,
          }),
          ...(product.spec.contact?.slack && {
            'kuadrant.io/contact-slack': product.spec.contact.slack,
          }),
        },
        tags: [...tags, 'kuadrant', 'apiproduct'],
        labels: {
          'kuadrant.io/synced': 'true',
          ...(product.metadata.labels || {}),
        },
      },
      spec: {
        type: 'openapi',
        lifecycle,
        owner,
        definition: product.spec.documentation?.openAPISpec
          ? `# openapi spec available at: ${product.spec.documentation.openAPISpec}\n\nopenapi: 3.0.0\ninfo:\n  title: ${displayName}\n  version: ${product.spec.version || '1.0.0'}\n  description: ${description}\n`
          : `# no openapi spec configured\n\nopenapi: 3.0.0\ninfo:\n  title: ${displayName}\n  version: ${product.spec.version || '1.0.0'}\n  description: ${description}\n`,
      },
    };

    return entity;
  }
}

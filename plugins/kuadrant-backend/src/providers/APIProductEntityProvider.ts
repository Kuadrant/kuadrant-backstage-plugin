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
    displayName: string;
    description?: string;
    version?: string;
    tags?: string[];
    targetRef: {
      group: string;
      kind: string;
      name: string;
    };
    approvalMode: 'automatic' | 'manual';
    publishStatus: 'Draft' | 'Published';
    documentation?: {
      openAPISpecURL?: string;
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
  status?: {
    discoveredPlans?: Array<{
      tier: string;
      limits?: any;
    }>;
    openapi?: {
      raw?: string;
      lastSyncTime?: string;
    };
    discoveredAuthScheme?: any;
    oidcDiscovery?: {
      tokenEndpoint: string;
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

  public async refresh(): Promise<void> {
    console.log('apiproduct provider: refresh called');
    if (!this.connection) {
      console.log('apiproduct provider: no connection, skipping refresh');
      return;
    }

    try {
      console.log('apiproduct provider: fetching apiproducts from kubernetes');
      // fetch all apiproducts from kubernetes
      const response = await this.k8sClient.listCustomResources(
        'devportal.kuadrant.io',
        'v1alpha1',
        'apiproducts'
      );

      const apiProducts = (response.items || []) as APIProduct[];
      console.log(`apiproduct provider: found ${apiProducts.length} apiproducts`);

      // filter out Draft API products - only include Published ones 
      const publishedProducts = apiProducts.filter(product => {
        const publishStatus = product.spec.publishStatus || 'Draft';  // default to Draft if not specified
        return publishStatus === 'Published';
      });
      console.log(`apiproduct provider: filtered to ${publishedProducts.length} published apiproducts (${apiProducts.length - publishedProducts.length} drafts excluded)`);

      // transform apiproducts to backstage api entities
      const entities = publishedProducts
        .map(product => this.transformToEntity(product))
        .filter((entity): entity is ApiEntity => entity !== null);
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

  private transformToEntity(product: APIProduct): ApiEntity | null {
    const namespace = product.metadata.namespace || 'default';
    const name = product.metadata.name;
    const displayName = product.spec.displayName || name;
    const description = product.spec.description || `api product: ${displayName}`;

    // determine lifecycle from labels or default to production
    const lifecycle = product.metadata.labels?.lifecycle || 'production';

    // owner must be set via backstage ownership annotation
    // if missing, skip this apiproduct (created outside backstage or invalid)
    const owner = product.metadata.annotations?.['backstage.io/owner'];
    if (!owner) {
      console.warn(`apiproduct ${namespace}/${name} has no backstage.io/owner annotation, skipping catalog sync`);
      return null;
    }

    // build tags from product tags
    const tags = product.spec.tags || [];

    // OpenAPI spec URL
    const definition = product.status?.openapi?.raw ? `${product.status.openapi.raw}`
      : `# no openapi spec configured
      openapi: 3.0.0
      info:
        title: ${displayName}
        version: ${product.spec.version || '1.0.0'}
        description: ${description}
    `;

    // Check if entity has API Key auth scheme
    const authSchemes = product.status?.discoveredAuthScheme?.authentication || {};
    const schemeObjects = Object.values(authSchemes);
    const hasApiKey = schemeObjects.some((scheme: any) =>
      scheme.hasOwnProperty("apiKey"),
    );
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
          'kuadrant.io/auth-apikey': hasApiKey.toString(),
          // add httproute annotation if we can infer it (usually same as apiproduct name without -api suffix)
          'kuadrant.io/httproute': name.endsWith('-api') ? name.slice(0, -4) : name,
          ...(product.spec.documentation?.openAPISpecURL && {
            'kuadrant.io/openapi-spec-url': product.spec.documentation.openAPISpecURL,
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
        definition: definition,
      },
    };

    return entity;
  }
}

import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
  IdentityApi,
} from '@backstage/core-plugin-api';
import retry from 'async-retry';
import { handleFetchError } from './utils/errors';
import {
  APIKey, APIKeyRequest,
  APIKeySpec,
  APIProduct,
  APIProductSpec, ExtractedSecret,
  PlanPolicy,
} from './types/api-management';

/**
 * Generic Kuadrant list type for API responses
 */
export interface KuadrantList<T = any> {
  items: T[];
}

/**
 * Options for constructing the KuadrantApiClient
 */
export type Options = {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
  identityApi: IdentityApi;
};

/**
 * Retry configuration for read operations (GET requests only)
 * Conservative strategy: 3 retries with exponential backoff
 */
const RETRY_OPTIONS: retry.Options = {
  retries: 3,
  factor: 2,
  minTimeout: 300, // 300ms, 600ms, 1200ms
  maxTimeout: 3000,
  randomize: true,
};

/**
 * Kuadrant API interface defining all operations for managing
 * API products, API keys, and related resources
 */
export interface KuadrantAPI {
  // ===== APIKey Requests =====

  /**
   * Fetch all API key requests
   * @returns Promise with list of all API key requests
   */
  getRequests(): Promise<KuadrantList<APIKey>>;

  /**
   * Fetch API key requests for a specific namespace
   * @param namespace - Kubernetes namespace
   * @returns Promise with list of requests in the namespace
   */
  getRequestsByNamespace(namespace: string): Promise<KuadrantList<APIKey>>;

  /**
   * Fetch a single API key request
   * @param namespace - API key request name
   * @param name - Kubernetes namespace
   * @returns Promise with the API key request
   */
  getRequest(namespace: string, name: string): Promise<APIKey>;

  /**
   * Create a new API key request
   * @param request - APIKeyRequest specification
   * @returns Promise with the created API key
   */
  createRequest(request: APIKeyRequest): Promise<APIKey>;

  /**
   * Update an existing API key request
   * @param namespace - Kubernetes namespace
   * @param name - API key request name
   * @param patch - Partial API key spec with fields to update
   * @returns Promise with the updated API key
   */
  updateRequest(
    namespace: string,
    name: string,
    patch: Partial<APIKeySpec>,
  ): Promise<APIKey>;

  /**
   * Delete an API key request
   * @param namespace - Kubernetes namespace
   * @param name - API key request name
   * @returns Promise that resolves when deletion completes
   */
  deleteRequest(namespace: string, name: string): Promise<void>;

  /**
   * Approve an API key request
   * @param namespace - Kubernetes namespace
   * @param name - API key request name
   * @returns Promise with the approved API key
   */
  approveRequest(namespace: string, name: string): Promise<APIKey>;

  /**
   * Reject an API key request
   * @param namespace - Kubernetes namespace
   * @param name - API key request name
   * @returns Promise with the rejected API key
   */
  rejectRequest(namespace: string, name: string): Promise<APIKey>;

  /**
   * Bulk approve multiple API key requests
   * @param requests - Array of namespace/name pairs to approve
   * @returns Promise that resolves when all approvals complete
   */
  bulkApproveRequests(
    requests: Array<{ namespace: string; name: string }>,
  ): Promise<void>;

  /**
   * Bulk reject multiple API key requests
   * @param requests - Array of namespace/name pairs to reject
   * @returns Promise that resolves when all rejections complete
   */
  bulkRejectRequests(
    requests: Array<{ namespace: string; name: string }>,
  ): Promise<void>;

  // ===== API Keys/Secrets =====

  /**
   * Fetch an API key resource
   * @param namespace - Kubernetes namespace
   * @param name - API key name
   * @returns Promise with the API key
   */
  getApiKey(namespace: string, name: string): Promise<APIKey>;

  /**
   * Retrieve the secret value for an API key (one-time operation)
   * @param namespace - Kubernetes namespace
   * @param name - API key name
   * @returns Promise with the secret value
   */
  getApiKeySecret(namespace: string, name: string): Promise<ExtractedSecret>;

  // ===== API Products =====

  /**
   * Fetch all API products
   * @returns Promise with list of all API products
   */
  getApiProducts(): Promise<KuadrantList<APIProduct>>;

  /**
   * Fetch a single API product
   * @param namespace - Kubernetes namespace
   * @param name - API product name
   * @returns Promise with the API product
   */
  getApiProduct(namespace: string, name: string): Promise<APIProduct>;

  /**
   * Create a new API product
   * @param product - API product specification
   * @returns Promise with the created API product
   */
  createApiProduct(product: APIProduct): Promise<APIProduct>;

  /**
   * Update an existing API product
   * @param namespace - Kubernetes namespace
   * @param name - API product name
   * @param patch - Partial API product spec with fields to update
   * @returns Promise with the updated API product
   */
  updateApiProduct(
    namespace: string,
    name: string,
    patch: Partial<APIProductSpec>,
  ): Promise<APIProduct>;

  /**
   * Delete an API product
   * @param namespace - Kubernetes namespace
   * @param name - API product name
   * @returns Promise that resolves when deletion completes
   */
  deleteApiProduct(namespace: string, name: string): Promise<void>;

  // ===== HTTP Routes & Policies =====

  /**
   * Fetch all HTTP routes
   * @returns Promise with list of all HTTP routes
   */
  getHttpRoutes(): Promise<KuadrantList>;

  // ===== Plan Policies =====

  /**
   * Fetch all plan policies
   * @returns Promise with list of all plan policies
   */
  getPlanPolicies(): Promise<KuadrantList<PlanPolicy>>;
}

/**
 * API reference for the Kuadrant API
 */
export const kuadrantApiRef = createApiRef<KuadrantAPI>({
  id: 'plugin.kuadrant.service',
});

/**
 * Implementation of the Kuadrant API client
 */
export class KuadrantApiClient implements KuadrantAPI {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: Options) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  /**
   * Get the base URL for the backend API
   */
  private async getBaseUrl(): Promise<string> {
    return await this.discoveryApi.getBaseUrl('');
  }

  /**
   * Wrapper for GET requests with automatic retry logic
   * Retries on network failures or 5xx errors with exponential backoff
   */
  private async fetchWithRetry<T>(url: string, errorMsg: string = ""): Promise<T> {
    return retry(
      async (bail) => {
        const response = await this.fetchApi.fetch(url);
        if (response.status === 401 || response.status === 403) { // Don't retry on Unauthenticated/Unauthorized
          const error = await handleFetchError(response);
          bail(new Error(error));
        }
        else if (!response.ok) {
          const error = await handleFetchError(response);
          throw new Error(`${errorMsg} ${error}`);
        }
        return await response.json();
      },
      RETRY_OPTIONS,
    );
  }

  /**
   * Wrapper for mutations (POST, PATCH, DELETE) without retry
   * These operations are not retried to avoid duplicate side effects
   */
  private async fetchWithoutRetry<T>(
    url: string,
    options: RequestInit,
    errorMsg: string = ""): Promise<T> {
    const response = await this.fetchApi.fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });

    if (!response.ok) {
      const error = await handleFetchError(response);
      throw new Error(`${errorMsg} ${error}`);
    }

    // DELETE operations don't return a body
    if (options.method === 'DELETE') {
      return undefined as T;
    }

    return await response.json();
  }

  // ===== API Requests Implementation =====

  async getRequests(): Promise<KuadrantList<APIKey>> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/requests/my`,
      "Failed to fetch API Key requests."
    );
  }

  async getRequestsByNamespace(namespace: string): Promise<KuadrantList<APIKey>> {
    const baseUrl = await this.getBaseUrl();
    const url = namespace
      ? `${baseUrl}kuadrant/requests/my?namespace=${namespace}`
      : `${baseUrl}kuadrant/requests/my`;
    return this.fetchWithRetry(url, "Failed to fetch API Key requests by namespace.");
  }

  async getRequest(namespace: string, name: string): Promise<APIKey> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/requests/${namespace}/${name}`,
      "Failed to fetch API Key request."
    );
  }

  async createRequest(request: APIKeyRequest): Promise<APIKey> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests`, {
      method: 'POST',
      body: JSON.stringify(request),
    }, "Failed to create APIKey request.");
  }

  async updateRequest(
    namespace: string,
    name: string,
    patch: Partial<APIKeySpec>,
  ): Promise<APIKey> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests/${namespace}/${name}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }, "Failed to update APIKey request.");
  }

  async deleteRequest(namespace: string, name: string): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests/${namespace}/${name}`, {
      method: 'DELETE',
    }, "Failed to delete APIKey request.");
  }

  async approveRequest(namespace: string, name: string): Promise<APIKey> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests/${namespace}/${name}/approve`, {
      method: 'POST',
    }, "Failed to approve APIKey request.");
  }

  async rejectRequest(namespace: string, name: string): Promise<APIKey> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests/${namespace}/${name}/reject`, {
      method: 'POST',
    }, "Failed to reject APIKey request.");
  }

  async bulkApproveRequests(
    requests: Array<{ namespace: string; name: string }>,
  ): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests/bulk-approve`, {
      method: 'POST',
      body: JSON.stringify({requests}),
    }, "Failed to bulk approve APIKey requests.");
  }

  async bulkRejectRequests(
    requests: Array<{ namespace: string; name: string }>,
  ): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/requests/bulk-reject`, {
      method: 'POST',
      body: JSON.stringify({requests}),
    }, "Failed to bulk reject APIKey requests");
  }

  // ===== API Keys/Secrets Implementation =====

  async getApiKey(namespace: string, name: string): Promise<APIKey> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/apikeys/${namespace}/${name}`,
      "Failed to fetch API Key."
    );
  }

  async getApiKeySecret(
    namespace: string,
    name: string,
  ): Promise<ExtractedSecret> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/apikeys/${namespace}/${name}/secret`,
      "Failed to fetch API Key Secret."
    );
  }

  // ===== API Products Implementation =====

  async getApiProducts(): Promise<KuadrantList<APIProduct>> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/apiproducts`,
      "Failed to fetch API Products."
    );
  }

  async getApiProduct(namespace: string, name: string): Promise<APIProduct> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/apiproducts/${namespace}/${name}`,
      "Failed to fetch API Product."
    );
  }

  async createApiProduct(product: APIProduct): Promise<APIProduct> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/apiproducts`, {
      method: 'POST',
      body: JSON.stringify(product),
    }, "Failed to create API Product.");
  }

  async updateApiProduct(
    namespace: string,
    name: string,
    patch: Partial<APIProductSpec>,
  ): Promise<APIProduct> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/apiproducts/${namespace}/${name}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }, "Failed to update API Product.");
  }

  async deleteApiProduct(namespace: string, name: string): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithoutRetry(`${baseUrl}kuadrant/apiproducts/${namespace}/${name}`, {
      method: 'DELETE',
    }, "Failed to delete API Product.");
  }

  // ===== HTTP Routes =====

  async getHttpRoutes(): Promise<KuadrantList> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/httproutes`,
      "Failed to fetch HTTPRoutes."
    );
  }

  // ===== Plan Policies Implementation =====

  async getPlanPolicies(): Promise<KuadrantList<PlanPolicy>> {
    const baseUrl = await this.getBaseUrl();
    return this.fetchWithRetry(
      `${baseUrl}kuadrant/planpolicies`,
      "Failed to fetch PlanPolicies."
    );
  }
}

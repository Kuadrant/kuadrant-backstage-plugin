export type PlanTier = string; // custom tier names defined by api owners
export type RequestPhase = 'Pending' | 'Approved' | 'Rejected';

export interface PlanLimits {
  daily?: number;
  weekly?: number;
  monthly?: number;
  yearly?: number;
  custom?: Array<{
    limit: number;
    window: string;
  }>;
}

export interface APIKeyRequestSpec {
  apiProductRef: {
    name: string;
  };
  planTier: PlanTier;
  useCase: string;
  requestedBy: {
    userId: string;
    email: string;
  };
}

export interface APIKeyRequestStatus {
  phase?: RequestPhase;
  reviewedBy?: string;
  reviewedAt?: string;
  apiHostname?: string;
  limits?: PlanLimits;
  secretRef?: {
    name: string;
    key: string;
  };
  conditions?: Array<{
    type: string;
    status: 'True' | 'False' | 'Unknown';
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
    observedGeneration?: number;
  }>;
}

// enriched response from backend (adds apiKey from secretRef lookup)
export interface EnrichedAPIKeyRequest extends APIKeyRequest {
  apiKey?: string;
}

// helper to extract rejection reason from conditions
export function getRejectionReason(request: APIKeyRequest): string | undefined {
  const conditions = request.status?.conditions;
  if (!conditions) return undefined;
  const rejected = conditions.find(
    c => c.type === 'Ready' && c.status === 'False' && c.reason === 'Rejected'
  );
  return rejected?.message;
}

export interface APIKeyRequest {
  apiVersion: 'devportal.kuadrant.io/v1alpha1';
  kind: 'APIKey';
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: APIKeyRequestSpec;
  status?: APIKeyRequestStatus;
}

export interface Plan {
  tier: string;
  description?: string;
  limits?: PlanLimits;
}

export interface APIProductSpec {
  displayName: string;
  description: string;
  version: string;
  tags?: string[];
  planPolicyRef?: {
    name: string;
    namespace: string;
  };
  publishStatus?: 'Draft' | 'Published';
  documentation?: {
    openAPISpecURL?: string;
    swaggerUI?: string;
    docsURL?: string;
    gitRepository?: string;
    techdocsRef?: string;
  };
  contact?: {
    team?: string;
    email?: string;
    slack?: string;
    url?: string;
  };
}

export interface APIProductStatus {
  observedGeneration?: number;
  discoveredPlans?: Plan[];
  conditions?: Array<{
    type: string;
    status: 'True' | 'False' | 'Unknown';
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
}

export interface APIProduct {
  apiVersion: 'devportal.kuadrant.io/v1alpha1';
  kind: 'APIProduct';
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: APIProductSpec;
  status?: APIProductStatus;
}

export interface PlanPolicyPlan {
  tier: string;
  predicate?: string;
  description?: string;
  limits?: PlanLimits;
}

export interface PlanPolicy {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    targetRef: {
      kind: 'HTTPRoute' | 'Gateway';
      name: string;
      namespace?: string;
    };
    plans: PlanPolicyPlan[];
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: 'True' | 'False' | 'Unknown';
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
  };
}

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
  apiName: string;
  apiNamespace: string;
  planTier: PlanTier;
  useCase?: string;
  requestedBy: {
    userId: string;
    email: string;
  };
  requestedAt?: string;
}

export interface APIKeyRequestStatus {
  phase?: RequestPhase;
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
  comment?: string;
  apiKey?: string;
  apiHostname?: string;
  apiBasePath?: string;
  apiDescription?: string;
  apiOasUrl?: string;
  apiOasUiUrl?: string;
  planLimits?: PlanLimits;
  conditions?: Array<{
    type: string;
    status: 'True' | 'False' | 'Unknown';
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
}

export interface APIKeyRequest {
  apiVersion: 'extensions.kuadrant.io/v1alpha1';
  kind: 'APIKeyRequest';
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
  plans: Plan[];
  publishStatus?: 'Draft' | 'Published';
  documentation?: {
    openAPISpec?: string;
    swaggerUI?: string;
    docsURL?: string;
    gitRepository?: string;
  };
  contact?: {
    team?: string;
    email?: string;
    slack?: string;
    url?: string;
  };
}

export interface APIProductStatus {
  conditions?: Array<{
    type: string;
    status: 'True' | 'False' | 'Unknown';
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
  planPolicyStatus?: string;
  lastSyncTime?: string;
}

export interface APIProduct {
  apiVersion: 'extensions.kuadrant.io/v1alpha1';
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

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

// Status condition types for Kubernetes resources
export type OpenAPISpecConditionReason =
  | 'SpecFetched'
  | 'SpecSizeTooLarge'
  | 'FetchFailed';

export type StatusConditionType =
  | 'OpenAPISpecReady'
  | string; // Allow other condition types

export interface StatusCondition {
  type: StatusConditionType;
  status: 'True' | 'False' | 'Unknown';
  reason?: OpenAPISpecConditionReason | string;
  message?: string;
  lastTransitionTime?: string;
}

export interface APIKeySpec {
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

// Authorino v1beta3 Credentials types
export interface CredentialsAuthorizationHeader {
  prefix?: string;
}

export interface CredentialsCustomHeader {
  name: string;
  prefix?: string;
}

export interface CredentialsNamed {
  name: string;
}

export interface Credentials {
  authorizationHeader?: CredentialsAuthorizationHeader;
  customHeader?: CredentialsCustomHeader;
  queryString?: CredentialsNamed;
  cookie?: CredentialsNamed;
}

// Authorino v1beta3 AuthenticationSpec types
export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: Array<{
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
    values?: string[];
  }>;
}

export interface AuthenticationSpec {
  selector?: LabelSelector;
  allNamespaces?: boolean;
}

export interface APIKeyAuthScheme {
  authenticationSpec?: AuthenticationSpec;
  credentials?: Credentials;
}

export interface APIKeyStatus {
  phase?: RequestPhase;
  reviewedBy?: string;
  reviewedAt?: string;
  apiHostname?: string;
  limits?: PlanLimits;
  secretRef?: {
    name: string;
    key: string;
  };
  canReadSecret?: boolean;
  authScheme?: APIKeyAuthScheme;
  conditions?: StatusCondition[];
}

export interface APIKey {
  apiVersion: 'devportal.kuadrant.io/v1alpha1';
  kind: 'APIKey';
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: APIKeySpec;
  status?: APIKeyStatus;
}

export interface Plan {
  tier: string;
  description?: string;
  limits?: PlanLimits;
}

export interface APIProductSpec {
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
  openapi?: {
    raw: string;
    lastSyncTime: string;
  };
  conditions?: StatusCondition[];
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
    conditions?: StatusCondition[];
  };
}

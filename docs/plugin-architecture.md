# Plugin Architecture

This document describes the architectural decisions, components, and data flows of the Kuadrant Backstage plugin.

## Overview

The Kuadrant Backstage plugin provides a developer portal interface for API access management. It enables API consumers to discover and request access to APIs, and API owners to manage those requests through approval workflows.

## Component Architecture

### Components

**Backstage Plugin**:
- **Frontend**: React UI for browsing APIs, requesting access, and managing API keys
- **Backend**: Express.js API that validates input (Zod schemas), enforces RBAC permissions, and issues CRUD calls to the Kubernetes API for APIProduct and APIKey resources
- **Entity Provider**: Periodically fetches published APIProducts from Kubernetes and syncs them to the Backstage catalog for discovery

**Kuadrant**:
- **Developer Portal Controller**: Kubernetes operator that reconciles APIKey (approval, Secret lifecycle) and APIProduct (policy discovery, OpenAPI sync, OIDC discovery) resources
- **Gateway**: Istio-based gateway that routes API traffic
- **Authorino**: Kubernetes-native authorization service that validates API keys from label-selected Secrets
- **Limitador**: Rate limiting service that enforces tier-based quotas

**Technologies**:
- Frontend: React, TypeScript, Material-UI
- Backend: Express.js, Zod, @kubernetes/client-node
- Testing: Playwright (E2E), Jest (unit tests)

### Technology Choices

**React + TypeScript + Material-UI:**
- React: Required by Backstage plugin framework
- TypeScript: Type safety for Backstage APIs and component contracts
- Material-UI v4: Backstage's UI library (forced version for consistency with core)

**Express.js:**
- Standard Backstage backend framework
- Lightweight HTTP routing
- Native middleware support for CORS, auth, permissions

**Zod:**
- Runtime schema validation for API requests
- Type inference (generates TypeScript types from schemas)
- Prevents invalid data from reaching Kubernetes API

**Playwright:**
- Browser automation for E2E tests
- Component annotations for test tracking
- Backstage test infrastructure standard



### High-Level Component Diagram

```mermaid
flowchart TB
    subgraph K8s["Kubernetes Cluster"]
        subgraph Backstage["Kuadrant Backstage Plugin"]
            FE["Frontend Plugin"]
            BE["Backend Plugin"]
            EP["Entity Provider"]
        end

        API["K8s API Server"]
        Catalog["Backstage Catalog"]

        subgraph Kuadrant["Kuadrant (Control Plane)"]
            DPC["Developer Portal Controller"]
        end

        subgraph DataPlane["Kuadrant (Data Plane)"]
            Gateway["Gateway"]
            Authorino["Authorino"]
            Limitador["Limitador"]
        end

        PlanPolicy["PlanPolicy CRD"]
        APIProduct["APIProduct CRD"]
        APIKey["APIKey CRD"]
        HTTPRoute["HTTPRoute"]
        AuthPolicy["AuthPolicy CRD"]
        Secrets["K8s Secrets"]
    end

    FE --> BE
    BE <-->|"CRUD"| API
    API --> DPC
    DPC -.->|"watches"| APIProduct
    DPC -.->|"watches"| APIKey
    DPC -.->|"watches"| PlanPolicy
    DPC -.->|"watches"| HTTPRoute
    DPC -.->|"watches"| AuthPolicy
    DPC -.->|"updates status"| APIProduct
    DPC -.->|"updates status"| APIKey
    DPC -.->|"creates"| Secrets
    EP -.->|"fetches"| APIProduct
    EP -.->|"syncs"| Catalog
    Authorino -.->|"reads"| Secrets
    PlanPolicy -.->|"configures"| Limitador
```

## Data Flow Diagrams

### API Key Request and Approval Flow

```mermaid
sequenceDiagram
    participant Consumer as API Consumer<br/>(Alice)
    participant FE as Frontend
    participant BE as Backend
    participant K8s as K8s API
    participant DPC as Developer Portal<br/>Controller
    participant Owner as API Owner<br/>(Bob)

    Consumer->>FE: 1. Request API Access<br/>(select plan, useCase)
    FE->>BE: 2. POST /api/kuadrant/requests
    BE->>BE: Validate & authorize
    BE->>K8s: 3. Create APIKey CRD<br/>(status: Pending)

    alt Auto Approval Mode
        K8s->>DPC: APIKey created
        DPC->>K8s: Set status: Approved
        DPC->>K8s: 4. Create Secret with API key
    else Manual Approval Mode
        Owner->>FE: 4. View pending requests
        FE->>BE: GET /api/kuadrant/requests
        Owner->>FE: Approve or Reject
        FE->>BE: POST /api/kuadrant/requests/:ns/:name/approve
        BE->>BE: Verify ownership
        BE->>K8s: Update APIKey status: Approved
        K8s->>DPC: Status changed
        DPC->>K8s: 5. Create Secret with API key
    end

    FE->>BE: Poll for status
    FE-->>Consumer: View API key<br/>(GET /apikeys/:ns/:name/secret)
```

### Runtime API Authentication

Once an APIKey is approved and the Secret is created, Kuadrant enforces authentication and rate limiting at runtime:

```mermaid
sequenceDiagram
    participant Consumer as API Consumer
    participant Gateway as Gateway
    participant Authorino as Authorino
    participant Limitador as Limitador
    participant Secrets as K8s Secrets
    participant API as Backend API

    Consumer->>Gateway: HTTP request<br/>(Authorization: APIKEY secret-alice-key)
    Gateway->>Authorino: Delegate auth check
    Authorino->>Secrets: Lookup Secret matching<br/>label selector (app: toystore)
    Secrets-->>Authorino: Secret found with<br/>plan-id: gold
    Authorino-->>Gateway: Authenticated (identity metadata)
    Gateway->>Limitador: Delegate rate limit check
    Limitador->>Limitador: Evaluate PlanPolicy predicate<br/>(secret.kuadrant.io/plan-id == "gold")
    Limitador-->>Gateway: Rate limit OK (100 req/day)
    Gateway->>API: Forward request
    API-->>Gateway: Response
    Gateway-->>Consumer: 200 OK

    Note over Gateway,Consumer: On failure: 401 (unauthorized)<br/>or 429 (rate limited)
```

**Secret Structure** (created by Developer Portal Controller):
- **Labels**: Match AuthPolicy selectors (e.g., `app: toystore`)
- **Annotations**: Plan identification (`secret.kuadrant.io/plan-id: gold`, `secret.kuadrant.io/user-id: user:default/alice`)
- **Data**: Actual API key value

### Catalog Sync Flow

The Entity Provider synchronizes published APIProducts from Kubernetes to the Backstage catalog:

```mermaid
sequenceDiagram
    participant EP as Entity Provider
    participant K8s as K8s API
    participant Catalog as Backstage Catalog

    loop Every 30 seconds
        EP->>K8s: List APIProducts
        K8s-->>EP: All APIProducts
        EP->>EP: Filter publishStatus: Published
        EP->>EP: Transform to API entities<br/>(metadata, OpenAPI spec)
        EP->>Catalog: applyMutation (full sync)
        Catalog-->>EP: Sync complete
    end

    Note over EP,Catalog: Ownership derived from<br/>backstage.io/owner annotation
```

## Security Architecture

The plugin implements defense-in-depth security with multiple layers:

- **Authentication**: All endpoints require valid Backstage credentials
- **Authorization**: RBAC permission checks enforce role-based access (`.all` and `.own` permissions)
- **Input Validation**: Zod schemas validate and sanitize all request data
- **Ownership Verification**: Resources are checked against user ownership before allowing modifications
- **Kubernetes RBAC**: Service account uses minimal permissions with access limited to specific CRDs and namespaces

For detailed security guidelines, see [Backend Security](./backend-security.md).

## References

- [Backend Security](./backend-security.md) - Detailed security tenets and implementation
- [RBAC Permissions](./rbac-permissions.md) - Permission model and role definitions
- [Kuadrant Resources](./kuadrant-resources.md) - CRD schemas and examples
- [Repository Guide](./repository-guide.md) - Monorepo structure, build system, configuration

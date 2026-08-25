# Backend API Reference

The backend plugin exposes REST API endpoints at `/api/kuadrant/*`. All endpoints require authentication and enforce RBAC permissions.

## APIProduct Endpoints

| Method | Endpoint                                     | Description                                                  | Permission                                        |
| ------ | -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| GET    | `/api/kuadrant/apiproducts`                  | List all API Products (filtered by ownership for non-admins) | `kuadrant.apiproduct.list`                        |
| GET    | `/api/kuadrant/apiproducts/:namespace/:name` | Get specific API Product                                     | `kuadrant.apiproduct.read.own` or `.read.all`     |
| POST   | `/api/kuadrant/apiproducts`                  | Create new API Product                                       | `kuadrant.apiproduct.create`                      |
| PATCH  | `/api/kuadrant/apiproducts/:namespace/:name` | Update API Product                                           | `kuadrant.apiproduct.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/apiproducts/:namespace/:name` | Delete API Product (cascades to APIKeys)                     | `kuadrant.apiproduct.delete.own` or `.delete.all` |

## HTTPRoute Endpoints

| Method | Endpoint                   | Description         | Permission                 |
| ------ | -------------------------- | ------------------- | -------------------------- |
| GET    | `/api/kuadrant/httproutes` | List all HTTPRoutes | `kuadrant.apiproduct.list` |

## MCP Management Endpoints

Read-only endpoints backing the MCP Management overview and resource detail views.

| Method | Endpoint                                                 | Description                                        | Permission                            |
| ------ | -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| GET    | `/api/kuadrant/gateways`                                 | List Gateways (minimal projection)                 | `kuadrant.gateway.list`               |
| GET    | `/api/kuadrant/mcp/gatewayextensions`                    | List MCPGatewayExtensions (minimal projection)     | `kuadrant.mcpgatewayextension.list`   |
| GET    | `/api/kuadrant/mcp/gatewayextensions/:namespace/:name`   | Get a single MCPGatewayExtension (full resource)   | `kuadrant.mcpgatewayextension.list`   |
| GET    | `/api/kuadrant/mcp/serverregistrations`                  | List MCPServerRegistrations (minimal projection)   | `kuadrant.mcpserverregistration.list` |
| GET    | `/api/kuadrant/mcp/serverregistrations/:namespace/:name` | Get a single MCPServerRegistration (full resource) | `kuadrant.mcpserverregistration.list` |

The list endpoints return only the fields the overview needs (name, namespace, targetRef, conditions). The detail endpoints return the full resource manifest — including labels, annotations, owner references and creation timestamp — because the read-only detail views render both a Details tab and a raw YAML tab. They respond `403` when the permission is denied and `500` on a Kubernetes client error.

## PlanPolicy Endpoints

| Method | Endpoint                                      | Description              | Permission                 |
| ------ | --------------------------------------------- | ------------------------ | -------------------------- |
| GET    | `/api/kuadrant/planpolicies`                  | List all Plan Policies   | `kuadrant.planpolicy.list` |
| GET    | `/api/kuadrant/planpolicies/:namespace/:name` | Get specific Plan Policy | `kuadrant.planpolicy.read` |

## AuthPolicy Endpoints

| Method | Endpoint                     | Description           | Permission                 |
| ------ | ---------------------------- | --------------------- | -------------------------- |
| GET    | `/api/kuadrant/authpolicies` | List all AuthPolicies | `kuadrant.authpolicy.list` |

## RateLimitPolicy Endpoints

| Method | Endpoint                          | Description                | Permission                      |
| ------ | --------------------------------- | -------------------------- | ------------------------------- |
| GET    | `/api/kuadrant/ratelimitpolicies` | List all RateLimitPolicies | `kuadrant.ratelimitpolicy.list` |

## APIKey Endpoints

| Method | Endpoint                                          | Description                           | Permission                                    |
| ------ | ------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| GET    | `/api/kuadrant/requests`                          | List API Keys (filtered by ownership) | `kuadrant.apikey.read.own` or `.read.all`     |
| GET    | `/api/kuadrant/requests/my`                       | List current user's API Keys          | `kuadrant.apikey.read.own`                    |
| POST   | `/api/kuadrant/requests`                          | Create API Key request                | `kuadrant.apikey.create`                      |
| PATCH  | `/api/kuadrant/requests/:namespace/:name`         | Edit pending request                  | `kuadrant.apikey.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/requests/:namespace/:name`         | Delete/cancel request                 | `kuadrant.apikey.delete.own` or `.delete.all` |
| POST   | `/api/kuadrant/requests/:namespace/:name/approve` | Approve request                       | `kuadrant.apikey.approve`                     |
| POST   | `/api/kuadrant/requests/:namespace/:name/reject`  | Reject request                        | `kuadrant.apikey.approve`                     |
| POST   | `/api/kuadrant/requests/bulk-approve`             | Bulk approve requests                 | `kuadrant.apikey.approve`                     |
| POST   | `/api/kuadrant/requests/bulk-reject`              | Bulk reject requests                  | `kuadrant.apikey.approve`                     |

## API Key Secret Endpoints

| Method | Endpoint                                        | Description                        | Permission                                |
| ------ | ----------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| GET    | `/api/kuadrant/apikeys/:namespace/:name/secret` | Get API key secret (one-time read) | `kuadrant.apikey.read.own` or `.read.all` |

## Query Parameters

**`GET /api/kuadrant/requests`:**

- `status` - Filter by status: `Pending`, `Approved`, `Rejected`
- `namespace` - Filter by Kubernetes namespace

**`GET /api/kuadrant/requests/my`:**

- `namespace` - Filter by Kubernetes namespace

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

| Method | Endpoint                                  | Description                           | Permission                   |
| ------ | ----------------------------------------- | ------------------------------------- | ---------------------------- |
| GET    | `/api/kuadrant/httproutes`                | List all HTTPRoutes                   | `kuadrant.httproute.list`    |
| GET    | `/api/kuadrant/httproutes/:namespace/:name` | Get a single HTTPRoute (full resource) | `kuadrant.httproute.list`    |

## MCP Management Endpoints

Read-only endpoints backing the MCP Management overview and resource detail views.

| Method | Endpoint                                                 | Description                                        | Permission                            |
| ------ | -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| GET    | `/api/kuadrant/gateways`                                 | List Gateways (minimal projection)                 | `kuadrant.gateway.list`               |
| GET    | `/api/kuadrant/mcp/gatewayextensions`                    | List MCPGatewayExtensions (minimal projection)     | `kuadrant.mcpgatewayextension.list`   |
| GET    | `/api/kuadrant/mcp/gatewayextensions/:namespace/:name`   | Get a single MCPGatewayExtension (full resource)   | `kuadrant.mcpgatewayextension.list`   |
| GET    | `/api/kuadrant/mcp/serverregistrations`                  | List MCPServerRegistrations (minimal projection)   | `kuadrant.mcpserverregistration.list` |
| GET    | `/api/kuadrant/mcp/serverregistrations/:namespace/:name` | Get a single MCPServerRegistration (full resource) | `kuadrant.mcpserverregistration.list` |
| POST   | `/api/kuadrant/mcp/inspector/:namespace/:name`           | Relay an MCP Inspector JSON-RPC request            | `kuadrant.mcp.inspector.use`          |

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
| GET    | `/api/kuadrant/requests`                          | List APIKeyRequests for owner review | `kuadrant.apikey.read.own` or `.read.all`     |
| GET    | `/api/kuadrant/requests/my`                       | List current user's API Keys          | `kuadrant.apikey.read.own`                    |
| POST   | `/api/kuadrant/requests`                          | Create API Key request                | `kuadrant.apikey.create`                      |
| PATCH  | `/api/kuadrant/requests/:namespace/:name`         | Edit pending request                  | `kuadrant.apikey.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/requests/:namespace/:name`         | Delete/cancel own request             | `kuadrant.apikey.delete.own`                 |
| POST   | `/api/kuadrant/requests/:namespace/:name/approve` | Approve request                       | `kuadrant.apikey.update.own` or `.update.all` |
| POST   | `/api/kuadrant/requests/:namespace/:name/reject`  | Reject request                        | `kuadrant.apikey.update.own` or `.update.all` |
| POST   | `/api/kuadrant/requests/bulk-approve`             | Bulk approve requests                 | `kuadrant.apikey.update.own` or `.update.all` |
| POST   | `/api/kuadrant/requests/bulk-reject`              | Bulk reject requests                  | `kuadrant.apikey.update.own` or `.update.all` |

`POST /requests` creates an APIKey in the authenticated consumer's namespace. Its required `secretName` must identify a consumer Secret created beforehand through `POST /secrets`. The request body's `namespace` identifies the APIProduct's namespace.

The approve/reject endpoints use an **APIKeyRequest's** namespace and name and create an APIKeyApproval referencing it. Edit/delete endpoints use the consumer's **APIKey** namespace and name. The controller reconciles approval conditions and enforcement Secrets. Approval endpoints require `update.all`, or `update.own` plus ownership of the APIProduct; `kuadrant.apikey.approve` controls visibility of the approval UI.

## API Key Secret Endpoints

| Method | Endpoint                                        | Description                                    | Permission                                |
| ------ | ----------------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| POST   | `/api/kuadrant/secrets`                         | Create consumer Secret (`name`, `apiKeyValue`) | `kuadrant.apikey.create`                  |
| DELETE | `/api/kuadrant/secrets/:name`                   | Delete consumer Secret                         | `kuadrant.apikey.create`                  |
| GET    | `/api/kuadrant/apikeys/:namespace/:name/secret` | Read the APIKey's consumer Secret on demand    | `kuadrant.apikey.read.own` or `.read.all` |

## Query Parameters

**`GET /api/kuadrant/requests`:**

- `status` - Filter by status: `Pending`, `Approved`, `Denied`
- `namespace` - Filter APIKeyRequests by APIProduct/owner namespace

**`GET /api/kuadrant/requests/my`:**

- `apiProductName`, `apiProductNamespace` - Filter by referenced APIProduct; the consumer namespace is derived from the authenticated user

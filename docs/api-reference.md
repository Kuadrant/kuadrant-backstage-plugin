# Backend API Reference

The backend plugin exposes REST API endpoints at `/api/kuadrant/*`. All endpoints require authentication and enforce RBAC permissions.

## APIProduct Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/apiproducts` | List all API Products (filtered by ownership for non-admins) | `kuadrant.apiproduct.list` |
| GET | `/api/kuadrant/apiproducts/:namespace/:name` | Get specific API Product | `kuadrant.apiproduct.read.own` or `.read.all` |
| POST | `/api/kuadrant/apiproducts` | Create new API Product | `kuadrant.apiproduct.create` |
| PATCH | `/api/kuadrant/apiproducts/:namespace/:name` | Update API Product | `kuadrant.apiproduct.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/apiproducts/:namespace/:name` | Delete API Product (cascades to APIKeys) | `kuadrant.apiproduct.delete.own` or `.delete.all` |

## HTTPRoute Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/httproutes` | List HTTPRoutes with `backstage.io/expose: "true"` annotation | `kuadrant.apiproduct.list` |

HTTPRoutes must have the `backstage.io/expose: "true"` annotation to appear in the list. This is set by platform engineers when exposing routes for API publishing.

## PlanPolicy Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/planpolicies` | List all Plan Policies | `kuadrant.planpolicy.list` |
| GET | `/api/kuadrant/planpolicies/:namespace/:name` | Get specific Plan Policy | `kuadrant.planpolicy.read` |

## APIKey Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/requests` | List API Keys (filtered by ownership) | `kuadrant.apikey.read.own` or `.read.all` |
| GET | `/api/kuadrant/requests/my` | List current user's API Keys | `kuadrant.apikey.read.own` |
| POST | `/api/kuadrant/requests` | Create API Key request | `kuadrant.apikey.create` |
| PATCH | `/api/kuadrant/requests/:namespace/:name` | Edit pending request | `kuadrant.apikey.update.own` or `.update.all` |
| DELETE | `/api/kuadrant/requests/:namespace/:name` | Delete/cancel request | `kuadrant.apikey.delete.own` or `.delete.all` |
| POST | `/api/kuadrant/requests/:namespace/:name/approve` | Approve request | `kuadrant.apikey.approve` |
| POST | `/api/kuadrant/requests/:namespace/:name/reject` | Reject request | `kuadrant.apikey.approve` |
| POST | `/api/kuadrant/requests/bulk-approve` | Bulk approve requests | `kuadrant.apikey.approve` |
| POST | `/api/kuadrant/requests/bulk-reject` | Bulk reject requests | `kuadrant.apikey.approve` |

## API Key Secret Endpoints

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/kuadrant/apikeys/:namespace/:name/secret` | Get API key secret (one-time read) | `kuadrant.apikey.read.own` or `.read.all` |

## Query Parameters

**`GET /api/kuadrant/requests`:**
- `status` - Filter by status: `Pending`, `Approved`, `Rejected`
- `namespace` - Filter by Kubernetes namespace

**`GET /api/kuadrant/requests/my`:**
- `namespace` - Filter by Kubernetes namespace

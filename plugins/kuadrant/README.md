# Kuadrant Plugin for Backstage/RHDH

Backstage plugin for Kuadrant - enables developer portals for API access management using Kuadrant Gateway API primitives.

**For installation instructions**, see [docs/installation.md](../../docs/installation.md).

## Features

- **API Access Management**: Request API keys for Kuadrant-protected APIs
- **Access Tiers**: Support for multiple access tiers with different rate limits via PlanPolicy
- **User Identity**: Integrates with Backstage identity API for user-specific API keys
- **Policy Visibility**: View AuthPolicies, RateLimitPolicies, and PlanPolicies
- **API Key Management**: View, create, and delete API keys
- **Approval Workflow**: API owners can approve/reject API access requests
- **APIProduct Integration**: Sync APIProduct custom resources from Kubernetes

## Components

### Pages

- **`KuadrantPage`** - Main page showing API products list and approval queue

### Entity Content

- **`EntityKuadrantApiKeysContent`** - API keys management tab for API entities
- **`EntityKuadrantApiProductInfoContent`** - APIProduct details and plan information tab
- **`EntityKuadrantApiAccessCard`** - Quick API key request card for API entity overview

### Other

- **`ApprovalQueueCard`** - Displays pending API key requests for API owners
- **`CreateAPIProductDialog`** - Dialog for creating new API products

## Usage

### For API Consumers

1. Navigate to an API entity in the catalog
2. Click the "API Keys" tab
3. Click "Request API Access"
4. Select a tier (bronze, silver, gold) and provide use case
5. Wait for approval from the API owner
6. Once approved, your API key will appear in the API Keys tab

### For API Owners

1. Navigate to the Kuadrant page
2. View all API products synced from Kubernetes
3. Create new API products by selecting an HTTPRoute and configuring:
   - Display name and description
   - Approval mode (manual or automatic)
   - Publish status (draft or published)
4. Approve or reject pending API key requests in the approval queue

## Related Documentation

- [Installation Guide](../../docs/installation.md)
- [RBAC Permissions](../../docs/rbac-permissions.md)
- [API Reference](../../docs/api-reference.md)
- [Backend Plugin](../kuadrant-backend/README.md)

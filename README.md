# Kuadrant Backstage Plugin

Backstage plugin for managing Kuadrant API access - enables self-service API key provisioning with plan-based rate limiting.

## Features

- **API Access Management** - Request and manage API keys for catalog APIs
- **Plan-Based Rate Limiting** - Gold/Silver/Bronze tier support via Kuadrant PlanPolicy
- **Kuadrant Resource Visibility** - View AuthPolicies, RateLimitPolicies, PlanPolicies, and API keys
- **Kubernetes Integration** - Automatic cluster access via service account or local kubeconfig

## Quick Start

```bash
# create kind cluster with kuadrant
make kind-create

# start rhdh with plugins
make dev
```

Access RHDH at http://localhost:7008

- Kuadrant plugin: http://localhost:7008/kuadrant
- Toystore API demo: http://localhost:7008/catalog/default/api/toystore-api

## What Gets Installed

- Kubernetes cluster (kind)
- Gateway API v1.2.0
- Istio (gateway implementation)
- Kuadrant Operator v1.3.0-rc2 (with extensions enabled)
- Demo resources: Toystore API with AuthPolicy and PlanPolicy

## Architecture

```
kuadrant-backstage-plugin/
├── kuadrant-backstage/
│   └── plugins/
│       ├── kuadrant/              # frontend plugin (react)
│       └── kuadrant-backend/      # backend plugin (express api)
├── rhdh-local/                    # rhdh runtime (git submodule)
├── rhdh-config-overlay/           # rhdh configuration
├── toystore-demo.yaml             # demo resources
└── Makefile                       # automation
```

## Development Workflow

1. **Make changes** to plugin code in `kuadrant-backstage/plugins/`
2. **Rebuild and deploy**: `make deploy`
3. **View changes** at http://localhost:7008

Plugins support hot reload during development with `yarn start` in the plugin directories.

## Makefile Targets

### Cluster Management
- `make kind-create` - create cluster + install kuadrant + deploy demo
- `make kind-delete` - delete cluster
- `make clean` - stop rhdh + delete cluster

### RHDH Development
- `make dev` - start rhdh with plugins (full dev environment)
- `make deploy` - rebuild plugins + restart rhdh
- `make build` - build plugins only
- `make export` - export plugins as dynamic plugins

### Kuadrant Management
- `make kuadrant-install` - install kuadrant on existing cluster
- `make kuadrant-uninstall` - uninstall kuadrant
- `make demo-install` - install toystore demo resources
- `make demo-uninstall` - uninstall demo resources

### Testing
- `make gateway-forward` - Port-forward to gateway for API testing

## Testing API Access

```bash
# start port-forward
make gateway-forward

# test with alice's gold tier key (100 requests/day)
curl -H 'Host: api.toystore.com' \
     -H 'Authorization: APIKEY secret-alice-key' \
     http://localhost:8080/

# test with bob's silver tier key (50 requests/day)
curl -H 'Host: api.toystore.com' \
     -H 'Authorization: APIKEY secret-bob-key' \
     http://localhost:8080/
```

## Plugin Capabilities

### API Access Card
- Displays available plan tiers (Gold/Silver/Bronze)
- Shows rate limits per tier
- Request API key button
- Integrated on API entity pages

### API Key Management Tab
- View user's API keys
- Show/hide key values
- Delete keys
- Displays plan tier and creation date

### Kuadrant Resources Page
- List all Kuadrant policies
- View AuthPolicies, RateLimitPolicies, PlanPolicies
- Filter by namespace
- Detailed resource view

## Configuration

### RHDH Setup
Configuration managed via `rhdh-config-overlay/`:
- `app-config.local.yaml` - RHDH app config overrides
- `.env` - Environment variables (kubeconfig path)
- `kubeconfig.yaml` - Auto-generated Kubernetes credentials
- `toystore.yaml` - Catalog entities

### Kubernetes Access
- **Local dev**: Uses kubeconfig in `configs/extra-files/.kube/config`
- **OpenShift**: Uses in-cluster service account automatically
- **RBAC**: Requires read/write on Kuadrant CRDs and Secrets

## Prerequisites

- Node.js 20 or 22 (not 24 - isolated-vm build issues)
- Yarn
- Docker/OrbStack
- kubectl
- Helm
- kind

## Known Limitations

- **Node 24**: Not supported due to isolated-vm compatibility
- **PlanPolicy Status**: Controller creates RateLimitPolicy but may show enforcement errors until all operators are ready

## Troubleshooting

Common issues:
- **401 errors**: Check kubeconfig path in RHDH logs
- **Stale token**: Regenerate with `make rhdh-kubeconfig`
- **Plugins not loading**: Check `docker logs rhdh`

## References

- [Kuadrant Documentation](https://docs.kuadrant.io)
- [RHDH-Local](https://github.com/redhat-developer/rhdh-local)
- [Backstage Documentation](https://backstage.io/docs)
- [Gateway API](https://gateway-api.sigs.k8s.io/)

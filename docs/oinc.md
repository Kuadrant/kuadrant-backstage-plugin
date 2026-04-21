# oinc Development Environment

[oinc](https://github.com/jasonmadigan/oinc) (OpenShift in a Container) provides a lightweight OpenShift-compatible cluster for testing the Kuadrant plugins with RHDH dynamic plugins.

This is an alternative to `kuadrant-dev-setup/` (kind cluster + `yarn dev`), not something you run alongside it. Use `kuadrant-dev-setup/` when you're developing plugins and want hot reload. Use oinc when you want to test with stock RHDH and dynamic plugins.

## Prerequisites

- [oinc](https://github.com/jasonmadigan/oinc)
- kubectl
- helm
- npm
- Docker or Podman

Recommended 8GB+ RAM. The full stack (Istio, Kuadrant, RHDH, PostgreSQL) is heavy.

## Usage

```bash
# full setup: cluster + RHDH
yarn oinc

# cluster only: kuadrant, gateway api, istio, metallb, console, demo resources
yarn oinc:cluster

# RHDH only: install on existing cluster from oinc:cluster
yarn oinc:rhdh

# teardown
yarn oinc:teardown
```

## Modes

### Cluster only (`yarn oinc:cluster`)

Creates an oinc cluster with the full Kuadrant infrastructure stack. Gets you to the **starting point** of the [installation guide](installation.md) -- a cluster with all prerequisites installed, ready for RHDH.

The `oinc create --addons kuadrant` command handles the bulk of the work: Gateway API CRDs, cert-manager, MetalLB, Istio (Sail Operator), Kuadrant Operator, OLM, and the OpenShift Console.

Our setup script then adds:
- MetalLB IP address pool (auto-detected from the container bridge network)
- Gateway resource (`kuadrant-ingressgateway` in `gateway-system`)
- Demo resources from `kuadrant-dev-setup/demo/`

After setup, the OpenShift Console is available at http://localhost:9000.

### RHDH (`yarn oinc:rhdh`)

Installs RHDH on an existing cluster from `oinc:cluster`. Gets you to the **end state** of the [installation guide](installation.md) -- RHDH running with Kuadrant dynamic plugins configured.

Configures: RHDH service account, RBAC policies, dynamic plugins (frontend + backend + RBAC management UI), guest auth, extensions installation UI.

After setup:
```bash
kubectl port-forward svc/rhdh-developer-hub 7007:7007 -n rhdh
# http://localhost:7007/kuadrant
```

## What oinc provides vs what we add

oinc gives you MicroShift in a container with OLM, OpenShift Console (port 9000), and a ConsolePlugin CRD out of the box. The `--addons kuadrant` flag installs the full Kuadrant stack and all its dependencies via topological dependency resolution.

Our setup scripts add:

**`setup-cluster.sh` adds:**

| Component | Notes |
|-|-|
| MetalLB IP pool | Auto-detected from container bridge subnet (.200-.220 range) |
| Gateway resource | `kuadrant-ingressgateway` in `gateway-system`, istio gatewayClass |
| Demo resources | APIProducts, PlanPolicies from `kuadrant-dev-setup/demo/` |

**`setup-rhdh.sh` adds:**

| Component | Source | Notes |
|-|-|-|
| RHDH (Helm chart) | `rhdh/backstage` | Stock RHDH image with dynamic plugins |
| Kuadrant plugins | npm packages | Frontend + backend, integrity hashes fetched at setup time |
| RBAC management UI | Bundled in RHDH image | `backstage-community-plugin-rbac`, just enabled |
| RHDH service account | `oinc/manifests/rhdh-sa.yaml` | ClusterRole for Kuadrant CRDs |
| Guest auth + RBAC | ConfigMaps | Guest user gets `api-admin` role for local dev |
| Extensions UI | app-config + seed file | Enables the plugin management UI in RHDH |

## File structure

```
oinc/
  setup.sh              # entry point, dispatches to modes
  setup-cluster.sh      # oinc create + post-setup (MetalLB pool, Gateway, demos)
  setup-rhdh.sh         # RHDH installation
  teardown.sh           # deletes the oinc cluster
  lib.sh                # shared helpers
  manifests/
    rhdh-sa.yaml        # RHDH service account + RBAC
```

## Differences from `yarn dev`

| | `yarn dev` (kind) | `yarn oinc` (oinc) |
|-|-|-|
| Plugins | Static (built into app) | Dynamic (npm packages) |
| Hot reload | Yes | No (uses published packages) |
| RHDH image | N/A (standalone Backstage) | Stock RHDH |
| Use case | Plugin development | Integration testing, installation guide validation |

## Running e2e tests against oinc

With RHDH running and port-forwarded:

```bash
kubectl port-forward svc/rhdh-developer-hub 7007:7007 -n rhdh
```

Run the e2e tests with `BASE_URL` pointed at port 7007 (the default is 3000 for `yarn dev`):

```bash
cd e2e-tests
BASE_URL=http://localhost:7007 yarn test
```

## Troubleshooting

Check pod status:
```bash
kubectl -n rhdh get pods
kubectl -n rhdh logs deployment/rhdh-developer-hub
```

Init container logs (plugin installation):
```bash
kubectl -n rhdh logs deployment/rhdh-developer-hub -c install-dynamic-plugins
```

If RHDH is stuck in init, it's usually downloading plugins. The init container fetches all default RHDH plugins plus the Kuadrant ones from npm.

Cluster status:
```bash
oinc status          # endpoints and addon status
oinc status --watch  # live dashboard
```

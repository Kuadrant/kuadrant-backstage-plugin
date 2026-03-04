# MINC Development Environment

MINC (MicroShift in Container) provides a lightweight OpenShift-compatible cluster for testing the Kuadrant plugins with RHDH dynamic plugins.

This is an alternative to `kuadrant-dev-setup/` (kind cluster + `yarn dev`), not something you run alongside it. Use `kuadrant-dev-setup/` when you're developing plugins and want hot reload. Use MINC when you want to test with "real" RHDH and dynamic plugins.

## Prerequisites

- [minc](https://github.com/minc-org/minc)
- kubectl
- helm
- npm
- Docker or Podman

Recommended 8GB+ RAM. The full stack (Istio, Kuadrant, RHDH, PostgreSQL) is heavy.

## Usage

```bash
# full setup: cluster + RHDH
yarn minc

# cluster only: kuadrant, gateway api, istio, metallb, console, demo resources
yarn minc:cluster

# RHDH only: install on existing cluster from minc:cluster
yarn minc:rhdh

# teardown
yarn minc:teardown
```

## Modes

### Cluster only (`yarn minc:cluster`)

Creates a MINC cluster with the full Kuadrant infrastructure stack. Gets you to the **starting point** of the [installation guide](installation.md) — a cluster with all prerequisites installed, ready for RHDH.

Installs: Gateway API CRDs, cert-manager, MetalLB, Istio (Sail Operator), Kuadrant Operator, OpenShift Console, and the demo resources from `kuadrant-dev-setup/demo/`.

After setup, the OpenShift Console is available at http://localhost:9000 (runs as a host container, no port-forward needed).

### RHDH (`yarn minc:rhdh`)

Installs RHDH on an existing cluster from `minc:cluster`. Gets you to the **end state** of the [installation guide](installation.md) — RHDH running with Kuadrant dynamic plugins configured.

Configures: RHDH service account, RBAC policies, dynamic plugins (frontend + backend + RBAC management UI), guest auth, extensions installation UI.

After setup:
```bash
kubectl port-forward svc/rhdh-developer-hub 7007:7007 -n rhdh
# http://localhost:7007/kuadrant
```

## What MINC provides vs what we add

[MINC](https://github.com/minc-org/minc) gives you MicroShift (a single-node OpenShift derivative) in a container. Out of the box that includes the Kubernetes API, CRI-O, built-in storage, and some OpenShift APIs (SecurityContextConstraints, Routes). It does not include OLM, the OpenShift Console, or any operators.

Our setup scripts layer everything else on top:

**`setup-cluster.sh` adds:**

| Component | Version | Why |
|-|-|-|
| Gateway API CRDs | v1.2.1 | Required by Kuadrant and Istio |
| cert-manager | v1.15.3 | TLS certificate management for Istio/Kuadrant |
| MetalLB | v0.13.7 | LoadBalancer support (MicroShift has none) |
| Istio (Sail Operator) | 1.27.1 | Service mesh, required by Kuadrant |
| Kuadrant Operator | latest | The thing we're testing |
| OpenShift Console | latest | Cluster visibility, runs as host container (amd64 image, no arm64 build). Adapted from [kuadrant-console-plugin](https://github.com/Kuadrant/kuadrant-console-plugin) |
| Demo resources | -- | APIProducts, PlanPolicies from `kuadrant-dev-setup/demo/` |

The OrbStack fix (`setup-cluster.sh` line ~47) patches CRI-O's storage config when running under OrbStack on macOS, which mounts `/host-container` as read-only and breaks image stores.

MetalLB needs SCC patches because MicroShift's default SecurityContextConstraints block the speaker/controller pods.

**`setup-rhdh.sh` adds:**

| Component | Source | Notes |
|-|-|-|
| RHDH (Helm chart) | `rhdh/backstage` | Stock RHDH image with dynamic plugins |
| Kuadrant plugins | npm packages | Frontend + backend, integrity hashes fetched at setup time |
| RBAC management UI | Bundled in RHDH image | `backstage-community-plugin-rbac`, just enabled |
| RHDH service account | `minc/manifests/rhdh-sa.yaml` | ClusterRole for Kuadrant CRDs |
| Guest auth + RBAC | ConfigMaps | Guest user gets `api-admin` role for local dev |
| Extensions UI | app-config + seed file | Enables the plugin management UI in RHDH |

## File structure

```
minc/
  setup.sh              # entry point, dispatches to modes
  setup-cluster.sh      # cluster infrastructure
  setup-rhdh.sh         # RHDH installation
  teardown.sh           # deletes the MINC cluster
  lib.sh                # shared helpers
  manifests/
    console.yaml        # OpenShift Console SA + RBAC
    rhdh-sa.yaml        # RHDH service account + RBAC
```

## Differences from `yarn dev`

| | `yarn dev` (kind) | `yarn minc` (MINC) |
|-|-|-|
| Plugins | Static (built into app) | Dynamic (npm packages) |
| Hot reload | Yes | No (uses published packages) |
| RHDH image | N/A (standalone Backstage) | Stock RHDH |
| Use case | Plugin development | Integration testing, installation guide validation |

## Running e2e tests against MINC

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

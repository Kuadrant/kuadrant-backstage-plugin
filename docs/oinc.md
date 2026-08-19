# oinc Development Environment

[oinc](https://github.com/jasonmadigan/oinc) (OpenShift in a Container) provides a lightweight OpenShift-compatible cluster for the Kuadrant plugins. Local yarn-dev has no OpenShift cluster of its own; oinc fills that gap.

Same three loops as the [root README](../README.md#quick-start):

| | Commands | URL | Auth | For |
|---|---|---|---|---|
| **1. kind + host app** | `make -C kuadrant-dev-setup kind-create` then `yarn dev:kind` | http://localhost:3000 | OIDC (Dex :5556) | In-tree plugins, hot reload. Lighter Kubernetes. |
| **2. oinc + host app** | `yarn oinc:cluster` then `yarn dev:oinc` | http://localhost:3000 | OIDC (Dex :5556) | Same in-tree app and Dex; OpenShift-compatible cluster. Console: http://localhost:9000 |
| **3. oinc + published dynamic plugins** | `yarn oinc` **or** `yarn oinc:cluster` then `yarn oinc:rhdh` | http://localhost:7007 | Guest | npm-published Scalprum / dynamic-plugin artifacts RHDH loads. No hot reload. |

**:3000 is yarn-dev. :7007 is in-cluster Helm RHDH.** Do not port-forward 7007 while the host app is running — both bind 7007. `yarn dev:oinc` refuses to start if it sees that port-forward. `yarn dev` is unguarded. Do not run kind and oinc at the same time; both write `K8S_URL` / `K8S_CLUSTER_TOKEN` in `.env`.

## Prerequisites

- [oinc](https://github.com/jasonmadigan/oinc) v0.4.3 or later (same pin as [kuadrant-console-plugin](https://github.com/Kuadrant/kuadrant-console-plugin) CI; `--metallb-address-pool auto` is the MetalLB path)
- kubectl
- helm
- npm
- Docker or Podman

Recommended 8GB+ RAM. The cluster stack (Istio, Kuadrant) is heavy; in-cluster RHDH adds PostgreSQL on top.

## Usage

```bash
# loop 2 — OpenShift-compatible cluster + demos + .env, then host app (Dex :3000)
yarn oinc:cluster
yarn dev:oinc

# loop 3 — cluster + in-cluster RHDH with published npm dynamic plugins (Guest :7007)
yarn oinc

# loop 3 — in-cluster RHDH on an existing oinc cluster
yarn oinc:rhdh

yarn oinc:teardown
```

## Modes

### Cluster only (`yarn oinc:cluster`) — loop 2

Creates an oinc cluster with the full Kuadrant infrastructure stack. That is enough for local `yarn dev:oinc`, and it is also the **starting point** of loop 3 / the [installation guide](installation.md) if you later install RHDH in-cluster.

Cluster create matches [kuadrant-console-plugin](https://github.com/Kuadrant/kuadrant-console-plugin) `scripts/cluster-setup.sh` (minus `--console-plugin`, which is that repo's OpenShift Console wiring):

```bash
oinc create --version 4.22 \
  --addons gateway-api,cert-manager,metallb,istio,kuadrant@latest,mcp-gateway \
  --metallb-address-pool auto
# then kubectl patch developerPortal; apply a class-less Gateway
```

That covers Gateway API CRDs, cert-manager, MetalLB (`oinc-pool` + `oinc-l2`), Istio (Sail Operator), Kuadrant Operator, MCP Gateway operator, OLM, and the OpenShift Console. Override with `OCP_VERSION` / `KUADRANT_VERSION`. Do not pass `--gateway-api-gateway`: it stamps `loadBalancerClass: oinc.io/metallb`, which unscoped MetalLB ignores, so the Gateway never gets an IP. Developer portal is the same merge-patch as console-plugin, not `--kuadrant-devportal`. Older oinc CLIs without `--metallb-address-pool` fall back to a kubectl pool in `setup-cluster.sh`.

Our setup script then adds:
- Demo resources from `kuadrant-dev-setup/demo/`
- MCP demo (`oinc/manifests/mcp-demo.yaml`): test server + `MCPServerRegistration` in `toystore`
- The host-side `rhdh` ServiceAccount (same manifest as kind: `kuadrant-dev-setup/rbac/rhdh-rbac.yaml`)
- `K8S_URL` and `K8S_CLUSTER_TOKEN` in `.env`, so the host app can talk to the cluster

After setup:
- OpenShift Console: http://localhost:9000
- Host app: `yarn dev:oinc` → http://localhost:3000/kuadrant
- Sign in with **OIDC** (Dex on http://localhost:5556), not Guest. Same personas as kind + `yarn dev:kind`; password is the email local-part (`admin` / `owner1` / `consumer1` / …).

Do not port-forward in-cluster RHDH to `localhost:7007` while the host app is running. Both bind 7007. `yarn dev:oinc` will refuse to start if it sees that port-forward. Guest-only sign-in on :7007 is loop 3 (Helm RHDH), not hot-reload Backstage.

`OCP_VERSION` overrides the pinned OpenShift version (default 4.22). `KUADRANT_VERSION` pins the Kuadrant operator (default `latest`):

```bash
OCP_VERSION=4.21 KUADRANT_VERSION=1.4.4 yarn oinc:cluster
```

### Published dynamic plugins in RHDH (`yarn oinc:rhdh`)

Installs stock RHDH (Helm) on an existing cluster from `oinc:cluster`. This is **loop 3**: the [dynamic plugins](ci.md) RHDH actually loads at runtime, not in-tree yarn-dev source.

`oinc/setup-rhdh.sh` does **not** run `yarn export-dynamic` or bake local `dist-scalprum` / `dist-dynamic` into the cluster. It Helm-installs the RHDH image and lists the **published npm packages**, with integrity hashes from `npm view` (latest on the registry; comments in the script assume published **0.4.0**):

- `@kuadrant/kuadrant-backstage-plugin-frontend` (includes `dist-scalprum` for [Scalprum](https://github.com/scalprum/scaffolding))
- `@kuadrant/kuadrant-backstage-plugin-backend-dynamic`

The init container (`install-dynamic-plugins`) downloads those packages. Helm `pluginConfig` keys (routes, mount points, Scalprum name) must match the published package — yarn-dev never exercises that. Plugin source still has `export-dynamic` scripts; CI / `publish.yml` use them to produce the npm artifacts. There is no `make dynamic-up` on this branch.

Also configures: RHDH service account, RBAC policies, RBAC management UI, guest auth, extensions installation UI. End state matches the [installation guide](installation.md).

After setup:
```bash
kubectl port-forward svc/rhdh-developer-hub 7007:7007 -n rhdh
# http://localhost:7007/kuadrant  (Guest auth; stop this before yarn dev:oinc)
```

This port-forward occupies the same backend port as `yarn dev` / `yarn dev:oinc`. Use it only for loop 3, not the hot-reload loop.

## What oinc provides vs what we add

oinc gives you MicroShift in a container with OLM, OpenShift Console (port 9000), and a ConsolePlugin CRD out of the box. `--addons gateway-api,cert-manager,metallb,istio,kuadrant@latest,mcp-gateway` is the same Kuadrant/GWAPI list as kuadrant-console-plugin (kuadrant already pulls those deps; listing them keeps the stack explicit), plus MCP Gateway. `--metallb-address-pool auto` creates `oinc-pool` / `oinc-l2`; a class-less `kuadrant-ingressgateway` then gets an IP from that pool. Developer portal is enabled with the same kubectl merge-patch as console-plugin.

Our setup scripts add:

**`setup-cluster.sh` adds:**

| Component | Notes |
|-|-|
| Demo resources | APIProducts, PlanPolicies from `kuadrant-dev-setup/demo/` |
| MCP demo | `oinc/manifests/mcp-demo.yaml` (test server + MCPServerRegistration in toystore) |
| Host-side RHDH SA | `kuadrant-dev-setup/rbac/rhdh-rbac.yaml` (`rhdh` in `default`) plus `.env` |

**`setup-rhdh.sh` adds:**

| Component | Source | Notes |
|-|-|-|
| RHDH (Helm chart) | `rhdh/backstage` | Stock RHDH image with dynamic plugins |
| Kuadrant plugins | npm packages | Frontend + backend, integrity hashes fetched at setup time |
| RBAC management UI | Bundled in RHDH image | `backstage-community-plugin-rbac`, just enabled |
| RHDH service account | `oinc/manifests/rhdh-sa.yaml` | In-cluster SA `rhdh-kuadrant` in `rhdh`; ClusterRole/Binding names are `rhdh-kuadrant-reader-oinc` so they do not replace the host-side yarn-dev RBAC |
| Guest auth + RBAC | ConfigMaps | Guest user gets `api-admin` role for local dev |
| Extensions UI | app-config + seed file | Enables the plugin management UI in RHDH |

## File structure

```
oinc/
  setup.sh              # entry point, dispatches to modes
  setup-cluster.sh      # oinc create (Kuadrant/GWAPI stack + mcp-gateway) + demos, host SA + .env
  setup-rhdh.sh         # in-cluster RHDH installation
  teardown.sh           # deletes the oinc cluster
  lib.sh                # shared helpers
  manifests/
    rhdh-sa.yaml        # in-cluster RHDH SA + rhdh-kuadrant-reader-oinc RBAC
    mcp-demo.yaml       # toystore MCP test server + MCPServerRegistration
```

## Why loop 3 exists

Yarn-dev (loops 1–2) imports the plugins in-tree with hot reload. It never loads the Scalprum remotes, Helm `pluginConfig`, or the RHDH image. Loop 3 is how you check the **published** dynamic-plugin packages against real RHDH.

## Running e2e tests against oinc

Loop 3, with RHDH running and port-forwarded:

```bash
kubectl port-forward svc/rhdh-developer-hub 7007:7007 -n rhdh
```

Run the e2e tests with `BASE_URL` pointed at port 7007 (the default is 3000 for `yarn dev:oinc` / `yarn dev:kind`):

```bash
cd e2e-tests
BASE_URL=http://localhost:7007 yarn test
```

## Troubleshooting

**Signed in as Guest / no Dex:** you are on loop 3 (`localhost:7007`), not the host app. Stop `kubectl port-forward … 7007:7007`, run `yarn dev:oinc` from the repo root, and open http://localhost:3000. Choose **OIDC** and sign in as `admin@kuadrant.local` / `admin` (or the other Dex personas). Dex itself is http://localhost:5556.

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

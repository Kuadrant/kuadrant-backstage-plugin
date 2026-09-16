# oinc Development Environment

[oinc](https://github.com/jasonmadigan/oinc) provides a lightweight
OpenShift-compatible cluster for testing the Kuadrant plugins in Red Hat Developer Hub
(RHDH). For hot reload, run `yarn dev:oinc` against an oinc cluster or
`yarn dev:kind` against kind. For dynamic-plugin loading, use in-cluster RHDH.

## Prerequisites

- [oinc](https://github.com/jasonmadigan/oinc) v0.5.3 or later
- kubectl
- Helm (CI uses 4.3.0)
- npm
- Docker or Podman (`make dynamic-up` specifically uses Docker)

Allow at least 8 GB of RAM for MicroShift, Istio, Kuadrant, RHDH, and PostgreSQL.

## Usage

```bash
yarn oinc           # cluster, Dex, and RHDH with published plugins
yarn oinc:cluster   # cluster, demos, and host-app credentials in .env
yarn dev:oinc       # host app with hot reload on :3000
yarn oinc:rhdh      # Dex and RHDH on an existing oinc cluster
yarn oinc:teardown
```

RHDH is exposed at `http://rhdh.localhost:9080/kuadrant`; the OpenShift Console is
available at `http://localhost:9000`.

## Cluster setup

`oinc/setup-cluster.sh` runs:

```bash
oinc create --version 4.22 \
  --addons gateway-api,cert-manager,metallb,istio,kuadrant@latest,mcp-gateway \
  --metallb-address-pool auto --gateway-api-gateway
```

oinc configures its default and MCP Gateways for the scoped `oinc.io/metallb`
controller and reuses Kuadrant's managed MCP Gateway controller. The script then
enables the developer portal, applies the API demo overlay with the same Service
class and the MCP demo, and configures the host service account and `.env`.
Both the host-app and dynamic-plugin CI paths use this cluster setup.
Use `OCP_VERSION` and `KUADRANT_VERSION` to override the defaults.

When upgrading an existing disposable cluster from oinc v0.4.3, recreate it after
saving anything you need. Gateway Service classes cannot be changed in place. See
[oinc's migration instructions](https://github.com/jasonmadigan/oinc/blob/v0.5.3/docs/addons.md#migration-from-v043)
to retain an existing cluster.

Do not run kind and oinc together: both write host credentials to `.env`.
The host app uses Dex on :5556; in-cluster RHDH uses Dex on :9080.

## RHDH setup

`oinc/setup-rhdh.sh` installs Dex first, then installs RHDH through the oinc `rhdh`
addon. Its values overlay configures:

- the Kuadrant frontend and backend dynamic plugins;
- frontend routes, menu items, entity tabs, and cards;
- the Kubernetes service-account connection;
- the catalog users and RBAC policy;
- Dex OIDC sign-in; and
- the extensions installation UI.

The default `PLUGIN_SOURCE=npm` loads the published Kuadrant packages and resolves their
integrity hashes. The dynamic test path uses `PLUGIN_SOURCE=baked`; it builds the current
branch's exported plugins into a derived RHDH image and sideloads that image with
`oinc load-image`.

The RHDH chart defaults to 6.2.2 and the image line to
`quay.io/rhdh-community/rhdh:next-1.10`. `RHDH_BASE_IMAGE`, `RHDH_CHART_VERSION`, `RHDH_IMAGE_REPOSITORY`, and
`RHDH_IMAGE_TAG` are overridable.

## Authentication

Both `yarn dev` and the oinc RHDH path use Dex v2.45.1 and the same five personas:

| User                       | Role           |
| -------------------------- | -------------- |
| `admin@kuadrant.local`     | `api-admin`    |
| `owner1@kuadrant.local`    | `api-owner`    |
| `owner2@kuadrant.local`    | `api-owner`    |
| `consumer1@kuadrant.local` | `api-consumer` |
| `consumer2@kuadrant.local` | `api-consumer` |

Passwords match the username local part. Dex users and clients live in
`kuadrant-dev-setup/dex/config.yaml`; Backstage users and group membership live in
`catalog-entities/kuadrant-users.yaml`; `rbac-policy.csv` maps those groups to roles.

The oinc issuer is `http://dex.localhost:9080`. On the host, `.localhost` reaches the
oinc ingress. In a pod, Kubernetes expands `dex.localhost` to the `dex` Service in the
`localhost` Namespace. Using one resolvable name matters because the token issuer cannot
differ between browser and backend.

On Linux hosts that do not synthesize `.localhost`, add explicit IPv4 entries:

```bash
echo "127.0.0.1 rhdh.localhost" | sudo tee -a /etc/hosts
echo "127.0.0.1 dex.localhost" | sudo tee -a /etc/hosts
```

## Kubernetes RBAC

The canonical ClusterRole is
`kuadrant-dev-setup/rbac/rhdh-cluster-role.yaml`. The kind and oinc manifests contain
only their environment-specific service accounts and bindings, so permission changes
cannot drift between the two paths.

## Testing the current branch dynamically

Use the root Make targets rather than the published-package `yarn oinc` path:

```bash
make dynamic-up
make e2e-deps
make e2e-specs
make teardown
```

`make e2e-dynamic` performs the same phases as a one-shot run. See
[E2E Testing](e2e-testing.md#running-against-rhdh-dynamic-plugins).

## Troubleshooting

```bash
oinc status --watch
kubectl -n rhdh get pods
kubectl -n rhdh logs deployment/rhdh-developer-hub
kubectl -n rhdh logs deployment/rhdh-developer-hub -c install-dynamic-plugins
kubectl -n localhost logs deployment/dex
```

The RHDH init container downloads or copies dynamic plugins before the backend starts,
so a fresh install can remain in init for several minutes.

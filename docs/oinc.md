# oinc Development Environment

[oinc](https://github.com/jasonmadigan/oinc) provides a lightweight
OpenShift-compatible cluster for testing the Kuadrant plugins in Red Hat Developer Hub
(RHDH). Use the kind + `yarn dev` path for hot reload; use oinc to exercise RHDH's
dynamic-plugin loading.

## Prerequisites

- oinc v0.3.1
- kubectl
- Helm
- npm
- Docker or Podman (`make dynamic-up` specifically uses Docker)

Allow at least 8 GB of RAM for MicroShift, Istio, Kuadrant, RHDH, and PostgreSQL.

## Usage

```bash
yarn oinc           # cluster, Dex, and RHDH with published plugins
yarn oinc:cluster   # cluster and demo resources only
yarn oinc:rhdh      # Dex and RHDH on an existing oinc cluster
yarn oinc:teardown
```

RHDH is exposed at `http://rhdh.localhost:9080/kuadrant`; the OpenShift Console is
available at `http://localhost:9000`.

## Cluster setup

`oinc/setup-cluster.sh` runs:

```bash
oinc create --version 4.21 --addons kuadrant@1.5.1 \
  --kuadrant-devportal \
  --metallb-address-pool auto \
  --gateway-api-gateway
```

oinc installs Gateway API, cert-manager, MetalLB, Istio, Kuadrant, OLM, and the
OpenShift Console. The options enable the developer portal and create the address pool
and default gateway. The repository script then applies the demo resources used by the
catalog and tests. oinc also merges the cluster kubeconfig during `create`.

`OCP_VERSION` and `KUADRANT_VERSION` override the pinned defaults:

```bash
OCP_VERSION=4.21 KUADRANT_VERSION=1.5.1 yarn oinc:cluster
```

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
`quay.io/rhdh-community/rhdh:1.10`. `RHDH_CHART_VERSION`, `RHDH_IMAGE_REPOSITORY`, and
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

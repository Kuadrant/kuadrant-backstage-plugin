# Kuadrant Plugin Installation Guide

This guide covers installing the Kuadrant plugins into an existing Red Hat Developer Hub (RHDH) or Backstage instance.

**For plugin development**, see the [main README](../README.md).

## Packages

| Plugin   | Package                                                                                                                                   | Type     |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------|----------|
| Frontend | [@kuadrant/kuadrant-backstage-plugin-frontend](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-frontend)               | Frontend |
| Backend  | [@kuadrant/kuadrant-backstage-plugin-backend-dynamic](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-backend-dynamic) | Backend  |

### Why Two Packages?

We publish only two packages that work for **both dynamic (RHDH) and static (Backstage) deployments**:

- **Frontend plugin**: Published directly from `plugins/kuadrant`. Frontend plugins are bundled by the app's webpack at build time, so the dynamic plugin system simply needs the source to be available. The `dist-scalprum/` assets for dynamic loading are included alongside the standard build output in the same package.

- **Backend plugin**: Published from `plugins/kuadrant-backend/dist-dynamic` (not the root). Backend plugins run in Node.js and are loaded at runtime, not bundled by webpack. For dynamic loading to work, the backend code must be pre-bundled as a self-contained module with all dependencies embedded. The `@janus-idp/cli export-dynamic` command generates this in `dist-dynamic/` with its own `package.json`. This is a separate package because the dependency structure differs from the source plugin.

In short: frontend plugins are bundled by the consuming app (so source is fine), while backend plugins must be pre-bundled for runtime loading (so we publish the generated `dist-dynamic` output).

## Prerequisites

### Kubernetes Cluster with Kuadrant

The plugins require a Kubernetes cluster with Kuadrant installed. You can either:

1. **Use an existing cluster** with:
   - [Kuadrant operator 1.4+](https://docs.kuadrant.io/latest/getting-started/) installed

2. **Use the development setup** (recommended for testing):
   ```bash
   cd kuadrant-dev-setup
   make kind-create
   ```
   This creates a kind cluster with:
   - Kuadrant operator
   - Gateway API CRDs v1.2.0
   - Istio service mesh
   - APIProduct and APIKey CRDs
   - Demo resources (toystore)
   - RHDH service account with proper RBAC

## Installation on Red Hat Developer Hub (RHDH)

This section covers installing the Kuadrant plugins on a Red Hat Developer Hub deployment in a Kubernetes/Openshift cluster.

### Prerequisites

* Red Hat Developer Hub

The Kuadrant plugins are tested and supported on **Red Hat Developer Hub 1.6** (based on Backstage 1.45.3).

**Installation guide:**
- [Installing Red Hat Developer Hub](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/)

Choose your preferred deployment method:
- Operator-based deployment (recommended for production)
- Helm-based deployment

### Provisioning your custom Developer Hub configuration

Set the following environment variables used for convenience in this tutorial:

```sh
# Your backstage instance namespace. Choose your own.
export RHDH_NS=rhdh
export KUADRANT_PLUGIN_VERSION=v0.1.0
export KUADRANT_BACKSTAGE_PLUGIN_BACKEND_DYNAMIC_SHA256=$(npm view @kuadrant/kuadrant-backstage-plugin-backend-dynamic@$KUADRANT_PLUGIN_VERSION dist.integrity)
export KUADRANT_BACKSTAGE_PLUGIN_FRONTEND_SHA256=$(npm view @kuadrant/kuadrant-backstage-plugin-frontend@$KUADRANT_PLUGIN_VERSION dist.integrity)
# base hostname of the cluster.
# In openshift, this can be easily read with the following command
#  oc get ingress.config.openshift.io cluster -o jsonpath='{.spec.domain}'
export CLUSTER_HOSTNAME=apps.example.com
```

#### Backstage Namespace

Create namespace for the backstage instance

```sh
kubectl create namespace $RHDH_NS
```

#### Dynamic Plugin configmap

Create a config map with the dynamic plugin configuration required to load kuadrant backstage plugins as dynamic plugins.

Copy [Kuadrant backstage dynamic plugins metadata](#dynamic-plugins) into a file named, for example , `dynamic-plugins-rhdh.yaml`. Then, create `dynamnic-plugins-rhdh` configmap from that file.


```sh
kubectl create configmap dynamnic-plugins-rhdh --from-file=dynamnic-plugins-rhdh.yamnl --namespace=$RHDH_NS
```

#### Backstage app-config.yaml

This is the main backstage application level configuration.

1. **Enable authentication and the permission framework**

Kuadrant backstage plugin requires that the permissions framework is setup and configured properly.

Set the `permissions.enabled` to true in `app-config.yaml`

```yaml
permission:
  enabled: true
```

Additionally, setup some [authentication in backstage](https://backstage.io/docs/auth/).

```yaml
auth:
  providers: {}
```

2. **Setup RBAC for the kuadrant plugin functionality**

This configuration will define kuadrant plugin user roles and permissions on those roles. Basically, who can do what withing the plugin.
The kuadrant backstage plugin permission model is detailed in [RBAC and Permissions doc](/docs/rbac-permissions.md).

Create `rbac-policy.csv` file with the kuadrant's plugin permission definition.
You can start with [this RBAC policy content sample](#rbac-policy) that includes three roles `[api-consumer, api-owner, api-admin]`. Then, create `rbac-policies` configmap from that file.

```sh
kubectl create configmap rbac-policies --from-file=rbac-policy.csv --namespace=$RHDH_NS
```

Add reference to `rbac-policy.csv` file in the `permissions.rbac.policies-csv-file` section of the `app-config.yaml`

```yaml
permission:
  rbac:
    policies-csv-file: /opt/app-root/etc/rbac-policy.csv
    policyFileReload: true
```
> The mounting path is configured later in the Backstage CR.

* **Configure kubernetes access**

Kubernetes access is configures in `app-config.yaml`.

The recommended approach is so called `in-cluster` mode. In this mode, the backstage application running inside a Kubernetes pod authenticates to the Kubernetes API server using the service account automatically provided by Kubernetes.

The `in-cluster` mode can be configured in two ways:

1. No `kubernetes` section in `app-config.yaml`
```yaml
kubernetes: null
```
2. When `serviceAccountToken` is being ommited.
```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: local-cluster
          url: ignored
          authProvider: serviceAccount
```

The kuadrant backstage plugin also supports the cluster locator method [config](https://backstage.io/docs/features/kubernetes/configuration#config). With this method, the kuadrant plugin will read cluster information, tipically cluster URL and cluster access token (which usually expires), from the `app-config.yaml` file.

```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: remote-cluster
          url: https://example.com
          authProvider: serviceAccount
          serviceAccountToken: ${K8S_ACCESS_TOKEN}
```

* **Configure Catalog Rules**

Add `APIProduct` to `catalog.rules`  in `app-config.yaml`:

```yaml
catalog:
  rules:
    - allow: [Component, System, API, APIProduct, Resource, Location]
```

Follow the steps in [Provisioning your custom Red Hat Developer Hub configuration](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/html/installing_red_hat_developer_hub_on_openshift_container_platform/assembly-install-rhdh-ocp-operator) for the full procedure.

<details><summary>A full example for "app-config.yaml"</summary>

```yaml
app:
  title: Red Hat Developer Hub
  baseUrl: https://frontend.$CLUSTER_HOSTNAME

# Testing only: enables guest access for rhdh-local.
# In production, configure your own identity provider and map roles/permissions to your users or groups.
auth:
  environment: development
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true
      userEntityRef: user:default/guest

kubernetes: null

catalog:
  rules:
    - allow: [Component, API, APIProduct, Location, Template, Domain, User, Group, System, Resource, Plugin, Package]

permission:
  enabled: true
  rbac:
    policies-csv-file: /opt/app-root/etc/rbac-policy.csv
    policyFileReload: true
```

</details>

Finally, create a config map from the `app-config.yaml` file.

```sh
kubectl create configmap rhdh-app-config --from-file=app-config.yamnl --namespace=$RHDH_NS
```

### RBAC for Kuadrant CRDs

This step grants permissions to the backstage application to manage kuadrant CRD's existing in the cluster. It consist on two steps: creating the clusterRole and then the ClusterRoleBinding.

First, create the [ClusterRole](#clusterrole) which defines permissions on the kuadrant CRD's.

By default, backstage application will run with the `default` service account of the namespace.
Thus, secondly, we need to bind that cluster role to this service account with cluster wide scope. Therefore, create *CluterRoleBinding* as follows:

```yaml
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: rhdh-kuadrant
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: rhdh-kuadrant
subjects:
  - kind: ServiceAccount
    name: default
    namespace: $RHDH_NS
EOF
```

You can verify permissions with the following command:

```sh
kubectl auth can-i update apikeys.devportal.kuadrant.io --as=system:serviceaccount:$RHDH_NS:default
```

### Backstage instance

The Backstage CR represents one backstage instance. It is where all preparation comes into one place and takes effect.

* Link the dynamic plugin configmap

```yaml
spec:
  application:
    dynamicPluginsConfigMapName: dynamic-plugins-rhdh
```

* Link the main `rhdh-app-config` configmap

```yaml
spec:
  application:
    appConfig:
      mountPath: /opt/app-root/src
      configMaps:
         - name: rhdh-app-config
```

* Link the RBAC policies from the `rbac-policies` configmap

```yaml
spec:
  application:
    extraFiles:
      mountPath: /opt/app-root/etc
      configMaps:
         - name: rbac-policies
```
> The mounting path is referenced from `app-config.yaml`, RBAC for the kuadrant functionality section. Ensure they match.

* [Optional] Enable serviceaccount token automount

Only required for kubernetes access *in-cluster* mode.

```yaml
spec:
  deployment:
    patch:
      spec:
        template:
          spec:
            automountServiceAccountToken: true
```

<details><summary>A full example for "rhdh" Backstage instance</summary>

```yaml
# https://github.com/redhat-developer/rhdh-operator/blob/main/api/v1alpha3/backstage_types.go
apiVersion: rhdh.redhat.com/v1alpha3
kind: Backstage
metadata:
  name: rhdh
  namespace: $RHDH_NS
spec:
  application:
    appConfig:
      mountPath: /opt/app-root/src
      configMaps:
         - name: rhdh-app-config
    extraFiles:
      mountPath: /opt/app-root/etc
      configMaps:
         - name: rbac-policies
    route:
      enabled: true
      subdomain: frontend
    dynamicPluginsConfigMapName: dynamic-plugins-rhdh
  database:
    enableLocalDb: true
  deployment:
    patch:
      spec:
        template:
          spec:
            automountServiceAccountToken: true
```

</details>

Go to [backstage_types.go for v1alpha3](https://github.com/redhat-developer/rhdh-operator/blob/main/api/v1alpha3/backstage_types.go) for full reference on the Backstage CRD.

## Installation on Red Hat Developer Hub (RHDH) Local

This section covers installing the plugins using [rhdh-local](https://github.com/redhat-developer/rhdh-local) for local development with Docker Compose. For production RHDH deployments, see [Deploying to Production RHDH](#deploying-to-production-rhdh).

### 1. Configure Dynamic Plugins

Add the plugins to `configs/dynamic-plugins/dynamic-plugins.override.yaml`:

```yaml
includes:
  - dynamic-plugins.default.yaml

plugins:
  # Kuadrant Backend
  - package: "@kuadrant/kuadrant-backstage-plugin-backend-dynamic"
    disabled: false
    integrity: <sha512-integrity-hash>

  # Kuadrant Frontend
  - package: "@kuadrant/kuadrant-backstage-plugin-frontend"
    integrity: <sha512-integrity-hash>
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          internal.plugin-kuadrant:
            appIcons:
              - name: kuadrantIcon
                importName: KuadrantIcon
            dynamicRoutes:
              - path: /kuadrant
                importName: KuadrantPage
                menuItem:
                  icon: kuadrantIcon
                  text: Kuadrant
              - path: /kuadrant/api-products/:namespace/:name
                importName: ApiProductDetailPage
              - path: /kuadrant/api-keys/:namespace/:name
                importName: ApiKeyDetailPage
            mountPoints:
              - mountPoint: entity.page.api/cards
                importName: EntityKuadrantApiKeyManagementTab
                config:
                  layout:
                    gridColumn: "1 / -1"
                  if:
                    allOf:
                      - isKind: api
              - mountPoint: entity.page.api/cards
                importName: EntityKuadrantApiProductInfoContent
                config:
                  layout:
                    gridColumn: "1 / -1"
                  if:
                    allOf:
                      - isKind: api
```

To get the integrity hash:
```bash
npm view @kuadrant/kuadrant-backstage-plugin-frontend dist.integrity
npm view @kuadrant/kuadrant-backstage-plugin-backend-dynamic dist.integrity
```

### 2. Configure Kubernetes Access

Add to `configs/app-config/app-config.yaml`:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://host.docker.internal:<port>
          authProvider: serviceAccount
          serviceAccountToken: <your-token>
          skipTLSVerify: true
```

> **Note**: Use `host.docker.internal` to access the host machine's kind cluster from Docker. Get the port with `kubectl cluster-info`.

### 3. Configure RBAC

Add to `configs/app-config/app-config.yaml`:

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: /opt/app-root/src/configs/rbac-policy.csv
    policyFileReload: true
```

Create `configs/rbac-policy.csv` with the [RBAC policy content](#rbac-policy).

### 4. Start RHDH

```bash
docker compose up
```

Visit http://localhost:7007/kuadrant

### Deploying to Production RHDH

For production RHDH deployments (Operator or Helm), the configuration is the same but stored in Kubernetes ConfigMaps instead of local files:

| rhdh-local File | Production RHDH |
|-----------------|-----------------|
| `configs/dynamic-plugins/dynamic-plugins.override.yaml` | ConfigMap referenced by `spec.application.dynamicPluginsConfigMapName` in Backstage CR |
| `configs/app-config/app-config.yaml` | ConfigMap referenced by `spec.application.appConfig` in Backstage CR |
| `configs/rbac-policy.csv` | ConfigMap mounted as a volume |

**Key differences:**

1. **Dynamic Plugins ConfigMap:**
   ```yaml
   kind: ConfigMap
   apiVersion: v1
   metadata:
     name: dynamic-plugins-rhdh
   data:
     dynamic-plugins.yaml: |
       # Same content as dynamic-plugins.override.yaml
   ```

2. **App-config ConfigMap:**
   ```yaml
   kind: ConfigMap
   apiVersion: v1
   metadata:
     name: app-config-rhdh
   data:
     app-config-kuadrant.yaml: |
       # Same content as sections 2-4 above (Kubernetes Access, Catalog Rules, RBAC)
   ```

3. **Backstage CR reference:**
   ```yaml
   apiVersion: rhdh.redhat.com/v1alpha3
   kind: Backstage
   metadata:
     name: my-rhdh
   spec:
     application:
       dynamicPluginsConfigMapName: dynamic-plugins-rhdh
       appConfig:
         configMaps:
           - name: app-config-rhdh
   ```

4. **Kubernetes credentials as Secret:**
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: rhdh-k8s-credentials
   type: Opaque
   stringData:
     K8S_CLUSTER_URL: "https://<cluster-api-url>"
     K8S_CLUSTER_TOKEN: "<service-account-token>"
   ```

   Reference in Backstage CR:
   ```yaml
   spec:
     application:
       extraEnvs:
         secrets:
           - name: rhdh-k8s-credentials
   ```

5. **Cluster URL**: Use the actual cluster API URL instead of `host.docker.internal`.

6. **TLS**: Set `skipTLSVerify: false` and configure proper TLS certificates.

7. **Verify installation** at `<RHDH-URL>/api/dynamic-plugins-info/loaded-plugins`.

---

## Installation on Backstage

This section covers installing the plugins on a standard Backstage instance.

### Important: RBAC Plugin Requirement

The Kuadrant backend plugin includes an RBAC module that integrates with the Backstage permission framework. **Standard Backstage does not include the RBAC plugin** that RHDH provides.

To use the RBAC module on Backstage, you need to install the community RBAC plugin:

```bash
yarn --cwd packages/backend add @backstage-community/plugin-rbac-backend @backstage-community/plugin-rbac-node
```

If you don't need RBAC, you can skip the RBAC module - the core plugin functionality works without it.

### 1. Install Dependencies

**Frontend** (`packages/app`):

```bash
yarn --cwd packages/app add @kuadrant/kuadrant-backstage-plugin-frontend
```

**Backend** (`packages/backend`):

```bash
yarn --cwd packages/backend add @kuadrant/kuadrant-backstage-plugin-backend-dynamic
```

### 2. Register Backend Plugin

Edit `packages/backend/src/index.ts`:

```typescript
import { createBackend } from '@backstage/backend-defaults';
import {
  kuadrantPlugin,
  catalogModuleApiProductEntityProvider,
} from '@kuadrant/kuadrant-backstage-plugin-backend-dynamic';

const backend = createBackend();

// ... other plugins ...

// Kuadrant plugin
backend.add(kuadrantPlugin);
backend.add(catalogModuleApiProductEntityProvider);

backend.start();
```

### 3. Register Frontend Routes

Edit `packages/app/src/App.tsx`:

```tsx
import {
  KuadrantPage,
  ApiProductsPage,
  ApiProductDetailPage,
  ApiKeysPage,
  ApiKeyDetailPage,
} from '@kuadrant/kuadrant-backstage-plugin-frontend';

// In your routes:
const routes = (
  <FlatRoutes>
    {/* ... other routes ... */}
    <Route path="/kuadrant" element={<KuadrantPage />} />
    <Route path="/kuadrant/api-products" element={<ApiProductsPage />} />
    <Route path="/kuadrant/api-products/:namespace/:name" element={<ApiProductDetailPage />} />
    <Route path="/kuadrant/api-keys" element={<ApiKeysPage />} />
    <Route path="/kuadrant/api-keys/:namespace/:name" element={<ApiKeyDetailPage />} />
  </FlatRoutes>
);
```

### 4. Add Sidebar Navigation (Optional)

Edit `packages/app/src/components/Root/Root.tsx`:

```tsx
import ExtensionIcon from '@material-ui/icons/Extension';

// In your sidebar:
<SidebarItem icon={ExtensionIcon} to="kuadrant" text="Kuadrant" />
```

### 5. Configure Auth

Add to `app-config.yaml`. The `userEntityRef` ensures the guest user identity matches the RBAC policy:

```yaml
# Testing only: enables guest access for local development.
# In production, configure your own identity provider and map roles/permissions to your users or groups.
auth:
  environment: development
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true
      userEntityRef: user:default/guest
```

### 6. Configure Kubernetes Access

Add to `app-config.yaml`:

```yaml
kubernetes:
  serviceLocatorMethod:
    type: multiTenant
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: https://127.0.0.1:<port>
          authProvider: serviceAccount
          serviceAccountToken: <your-token>
          skipTLSVerify: true
```

### 7. Configure Catalog Rules

Add to `app-config.yaml`:

```yaml
catalog:
  rules:
    - allow: [Component, System, API, APIProduct, Resource, Location]
```

### 8. Configure Permissions and RBAC

Add to `app-config.yaml`:

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: ./configs/rbac-policy.csv
    policyFileReload: true
```

Then create the RBAC policy file at `configs/rbac-policy.csv` in your project root. See the [RBAC Policy](#rbac-policy) section for the full file contents.

For example, to grant the guest user admin access:

```bash
mkdir -p configs
```

Create `configs/rbac-policy.csv` with the policies from the [RBAC Policy](#rbac-policy) section.

### 9. Register RBAC Backend Plugin

The default Backstage permission backend uses an allow-all policy. To use the RBAC CSV policies, replace it with the community RBAC plugin.

In `packages/backend/src/index.ts`, replace:

```typescript
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);
```

with:

```typescript
// RBAC permission policy
backend.add(import('@backstage-community/plugin-rbac-backend'));
```

### 10. Start Backstage

```bash
yarn start
```

Visit http://localhost:3000/kuadrant

---

## Assets

### Dynamic Plugins

```yaml
includes:
  - dynamic-plugins.default.yaml

plugins:
  # Kuadrant Backend
  - package: "@kuadrant/kuadrant-backstage-plugin-backend-dynamic@$KUADRANT_PLUGIN_VERSION"
    disabled: false
    integrity: $KUADRANT_BACKSTAGE_PLUGIN_BACKEND_DYNAMIC_SHA256

  # Kuadrant Frontend
  - package: "@kuadrant/kuadrant-backstage-plugin-frontend@$KUADRANT_PLUGIN_VERSION"
    integrity: $KUADRANT_BACKSTAGE_PLUGIN_FRONTEND_SHA256
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          internal.plugin-kuadrant:
            appIcons:
              - name: kuadrantIcon
                importName: KuadrantIcon
            dynamicRoutes:
              - path: /kuadrant
                importName: KuadrantPage
                menuItem:
                  icon: kuadrantIcon
                  text: Kuadrant
              - path: /kuadrant/api-products/:namespace/:name
                importName: ApiProductDetailPage
              - path: /kuadrant/api-keys/:namespace/:name
                importName: ApiKeyDetailPage
            mountPoints:
              - mountPoint: entity.page.api/cards
                importName: EntityKuadrantApiKeyManagementTab
                config:
                  layout:
                    gridColumn: "1 / -1"
                  if:
                    allOf:
                      - isKind: api
              - mountPoint: entity.page.api/cards
                importName: EntityKuadrantApiProductInfoContent
                config:
                  layout:
                    gridColumn: "1 / -1"
                  if:
                    allOf:
                      - isKind: api
```

### RBAC Policy

Example `rbac-policy.csv` for Kuadrant permissions:

```csv
# api consumer: browses apis, requests access
p, role:default/api-consumer, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-consumer, kuadrant.apiproduct.list, read, allow
p, role:default/api-consumer, kuadrant.apikey.create, create, allow, apiproduct:*/*
p, role:default/api-consumer, kuadrant.apikey.read.own, read, allow
p, role:default/api-consumer, kuadrant.apikey.update.own, update, allow
p, role:default/api-consumer, kuadrant.apikey.delete.own, delete, allow
p, role:default/api-consumer, catalog.entity.read, read, allow

# api owner: publishes apis they own, approves requests for their apis
p, role:default/api-owner, kuadrant.planpolicy.read, read, allow
p, role:default/api-owner, kuadrant.planpolicy.list, read, allow
p, role:default/api-owner, kuadrant.apiproduct.create, create, allow
p, role:default/api-owner, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-owner, kuadrant.apiproduct.update.own, update, allow
p, role:default/api-owner, kuadrant.apiproduct.delete.own, delete, allow
p, role:default/api-owner, kuadrant.apiproduct.list, read, allow
p, role:default/api-owner, kuadrant.apikey.create, create, allow, apiproduct:*/*
p, role:default/api-owner, kuadrant.apikey.read.own, read, allow
p, role:default/api-owner, kuadrant.apikey.update.own, update, allow
p, role:default/api-owner, kuadrant.apikey.delete.own, delete, allow
p, role:default/api-owner, kuadrant.apikey.approve, update, allow
p, role:default/api-owner, catalog.entity.read, read, allow

# api admin: platform engineers who manage all api products
p, role:default/api-admin, kuadrant.planpolicy.read, read, allow
p, role:default/api-admin, kuadrant.planpolicy.list, read, allow
p, role:default/api-admin, kuadrant.apiproduct.create, create, allow
p, role:default/api-admin, kuadrant.apiproduct.read.all, read, allow
p, role:default/api-admin, kuadrant.apiproduct.update.all, update, allow
p, role:default/api-admin, kuadrant.apiproduct.delete.all, delete, allow
p, role:default/api-admin, kuadrant.apiproduct.list, read, allow
p, role:default/api-admin, kuadrant.apikey.create, create, allow, apiproduct:*/*
p, role:default/api-admin, kuadrant.apikey.read.all, read, allow
p, role:default/api-admin, kuadrant.apikey.update.all, update, allow
p, role:default/api-admin, kuadrant.apikey.delete.all, delete, allow
p, role:default/api-admin, kuadrant.apikey.approve, update, allow
p, role:default/api-admin, catalog.entity.read, read, allow

# assign groups to roles
g, group:default/api-consumers, role:default/api-consumer
g, group:default/api-owners, role:default/api-owner
g, group:default/api-admins, role:default/api-admin

# Development/testing only: assign guest user to admin role.
# For production, remove this line and assign roles to your actual users or groups.
g, user:default/guest, role:default/api-admin
```

### ClusterRole

Permissions to manage resources from kuadrant CRDs.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: rhdh-kuadrant
rules:
  - apiGroups: ["kuadrant.io"]
    resources:
      - authpolicies
      - ratelimitpolicies
      - dnspolicies
      - tlspolicies
    verbs: ["get", "list", "watch"]
  - apiGroups: ["extensions.kuadrant.io"]
    resources:
      - planpolicies
    verbs: ["get", "list", "watch"]
  - apiGroups: ["devportal.kuadrant.io"]
    resources:
      - apiproducts
      - apikeys
    verbs: ["get", "list", "watch", "create", "delete", "patch", "update"]
  - apiGroups: ["devportal.kuadrant.io"]
    resources:
      - apikeys/status
    verbs: ["get", "patch", "update"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources:
      - gateways
      - httproutes
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources:
      - namespaces
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources:
      - secrets
    verbs: ["get", "list", "watch", "create", "delete"]
```

---

## Exposed Modules

### Frontend

| Import Name                          | Description                                     |
|--------------------------------------|-------------------------------------------------|
| `KuadrantPage`                       | Main page with API products and approval queue  |
| `ApiProductsPage`                    | API products list page                          |
| `ApiProductDetailPage`               | Single API product detail page                  |
| `ApiKeysPage`                        | API keys list page                              |
| `ApiKeyDetailPage`                   | Single API key detail page                      |
| `EntityKuadrantApiAccessCard`        | API key request card for entity overview        |
| `EntityKuadrantApiKeyManagementTab`  | Full API keys management tab                    |
| `EntityKuadrantApiKeysContent`       | API keys content component                      |
| `EntityKuadrantApiProductInfoContent`| APIProduct details tab                          |
| `KuadrantIcon`                       | Kuadrant logo icon for navigation               |

### Backend

| Export                                  | Description                                                   |
|-----------------------------------------|---------------------------------------------------------------|
| `kuadrantPlugin`                        | Main backend plugin with HTTP router                          |
| `catalogModuleApiProductEntityProvider` | Catalog entity provider for APIProduct sync                   |
| `rbacModule`                            | RBAC module for permission integration (requires RBAC plugin) |

---

## Verification

After installation:

1. Navigate to `/kuadrant` - you should see the main Kuadrant page
2. Check the catalog for APIProduct entities synced from Kubernetes
3. Navigate to an API entity and verify Kuadrant components appear

## Troubleshooting

### APIProduct entities not appearing

1. Check backend logs for entity provider sync messages
2. Verify Kubernetes connectivity
3. Ensure APIProduct CRDs exist in your cluster
4. Check catalog rules allow APIProduct kind

### API key requests failing

1. Verify Kubernetes write permissions for the service account
2. Check backend logs for detailed error messages
3. Ensure the target namespace exists and is accessible

## Related Documentation

- [RBAC Permissions](rbac-permissions.md) - Detailed permissions guide
- [Kuadrant Docs](https://docs.kuadrant.io/) - Kuadrant documentation
- [RHDH Local](https://github.com/redhat-developer/rhdh-local) - RHDH local development

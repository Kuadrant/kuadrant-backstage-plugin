# Kuadrant Plugin Installation Guide

This guide covers installing the Kuadrant plugins into an existing Red Hat Developer Hub (RHDH) or Backstage instance.

**For plugin development**, see the [main README](../README.md).

## Prerequisites

- Red Hat Developer Hub 1.4+ or Backstage 1.30+
- Kubernetes cluster with:
  - [Kuadrant operator](https://docs.kuadrant.io/latest/getting-started/) installed
  - Gateway API CRDs
  - APIProduct and APIKey CRDs (from this repo's `kuadrant-dev-setup/crds/`)
- Existing RHDH deployment with:
  - Backstage CR configured
  - ConfigMap for dynamic plugins

For RHDH setup, see the [official documentation](https://docs.redhat.com/en/documentation/red_hat_developer_hub/).

## Packages

| Plugin | Package | Type |
|--------|---------|------|
| Frontend | [@kuadrant/kuadrant-backstage-plugin-frontend](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-frontend) | Frontend |
| Backend | [@kuadrant/kuadrant-backstage-plugin-backend](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-backend) | Backend |

## Installation

### 1. Add Dynamic Plugins

Add the plugins to your RHDH dynamic plugins ConfigMap:

```yaml
# dynamic-plugins.yaml
plugins:
  - package: '@kuadrant/kuadrant-backstage-plugin-frontend'
    disabled: false
  - package: '@kuadrant/kuadrant-backstage-plugin-backend'
    disabled: false
```

### 2. Configure Kubernetes Access

The backend plugin needs access to Kubernetes to manage APIProducts and APIKeys.

Add to your `app-config.yaml`:

```yaml
kubernetes:
  clusterLocatorMethods:
    - type: config
      clusters:
        - name: production
          url: ${K8S_URL}
          authProvider: serviceAccount
          serviceAccountToken: ${K8S_CLUSTER_TOKEN}
          skipTLSVerify: false
```

Create a service account with the required permissions:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: rhdh-kuadrant
  namespace: rhdh
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: rhdh-kuadrant
rules:
  - apiGroups: ["devportal.kuadrant.io"]
    resources: ["apiproducts", "apikeys"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["kuadrant.io"]
    resources: ["planpolicies"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "create", "delete"]
---
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
    name: rhdh-kuadrant
    namespace: rhdh
```

Generate a token:

```bash
kubectl create token rhdh-kuadrant -n rhdh --duration=8760h
```

### 3. Configure Frontend Plugin

Add to `app-config.yaml`:

```yaml
dynamicPlugins:
  frontend:
    internal.plugin-kuadrant:
      appIcons:
        - name: kuadrant
          importName: ExtensionIcon

      dynamicRoutes:
        - path: /kuadrant
          importName: KuadrantPage
          menuItem:
            icon: kuadrant
            text: Kuadrant

      mountPoints:
        - mountPoint: entity.page.api-keys/cards
          importName: EntityKuadrantApiKeysContent
          config:
            layout:
              gridColumn: "1 / -1"
            if:
              allOf:
                - isKind: api

        - mountPoint: entity.page.overview/cards
          importName: EntityKuadrantApiAccessCard
          config:
            layout:
              gridColumnEnd: "span 6"
            if:
              allOf:
                - isKind: api
                - hasAnnotation: kuadrant.io/httproute

        - mountPoint: entity.page.api-product-info/cards
          importName: EntityKuadrantApiProductInfoContent
          config:
            layout:
              gridColumn: "1 / -1"
            if:
              allOf:
                - isKind: API
                - hasLabel: kuadrant.io/synced
```

### 4. Configure Catalog

Allow APIProduct entities in the catalog:

```yaml
catalog:
  rules:
    - allow: [Component, System, API, APIProduct, Group, User, Resource, Location, Template]
```

### 5. Configure RBAC (Optional)

Enable RBAC with Kuadrant permissions:

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: ./rbac-policy.csv
    policyFileReload: true
```

Example `rbac-policy.csv`:

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
```

## Exposed Modules

### Frontend

| Import Name | Description |
|-------------|-------------|
| `KuadrantPage` | Main page with API products and approval queue |
| `EntityKuadrantApiAccessCard` | API key request card for entity overview |
| `EntityKuadrantApiKeyManagementTab` | Full API keys management tab |
| `EntityKuadrantApiKeysContent` | API keys content component |
| `EntityKuadrantApiProductInfoContent` | APIProduct details tab |

### Backend

| Export Path | Description |
|-------------|-------------|
| Default | Main backend plugin with HTTP router |
| `/alpha` | Catalog entity provider for APIProduct sync |
| `/rbac` | RBAC module for permission integration |

## Verification

After installation:

1. Navigate to `/kuadrant` in RHDH - you should see the main Kuadrant page
2. Check the catalog for APIProduct entities synced from Kubernetes
3. Navigate to an API entity and verify the "API Keys" tab appears

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

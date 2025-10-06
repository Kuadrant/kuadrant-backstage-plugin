# kuadrant backstage plugin

backstage plugin for kuadrant - enables developer portals for api access management using kuadrant gateway api primitives.

## features

- **api access management**: request api keys for kuadrant-protected apis
- **tiered plans**: support for multiple access tiers with different rate limits via planpolicy
- **user identity**: integrates with backstage identity api for user-specific api keys
- **policy visibility**: view authpolicies, ratelimitpolicies, and planpolicies
- **api key management**: view, create, and delete api keys with show/hide toggles

## installation

1. install the frontend plugin:
```bash
yarn add @internal/plugin-kuadrant
```

2. install the backend plugin:
```bash
yarn add @internal/plugin-kuadrant-backend
```

3. configure kubernetes access in `app-config.yaml`:
```yaml
kubernetes:
  serviceLocatorMethod:
    type: 'localKubectlProxy'
  clusterLocatorMethods:
    - type: 'localKubectlProxy'
```

4. start kubectl proxy:
```bash
kubectl proxy --port=8001
```

## configuring api entities

to enable kuadrant features for an api entity, add the following annotations:

```yaml
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: toystore-api
  annotations:
    # required: name of the gateway api httproute resource
    kuadrant.io/httproute: toystore

    # required: kubernetes namespace where the httproute exists
    kuadrant.io/namespace: toystore

    # optional: gateway name for reference
    kuadrant.io/gateway: external
spec:
  type: openapi
  lifecycle: production
  owner: team-a
```

### annotation reference

| annotation | required | description | example |
|-----------|----------|-------------|---------|
| `kuadrant.io/httproute` | yes | name of the gateway api httproute resource | `toystore` |
| `kuadrant.io/namespace` | yes | kubernetes namespace containing the httproute | `toystore` |
| `kuadrant.io/gateway` | no | gateway name for reference/display | `external` |

## usage

### api access card

the `ApiAccessCard` component displays available plans and allows users to request api keys.

add to your api entity page in `packages/app/src/components/catalog/EntityPage.tsx`:

```tsx
import { ApiAccessCard } from '@internal/plugin-kuadrant';

const apiPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      <Grid container spacing={3}>
        <Grid item md={8} xs={12}>
          <ApiAccessCard />
        </Grid>
      </Grid>
    </EntityLayout.Route>
  </EntityLayout>
);
```

the component reads configuration from entity annotations (see above).

### api key management tab

the `ApiKeyManagementTab` component shows all api keys for a user.

add to your api entity page:

```tsx
import { ApiKeyManagementTab } from '@internal/plugin-kuadrant';

const apiPage = (
  <EntityLayout>
    <EntityLayout.Route path="/api-keys" title="API Keys">
      <ApiKeyManagementTab />
    </EntityLayout.Route>
  </EntityLayout>
);
```

## kubernetes resources

the plugin creates and manages the following kubernetes resources:

### api key secrets

when a user requests access, the plugin creates a kubernetes secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: user-toystore-1234567890
  namespace: toystore
  labels:
    app: toystore  # matches authpolicy selector
  annotations:
    secret.kuadrant.io/user-id: john
    secret.kuadrant.io/plan-id: gold
type: Opaque
data:
  api_key: <base64-encoded-key>
```

these secrets are automatically selected by kuadrant authpolicy resources via label selectors.

## development

see the main project [README.md](../../../README.md) for development setup instructions.

# Getting Started Tutorial

This tutorial walks you through publishing an API and managing consumer access using the Kuadrant developer portal.

By the end, you will have:
- Deployed an API with authentication and tiered rate limiting
- Published it as an API Product via Backstage
- Requested and approved API access
- Used the generated API key

## Prerequisites

- Kubernetes cluster with [Kuadrant operator](https://docs.kuadrant.io/latest/getting-started/) installed
- Gateway API CRDs and a gateway provider (Istio or Envoy Gateway)
- RHDH/Backstage with Kuadrant plugins installed (see [Installation Guide](installation.md))

## Part 1: Platform Engineer Setup

These steps are performed by a platform engineer or API owner with cluster access. They prepare the infrastructure and policies that enable API access management.

### Step 1: Deploy the API

Create the namespace and deploy the toystore application:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: getting-started-tutorial
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: toystore
  namespace: getting-started-tutorial
  labels:
    app: toystore
spec:
  replicas: 1
  selector:
    matchLabels:
      app: toystore
  template:
    metadata:
      labels:
        app: toystore
    spec:
      containers:
        - name: toystore
          image: quay.io/kuadrant/authorino-examples:talker-api
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
---
apiVersion: v1
kind: Service
metadata:
  name: toystore
  namespace: getting-started-tutorial
spec:
  selector:
    app: toystore
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
EOF
```

Wait for the deployment to be available:

```bash
kubectl -n getting-started-tutorial wait --timeout=120s --for=condition=Available deployment/toystore
```

### Step 2: Create the Gateway and HTTPRoute

Create a Gateway and expose the API via an HTTPRoute. The `backstage.io/expose: "true"` annotation makes the route available for publishing in the developer portal.

```bash
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: getting-started-gateway
  namespace: getting-started-tutorial
spec:
  gatewayClassName: istio
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: getting-started-toystore
  namespace: getting-started-tutorial
  annotations:
    backstage.io/expose: "true"
spec:
  parentRefs:
    - name: getting-started-gateway
      namespace: getting-started-tutorial
  hostnames:
    - getting-started.toystore.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
          method: GET
      backendRefs:
        - name: toystore
          port: 80
EOF
```

Verify:

```bash
kubectl get httproute,gateway -n getting-started-tutorial
```

### Step 3: Configure API Key Authentication

Create an AuthPolicy requiring API key authentication. Keys are stored as Kubernetes Secrets with the label `app: getting-started-toystore-api` (matching the APIProduct name we'll create in Step 5).

```bash
kubectl apply -f - <<EOF
apiVersion: kuadrant.io/v1
kind: AuthPolicy
metadata:
  name: getting-started-auth
  namespace: getting-started-tutorial
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: getting-started-toystore
  rules:
    authentication:
      "api-key-users":
        apiKey:
          selector:
            matchLabels:
              app: getting-started-toystore-api
          allNamespaces: true
        credentials:
          authorizationHeader:
            prefix: APIKEY
EOF
```

Verify the policy is enforced:

```bash
kubectl get authpolicy -n getting-started-tutorial
```

### Step 4: Create Plan Tiers

Create a PlanPolicy defining access tiers with different rate limits.

```bash
kubectl apply -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: PlanPolicy
metadata:
  name: getting-started-plans
  namespace: getting-started-tutorial
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: getting-started-toystore
  plans:
    - tier: gold
      predicate: |
        has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "gold"
      limits:
        daily: 100
    - tier: silver
      predicate: |
        has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "silver"
      limits:
        daily: 50
    - tier: bronze
      predicate: |
        has(auth.identity) && auth.identity.metadata.annotations["secret.kuadrant.io/plan-id"] == "bronze"
      limits:
        daily: 10
EOF
```

Verify:

```bash
kubectl get planpolicy -n getting-started-tutorial
```

The platform engineer setup is complete. The HTTPRoute is now available for API owners to publish via the developer portal.

## Part 2: API Owner Workflow

These steps are performed by an API owner using the Backstage UI.

### Step 5: Publish as an API Product

1. Navigate to your Backstage instance
2. Go to the **Kuadrant** page from the sidebar
3. Click **Create API Product**
4. Select the **getting-started-toystore** HTTPRoute from the dropdown
5. Fill in the details:
   - **Name**: `getting-started-toystore-api`
   - **Display Name**: `Getting Started Toystore API`
   - **Description**: `Toystore API for the getting started tutorial`
   - **Approval Mode**: Manual
   - **Publish Status**: Published
6. Click **Create**

The plugin creates an APIProduct resource in Kubernetes. The PlanPolicy tiers (gold, silver, bronze) are automatically discovered and shown on the API Product page.

Verify via kubectl:

```bash
kubectl get apiproduct -n getting-started-tutorial
```

## Part 3: API Consumer Workflow

These steps are performed by an API consumer using the Backstage UI.

### Step 6: Discover the API

1. Click **APIs** in the sidebar
2. Find **Getting Started Toystore API** in the list
3. Click to view the API details

The API page shows:
- **Overview** tab with description and metadata
- **API Keys** tab for requesting access
- **API Product Info** tab with plan tiers and rate limits

### Step 7: Request API Access

1. Click the **API Keys** tab
2. Click **Request API Access**
3. Select a tier (e.g. **silver** - 50 requests/day)
4. Provide a use case description (e.g. "Testing API integration")
5. Click **Submit**

The request creates an APIKey resource with status `Pending`.

## Part 4: API Owner Approval

Back to the API owner workflow.

### Step 8: Approve the Request

1. Navigate to the **Kuadrant** page
2. View the **Pending Requests** section
3. Find the request and review the details:
   - Requester
   - Requested tier
   - Use case
4. Click **Approve**

The developer-portal-controller creates a Secret containing the API key and updates the APIKey status to `Approved`.

## Part 5: Using the API

Back to the API consumer.

### Step 9: Retrieve and Use the API Key

1. Navigate to the Getting Started Toystore API in the catalog
2. Click the **API Keys** tab
3. Find your approved key
4. Click the eye icon to reveal the secret
5. Copy the API key value

Test the API:

```bash
export GATEWAY_IP=$(kubectl get gateway getting-started-gateway -n getting-started-tutorial -o jsonpath='{.status.addresses[0].value}')
export API_KEY="your-api-key-here"

curl -H "Host: getting-started.toystore.com" -H "Authorization: APIKEY $API_KEY" http://$GATEWAY_IP/
```

You should receive a response from the toystore API.

## Cleanup

Remove all resources by deleting the namespace:

```bash
kubectl delete namespace getting-started-tutorial
```

## Summary

| Persona | Actions |
|---------|---------|
| Platform Engineer | Deploy API, create Gateway/HTTPRoute, configure AuthPolicy and PlanPolicy |
| API Owner | Publish API Product via Backstage, approve access requests |
| API Consumer | Discover APIs, request access, use API keys |

## Next Steps

- [RBAC Permissions](rbac-permissions.md) - Configure role-based access control
- [API Reference](api-reference.md) - Backend API endpoints
- [Kuadrant Documentation](https://docs.kuadrant.io/) - Full Kuadrant operator documentation

# RBAC for API Key Management

This directory contains RBAC roles for the API key management feature.

## Overview

The API key management system uses Custom Resources (APIKeyRequest CRs) with proper spec/status separation. This enables clean, native Kubernetes RBAC without any workarounds or hacks.

## Roles

### 1. api-key-requester (Role)

Regular users who can create and manage their own API key requests within their namespace.

**Permissions:**
- Create, view, update, delete `APIKeyRequest` CRs in their namespace
- Read status (to see approved API keys)
- **Cannot** update status (cannot self-approve)

**Typical use case:** Developer who wants to request access to APIs.

**Example binding:**
```bash
kubectl create rolebinding developer-api-keys \
  --role=api-key-requester \
  --user=developer@example.com \
  --namespace=developer-ns
```

### 2. api-key-approver (ClusterRole)

Admins who can approve or reject API key requests across all namespaces.

**Permissions:**
- View all `APIKeyRequest` CRs across all namespaces
- Update status subresource (approve/reject)
- Create Secrets in API namespaces (for approved keys)

**Typical use case:** Platform admin who reviews and approves API access requests.

**Example binding:**
```bash
kubectl create clusterrolebinding api-admins \
  --clusterrole=api-key-approver \
  --group=api-admins
```

## Deployment

Apply the roles to your cluster:

```bash
# create rbac directory if it doesn't exist
mkdir -p config/rbac

# apply the requester role (namespace-scoped)
kubectl apply -f config/rbac/api-key-requester-role.yaml

# apply the approver clusterrole
kubectl apply -f config/rbac/api-key-approver-clusterrole.yaml
```

## How it Works

The key insight is using CRD status subresources for approval workflow:

1. **Request Creation**: User creates `APIKeyRequest` CR in their namespace
   - Sets `spec` fields (apiName, planTier, useCase, etc.)
   - Initial `status.phase` is "Pending"

2. **Approval**: Admin patches `/status` subresource
   - Changes `status.phase` to "Approved" or "Rejected"
   - Adds API key and metadata to status
   - Creates Secret with actual key

3. **RBAC Enforcement**:
   - Regular users have `get/list` on `/status` but **not** `update/patch`
   - Admins have `update/patch` on `/status`
   - Native Kubernetes RBAC prevents users from self-approving

## Namespace Isolation

API key requests are stored in the user's own namespace, providing natural isolation:

- User A in namespace `team-a` can only see requests in `team-a`
- User B in namespace `team-b` can only see requests in `team-b`
- Admins with cluster-level permissions can see all requests

No label-based filtering needed - standard Kubernetes namespace RBAC works perfectly!

## Security Considerations

### What's Protected

✅ Users cannot approve their own requests (no `update` on status)
✅ Users cannot see other users' requests (namespace isolation)
✅ Users cannot modify approved keys (status is controlled by admins)
✅ Admins can't be bypassed via kubectl (RBAC enforced at API server level)

### What's Not Protected (by design)

⚠️ Users can delete their own requests (even if approved)
⚠️ Users can edit their request spec (but this doesn't affect approved status)
⚠️ API keys are stored in status (visible to anyone who can read the CR)

### Recommendations

1. **Limit namespace access**: Don't give users access to other namespaces
2. **Use RBAC groups**: Bind roles to groups, not individual users
3. **Audit logging**: Enable Kubernetes audit logs to track approvals
4. **Secret management**: Consider using a controller to move keys to secrets and remove from status
5. **Rotate keys**: Implement key rotation by creating new requests

## Example Workflow

```bash
# as developer in namespace 'developer-ns'
kubectl apply -f - <<EOF
apiVersion: extensions.kuadrant.io/v1alpha1
kind: APIKeyRequest
metadata:
  name: developer-petstore-abc
  namespace: developer-ns
spec:
  apiName: petstore
  apiNamespace: api-gateway
  planTier: gold
  useCase: "building mobile app"
  requestedBy:
    userId: developer
    email: developer@example.com
  requestedAt: "2025-01-15T10:00:00Z"
EOF

# as admin (anywhere)
kubectl get apikeyrequests -A
# developer-ns   developer-petstore-abc   petstore   gold    Pending

# approve via console UI or kubectl patch:
kubectl patch apikeyrequests developer-petstore-abc \
  -n developer-ns \
  --type=merge \
  --subresource=status \
  -p '{"status":{"phase":"Approved","apiKey":"generated-key-here"}}'

# developer can now see their approved key
kubectl get apikeyrequests developer-petstore-abc -n developer-ns -o yaml
```

## Comparison: ConfigMaps vs CRDs

### ConfigMap Approach (Previous)
❌ No status subresource → users can modify approval
❌ Label-based filtering not supported by Kubernetes RBAC
❌ Requires application-level filtering (bypassable with kubectl)
❌ No schema validation
❌ Mixed concerns (spec + status in data field)

### CRD Approach (Current)
✅ Status subresource → clean RBAC separation
✅ Namespace-based isolation → native Kubernetes RBAC
✅ Enforceable at API server level
✅ Schema validation via OpenAPI
✅ Proper Kubernetes semantics (spec vs status)

## Troubleshooting

**User can't create requests:**
```bash
# check role binding
kubectl get rolebindings -n <namespace>
kubectl describe rolebinding api-key-requester -n <namespace>
```

**User can see requests but not status:**
```bash
# verify status permissions
kubectl auth can-i get apikeyrequests/status \
  --as=user@example.com \
  --namespace=<namespace>
```

**Admin can't approve:**
```bash
# verify clusterrole binding
kubectl get clusterrolebindings api-admins
kubectl auth can-i patch apikeyrequests/status \
  --as=admin@example.com \
  --all-namespaces
```

## Future Enhancements

1. **Controller**: Add operator logic to automate approval workflow
2. **Webhooks**: Add validating webhook to enforce business rules
3. **Owner References**: Automatic cleanup when resources are deleted
4. **Conditions**: Add Kubernetes-style conditions for better status tracking
5. **Metrics**: Expose request/approval metrics via controller

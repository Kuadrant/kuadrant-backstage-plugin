# Backend Security Principles

All backend code in `plugins/kuadrant-backend/src/router.ts` must follow these security tenets.

For RBAC permissions and access control patterns, see [rbac-permissions.md](rbac-permissions.md).

## 1. Never Trust Client Input

**Principle:** All data from HTTP requests is untrusted and must be validated before use.

**Implementation:**
- Use Zod schemas to validate all request bodies
- Define explicit whitelists of allowed fields
- Reject requests that don't match the schema

**Reference:** See validation examples in [`plugins/kuadrant-backend/src/router.ts`](../plugins/kuadrant-backend/src/router.ts) - search for `z.object` patterns.

**Why:** Unvalidated input allows attackers to modify fields they shouldn't (privilege escalation, namespace injection, etc.).

## 2. Authentication Required, No Fallbacks

**Principle:** All endpoints must require valid authentication. No guest user fallbacks.

**Implementation:**
- Use `httpAuth.credentials(req)` without `{ allow: ['user', 'none'] }`
- Explicitly check credentials exist before proceeding
- Extract user identity from auth credentials, never from request parameters

**Reference:** See `getUserIdentity` usage in [`plugins/kuadrant-backend/src/router.ts`](../plugins/kuadrant-backend/src/router.ts).

**Why:** Guest fallbacks and client-supplied identity allow user impersonation and privilege escalation.

## 3. Pure RBAC Permission Model

**Principle:** Authorization decisions must only use Backstage RBAC permissions, not group membership checks.

**See [rbac-permissions.md](rbac-permissions.md) for complete permission definitions and enforcement patterns.**

**Implementation:**
- Check permissions using `permissions.authorize()`
- Use specific permission objects (create, read, update, delete, etc.)
- Support both `.own` and `.all` permission variants where appropriate
- Never bypass RBAC with group-based role flags

**Why:** Mixed authorization models create bypass opportunities and make security audits difficult.

## 4. Validate Field Mutability

**Principle:** Distinguish between mutable and immutable fields. Prevent modification of critical resource identifiers.

**Implementation:**
- In PATCH endpoints, only allow updating safe metadata fields
- Exclude from validation schemas:
  - `namespace`, `name` (Kubernetes identifiers)
  - `targetRef` (infrastructure references)
  - `userId`, `requestedBy` (ownership)
  - Fields managed by controllers (e.g., `plans` in APIProduct)

**Reference:** See PATCH endpoint schemas in [`plugins/kuadrant-backend/src/router.ts`](../plugins/kuadrant-backend/src/router.ts) - search for `patchSchema`.

**Why:** Allowing modification of references can break infrastructure relationships or grant unauthorised access.

## 5. Ownership Validation for User Resources

**Principle:** When users manage their own resources (API keys, requests), verify ownership before allowing modifications.

**See [rbac-permissions.md](rbac-permissions.md) for detailed ownership model and tiered permission check patterns.**

**Implementation:**
- Check `.all` permission first (admin/owner access)
- If not allowed, check `.own` permission
- Fetch existing resource and verify `requestedBy.userId` matches current user
- Throw `NotAllowedError` if ownership check fails

**Why:** Prevents users from modifying other users' resources even if they have the base permission.

## 6. Follow Namespace Organisation Pattern

**Principle:** Respect Kuadrant's namespace architecture where all API resources live in the same namespace.

**See [kuadrant-resources.md](kuadrant-resources.md) for detailed namespace architecture.**

**Implementation:**
- Never accept `namespace` from client input for resource creation
- Use the namespace of the referenced resource (APIProduct, HTTPRoute)
- Create APIKeys in the API's namespace (spec.apiNamespace)
- Create Secrets in the API's namespace (not user namespace)

**Why:** Cross-namespace creation can bypass RBAC, pollute namespaces, or break AuthPolicy references.

## 7. Explicit Error Responses

**Principle:** Return appropriate HTTP status codes and clear error messages.

**Implementation:**
- 400 for validation errors (`InputError`)
- 403 for permission denied (`NotAllowedError`)
- 500 for unexpected errors
- Include error details in response body
- Log errors server-side for debugging

**Why:** Clear errors help legitimate users debug issues while avoiding information disclosure to attackers.

## Reference Examples in Codebase

**Good patterns to follow in [`plugins/kuadrant-backend/src/router.ts`](../plugins/kuadrant-backend/src/router.ts):**
- `router.patch('/requests/:namespace/:name', ...)` - Whitelist validation, ownership checks
- `router.post('/requests/:namespace/:name/approve', ...)` - Zod validation, proper auth
- `router.patch('/apiproducts/:namespace/:name', ...)` - Comprehensive field whitelist

**Anti-patterns fixed in security audit:**
- Accepting userId from request body (privilege escalation)
- Guest user fallbacks (authentication bypass)
- Group-based authorization alongside RBAC (dual auth paths)
- Unvalidated PATCH bodies (field manipulation)
- Client-controlled namespace (namespace injection)

# UI Patterns

This document describes frontend patterns used in the Kuadrant plugin.

## Backstage Table detailPanel with Interactive Content

When using the Backstage `Table` component's `detailPanel` feature with interactive elements (tabs, buttons, etc.), there's a critical pattern to avoid re-render issues.

**Problem:** If the detail panel content uses parent component state, changing that state causes the entire parent to re-render, which makes the Material Table lose its internal expansion state and collapse the row.

**Solution:** Create a separate component for the detail panel content with its own isolated local state.

**Key principles:**
1. Each detail panel instance gets its own component with isolated state
2. Changing state in one detail panel doesn't trigger parent re-renders
3. Add `onClick={(e) => e.stopPropagation()}` to prevent clicks from bubbling to table row
4. Add `e.stopPropagation()` to interactive element handlers (onChange, onClick, etc.)
5. Keep `detailPanelConfig` in `useMemo` with minimal dependencies

**Example:** See [`plugins/kuadrant/src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx`](../plugins/kuadrant/src/components/ApiKeyManagementTab/ApiKeyManagementTab.tsx) - API key management tab shows expandable rows with code examples in multiple languages (cURL, Node.js, Python, Go). Each row has language tabs that can be switched without collapsing the expansion.

## Read-only Resource Detail View (Details / YAML tabs)

Kubernetes resources that the portal only reads (no create/edit/delete) get a
read-only detail page reached by clicking a row in the resource's list/table.
The reference implementation is the Gateway detail view
([`plugins/kuadrant/src/components/GatewayDetailPage/GatewayDetailPage.tsx`](../plugins/kuadrant/src/components/GatewayDetailPage/GatewayDetailPage.tsx)),
mounted at `/kuadrant/gateways/:namespace/:name`.

**Layout:**

- **Breadcrumb** back to the resource's list page.
- **Details tab** — Name, Namespace, Ready/Status, Age, Labels, Annotations,
  Created at, Owner, plus a **Conditions** table (Type, Status, Updated, Reason,
  Message) rendered with the core-components `Table`.
- **YAML tab** — the raw manifest rendered read-only with `CodeSnippet`
  (`language="yaml"`, from `@backstage/core-components`). The repo does not
  bundle the Monaco editor; `CodeSnippet` is the established read-only viewer.

**Key principles:**

1. Keep display logic (age formatting, readiness, owner) in a pure `utils.ts`
   next to the component so it can be unit tested without rendering
   (see [`GatewayDetailPage/utils.ts`](../plugins/kuadrant/src/components/GatewayDetailPage/utils.ts)).
2. Readiness mirrors the list/table health rule (a Gateway is Ready when both
   `Accepted` and `Programmed` conditions are `True`).
3. Register the page as a routable extension in `plugin.ts`, export it from
   `index.ts`, and add the route in `packages/app/src/components/AppBase/AppBase.tsx`.

> Note: the Gateway detail view is reached by clicking a Gateway name in the MCP
> Gateways table on the MCP overview page
> ([`plugins/kuadrant/src/components/McpOverviewPage/McpOverviewPage.tsx`](../plugins/kuadrant/src/components/McpOverviewPage/McpOverviewPage.tsx)),
> whose Name column links to `/kuadrant/gateways/:namespace/:name`. The page
> fetches the full manifest via `kuadrantApi.getGateway(namespace, name)`, which
> calls the backend `GET /gateways/:namespace/:name` read endpoint.

## Delete Confirmation Patterns

All delete operations should use proper Material-UI dialogs instead of browser `window.confirm()` or `alert()`. The pattern varies based on severity.

### ConfirmDeleteDialog Component

Reusable component at [`plugins/kuadrant/src/components/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx`](../plugins/kuadrant/src/components/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx)

### Severity Levels

**Normal severity** (API key requests, pending requests):
- Simple confirmation dialog with description
- Cancel and Delete buttons
- No text confirmation required

**High severity** (API Products, infrastructure resources):
- Warning icon in title
- Detailed description explaining consequences
- Text confirmation required (user must type resource name)
- Delete button disabled until text matches

### Usage Examples

**High severity:** See [`plugins/kuadrant/src/components/KuadrantPage/ApiProductsPage.tsx`](../plugins/kuadrant/src/components/KuadrantPage/ApiProductsPage.tsx) - API Products deletion

## Frontend Permission System

The Kuadrant frontend uses Backstage's permission framework for fine-grained access control. All UI actions check permissions before rendering buttons/forms.

**See [rbac-permissions.md](rbac-permissions.md) for complete frontend permission documentation including:**
- Custom `useKuadrantPermission` hook usage
- Permission error handling patterns
- Ownership-aware action patterns
- Component patterns (PermissionGate, button gating, conditional columns)
- Loading states and empty states

**Key files:**
- Permission hook: [`plugins/kuadrant/src/utils/permissions.ts`](../plugins/kuadrant/src/utils/permissions.ts)
- Permission definitions: [`plugins/kuadrant/src/permissions.ts`](../plugins/kuadrant/src/permissions.ts)

## Sidebar Menu Configuration

RHDH uses a specific pattern for sidebar menu items with parent-child relationships. This is configured in [`packages/app/src/consts.ts`](../packages/app/src/consts.ts).

**Key pattern:** Parent-child relationships use the `parent` property on child items, NOT nested `children` arrays.

```typescript
// parent item - no `to` property makes it expandable
'default.kuadrant': {
  title: 'Kuadrant',
  icon: 'extension',
  priority: 55,
},
// child items reference parent via `parent` property
'default.kuadrant.api-products': {
  title: 'API Products',
  icon: 'category',
  to: '/kuadrant/api-products',
  parent: 'default.kuadrant',
  priority: 20,
},
```

**Properties:**
- `title`: Display text in sidebar
- `icon`: Icon name registered in [`packages/app/src/components/DynamicRoot/CommonIcons.tsx`](../packages/app/src/components/DynamicRoot/CommonIcons.tsx) (home, group, category, extension, key, add, admin, etc.)
- `to`: Route path (omit for parent-only expandable items)
- `parent`: Reference to parent menu item key
- `priority`: Higher values appear higher in the list

**Adding new icons:** Import from `@mui/icons-material` and add to the `CommonIcons` map in `CommonIcons.tsx`.

**Documentation:** [RHDH Customizing Appearance](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.6/html/customizing_red_hat_developer_hub/customizing-appearance)

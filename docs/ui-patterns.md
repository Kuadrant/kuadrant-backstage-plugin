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

**High severity:** See [`plugins/kuadrant/src/components/KuadrantPage/KuadrantPage.tsx`](../plugins/kuadrant/src/components/KuadrantPage/KuadrantPage.tsx) - API Products deletion

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

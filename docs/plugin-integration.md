# Plugin Integration

This document describes how to add custom plugins to the monorepo for local development.

## Adding Custom Plugins

1. Copy plugin directories to `plugins/` folder
2. Run `yarn install` to link them via workspace
3. Add backend plugins to [`packages/backend/src/index.ts`](../packages/backend/src/index.ts):
   ```typescript
   backend.add(import('@internal/plugin-your-backend'));
   backend.add(import('@internal/plugin-your-backend/alpha'));
   ```
4. Add frontend plugin to [`packages/app/package.json`](../packages/app/package.json):
   ```json
   {
     "dependencies": {
       "@internal/plugin-your-plugin": "0.1.0"
     }
   }
   ```
5. Import and use directly in app components (see patterns below)

Hot reloading works automatically with `yarn dev`.

## Plugin Integration Patterns

For local development, direct imports work better than Scalprum dynamic loading.

### Adding a Plugin Page

1. Import and add route in [`packages/app/src/components/AppBase/AppBase.tsx`](../packages/app/src/components/AppBase/AppBase.tsx):
   ```typescript
   import { YourPluginPage } from '@internal/plugin-your-plugin';

   <Route path="/your-plugin" element={<YourPluginPage />} />
   ```

2. Add menu item in [`packages/app/src/consts.ts`](../packages/app/src/consts.ts):
   ```typescript
   'default.your-plugin': {
     title: 'Your Plugin',
     icon: 'extension',
     to: 'your-plugin',
     priority: 55,
   }
   ```

### Adding Entity Page Components

1. Add imports to [`packages/app/src/components/catalog/EntityPage/defaultTabs.tsx`](../packages/app/src/components/catalog/EntityPage/defaultTabs.tsx):
   ```typescript
   import {
     EntityYourContent,
   } from '@internal/plugin-your-plugin';
   ```

2. Define tab in `defaultTabs` object:
   ```typescript
   '/your-tab': {
     title: 'Your Tab',
     mountPoint: 'entity.page.your-tab',
   }
   ```

3. Add visibility rule in `tabRules` object:
   ```typescript
   '/your-tab': {
     if: isKind('api'),
   }
   ```

4. Add content in `tabChildren` object:
   ```typescript
   '/your-tab': {
     children: <EntityYourContent />,
   }
   ```

### Adding Entity Overview Cards

Add to [`packages/app/src/components/catalog/EntityPage/OverviewTabContent.tsx`](../packages/app/src/components/catalog/EntityPage/OverviewTabContent.tsx) within the appropriate `EntitySwitch.Case`:

```typescript
<Grid
  item
  sx={{
    gridColumn: {
      lg: '5 / -1',
      md: '7 / -1',
      xs: '1 / -1',
    },
  }}
>
  <EntityYourCard />
</Grid>
```

### Grid Layout for Entity Page Tabs

Entity pages use CSS Grid layout. Content in tabs must be wrapped in Grid components with explicit grid column settings:

```typescript
// full-width content (recommended for most tabs)
'/your-tab': {
  children: (
    <Grid item sx={{ gridColumn: '1 / -1' }}>
      <YourContent />
    </Grid>
  ),
}

// half-width content
'/your-tab': {
  children: (
    <>
      <Grid item sx={{ gridColumn: { lg: '1 / span 6', xs: '1 / -1' } }}>
        <LeftContent />
      </Grid>
      <Grid item sx={{ gridColumn: { lg: '7 / span 6', xs: '1 / -1' } }}>
        <RightContent />
      </Grid>
    </>
  ),
}
```

Without explicit grid column settings, content receives default grid sizing which may appear half-width.

## Local Development Authentication

For local development with `yarn dev`, enable guest authentication in [`app-config.local.yaml`](../app-config.local.yaml):

```yaml
auth:
  environment: development
  providers:
    guest:
      dangerouslyAllowOutsideDevelopment: true
```

## Home Page Route

For local development with `yarn dev`, dynamic plugins don't load, so the dynamic home page plugin (`red-hat-developer-hub.backstage-plugin-dynamic-home-page`) won't provide the "/" route.

Add a redirect in [`packages/app/src/components/AppBase/AppBase.tsx`](../packages/app/src/components/AppBase/AppBase.tsx):

```typescript
import { Navigate, Route } from 'react-router-dom';

// in FlatRoutes:
<Route path="/" element={<Navigate to="catalog" />} />
```

**Note:** The actual dynamic home page configured in `app-config.dynamic-plugins.yaml` will work correctly in production with `yarn start` or when deployed.

## Common Pitfalls

### Backend API calls in frontend components

Always use absolute backend URLs, not relative paths. Relative paths go to the webpack dev server (port 3000) instead of the backend (port 7007).

```typescript
// incorrect (goes to webpack dev server)
const response = await fetchApi.fetch('/api/your-endpoint');

// correct (goes to backend)
const config = useApi(configApiRef);
const backendUrl = config.getString('backend.baseUrl');
const response = await fetchApi.fetch(`${backendUrl}/api/your-endpoint`);
```

### Menu items showing translation keys

If menu items show `menuItem.key-name` instead of the actual title, remove the `titleKey` property and only use `title`:

```typescript
// incorrect
'default.your-plugin': {
  title: 'Your Plugin',
  titleKey: 'menuItem.yourPlugin',  // remove this
  icon: 'extension',
  to: 'your-plugin',
}

// correct
'default.your-plugin': {
  title: 'Your Plugin',
  icon: 'extension',
  to: 'your-plugin',
}
```

## Running Locally with Dynamic Plugins

The repository includes a pre-configured [`app-config.local.yaml`](../app-config.local.yaml) with RBAC enabled and proper dev server ports.

1. Run `yarn install`
2. (Optional) Run `yarn export-dynamic -- -- --dev` to export dynamic plugins to `dynamic-plugins-root/`
3. Start with `yarn dev` (frontend + backend with hot reload) or `yarn start` (backend only)

**Note:** `yarn dev` doesn't load dynamic plugins but provides hot reload for Kuadrant plugin development. Use `yarn start` if you need dynamic plugins loaded.

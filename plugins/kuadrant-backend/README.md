# kuadrant

This plugin backend was templated using the Backstage CLI. You should replace this text with a description of your plugin backend.

## Installation

This plugin is installed via the `@internal/plugin-kuadrant-backend` package. To install it to your backend package, run the following command:

```bash
# From your root directory
yarn --cwd packages/backend add @internal/plugin-kuadrant-backend
```

Then add the plugin to your backend in `packages/backend/src/index.ts`:

```ts
const backend = createBackend();
// ...
backend.add(import('@internal/plugin-kuadrant-backend'));
```

## Development

Run the plugin inside the host app: see the development loops in
[docs/oinc.md](../../docs/oinc.md).

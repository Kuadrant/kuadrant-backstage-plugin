# packaging/

This directory is the Konflux product build entry point for the Kuadrant RHDH
dynamic plugins. It is a standalone yarn workspace covering only the two plugin
packages, separate from the full rhdh-local development environment at the repo root.

## Why this exists

The root `yarn.lock` covers the entire RHDH application (~3878 packages) because
this repo is an rhdh-local fork used for local development. The Konflux hermetic
build (cachi2 prefetch) only needs the plugin dependencies, roughly 1000 packages.

This directory provides a minimal yarn workspace root that cachi2 can read without
pulling in the full RHDH dependency tree.

## Contents

- `package.json` — workspace root referencing the two plugin packages
- `yarn.lock` — generated lockfile covering only plugin transitive dependencies
- `.yarnrc.yml` — build-appropriate settings (x64/linux, node-modules linker)
- `plugins/kuadrant` — symlink to `../../plugins/kuadrant`
- `plugins/kuadrant-backend` — symlink to `../../plugins/kuadrant-backend`

## Keeping it in sync

When you update dependencies in either plugin's `package.json`, you must also
regenerate `packaging/yarn.lock`:

```bash
cd packaging
yarn install
git add yarn.lock
git commit -m "update packaging/yarn.lock"
```

A CI check (`.github/workflows/verify-packaging.yml`) enforces this, it will
fail if the lockfile is out of sync with the plugin `package.json` files.

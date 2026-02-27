---
description: Sync changes from upstream RHDH repository (redhat-developer/rhdh)
---

# Sync RHDH Upstream

Fetch and selectively sync changes from the upstream RHDH repository.

**Upstream:** https://github.com/redhat-developer/rhdh

**Note:** This repo has no common Git ancestor with RHDH (it was created as a copy, not a fork). Standard merges don't work. This command selectively syncs useful updates.

---

## Step 0: Choose Version

Ask the user which RHDH version to sync to. List available tags:

```bash
git ls-remote --tags https://github.com/redhat-developer/rhdh.git | sed -n 's|.*refs/tags/\([0-9][0-9]*\.[0-9][0-9]*\(\.[0-9][0-9]*\)\{0,1\}\)$|\1|p' | sort -V | tail -20
```

Present the tags and ask the user to pick one (e.g. `1.8.4`). Store this as `RHDH_VERSION` for use in later steps.

If the user already provided a version as an argument to this command, use that directly.

## Step 1: Fetch Upstream

Fetch the chosen tag:

```bash
git fetch https://github.com/redhat-developer/rhdh.git refs/tags/${RHDH_VERSION}:refs/remotes/rhdh-sync/target --no-tags
```

## Step 2: Show What's at That Tag

```bash
git log --oneline rhdh-sync/target -10
```

## Step 3: Create Sync Branch

```bash
git checkout main
git checkout -b rhdh-sync-${RHDH_VERSION}
```

## Step 4: Compare Versions

Check Backstage version:
```bash
echo "Local:"; cat backstage.json
echo "Upstream (${RHDH_VERSION}):"; git show rhdh-sync/target:backstage.json
```

## Step 5: Sync Lockfile

Use the upstream lockfile as a base. This preserves upstream transitive resolutions and avoids cascading dependency conflicts.

```bash
git show rhdh-sync/target:yarn.lock > yarn.lock
```

After syncing all package.json files (below), run `yarn install` to layer our extra packages on top.

## Step 6: Sync Key Files

Update these files by comparing and applying changes. Use `git show rhdh-sync/target:<file>` to read upstream versions.

### backstage.json
```bash
git show rhdh-sync/target:backstage.json > backstage.json
```

### Root package.json
Compare and selectively update:
- `version` field to match RHDH version
- `@backstage/cli` version in devDependencies
- `@backstage/frontend-test-utils` version in devDependencies
- Resolution versions (keep our custom ones, update Backstage ones)

**Keep our custom additions:**
- Our dev scripts (dex, concurrently)
- Our dependencies (oidc-provider, dotenv)

### packages/app/package.json
Update all `@backstage/*` dependencies to match upstream versions.
**Keep our additions:**
- `@backstage-community/plugin-rbac`
- `@kuadrant/kuadrant-backstage-plugin-frontend`
- `@material-ui/core`

### packages/backend/package.json
Update all `@backstage/*` dependencies to match upstream versions.
**Keep our additions:**
- `@kuadrant/kuadrant-backstage-plugin-backend`
- `dotenv`

### Internal RHDH plugins
Sync `plugins/dynamic-plugins-info-backend`, `plugins/licensed-users-info-backend`, and `plugins/scalprum-backend` package.json files from upstream.

### Yarn patches
Copy any `.yarn/patches/` files from upstream:
```bash
git show rhdh-sync/target:.yarn/patches/ # check what exists
```

### Kuadrant plugins
Update `plugins/kuadrant/package.json` and `plugins/kuadrant-backend/package.json` to use compatible `@backstage/*` versions. Match the versions used by other packages in the monorepo.

## Step 7: Install and Verify

```bash
yarn install
```

Regenerate build metadata (RHDH version, Backstage version):
```bash
yarn versions:metadata
```

Clear stale webpack cache before building (janus-cli uses filesystem caching that bakes in absolute module paths):
```bash
rm -rf packages/app/.webpack-cache
```

Then verify:
```bash
yarn tsc
yarn build
yarn test
```

## Step 8: Handle Known Issues

### Zod Version Conflicts
If RBAC or other plugins pull in `zod-to-json-schema` that needs `zod@^3.25` (for the `zod/v3` export), set the zod resolution to `^3.25.0` rather than pinning an older version.

### Stale Webpack Cache
If `yarn build` fails with `Cannot find module .../html-webpack-plugin/node_modules/lodash/lodash.js`, delete `packages/app/.webpack-cache` and rebuild.

### OOM During TypeScript
If tsc runs out of memory:
```bash
NODE_OPTIONS="--max-old-space-size=8192" yarn tsc
```

### Stale node_modules
If you see `@backstage/cli/config/tsconfig.json` not found or similar, do a clean install:
```bash
rm -rf node_modules && yarn install
```

## Step 9: Cleanup

```bash
git update-ref -d refs/remotes/rhdh-sync/target
```

---

## Output Summary

```
RHDH UPSTREAM SYNC COMPLETE
===========================

Synced to: RHDH ${RHDH_VERSION}
Backstage version: [old] -> [new]

Files updated:
- backstage.json
- package.json (resolutions, devDeps)
- packages/app/package.json
- packages/backend/package.json
- plugins/kuadrant/package.json
- plugins/kuadrant-backend/package.json

Build status: PASSED / FAILED

Next steps:
- Run e2e tests
- User pushes when ready
```

## Files to NEVER Sync

These are Kuadrant-specific and should never be overwritten:
- `plugins/kuadrant/**`
- `plugins/kuadrant-backend/**`
- `kuadrant-dev-setup/**`
- `app-config.yaml`, `app-config.local.yaml`
- `rbac-policy.csv`
- `CLAUDE.md`, `.claude/**`
- `docs/**`
- `e2e-tests/**`

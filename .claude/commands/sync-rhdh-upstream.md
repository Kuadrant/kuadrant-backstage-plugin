---
description: Sync changes from upstream RHDH repository (redhat-developer/rhdh)
---

# Sync RHDH Upstream

Fetch and selectively sync changes from the upstream RHDH repository.

**Upstream:** https://github.com/redhat-developer/rhdh

**Note:** This repo has no common Git ancestor with RHDH (it was created as a copy, not a fork). Standard merges don't work. This command selectively syncs useful updates.

---

## Step 1: Fetch Upstream

Fetch latest from RHDH without clobbering local tags:

```bash
git fetch https://github.com/redhat-developer/rhdh.git main:refs/remotes/rhdh-sync/main --no-tags
```

## Step 2: Show Recent Upstream Changes

```bash
git log --oneline rhdh-sync/main -30
```

## Step 3: Create Sync Branch

```bash
git checkout main
git checkout -b rhdh-sync-$(date +%Y%m%d)
```

## Step 4: Compare Versions

Check Backstage version:
```bash
echo "Local:"; cat backstage.json
echo "Upstream:"; git show rhdh-sync/main:backstage.json
```

## Step 5: Sync Key Files

Update these files by comparing and applying changes:

### backstage.json
```bash
git show rhdh-sync/main:backstage.json > backstage.json
```

### Root package.json
Compare and selectively update:
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

### Kuadrant plugins
Update `plugins/kuadrant/package.json` and `plugins/kuadrant-backend/package.json` to use compatible `@backstage/*` versions.

## Step 6: Handle Known Issues

### Zod Version Conflicts
If you see zod type errors during tsc, add a resolution in root package.json:
```json
"resolutions": {
  "zod": "3.23.8"
}
```

### OOM During TypeScript
If tsc runs out of memory:
```bash
NODE_OPTIONS="--max-old-space-size=8192" yarn tsc
```

## Step 7: Install and Verify

```bash
yarn install
NODE_OPTIONS="--max-old-space-size=8192" yarn tsc
NODE_OPTIONS="--max-old-space-size=8192" yarn build
```

## Step 8: Cleanup

```bash
git update-ref -d refs/remotes/rhdh-sync/main
```

---

## Output Summary

```
RHDH UPSTREAM SYNC COMPLETE
===========================

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

# How to Release kuadrant-backstage-plugin

To release a version `X.Y.Z` of the `kuadrant-backstage-plugin` on GitHub and npm, follow these steps:

## 1. Prepare the Release Commit

- Remove the `-dev` suffix from the `version` field in both plugin `package.json` files:
  - `plugins/kuadrant/package.json`
  - `plugins/kuadrant-backend/package.json`
- Commit these changes to create a "floating" release commit.

You can either:
- Push this commit directly to `main`, or
- Open a pull request (recommended if time allows).

## 2. Trigger the Release Workflow

- Go to the [Release workflow](https://github.com/Kuadrant/kuadrant-backstage-plugin/actions/workflows/release.yml) in GitHub Actions.
- Click **"Run workflow"** and select the branch containing the release commit (typically `main`).

> [!NOTE]
> The release workflow will fail if the tag `vX.Y.Z` already exists. Ensure that the version in `plugins/kuadrant/package.json` has been bumped before triggering the workflow.

This workflow (`workflow_dispatch`) will:
1. Read the version from `plugins/kuadrant/package.json`.
2. Verify the tag `vX.Y.Z` does not already exist.
3. Build all packages and export dynamic plugins.
4. Create tarball artifacts:
   - `kuadrant-backstage-plugin-frontend-X.Y.Z.tgz`
   - `kuadrant-backstage-plugin-backend-X.Y.Z.tgz`
   - `kuadrant-backstage-plugin-backend-dynamic-X.Y.Z.tgz`
5. Generate a changelog from commit history.
6. Create a GitHub Release tagged `vX.Y.Z` with the tarballs attached.

## 3. Publish to npm (Automatic)

When the GitHub Release is published, the [Publish workflow](https://github.com/Kuadrant/kuadrant-backstage-plugin/actions/workflows/publish.yml) is triggered automatically. It publishes three npm packages with the `latest` dist-tag:

- [`@kuadrant/kuadrant-backstage-plugin-frontend`](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-frontend)
- [`@kuadrant/kuadrant-backstage-plugin-backend`](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-backend)
- [`@kuadrant/kuadrant-backstage-plugin-backend-dynamic`](https://www.npmjs.com/package/@kuadrant/kuadrant-backstage-plugin-backend-dynamic)

### Publishing a Dev Build Manually

You can also trigger the Publish workflow manually via `workflow_dispatch`. In this case:
- The version is derived from the current `package.json` version plus the short Git SHA (e.g., `0.0.2-dev-abc1234`).
- The package is published with the `dev` dist-tag.

## 4. Bump to the Next Development Version

After the release is published, prepare the repository for the next development cycle:

- Update the `version` field in both plugin `package.json` files to the next version with a `-dev` suffix (e.g., `0.0.3-dev`).
- Create a PR to merge these changes into `main`.

## Summary

| Step | Action | Trigger |
|------|--------|---------|
| 1 | Remove `-dev` suffix from plugin `package.json` versions | Manual |
| 2 | Run the Release workflow | Manual (`workflow_dispatch`) |
| 3 | npm packages published | Automatic (on release published) |
| 4 | Bump versions to next `-dev` | Manual |

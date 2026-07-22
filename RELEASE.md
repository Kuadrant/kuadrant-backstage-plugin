# Releasing kuadrant-backstage-plugin

Stable releases come from `release-X.Y` branches. Version changes go through a
pull request and CI; the release step never commits or pushes a branch.

There are three separate publication points:

1. A signed annotated Git tag fixes `vX.Y.Z` to a reviewed commit.
2. A GitHub Release publishes generated notes for that existing tag.
3. The GitHub Release event starts `publish.yml`, which publishes three npm
   packages with the `latest` dist-tag.

Only the frontend and static backend have source manifests. The publish workflow
sets the exported backend-dynamic package to the same release version.

Use the guarded Claude command for the happy path. The manual steps below are
the equivalent fallback and are also useful when diagnosing a failed release.

## Prerequisites

- Push access to `Kuadrant/kuadrant-backstage-plugin`
- A signing key configured for `git tag -s`
- `git`, `gh`, `node`, and `npm`
- A human GitHub login stored by `gh auth`

Do not set `GH_TOKEN` or `GITHUB_TOKEN` while creating the GitHub Release. Those
environment variables take precedence over the account stored by `gh auth`.
Confirm the human identity before releasing:

```shell
gh auth status --hostname github.com
gh api user --jq .login
```

The human credential creates the GitHub Release so its `release: published`
event can start the npm workflow. `GITHUB_TOKEN` is used only inside GitHub
Actions, and npm publication uses the workflow's trusted-publishing identity. A
manual dispatch of `publish.yml` is only for a development build.

## Prepare a minor release

A minor release is `X.Y.0` from a new `release-X.Y` branch.

1. Create the release branch from the intended, current `upstream/main` commit:

   ```shell
   git fetch upstream main
   git switch --create release-X.Y upstream/main
   git push --set-upstream upstream \
     "refs/heads/release-X.Y:refs/heads/release-X.Y"
   ```

2. From a separate topic branch, set both manifests to the stable `X.Y.0`:
   - `plugins/kuadrant/package.json`
   - `plugins/kuadrant-backend/package.json`

3. Open a PR from the topic branch to `release-X.Y`. Merge it only after all
   required CI checks pass. Include any release-branch-only CI fix in this PR;
   the commit eventually tagged must be a reviewed PR merge at the tip of the
   release branch.

## Prepare a patch release

A patch release is `X.Y.Z`, where `Z > 0`, from the existing `release-X.Y`
branch.

1. Fetch the release branch and create a topic branch from it:

   ```shell
   git fetch upstream release-X.Y
   git switch --create release-X.Y.Z upstream/release-X.Y
   ```

2. Backport the intended fixes through that topic branch. Set both plugin
   manifests to the same stable `X.Y.Z` version.
3. Open a PR to `release-X.Y` and merge it only after all required CI checks
   pass. Do not push the release commit directly to the release branch or main.

## Command-driven release

After the preparation PR is merged, check out its merge commit at the tip of the
release branch with a clean worktree, then run one of:

```text
/release minor
/release minor X.Y.0
/release patch
/release patch X.Y.Z
```

The version is normally derived from the two manifests. Supplying it makes the
version an additional assertion; the command never edits either file.

Before changing anything, the command checks the branch, upstream synchronization,
stable versions, release PR, required CI, tag/release absence, and npm state. It
prints the one tag ref it will push and asks for confirmation. It then creates
and verifies a signed tag, pushes only that tag, creates the GitHub Release with
generated notes, waits for npm publication, and verifies all three packages.

## Equivalent manual release

Run these commands from the repository root after the release PR has merged.
Set `RELEASE_TYPE` to `minor` or `patch` and omit the leading `v` from `VERSION`.

```shell
REPO=Kuadrant/kuadrant-backstage-plugin
RELEASE_TYPE=minor
VERSION=X.Y.Z
TAG=v${VERSION}
BRANCH=$(git branch --show-current)
HEAD_SHA=$(git rev-parse HEAD)
```

### 1. Preflight

Require a clean, synchronized release branch and human `gh` credentials:

```shell
test -z "$(git status --porcelain=v1)"
test "$BRANCH" = "release-${VERSION%.*}"
test -z "${GH_TOKEN:-}"
test -z "${GITHUB_TOKEN:-}"

git remote get-url upstream
gh auth status --hostname github.com
gh api user --jq .login

git fetch --no-tags upstream \
  "refs/heads/${BRANCH}:refs/remotes/upstream/${BRANCH}"
test "$HEAD_SHA" = "$(git rev-parse "refs/remotes/upstream/${BRANCH}")"
```

Read and compare the two source versions:

```shell
FRONTEND_VERSION=$(node -p \
  "require('./plugins/kuadrant/package.json').version")
BACKEND_VERSION=$(node -p \
  "require('./plugins/kuadrant-backend/package.json').version")

test "$FRONTEND_VERSION" = "$BACKEND_VERSION"
test "$FRONTEND_VERSION" = "$VERSION"
node -e 'process.exit(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(process.argv[1]) ? 0 : 1)' \
  "$VERSION"
```

For a minor release, require the patch component to be zero. For a patch
release, require it to be greater than zero:

```shell
PATCH_VERSION=${VERSION##*.}
if test "$RELEASE_TYPE" = minor; then
  test "$PATCH_VERSION" -eq 0
elif test "$RELEASE_TYPE" = patch; then
  test "$PATCH_VERSION" -gt 0
else
  exit 1
fi
```

Require the tag and GitHub Release to be absent:

```shell
if git show-ref --verify --quiet "refs/tags/${TAG}"; then exit 1; fi
REMOTE_TAG_REFS=$(git ls-remote --tags upstream \
  "refs/tags/${TAG}" "refs/tags/${TAG}^{}") || exit 1
test -z "$REMOTE_TAG_REFS"

RELEASE_OUTPUT=$(gh release view "$TAG" --repo "$REPO" 2>&1)
RELEASE_STATUS=$?
if test "$RELEASE_STATUS" -eq 0 || \
   test "$RELEASE_OUTPUT" != "release not found"; then
  printf '%s\n' "$RELEASE_OUTPUT" >&2
  exit 1
fi
```

Find the PR associated with the exact commit. The output must contain exactly
one merged PR targeting `$BRANCH`, with `merge_commit_sha` equal to `$HEAD_SHA`:

```shell
gh api "repos/${REPO}/commits/${HEAD_SHA}/pulls" \
  --jq '.[] | {number, base: .base.ref, merge_commit_sha, merged_at, url: .html_url}'
```

Set `PR` to that number and verify its state and required checks. The required
checks must include passing `build-validate`, `export-plugins`, `unittests`, and
`e2e-tests` jobs:

```shell
PR=<release-pr-number>
gh pr view "$PR" --repo "$REPO" \
  --json state,mergedAt,baseRefName,mergeCommit,url
gh pr checks "$PR" --repo "$REPO" --required
```

Finally, list the published versions of all three packages and verify that the
target version is absent from every list. A registry or authentication error is
a failed check, not proof that the version is absent:

```shell
for PACKAGE in \
  @kuadrant/kuadrant-backstage-plugin-frontend \
  @kuadrant/kuadrant-backstage-plugin-backend \
  @kuadrant/kuadrant-backstage-plugin-backend-dynamic
do
  VERSIONS=$(npm view "$PACKAGE" versions --json \
    --registry https://registry.npmjs.org/) || exit 1
  printf '%s\n' "$VERSIONS" | node -e '
    const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const versions = Array.isArray(data) ? data : [data];
    process.exit(versions.includes(process.argv[1]) ? 1 : 0)
  ' "$VERSION" || exit 1
done
```

A non-zero exit above is a stop, not a successful preflight.

### 2. Sign and push the tag

Fetch and repeat the branch, version, PR/CI, remote-tag, release, and npm
version-absence checks immediately before tagging. Then create the signed
annotated tag:

```shell
git tag -s "$TAG" "$HEAD_SHA" -m "$TAG"
test "$(git cat-file -t "refs/tags/${TAG}")" = tag
git verify-tag "$TAG"
test "$(git rev-list -n 1 "$TAG")" = "$HEAD_SHA"
```

Push only the intended ref. Never use `--tags`, `--follow-tags`, or force:

```shell
git push upstream "refs/tags/${TAG}:refs/tags/${TAG}"
```

Verify the remote tag object and its peeled commit:

```shell
test "$(git ls-remote --tags upstream "refs/tags/${TAG}" | awk '{print $1}')" = \
  "$(git rev-parse "refs/tags/${TAG}")"
test "$(git ls-remote --tags upstream "refs/tags/${TAG}^{}" | awk '{print $1}')" = \
  "$HEAD_SHA"
```

### 3. Publish the GitHub Release

The existing remote tag is the source of truth. Do not pass `--target`:

```shell
test -z "${GH_TOKEN:-}"
test -z "${GITHUB_TOKEN:-}"
gh api user --jq .login
gh release create "$TAG" --repo "$REPO" --verify-tag --generate-notes
gh release view "$TAG" --repo "$REPO" \
  --json tagName,isDraft,isPrerelease,publishedAt,url
```

### 4. Wait for npm and verify it

Allow up to two minutes for the release event to appear. Repeat this query until
it returns exactly one run whose branch is `$TAG` and SHA is `$HEAD_SHA`:

```shell
gh run list --repo "$REPO" \
  --workflow publish.yml \
  --event release \
  --branch "$TAG" \
  --commit "$HEAD_SHA" \
  --json databaseId,headBranch,headSha,status,conclusion,url
```

Then wait for that exact run:

```shell
RUN_ID=<databaseId>
gh run watch "$RUN_ID" --repo "$REPO" --compact --exit-status
```

After it succeeds, repeat these checks for up to five minutes to allow for npm
registry propagation:

```shell
for PACKAGE in \
  @kuadrant/kuadrant-backstage-plugin-frontend \
  @kuadrant/kuadrant-backstage-plugin-backend \
  @kuadrant/kuadrant-backstage-plugin-backend-dynamic
do
  test "$(npm view "${PACKAGE}@${VERSION}" version \
    --registry https://registry.npmjs.org/)" = "$VERSION"
  test "$(npm view "$PACKAGE" dist-tags.latest \
    --registry https://registry.npmjs.org/)" = "$VERSION"
done
```

## Recovery

Never move or force-push a remote tag, and never delete a published npm version.
Inventory the tag, GitHub Release, workflow run, and all three npm versions
before choosing a recovery point.

### The tag already exists

Inspect it with `git ls-remote`. If the remote tag is absent locally, fetch only
that tag, without overwriting an existing local ref, before using `git cat-file
-t`, `git verify-tag`, and `git rev-list`:

```shell
git fetch --no-tags upstream \
  "refs/tags/vX.Y.Z:refs/tags/vX.Y.Z"
```

- If it exists only locally and was created by this failed release attempt,
  reuse it only when it is signed, annotated, and points to the synchronized
  release-branch tip. Otherwise, after confirming the exact tag name, remove
  only the local tag with `git tag -d vX.Y.Z` and rerun the full preflight.
- If the remote tag is correct but no GitHub Release exists, verify that the
  tag is signed and points to the synchronized release-branch tip, rerun the
  remaining read-only preflight checks while skipping the tag-absence gate,
  and resume with `gh release create --verify-tag`.
- If the remote tag points anywhere unexpected, stop. Do not delete or replace
  it; choose a new version or agree a recovery with the maintainers.

### GitHub Release creation failed

Use `gh release view vX.Y.Z` to determine whether publication actually happened.
If no release exists and the remote tag verifies correctly, retry release
creation. If the release exists, do not create another one; locate the matching
`release`-event run by tag and SHA.

If a published release has no corresponding workflow run after the event delay,
stop and investigate. Do not manually dispatch `publish.yml`: that path derives
and publishes a development version.

### npm publication failed or was partial

Check the exact version of all three packages before rerunning anything.

- If none exists, it is safe to rerun the failed release-event job with
  `gh run rerun <run-id> --failed`, then watch and verify it again.
- If only some exist, do not rerun the current all-in-one publish job: it starts
  again with the frontend package and npm will reject an already-published
  version. npm versions are immutable. Coordinate a maintainer-approved publish
  of only the missing package(s), built from the exact release tag, then verify
  all three versions and `latest` dist-tags.
- If all three exist at the expected version, do not rerun publication. Verify
  their `latest` dist-tags, record the packages as published, and investigate
  the later workflow step that failed. A wrong dist-tag needs a maintainer-approved
  dist-tag correction, not another package publish.

## Post-release development version

Prepare the next development version in a new topic branch and PR it to `main`.
Update both source manifests to the same canonical version ending in `-dev`.

Choose the next version deliberately: `X.Y.(Z+1)-dev` is appropriate when the
next planned release is another patch; `X.(Y+1).0-dev` is appropriate when main
moves to the next minor. For a patch from an older release branch, first inspect
`upstream/main`; never downgrade or replace a newer development version.

The release command does not make this commit and nothing in this process pushes
directly to `main`.

## Development builds

The manual `workflow_dispatch` path of `publish.yml` is separate from stable
releases. It appends the short Git SHA to the source development version and
publishes all three packages with the `dev` dist-tag.

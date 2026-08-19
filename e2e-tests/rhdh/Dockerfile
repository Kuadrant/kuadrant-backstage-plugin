# derived rhdh image for the dynamic-plugin e2e job.
# bakes the locally-built kuadrant dynamic plugins into a stock rhdh image so ci
# validates the current branch's export-dynamic output without publishing to npm.
#
# build context is the repo root:
#   docker build -f e2e-tests/rhdh/Dockerfile -t <tag> .
# run yarn build + export-dynamic in both plugins first so the dist-dynamic dirs exist.

ARG RHDH_BASE_IMAGE=quay.io/rhdh-community/rhdh:1.10
FROM ${RHDH_BASE_IMAGE}

# setup-rhdh.sh references these as ./dynamic-plugins/dist/<dir>, relative to
# /opt/app-root/src. Group 0 + uid 1001 keeps them readable under OpenShift's
# arbitrary-uid semantics.
COPY --chown=1001:0 plugins/kuadrant/dist-dynamic \
  /opt/app-root/src/dynamic-plugins/dist/kuadrant-kuadrant-backstage-plugin-frontend
COPY --chown=1001:0 plugins/kuadrant-backend/dist-dynamic \
  /opt/app-root/src/dynamic-plugins/dist/kuadrant-kuadrant-backstage-plugin-backend-dynamic

# RHDH Release Testing

How to install a Red Hat Connectivity Link (RHCL) release candidate, Red Hat Developer Hub
(RHDH) and the productised Kuadrant plugins on one cluster, then run this repo's e2e suite
against them. Repeat it for each RHCL release. The Red Hat docs remain the reference for
the install; the steps and manifests here are the ones the last release test used, with
the places where the docs lag the plugin called out. The manifests live in
[`release-testing/`](release-testing/). For the npm packages or a local build, see
[oinc Development Environment](oinc.md).

## Requirements

- An OpenShift cluster on the latest OCP, with cluster-admin. The plugin does not depend on
  the OCP version, so one cluster is enough.
- amd64 workers. RHDH 1.10 runs only on amd64: its operator pod requires
  `kubernetes.io/arch In [amd64]`. The QE release clusters have been arm64-only.
- Credentials for the release candidate registries, from QE: `registry.stage.redhat.io`,
  `brew.registry.redhat.io` and `quay.io/kuadrant/qe-rhcl-prerelease-images`.
- `oc`, `helm`, `jq`, and Node 22 with Yarn for the e2e harness, run from a checkout of
  this repo.

## 1. Registry access

Merge the release candidate credentials, as a Docker config JSON (`rc-auth.json`), into the
cluster pull secret, and mirror the release candidate images through brew as the QE
clusters do:

```bash
oc get secret pull-secret -n openshift-config -o jsonpath='{.data.\.dockerconfigjson}' \
  | base64 -d > pull-secret.json
jq -s '.[0] * .[1]' pull-secret.json rc-auth.json > merged.json
oc set data secret/pull-secret -n openshift-config --from-file=.dockerconfigjson=merged.json
oc apply -f docs/release-testing/image-mirrors.yaml
rm pull-secret.json merged.json
```

On a hosted control plane cluster (HCP, including ROSA) the global pull secret is managed.
Put the credentials in `kube-system/additional-pull-secret` instead, which HCP merges into
every node, and set the same mirrors through the provider (for ROSA,
`rosa create image-mirror`).

## 2. RHCL release candidate

Install it the way QE does, with [helm-charts-olm](https://github.com/Kuadrant/helm-charts-olm).
[`rhcl-values.yaml`](release-testing/rhcl-values.yaml) sets the `rhcl-operator` package,
the `stable` channel, OSSM3 and the QE catalog; set `indexImage` for the release candidate
and OCP version.

```bash
git clone https://github.com/Kuadrant/helm-charts-olm
helm install kuadrant-operators helm-charts-olm/charts/kuadrant-operators \
  --values helm-charts-olm/values.yaml \
  --values docs/release-testing/rhcl-values.yaml --wait --timeout 25m
helm install kuadrant-instances helm-charts-olm/charts/kuadrant-instances \
  --values helm-charts-olm/values.yaml \
  --values docs/release-testing/rhcl-values.yaml --wait --timeout 25m
```

RHCL 1.5 includes the MCP Gateway controller, and the chart enables the developer portal
(OCP 4.20 or later). Check before going on:

```bash
oc get csv -n kuadrant-system                       # rhcl-operator Succeeded; note the version
oc get kuadrant -A -o custom-columns=DEVPORTAL:.spec.components.developerPortal.enabled  # true
oc get crd apiproducts.devportal.kuadrant.io apikeys.devportal.kuadrant.io \
  apikeyrequests.devportal.kuadrant.io apikeyapprovals.devportal.kuadrant.io \
  planpolicies.extensions.kuadrant.io mcpgatewayextensions.mcp.kuadrant.io \
  mcpserverregistrations.mcp.kuadrant.io
oc get gatewayclass istio                           # ACCEPTED True
```

## 3. RHDH and the plugin

Install the RHDH operator (package `rhdh`, channel `fast-1.10`), then the plugin's
configuration. The plugin image comes from the release candidate's advisory under
[`rhtap-release/advisories`](https://gitlab.cee.redhat.com/rhtap-release/advisories/-/tree/main/data/advisories/api-management-tenant)
(component `rhcl-<version>-rhcl-rhdh-dynamic-plugin`); set its tag in
[`dynamic-plugins.yaml`](release-testing/dynamic-plugins.yaml). One image holds both
plugins. `rc-plugin-auth.json` holds the `registry.stage.redhat.io` credentials: RHDH's
plugin installer pulls the image itself and ignores cluster mirrors.

If `oc get subscriptions.operators.coreos.com -A | grep -w rhdh` finds an RHDH operator
already on the cluster, use it and leave out the first two commands: a second operator
conflicts with it. If its version does not suit the plugin (below), use another cluster. The
`rhdh` namespace must not exist yet: this step creates it and cleanup deletes it.

```bash
oc apply -f docs/release-testing/rhdh-operator.yaml
until oc get csv -n rhdh-operator -l operators.coreos.com/rhdh.rhdh-operator \
  -o jsonpath='{.items[0].status.phase}' 2>/dev/null | grep -q Succeeded; do sleep 10; done
oc create namespace rhdh
oc create secret generic dynamic-plugins-registry-auth -n rhdh --from-file=auth.json=rc-plugin-auth.json
oc create configmap dynamic-plugins-rhdh -n rhdh \
  --from-file=dynamic-plugins.yaml=docs/release-testing/dynamic-plugins.yaml
oc create configmap rhdh-app-config -n rhdh \
  --from-file=app-config.yaml=docs/release-testing/app-config.yaml
oc apply -f docs/release-testing/plugin-rbac.yaml
oc apply -f docs/release-testing/backstage.yaml
oc rollout status deployment/backstage-developer-hub -n rhdh --timeout=15m
```

The plugin's Backstage version, in `backstage.json` at its release tag, must match RHDH's;
the preface of the
[RHDH release notes](https://docs.redhat.com/en/documentation/red_hat_developer_hub/latest/html/red_hat_developer_hub_release_notes/index)
states RHDH's. Plugin 0.5.0 is built on Backstage 1.49.4, which is RHDH 1.10. If the latest
RHDH has moved past the plugin, test on the newest RHDH that matches and raise the mismatch.

## 4. Test fixtures and sign-in

The RHDH route is `backstage-developer-hub-rhdh.<apps domain>`, from the `Backstage` CR
name and namespace. `make remote-setup` creates the demo and MCP fixtures, deploys Dex for
the five test personas, and adds the OIDC, persona and RBAC configuration for it to the
`Backstage` CR, then waits for RHDH to restart. The RBAC policy and personas come from the
plugin's release tag:

```bash
PLUGIN_TAG=v0.5.0   # the plugin version in the release candidate
release=$(mktemp -d)
git show $PLUGIN_TAG:rbac-policy.csv > $release/rbac-policy.csv
git show $PLUGIN_TAG:catalog-entities/kuadrant-users.yaml > $release/kuadrant-users.yaml
BASE_URL=https://backstage-developer-hub-rhdh.$(oc get ingresses.config.openshift.io cluster -o jsonpath='{.spec.domain}')
make remote-setup BASE_URL=$BASE_URL \
  RBAC_POLICY=$release/rbac-policy.csv CATALOG_USERS=$release/kuadrant-users.yaml
```

Until teardown, anyone who can reach RHDH can sign in as a test persona, including the
RBAC super user. If the checkout already records a run on another cluster, set
`E2E_REMOTE_STATE_DIR` per cluster. The harness is described in "Running against a
deployed Backstage" and "Preparing RHDH on OpenShift" in `docs/e2e-testing.md`, currently
in [#397](https://github.com/Kuadrant/kuadrant-backstage-plugin/pull/397/files#diff-dfba8a062cf9475f2bf84e324e824db223b976cd19e83970d908027a01d50690).

## 5. Run the suite

```bash
make e2e-deps
make e2e-remote BASE_URL=$BASE_URL
```

Record the OCP version, RHCL CSV, RHDH version and plugin image digest with the result.

| Release | OCP | RHCL CSV | RHDH | Plugin image | Result |
|-|-|-|-|-|-|
| 1.5.0 RC3 | 4.22.16 | `rhcl-operator.v1.5.0` | 1.10.5 | `rhcl-rhdh-dynamic-plugin-rhel9:0.5.0` (`sha256:1e2c17a0ad8e`) | 99 of 99 passed, with the spec fixes in #397 |

## Where the RHCL docs lag the plugin

As of the 1.5.0 RC3 pre-release docs
([`rhdh-plugin-installation.adoc`](https://github.com/openshift/openshift-docs/blob/rhcl-docs-main/develop/rhdh-plugin-installation.adoc)
on `rhcl-docs-main`; GA 1.4:
[Use the Red Hat Developer Hub plugin](https://docs.redhat.com/en/documentation/red_hat_connectivity_link/1.4/html/develop_apis_with_the_web_console/use-the-red-hat-developer-hub-plugin)):

- The image refs are `registry.redhat.io/rhdh/kuadrant-backstage-plugin-{backend,frontend}-dynamic-rhel9:bs_1.4__v0.2.1`.
  The product image is `rhcl-1/rhcl-rhdh-dynamic-plugin-rhel9`, tagged `0.5.0` and
  `rhcl-1.5`, with no `bs_` tag.
- RHDH 1.10 serves only `rhdh.redhat.com/v1alpha4` and `v1alpha5` for the `Backstage` CR;
  the docs link the v1alpha3 types.
- The frontend config has no gateway or MCP routes, MCP menu items or overview access card.
  `dynamic-plugins.yaml` here carries the 0.5.0 config from `oinc/setup-rhdh.sh`.
- The RBAC CSV lacks the gateway, MCP and MCP inspector permissions, and the ClusterRole
  lacks the `mcp.kuadrant.io` rules that `plugin-rbac.yaml` adds.
- `automountServiceAccountToken: true` is marked optional but is required: with no
  `kubernetes:` config the backend uses in-cluster credentials.
- `APIProduct` in `catalog.rules` does nothing; products sync as `API` entities.

## Cleanup

`make remote-teardown` removes the e2e configuration from the `Backstage` CR and waits for
RHDH to drop it, then removes the fixtures and Dex, deleting MCP resources before their
namespaces. Then:

```bash
oc delete -f docs/release-testing/backstage.yaml
oc delete namespace rhdh
oc delete -f docs/release-testing/plugin-rbac.yaml
oc delete -f docs/release-testing/rhdh-operator.yaml   # its namespace takes the CSV with it
```

Leave out the last command if step 3 used an operator that was already on the cluster. The
`backstages.rhdh.redhat.com` CRD stays either way, as OLM leaves an uninstalled operator's
CRDs: deleting it deletes every `Backstage` on the cluster, in every namespace.

On a cluster you created for the test, also remove RHCL (`helm uninstall kuadrant-instances`
then `helm uninstall kuadrant-operators`), the mirrors and the pull secret entries, or
delete the cluster. If you keep it, remove the CRD too once no `Backstage` is left, as
`oc get backstages.rhdh.redhat.com -A` shows: `oc delete crd backstages.rhdh.redhat.com`.

## Known issues

- RHCL 1.5.0 RC3: deleting a namespace that still holds an `MCPGatewayExtension` hangs. The
  MCP Gateway controller tries to create `mcp-gateway-config` in the terminating namespace
  and never removes `mcp.kuadrant.io/finalizer`. Delete MCP resources before their
  namespace, as `make remote-teardown` does.

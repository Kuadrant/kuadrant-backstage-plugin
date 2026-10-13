import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
// backstage's own parser, for files the backend reads
import YAML from "yaml";
import { backstageOrigin } from "./origin.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const stateDir =
  process.env.E2E_REMOTE_STATE_DIR || path.join(root, ".e2e-remote");
const stateFile = path.join(stateDir, "state.json");
const namespace = "kuadrant-backstage-e2e";
const ownerLabel = "kuadrant.io/backstage-e2e-run";
const mcpAPIs = [
  "mcpserverregistrations.mcp.kuadrant.io",
  "mcpgatewayextensions.mcp.kuadrant.io",
];
const backstageAPI = "backstages.rhdh.redhat.com";
// configmaps setup adds to the rhdh instance at BASE_URL
const appConfigMap = "kuadrant-e2e-app-config";
const filesConfigMap = "kuadrant-e2e-files";
const rhdhConfigMaps = [appConfigMap, filesConfigMap];
// a directory of its own, so the files cannot replace the instance's
const rhdhFiles = "/opt/app-root/src/kuadrant-e2e";
const backendContainer = "backstage-backend";
// resolved against the file they sit in, so a copy cannot carry them
const directives = ["$include", "$file"];
// app-config variables outrank every file, the e2e one included
const locationVariables = [
  "APP_CONFIG_catalog",
  "APP_CONFIG_catalog_locations",
];
const [testAuth] = readYaml("kuadrant-dev-setup/rhdh-auth.yaml");
const authEnvironment = testAuth.auth.environment;
let context;

function run(command, args, { raw, ...options } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed`);
  return raw ? result.stdout : result.stdout?.trim();
}

function kube(args, options) {
  return run(
    "kubectl",
    ["--context", context, "--request-timeout=30s", ...args],
    options,
  );
}

function get(resource, name, ns) {
  const output = kube([
    "get",
    resource,
    name,
    ...(ns ? ["-n", ns] : []),
    "--ignore-not-found",
    "-o",
    "json",
  ]);
  return output ? JSON.parse(output) : undefined;
}

function list(resource, ...selectors) {
  return JSON.parse(kube(["get", resource, ...selectors, "-o", "json"])).items;
}

// polls find until it finds nothing, and returns what it last found
async function until(attempts, find) {
  let found;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await sleep(2000);
    found = find();
    if (!found) return undefined;
  }
  return found;
}

function readYaml(file) {
  return yaml
    .loadAll(fs.readFileSync(path.join(root, file), "utf8"))
    .filter(Boolean);
}

function fixtures() {
  const resources = [
    ...readYaml("kuadrant-dev-setup/demo/toystore-demo.yaml"),
    ...readYaml("kuadrant-dev-setup/demo/gamestore-demo.yaml"),
    ...readYaml("kuadrant-dev-setup/demo/additional-demos.yaml"),
    ...readYaml("e2e-tests/remote/mcp-gateway.yaml"),
    ...readYaml("oinc/manifests/mcp-demo.yaml"),
  ];
  const namespaces = new Map(
    resources
      .filter((r) => r.kind === "Namespace")
      .map((r) => [r.metadata.name, r]),
  );
  namespaces.set(namespace, {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: namespace },
  });
  // Own the namespaces where the UI creates keys for the Dex personas.
  const [dex] = readYaml("kuadrant-dev-setup/dex/config.yaml");
  for (const { username } of dex.staticPasswords) {
    const hash = createHash("sha256")
      .update(`user:default/${username}`)
      .digest("hex")
      .slice(0, 8);
    const name = `kuadrant-${username}-${hash}`;
    namespaces.set(name, {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name,
        labels: { "devportal.kuadrant.io/consumer-namespace": "true" },
      },
    });
  }
  const namespaced = resources.filter((r) => r.kind !== "Namespace");
  for (const resource of namespaced) {
    if (resource.metadata.namespace === "gateway-system")
      resource.metadata.namespace = namespace;
    for (const parent of resource.spec?.parentRefs || []) {
      if (
        parent.name === "mcp-gateway" &&
        parent.namespace === "gateway-system"
      )
        parent.namespace = namespace;
    }
  }
  return { roots: [...namespaces.values()], namespaced };
}

function ingressDomain() {
  const domain = get("ingresses.config.openshift.io", "cluster")?.spec?.domain;
  if (!domain)
    throw new Error(
      "Cannot read the cluster ingress domain from ingresses.config.openshift.io/cluster",
    );
  return domain;
}

function dexFixtures(origin, domain) {
  const host = `dex-${namespace}.${domain}`;
  const issuer = `https://${host}`;
  const [config] = readYaml("kuadrant-dev-setup/dex/config.yaml");
  config.issuer = issuer;
  const client = config.staticClients.find((c) => c.id === "backstage");
  client.redirectURIs.push(`${origin}/api/auth/oidc/handler/frame`);
  const manifests = readYaml("oinc/manifests/dex.yaml");
  for (const resource of manifests) resource.metadata.namespace = namespace;
  const route = manifests.find((r) => r.kind === "Route");
  route.spec.host = host;
  route.spec.tls = {
    termination: "edge",
    insecureEdgeTerminationPolicy: "Redirect",
  };
  const configMap = (name, data) => ({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name, namespace },
    data,
  });
  const template = path.join(
    root,
    "kuadrant-dev-setup/dex/web/templates/password.html",
  );
  return {
    issuer,
    client,
    resources: [
      configMap("dex-config", {
        "config.yaml": yaml.dump(config, { lineWidth: -1 }),
      }),
      configMap("dex-web", {
        "password.html": fs.readFileSync(template, "utf8"),
      }),
      ...manifests,
    ],
  };
}

async function checkIssuer(issuer) {
  const url = `${issuer}/.well-known/openid-configuration`;
  let status;
  for (let attempt = 0; attempt < 30; attempt++) {
    // the router answers 503 until it routes to the new dex endpoints
    if (attempt) await sleep(2000);
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (error) {
      console.warn(
        `warning: cannot fetch ${url} from this machine: ${error.cause?.message || error.message}. RHDH must trust the cluster's ingress CA to reach Dex, for example through NODE_EXTRA_CA_CERTS.`,
      );
      return;
    }
    if (response.ok) {
      const discovery = await response.json().catch(() => ({}));
      if (discovery.issuer !== issuer)
        throw new Error(
          `${url} reports issuer ${discovery.issuer ?? "none"}, expected ${issuer}`,
        );
      console.log(`Verified: Dex serves issuer ${issuer}.`);
      return;
    }
    status = response.status;
  }
  throw new Error(
    `${url} still returns HTTP ${status}; check route dex in namespace ${namespace}`,
  );
}

function rhdhAppConfig(issuer, client, locations) {
  const config = structuredClone(testAuth);
  config.auth.session = { secret: randomBytes(32).toString("hex") };
  Object.assign(config.auth.providers.oidc[authEnvironment], {
    metadataUrl: `${issuer}/.well-known/openid-configuration`,
    clientId: client.id,
    clientSecret: client.secret,
  });
  config.catalog = {
    // An array replaces the instance's, so repeat its existing locations.
    locations: [
      ...locations,
      {
        type: "file",
        target: `${rhdhFiles}/kuadrant-users.yaml`,
        rules: [{ allow: ["User", "Group"] }],
      },
    ],
  };
  config.permission.rbac["policies-csv-file"] = `${rhdhFiles}/rbac-policy.csv`;
  return config;
}

function rhdhFileData() {
  const read = (variable, fallback) => {
    try {
      return fs.readFileSync(
        path.resolve(process.env[variable] || path.join(root, fallback)),
        "utf8",
      );
    } catch (error) {
      throw new Error(`Cannot read ${variable}: ${error.message}`);
    }
  };
  return {
    "kuadrant-users.yaml": read(
      "CATALOG_USERS",
      "catalog-entities/kuadrant-users.yaml",
    ),
    "rbac-policy.csv": read("RBAC_POLICY", "rbac-policy.csv"),
  };
}

// configmaps a backstage cr mounts as app-config or extra files
function references(backstage) {
  const application = backstage.spec?.application;
  return ["appConfig", "extraFiles"].flatMap((field) =>
    (application?.[field]?.configMaps || []).map((ref) => ref.name),
  );
}

const isObject = (value) => value !== null && typeof value === "object";
const isMap = (value) => isObject(value) && !Array.isArray(value);
const directed = (value) =>
  isObject(value) && directives.some((key) => Object.hasOwn(value, key));
const directedWithin = (value) =>
  directed(value) ||
  (isObject(value) && Object.values(value).some(directedWithin));

// a ready pod of a finished rollout, so its files are the ones the backend loaded
function backendPod(id, deployment) {
  const { name, namespace: ns, generation } = deployment.metadata;
  const status = deployment.status || {};
  const replicas = deployment.spec.replicas ?? 1;
  const selector = Object.entries(deployment.spec.selector?.matchLabels || {})
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  const pod =
    replicas > 0 &&
    status.observedGeneration >= generation &&
    [status.replicas, status.updatedReplicas, status.availableReplicas].every(
      (count) => count === replicas,
    ) &&
    selector &&
    list("pods", "-n", ns, "-l", selector).find(
      (candidate) =>
        !candidate.metadata.deletionTimestamp &&
        candidate.status?.conditions?.some(
          (condition) =>
            condition.type === "Ready" && condition.status === "True",
        ),
    );
  if (!pod)
    throw new Error(
      `Deployment ${ns}/${name} has no ready pod from a finished rollout; setup reads Backstage ${id}'s catalog locations from one, so retry once RHDH is up`,
    );
  return pod.metadata.name;
}

// the catalog.locations the backend loaded, resolved as backstage does: the
// last --config file to set them wins and null removes them
function catalogLocations(id, deployment) {
  const ns = deployment.metadata.namespace;
  const pod = backendPod(id, deployment);
  const exec = (...command) => {
    try {
      return kube(
        ["exec", pod, "-n", ns, "-c", backendContainer, "--", ...command],
        { raw: true, maxBuffer: 64 * 1024 * 1024 },
      );
    } catch (error) {
      throw new Error(
        `Cannot run ${command.join(" ")} in pod ${ns}/${pod}: ${error.code || "see the kubectl error above"}`,
      );
    }
  };
  // names only, so no value leaves the pod
  const overrides = exec(
    "sh",
    "-c",
    `echo ${locationVariables.map((name) => `\${${name}:+${name}}`).join(" ")}`,
  )
    .split(/\s+/)
    .filter(Boolean);
  if (overrides.length)
    throw new Error(
      `Backstage ${id} sets ${overrides.join(" and ")}, which can override the catalog locations setup adds`,
    );
  const argv = exec("cat", "/proc/1/cmdline").split("\0");
  const files = argv
    .map((arg, index) =>
      arg === "--config"
        ? argv[index + 1]
        : arg.startsWith("--config=") && arg.slice("--config=".length),
    )
    .filter(Boolean);
  if (!files.length)
    throw new Error(
      `Backstage ${id} runs ${argv[0] || "a backend"} without --config files; setup cannot tell which catalog locations to keep`,
    );
  if (files.some((file) => path.basename(file) === `${appConfigMap}.yaml`))
    throw new Error(
      `Pod ${ns}/${pod} still runs with ${appConfigMap}; wait for RHDH to restart without it, or run make remote-teardown`,
    );
  let locations = [];
  for (const file of files) {
    if (/^https?:/.test(file))
      throw new Error(
        `Backstage ${id} loads configuration from ${file}; setup cannot read its catalog locations`,
      );
    const text = exec("cat", file);
    let config;
    try {
      // without warnings, which quote the file
      config = YAML.parse(text, { logLevel: "error" }) ?? {};
    } catch (error) {
      // past its first line, the message quotes the file
      throw new Error(
        `Cannot parse ${file} from Backstage ${id}: ${error.message.split("\n")[0]}`,
      );
    }
    if (
      directed(config) ||
      directed(config.catalog) ||
      directedWithin(config.catalog?.locations)
    )
      throw new Error(
        `${file} in Backstage ${id} sets catalog locations through ${directives.join(" or ")}, which setup cannot copy`,
      );
    if (config.catalog === null) locations = [];
    else if (
      isMap(config.catalog) &&
      Object.hasOwn(config.catalog, "locations")
    ) {
      const value = config.catalog.locations ?? [];
      if (!Array.isArray(value) || !value.every(isMap))
        throw new Error(
          `${file} in Backstage ${id} sets catalog.locations to something other than a list of locations, which setup cannot copy`,
        );
      locations = value;
    }
  }
  return locations;
}

// the rhdh operator instance whose route serves BASE_URL
function findBackstage(origin) {
  if (!get("crd", backstageAPI))
    throw new Error(
      `BASE_URL must be served by an RHDH operator Backstage instance; the cluster has no ${backstageAPI} API`,
    );
  const host = new URL(origin).hostname;
  const owners = list("routes.route.openshift.io", "-A")
    .filter((route) => route.spec?.host === host)
    .flatMap((route) =>
      (route.metadata.ownerReferences || [])
        .filter(
          (owner) =>
            owner.kind === "Backstage" &&
            owner.apiVersion.startsWith("rhdh.redhat.com/"),
        )
        .map((owner) => ({ ...owner, namespace: route.metadata.namespace })),
    );
  if (owners.length !== 1)
    throw new Error(
      `No RHDH Backstage instance serves ${host}; BASE_URL must be the route of a Backstage CR managed by the RHDH operator`,
    );
  const [owner] = owners;
  const id = `${owner.namespace}/${owner.name}`;
  const backstage = get(backstageAPI, owner.name, owner.namespace);
  if (backstage?.metadata.uid !== owner.uid)
    throw new Error(`Backstage ${id} no longer owns the route for ${host}`);
  for (const name of references(backstage)) {
    if (rhdhConfigMaps.includes(name))
      throw new Error(
        `Backstage ${id} already references ${name}; remove it from the CR before setup`,
      );
  }
  for (const name of rhdhConfigMaps) {
    if (get("configmap", name, owner.namespace))
      throw new Error(
        `ConfigMap ${owner.namespace}/${name} already exists; refusing to overwrite it. If the checkout's state was lost, run make remote-teardown`,
      );
  }
  const deployment = `backstage-${owner.name}`;
  const live = get("deployment", deployment, owner.namespace);
  if (!live)
    throw new Error(
      `Backstage ${id} has no deployment ${deployment}; check the RHDH operator`,
    );
  return { backstage, deployment, locations: catalogLocations(id, live) };
}

function addReferences(backstage) {
  const ops = [
    // generation moves with the spec only, not with the operator's status writes
    {
      op: "test",
      path: "/metadata/generation",
      value: backstage.metadata.generation,
    },
  ];
  if (!backstage.spec) ops.push({ op: "add", path: "/spec", value: {} });
  const application = backstage.spec?.application;
  if (!application)
    ops.push({ op: "add", path: "/spec/application", value: {} });
  for (const [field, ref] of [
    // appended, so the e2e app-config merges last
    ["appConfig", { name: appConfigMap }],
    ["extraFiles", { name: filesConfigMap, mountPath: rhdhFiles }],
  ]) {
    const at = `/spec/application/${field}`;
    if (!application?.[field])
      ops.push({ op: "add", path: at, value: { configMaps: [ref] } });
    else if (!application[field].configMaps)
      ops.push({ op: "add", path: `${at}/configMaps`, value: [ref] });
    else ops.push({ op: "add", path: `${at}/configMaps/-`, value: ref });
  }
  return ops;
}

function removeReferences(backstage) {
  const ops = [
    {
      op: "test",
      path: "/metadata/generation",
      value: backstage.metadata.generation,
    },
  ];
  for (const field of ["appConfig", "extraFiles"]) {
    const refs = backstage.spec.application[field]?.configMaps || [];
    // highest index first, so the others stay valid
    for (let index = refs.length - 1; index >= 0; index--) {
      if (rhdhConfigMaps.includes(refs[index].name))
        ops.push({
          op: "remove",
          path: `/spec/application/${field}/configMaps/${index}`,
        });
    }
  }
  return ops;
}

function patchBackstage(backstage, ops) {
  const { name, namespace: ns } = backstage.metadata;
  try {
    kube([
      "patch",
      backstageAPI,
      name,
      "-n",
      ns,
      "--type=json",
      "-p",
      JSON.stringify(ops),
    ]);
  } catch {
    throw new Error(
      `Cannot patch Backstage ${ns}/${name}; see the kubectl error above. A spec change since it was read also fails the patch`,
    );
  }
}

// rhdh starts sign-in by redirecting to the issuer its configuration names
async function checkSignIn(origin, issuer) {
  const url = `${origin}/api/auth/oidc/start?env=${authEnvironment}`;
  let status;
  for (let attempt = 0; attempt < 30; attempt++) {
    // the route can still reach a pod from before the restart
    if (attempt) await sleep(2000);
    let response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.warn(
        `warning: cannot fetch ${url} from this machine: ${error.cause?.message || error.message}. RHDH sign-in was not verified.`,
      );
      return;
    }
    if (response.headers.get("location")?.startsWith(`${issuer}/`)) {
      console.log(`Verified: ${origin} sends sign-in to Dex.`);
      return;
    }
    status = response.status;
  }
  throw new Error(
    `${url} returns HTTP ${status}, not a redirect to ${issuer}. RHDH must trust the cluster's ingress CA to reach Dex, for example through NODE_EXTRA_CA_CERTS`,
  );
}

async function configureRhdh(state, rhdh, origin, dex, files) {
  const { name, namespace: ns } = rhdh.backstage.metadata;
  for (const [configMap, data] of [
    [
      appConfigMap,
      {
        [`${appConfigMap}.yaml`]: yaml.dump(
          rhdhAppConfig(dex.issuer, dex.client, rhdh.locations),
          { lineWidth: -1 },
        ),
      },
    ],
    [filesConfigMap, files],
  ]) {
    // record intent before creating, so an interrupted setup remains cleanable
    state.configMaps.push({
      kind: "ConfigMap",
      metadata: { name: configMap, namespace: ns },
    });
    save(state);
    const created = JSON.parse(
      kube(["create", "-f", "-", "-o", "json"], {
        input: JSON.stringify({
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: configMap,
            namespace: ns,
            labels: { [ownerLabel]: state.runID },
          },
          data,
        }),
      }),
    );
    state.configMaps.at(-1).metadata.uid = created.metadata.uid;
    save(state);
    console.log(`Created ConfigMap/${configMap} in namespace ${ns}`);
  }
  patchBackstage(rhdh.backstage, addReferences(rhdh.backstage));
  console.log(`Added the e2e configuration to Backstage ${ns}/${name}`);
  try {
    // until the operator renders the cr, rollout status reports the old deployment
    const unrendered = await until(60, () => {
      const pod = get("deployment", rhdh.deployment, ns)?.spec.template.spec;
      const mounted = (pod?.volumes || []).map((v) => v.configMap?.name);
      return !(
        rhdhConfigMaps.every((cm) => mounted.includes(cm)) &&
        pod.containers.some((c) =>
          c.volumeMounts?.some((m) => m.mountPath === rhdhFiles),
        )
      );
    });
    if (unrendered)
      throw new Error(
        `Deployment ${ns}/${rhdh.deployment} does not mount the e2e ConfigMaps at ${rhdhFiles}; check the RHDH operator`,
      );
    kube(
      [
        "rollout",
        "status",
        `deployment/${rhdh.deployment}`,
        "-n",
        ns,
        "--timeout=15m",
      ],
      { stdio: "inherit" },
    );
    await checkSignIn(origin, dex.issuer);
  } catch (error) {
    throw new Error(
      `${error.message}. Backstage ${ns}/${name} keeps the e2e configuration until make remote-teardown`,
    );
  }
}

// waits until no pod in the namespace runs with this run's configmaps
async function release(ns, configMaps) {
  const mounted = (pod) =>
    (pod.volumes || [])
      .map((volume) => volume.configMap?.name)
      .filter((name) => configMaps.includes(name));
  // the operator re-renders each deployment first; a stopped operator fails here, not in the pod wait
  const deployment = await until(60, () =>
    list("deployments", "-n", ns).find(
      (d) => mounted(d.spec.template.spec).length,
    ),
  );
  if (deployment)
    throw new Error(
      `Deployment ${ns}/${deployment.metadata.name} still mounts ${mounted(deployment.spec.template.spec).join(", ")}; check the RHDH operator before retrying make remote-teardown`,
    );
  const pod = await until(450, () =>
    list("pods", "-n", ns).find(
      (p) =>
        !["Succeeded", "Failed"].includes(p.status?.phase) &&
        mounted(p.spec).length,
    ),
  );
  if (pod)
    throw new Error(
      `Pod ${ns}/${pod.metadata.name} still runs with ${mounted(pod.spec).join(", ")}; check its rollout before retrying make remote-teardown`,
    );
  console.log(`No pod in namespace ${ns} uses the e2e configuration.`);
}

function save(state) {
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(`${stateFile}.tmp`, stateFile);
}

function identity() {
  const config = JSON.parse(kube(["config", "view", "--minify", "-o", "json"]));
  const system = get("namespace", "kube-system");
  if (!system)
    throw new Error("Cannot identify the cluster's kube-system namespace");
  return {
    server: config.clusters[0].cluster.server,
    clusterUID: system.metadata.uid,
  };
}

function load() {
  if (!fs.existsSync(stateFile))
    throw new Error(
      "No remote setup recorded; run make remote-setup. If fixtures remain from a lost checkout, run make remote-teardown first",
    );
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  context = run("kubectl", ["config", "current-context"]);
  const current = identity();
  if (
    context !== state.context ||
    current.server !== state.server ||
    current.clusterUID !== state.clusterUID
  ) {
    throw new Error(
      `Select the setup context '${state.context}' and its original cluster before continuing`,
    );
  }
  return state;
}

function assertOwned(state, resource) {
  const live = get(
    resource.kind,
    resource.metadata.name,
    resource.metadata.namespace,
  );
  if (
    live &&
    (live.metadata.labels?.[ownerLabel] !== state.runID ||
      (resource.metadata.uid && live.metadata.uid !== resource.metadata.uid))
  ) {
    throw new Error(
      `Refusing to touch replaced or unowned ${resource.kind}/${resource.metadata.name}`,
    );
  }
  return live;
}

async function setup() {
  const origin = process.env.BASE_URL
    ? backstageOrigin(process.env.BASE_URL)
    : undefined;
  if (fs.existsSync(stateDir))
    throw new Error(
      "Remote setup already recorded; use make remote-teardown before another setup",
    );
  context = run("kubectl", ["config", "current-context"]);
  const cluster = identity();
  const version = get("clusterversion", "version")?.status?.desired?.version;
  if (!version) throw new Error("An existing OpenShift cluster is required");
  console.log(
    `Preparing fixtures on ${cluster.server} (OpenShift ${version}, context ${context})`,
  );
  const kuadrants = JSON.parse(
    kube(["get", "kuadrants.kuadrant.io", "-A", "-o", "json"]),
  );
  if (
    !kuadrants.items.some(
      (k) => k.spec?.components?.developerPortal?.enabled === true,
    )
  ) {
    throw new Error(
      "The installed Kuadrant must already have spec.components.developerPortal.enabled=true",
    );
  }
  for (const name of [
    "apiproducts.devportal.kuadrant.io",
    "apikeys.devportal.kuadrant.io",
    "apikeyrequests.devportal.kuadrant.io",
    "apikeyapprovals.devportal.kuadrant.io",
    "planpolicies.extensions.kuadrant.io",
    "authpolicies.kuadrant.io",
    "ratelimitpolicies.kuadrant.io",
    "gateways.gateway.networking.k8s.io",
    "httproutes.gateway.networking.k8s.io",
    ...mcpAPIs,
  ]) {
    if (!get("crd", name)) throw new Error(`Required CRD missing: ${name}`);
  }
  kube([
    "wait",
    "gatewayclass/istio",
    "--for=condition=Accepted=True",
    "--timeout=30s",
  ]);
  const { roots, namespaced } = fixtures();
  const dex = origin && dexFixtures(origin, ingressDomain());
  if (dex) {
    namespaced.push(...dex.resources);
    console.log(`Dex for ${origin}: ${dex.issuer}`);
  }
  for (const resource of roots) {
    if (get(resource.kind, resource.metadata.name)) {
      throw new Error(
        `Fixture ${resource.kind}/${resource.metadata.name} already exists; refusing to overwrite it. If the checkout's state was lost, run make remote-teardown`,
      );
    }
  }
  const rhdh = origin && findBackstage(origin);
  const files = origin && rhdhFileData();
  const state = {
    ...cluster,
    context,
    version,
    runID: randomUUID(),
    roots: [],
    configMaps: [],
  };
  fs.mkdirSync(stateDir, { mode: 0o700 });
  save(state);
  for (const resource of [...roots, ...namespaced]) {
    resource.metadata.labels = {
      ...resource.metadata.labels,
      [ownerLabel]: state.runID,
    };
    if (!resource.metadata.namespace) {
      // Record intent before creating, so interrupted setup remains cleanable.
      state.roots.push(resource);
      save(state);
    }
    const created = JSON.parse(
      kube(["create", "-f", "-", "-o", "json"], {
        input: JSON.stringify(resource),
      }),
    );
    if (!resource.metadata.namespace) {
      resource.metadata.uid = created.metadata.uid;
      save(state);
    }
    console.log(`Created ${resource.kind}/${resource.metadata.name}`);
  }
  for (const resource of namespaced.filter((r) => r.kind === "Gateway")) {
    kube(
      [
        "wait",
        `gateway/${resource.metadata.name}`,
        "-n",
        resource.metadata.namespace,
        "--for=condition=Programmed=True",
        "--timeout=300s",
      ],
      { stdio: "inherit" },
    );
  }
  if (dex) {
    kube(
      [
        "rollout",
        "status",
        "deployment/dex",
        "-n",
        namespace,
        "--timeout=180s",
      ],
      { stdio: "inherit" },
    );
    await checkIssuer(dex.issuer);
    await configureRhdh(state, rhdh, origin, dex, files);
  }
  save(state);
  if (rhdh) {
    const { name, namespace: ns } = rhdh.backstage.metadata;
    console.log(
      `Fixtures ready. Backstage ${ns}/${name} signs in through Dex until make remote-teardown. Run make e2e-remote BASE_URL=${origin}.`,
    );
  } else {
    console.log(
      "Fixtures ready. Run make e2e-remote BASE_URL=<Backstage origin> against your configured deployment.",
    );
  }
}

function recover() {
  context = run("kubectl", ["config", "current-context"]);
  const state = {
    ...identity(),
    context,
    roots: [],
    configMaps: [],
  };
  const claim = (runID) => {
    if (state.runID && state.runID !== runID)
      throw new Error("Fixtures belong to different runs; refusing recovery");
    state.runID = runID;
  };
  for (const resource of fixtures().roots) {
    const live = get(resource.kind, resource.metadata.name);
    if (!live) continue;
    const runID = live.metadata.labels?.[ownerLabel];
    if (!runID || !live.metadata.uid)
      throw new Error(
        `Cannot recover unowned ${resource.kind}/${resource.metadata.name}`,
      );
    claim(runID);
    state.roots.push({
      kind: resource.kind,
      metadata: { name: resource.metadata.name, uid: live.metadata.uid },
    });
  }
  for (const live of list("configmaps", "-A", "-l", ownerLabel)) {
    if (!rhdhConfigMaps.includes(live.metadata.name)) continue;
    claim(live.metadata.labels[ownerLabel]);
    const { name, namespace: ns, uid } = live.metadata;
    state.configMaps.push({
      kind: "ConfigMap",
      metadata: { name, namespace: ns, uid },
    });
  }
  if (!state.roots.length && !state.configMaps.length)
    throw new Error("No remote fixtures found; run make remote-setup");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  save(state);
  console.log(
    `Recovered cleanup record for run ${state.runID} on ${state.server}.`,
  );
  return state;
}

async function teardown(state) {
  // Validate the entire inventory before deleting anything.
  for (const resource of state.roots) assertOwned(state, resource);
  const configMaps = (state.configMaps || []).filter((resource) =>
    assertOwned(state, resource),
  );
  const owned = configMaps.map(
    ({ metadata }) => `${metadata.namespace}/${metadata.name}`,
  );
  const configured = [];
  for (const backstage of get("crd", backstageAPI)
    ? list(backstageAPI, "-A")
    : []) {
    const { name, namespace: ns } = backstage.metadata;
    const refs = references(backstage).filter((ref) =>
      rhdhConfigMaps.includes(ref),
    );
    for (const ref of refs) {
      if (!owned.includes(`${ns}/${ref}`))
        throw new Error(
          `Backstage ${ns}/${name} references ConfigMap ${ref}, which this run did not create; remove it from the CR and wait for RHDH to restart before make remote-teardown`,
        );
    }
    if (refs.length) configured.push(backstage);
  }
  // rhdh must drop dex first, or whoever claims dex's route host can sign in
  for (const backstage of configured) {
    patchBackstage(backstage, removeReferences(backstage));
    const { name, namespace: ns } = backstage.metadata;
    console.log(`Removed the e2e configuration from Backstage ${ns}/${name}`);
  }
  for (const ns of new Set(configMaps.map((cm) => cm.metadata.namespace))) {
    await release(
      ns,
      configMaps
        .filter((cm) => cm.metadata.namespace === ns)
        .map((cm) => cm.metadata.name),
    );
  }
  for (const { metadata } of configMaps) {
    kube(
      [
        "delete",
        "configmap",
        metadata.name,
        "-n",
        metadata.namespace,
        "--ignore-not-found",
        "--timeout=180s",
      ],
      { stdio: "inherit" },
    );
  }
  // the mcp controller cannot remove its finalizers once the namespace is terminating
  const mcp = mcpAPIs.filter((crd) => get("crd", crd));
  if (mcp.length) {
    for (const resource of state.roots.filter((r) => r.kind === "Namespace")) {
      const deleted = kube([
        "delete",
        mcp.join(","),
        "-n",
        resource.metadata.name,
        "-l",
        `${ownerLabel}=${state.runID}`,
        "--ignore-not-found",
        "--timeout=120s",
      ]);
      if (deleted !== "No resources found") console.log(deleted);
    }
  }
  for (const resource of [...state.roots].reverse()) {
    kube(
      [
        "delete",
        resource.kind,
        resource.metadata.name,
        "--ignore-not-found",
        "--timeout=180s",
      ],
      { stdio: "inherit" },
    );
  }
  fs.rmSync(stateDir, { recursive: true });
  console.log(
    "Removed this run's fixtures; existing cluster and installed operators retained.",
  );
}

try {
  const action = process.argv[2];
  if (action === "setup") {
    await setup();
  } else if (action === "teardown") {
    await teardown(fs.existsSync(stateFile) ? load() : recover());
  } else {
    throw new Error("Usage: cluster.mjs setup|teardown");
  }
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}

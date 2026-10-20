import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import yaml from "js-yaml";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const dexConfig = yaml.load(
  fs.readFileSync(
    path.join(repo, "kuadrant-dev-setup/dex/config.yaml"),
    "utf8",
  ),
);
const deployed = "https://rhdh.example.com";
const issuer = "https://dex-kuadrant-backstage-e2e.apps.release-test.example";
const backstage = "backstage/rhdh/developer-hub";
const rhdhFiles = "/opt/app-root/src/kuadrant-e2e";
const personas = {
  type: "file",
  target: `${rhdhFiles}/kuadrant-users.yaml`,
  rules: [{ allow: ["User", "Group"] }],
};
// the catalog location rhdh's image ships
const shipped = { type: "file", target: "../../catalog-entities/all.yaml" };
const backendLabels = { "rhdh.redhat.com/app": "backstage-developer-hub" };

// an rhdh operator instance serving `deployed`, rendered as the operator would
function rhdh() {
  const owner = {
    apiVersion: "rhdh.redhat.com/v1alpha5",
    kind: "Backstage",
    name: "developer-hub",
    uid: "developer-hub-uid",
    controller: true,
  };
  const metadata = (name) => ({
    name,
    namespace: "rhdh",
    ownerReferences: [owner],
  });
  const configMap = (name, data) => ({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name, namespace: "rhdh" },
    data,
  });
  return {
    [backstage]: {
      apiVersion: "rhdh.redhat.com/v1alpha5",
      kind: "Backstage",
      metadata: {
        name: "developer-hub",
        namespace: "rhdh",
        uid: "developer-hub-uid",
        resourceVersion: "1",
        generation: 1,
      },
      spec: {
        application: {
          dynamicPluginsConfigMapName: "dynamic-plugins-rhdh",
          appConfig: {
            mountPath: "/opt/app-root/src",
            configMaps: [{ name: "rhdh-app-config" }],
          },
          extraFiles: {
            mountPath: "/opt/app-root/etc",
            configMaps: [{ name: "rbac-policies" }],
          },
        },
      },
    },
    "route/rhdh/backstage-developer-hub": {
      apiVersion: "route.openshift.io/v1",
      kind: "Route",
      metadata: metadata("backstage-developer-hub"),
      spec: { host: "rhdh.example.com" },
    },
    "deployment/rhdh/backstage-developer-hub": {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { ...metadata("backstage-developer-hub"), generation: 1 },
      spec: {
        replicas: 1,
        selector: { matchLabels: backendLabels },
        template: {
          metadata: { labels: backendLabels },
          spec: {
            volumes: [
              {
                name: "rhdh-app-config",
                configMap: { name: "rhdh-app-config" },
              },
              { name: "rbac-policies", configMap: { name: "rbac-policies" } },
            ],
            containers: [
              {
                name: "backstage-backend",
                args: [
                  "--config",
                  "dynamic-plugins-root/app-config.dynamic-plugins.yaml",
                  "--config",
                  "/opt/app-root/src/app-config.yaml",
                ],
                volumeMounts: [
                  { name: "rhdh-app-config", mountPath: "/opt/app-root/src" },
                  { name: "rbac-policies", mountPath: "/opt/app-root/etc" },
                ],
              },
            ],
          },
        },
      },
      // rolled out
      status: {
        observedGeneration: 1,
        replicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
      },
    },
    "configmap/rhdh/rhdh-app-config": configMap("rhdh-app-config", {
      "app-config.yaml": "app:\n  title: Developer Hub\n",
    }),
    "configmap/rhdh/rbac-policies": configMap("rbac-policies", {
      "rbac-policy.csv": "g, group:default/platform, role:default/api-admin\n",
    }),
  };
}

// versions move with every patch; compare what the cr asks for
const withoutVersions = (db) =>
  Object.fromEntries(
    Object.entries(db).map(([id, obj]) => [
      id,
      obj.kind === "Backstage"
        ? {
            ...obj,
            metadata: { ...obj.metadata, resourceVersion: "", generation: 0 },
          }
        : obj,
    ]),
  );

// Component: integration. These tests use a fake kubectl and never contact a cluster.
function harness(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backstage-remote-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbFile = path.join(dir, "cluster.json");
  const logFile = path.join(dir, "commands.jsonl");
  const stateDir = path.join(dir, "state");
  const fetchMock = path.join(dir, "fetch.mjs");
  fs.writeFileSync(
    fetchMock,
    `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import timers from 'node:timers/promises';
import yaml from ${JSON.stringify(import.meta.resolve("js-yaml"))};
// retry delays elapse at once
timers.setTimeout = async () => {};
syncBuiltinESMExports();
let unavailable = Number(process.env.FAKE_DEX_UNAVAILABLE || 0);
let rhdhUnavailable = Number(process.env.FAKE_RHDH_UNAVAILABLE || 0);
globalThis.fetch = async (url, options = {}) => {
  if (url.includes('/api/auth/oidc/start')) {
    if (process.env.FAKE_RHDH_FETCH_ERROR)
      throw new TypeError('fetch failed', { cause: new Error(process.env.FAKE_RHDH_FETCH_ERROR) });
    // stands in for rhdh: sign-in goes to the issuer in the config its deployment mounts
    const db = JSON.parse(fs.readFileSync(process.env.FAKE_DB, 'utf8'));
    const route = Object.values(db).find(r => r.kind === 'Route' && r.spec.host === new URL(url).host);
    const ns = route?.metadata.namespace;
    const deployment = route && db['deployment/' + ns + '/' + route.metadata.name];
    const mounted = deployment?.spec.template.spec.volumes.some(v => v.configMap?.name === 'kuadrant-e2e-app-config');
    const headers = new Headers();
    if (process.env.FAKE_RHDH_STATUS || !mounted || rhdhUnavailable-- > 0)
      return { ok: false, status: Number(process.env.FAKE_RHDH_STATUS || 404), headers };
    const app = yaml.load(Object.values(db['configmap/' + ns + '/kuadrant-e2e-app-config'].data)[0]);
    if (new URL(url).searchParams.get('env') !== app.auth.environment) return { ok: false, status: 400, headers };
    const provider = app.auth.providers.oidc[app.auth.environment];
    // fetch would follow the redirect to the dex login page
    if (options.redirect !== 'manual') return { ok: true, status: 200, headers };
    headers.set('location', provider.metadataUrl.replace('/.well-known/openid-configuration', '/auth?client_id=' + provider.clientId));
    return { ok: false, status: 302, headers };
  }
  if (url.endsWith('/.well-known/openid-configuration')) {
    if (process.env.FAKE_DEX_FETCH_ERROR)
      throw new TypeError('fetch failed', { cause: new Error(process.env.FAKE_DEX_FETCH_ERROR) });
    // stands in for the router: the route for this host, backed by the deployed dex config
    const db = JSON.parse(fs.readFileSync(process.env.FAKE_DB, 'utf8'));
    const route = Object.values(db).find(r => r.kind === 'Route' && r.spec.host === new URL(url).host);
    if (!route || unavailable-- > 0) return { ok: false, status: 503 };
    const config = yaml.load(db['configmap/' + route.metadata.namespace + '/dex-config'].data['config.yaml']);
    return { ok: true, status: 200, json: async () => ({ issuer: process.env.FAKE_DEX_ISSUER || config.issuer }) };
  }
  throw new Error('Unexpected fetch: ' + url);
};
`,
  );
  fs.writeFileSync(dbFile, "{}");
  fs.writeFileSync(logFile, "");
  fs.writeFileSync(
    path.join(dir, "kubectl"),
    `#!${process.execPath}
const fs = require('node:fs');
let args = process.argv.slice(2);
const input = args.includes('-f') ? JSON.parse(fs.readFileSync(0, 'utf8')) : undefined;
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(input ? [...args, input.kind + '/' + input.metadata.name] : args) + '\\n');
if (args[0] === '--context') args = args.slice(3);
const db = JSON.parse(fs.readFileSync(process.env.FAKE_DB, 'utf8'));
const key = (kind, name, ns = '') => [kind.toLowerCase(), ns, name].join('/');
const missing = (process.env.FAKE_MISSING_CRD || '').split(',');
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const ns = flag('-n') || '';
const kind = (resource) => ({
  'backstages.rhdh.redhat.com': 'backstage',
  'routes.route.openshift.io': 'route',
  configmaps: 'configmap',
  deployments: 'deployment',
  pods: 'pod',
})[resource] || resource.toLowerCase();
const operatorFile = process.env.FAKE_DB + '.operator';
const operator = fs.existsSync(operatorFile) ? JSON.parse(fs.readFileSync(operatorFile, 'utf8')) : { reads: {}, running: {} };
// rhdh's entrypoint, the configuration its image ships and the dynamic plugins' one its
// init container writes, all in its working directory
const locations = 'catalog:\\n  locations:\\n    - type: file\\n      target: ../../catalog-entities/all.yaml\\n';
const image = {
  entrypoint: ['node', '--require', './instrumentation.js', 'packages/backend', '--config', 'app-config.yaml',
    '--config', 'app-config.example.yaml', '--config', 'app-config.example.production.yaml'],
  files: {
    '/opt/app-root/src/app-config.yaml': locations,
    '/opt/app-root/src/app-config.example.yaml': locations,
    '/opt/app-root/src/app-config.example.production.yaml': 'app:\\n  title: Red Hat Developer Hub\\n',
    '/opt/app-root/src/dynamic-plugins-root/app-config.dynamic-plugins.yaml': 'dynamicPlugins:\\n  frontend: {}\\n',
  },
  ...JSON.parse(process.env.FAKE_IMAGE || '{}'),
};
// stands in for the rhdh operator: after FAKE_OPERATOR_LAG reads, a deployment follows its
// backstage cr once every configmap the cr names exists
function reconcile() {
  if (process.env.FAKE_OPERATOR_STOPPED) return;
  for (const cr of Object.values(db).filter(obj => obj.kind === 'Backstage')) {
    const version = key('Backstage', cr.metadata.name, cr.metadata.namespace) + '@' + cr.metadata.resourceVersion;
    operator.reads[version] = (operator.reads[version] || 0) + 1;
    if (operator.reads[version] <= Number(process.env.FAKE_OPERATOR_LAG || 0)) continue;
    const id = key('Deployment', 'backstage-' + cr.metadata.name, cr.metadata.namespace);
    const deployment = db[id];
    const app = cr.spec?.application || {};
    const refs = ['appConfig', 'extraFiles'].flatMap(field =>
      (app[field]?.configMaps || []).map(ref => ({ ...ref, field, shared: app[field].mountPath || '/opt/app-root/src' })));
    if (!deployment || refs.some(ref => !db[key('ConfigMap', ref.name, cr.metadata.namespace)])) continue;
    // each app-config key is a --config file, after the dynamic plugins' configuration
    const configs = refs.filter(ref => ref.field === 'appConfig').flatMap(ref =>
      Object.keys(db[key('ConfigMap', ref.name, cr.metadata.namespace)].data || {})
        .flatMap(file => ['--config', (ref.mountPath || ref.shared) + '/' + file]));
    const current = deployment.spec.template.spec;
    const rendered = {
      ...current,
      volumes: refs.map(ref => ({ name: ref.name, configMap: { name: ref.name } })),
      containers: [{
        ...current.containers[0],
        args: ['--config', 'dynamic-plugins-root/app-config.dynamic-plugins.yaml', ...configs],
        volumeMounts: refs.map(ref => ({ name: ref.name, mountPath: ref.mountPath || ref.shared })),
      }],
    };
    if (JSON.stringify(rendered) === JSON.stringify(current)) continue;
    // the previous pods keep running until the rollout replaces them
    operator.running[id] = { spec: current, reads: 0 };
    deployment.spec.template.spec = rendered;
  }
}
let output;
if (args[0] === 'config' && args[1] === 'current-context') {
  output = process.env.FAKE_CONTEXT || 'release-test';
} else if (args[0] === 'config' && args[1] === 'view') {
  output = { clusters: [{ cluster: { server: 'https://release-test.example:6443' } }] };
} else if (args[0] === 'get' && args[1] === 'namespace' && args[2] === 'kube-system') {
  output = { metadata: { uid: process.env.FAKE_CLUSTER_UID || 'original-cluster' } };
} else if (args[0] === 'get' && args[1] === 'clusterversion') {
  output = { status: { desired: { version: '4.21.35' } } };
} else if (args[0] === 'get' && args[1] === 'ingresses.config.openshift.io') {
  output = { spec: { domain: process.env.FAKE_INGRESS_DOMAIN ?? 'apps.release-test.example' } };
} else if (args[0] === 'get' && args[1] === 'kuadrants.kuadrant.io') {
  output = { items: [{ spec: { components: { developerPortal: { enabled: true } } } }] };
} else if (args[0] === 'get' && args[1] === 'crd') {
  output = missing.includes(args[2]) ? '' : { metadata: { name: args[2] } };
} else if (args[0] === 'get' && missing.includes(args[1])) {
  console.error('error: the server does not have resource type ' + args[1]);
  process.exit(1);
} else if (args[0] === 'get' && kind(args[1]) === 'pod') {
  reconcile();
  const [label, value] = (flag('-l') || '').split('=');
  // pods from before a template change last FAKE_POD_LAG reads
  output = {
    items: Object.values(db).filter(obj => obj.kind === 'Deployment' && obj.metadata.namespace === ns).map(deployment => {
      const old = operator.running[key('Deployment', deployment.metadata.name, ns)];
      const spec = old && old.reads++ < Number(process.env.FAKE_POD_LAG || 0) ? old.spec : deployment.spec.template.spec;
      return {
        kind: 'Pod',
        metadata: { name: deployment.metadata.name + '-0', namespace: ns, labels: deployment.spec.template.metadata?.labels },
        spec,
        status: { conditions: [{ type: 'Ready', status: process.env.FAKE_BACKEND_STOPPED ? 'False' : 'True' }] },
      };
    }).filter(pod => !label || pod.metadata.labels?.[label] === value),
  };
} else if (args[0] === 'get' && (!args[2] || args[2].startsWith('-'))) {
  if (kind(args[1]) === 'deployment') reconcile();
  const [label, value] = (flag('-l') || '').split('=');
  output = {
    items: Object.values(db).filter(obj =>
      obj.kind.toLowerCase() === kind(args[1]) &&
      (args.includes('-A') || (obj.metadata.namespace || '') === ns) &&
      (!label || (value === undefined ? obj.metadata.labels?.[label] !== undefined : obj.metadata.labels?.[label] === value))),
  };
} else if (args[0] === 'get') {
  if (kind(args[1]) === 'deployment') reconcile();
  output = db[key(kind(args[1]), args[2], ns)] || '';
} else if (args[0] === 'patch') {
  const obj = db[key(kind(args[1]), args[2], ns)];
  if (!obj) {
    console.error('Error from server (NotFound): ' + args[1] + ' "' + args[2] + '" not found');
    process.exit(1);
  }
  // since the read, the operator wrote status, or another client changed the spec
  if (process.env.FAKE_STATUS_WRITE) obj.metadata.resourceVersion = String(Number(obj.metadata.resourceVersion) + 1);
  if (process.env.FAKE_CONCURRENT_EDIT) obj.metadata.generation += 1;
  for (const op of JSON.parse(flag('-p'))) {
    const parts = op.path.split('/').slice(1);
    const last = parts.pop();
    const parent = parts.reduce((value, part) => value?.[part], obj);
    if (parent === undefined || (op.op === 'remove' && !(last in parent)) ||
        (op.op === 'test' && JSON.stringify(parent[last]) !== JSON.stringify(op.value))) {
      console.error('The request is invalid: ' + op.op + ' ' + op.path);
      process.exit(1);
    }
    if (op.op === 'add' && Array.isArray(parent)) parent.splice(last === '-' ? parent.length : Number(last), 0, op.value);
    else if (op.op === 'add') parent[last] = op.value;
    else if (op.op === 'remove' && Array.isArray(parent)) parent.splice(Number(last), 1);
    else if (op.op === 'remove') delete parent[last];
  }
  obj.metadata.resourceVersion = String(Number(obj.metadata.resourceVersion) + 1);
  obj.metadata.generation += 1;
  output = kind(args[1]) + '/' + args[2] + ' patched';
} else if (args[0] === 'create' && args[1] === '-f') {
  const obj = input;
  if (obj.kind === process.env.FAKE_FAIL_KIND) process.exit(1);
  const id = key(obj.kind, obj.metadata.name, obj.metadata.namespace);
  if (db[id]) process.exit(1);
  obj.metadata.uid = id;
  db[id] = obj;
  output = obj;
} else if (args[0] === 'delete' && args.includes('-l')) {
  const types = args[1].split(',');
  if (types.some(type => !type || missing.includes(type))) {
    console.error('error: the server does not have resource type ' + args[1]);
    process.exit(1);
  }
  const ns = args[args.indexOf('-n') + 1];
  const [label, value] = args[args.indexOf('-l') + 1].split('=');
  const deleted = [];
  for (const [id, obj] of Object.entries(db)) {
    const resource = obj.kind.toLowerCase() + '.' + obj.apiVersion?.split('/')[0];
    if (types.includes(resource.replace('.', 's.')) && obj.metadata.namespace === ns && obj.metadata.labels?.[label] === value) {
      delete db[id];
      deleted.push(resource + ' "' + obj.metadata.name + '" deleted');
    }
  }
  output = deleted.join('\\n') || 'No resources found';
} else if (args[0] === 'delete') {
  if (args[1] === process.env.FAKE_FAIL_DELETE_KIND) process.exit(1);
  // mcp finalizers cannot complete once their namespace is terminating
  if (args[1] === 'Namespace' && Object.values(db).some(obj => obj.kind.startsWith('MCP') && obj.metadata.namespace === args[2])) {
    console.error('error: timed out waiting for namespace ' + args[2]);
    process.exit(1);
  }
  delete db[key(kind(args[1]), args[2], ns)];
  if (args[1] === 'Namespace') {
    for (const [id, obj] of Object.entries(db)) {
      if (obj.metadata.namespace === args[2]) delete db[id];
    }
  }
} else if (args[0] === 'exec') {
  // stands in for a pod's running backend: the image's entrypoint and files, then the
  // args and configmap mounts of its deployment
  const pod = db[key('Deployment', args[1].replace(/-0$/, ''), ns)]?.spec.template.spec;
  const container = pod?.containers.find(c => c.name === flag('-c'));
  if (!container || process.env.FAKE_BACKEND_STOPPED) {
    console.error('error: unable to upgrade connection: container not found ("' + flag('-c') + '")');
    process.exit(1);
  }
  const command = args.slice(args.indexOf('--') + 1);
  const file = command[1];
  if (command[0] === 'sh') {
    // echoes the names of the set, non-empty variables the script asks about
    const env = JSON.parse(process.env.FAKE_BACKEND_ENV || '{}');
    output = [...command[2].matchAll(/\\$\\{(\\w+):\\+\\w+\\}/g)].map(match => match[1]).filter(name => env[name]).join(' ');
  } else if (file === '/proc/1/cmdline') {
    output = [...image.entrypoint, ...(container.args || [])].join('\\0') + '\\0';
  } else {
    // a configmap key mounted over an image file shadows it, as a subPath mount does
    const target = file.startsWith('/') ? file : '/opt/app-root/src/' + file;
    output = container.volumeMounts
      .filter(mount => target.startsWith(mount.mountPath + '/'))
      .map(mount => {
        const volume = pod.volumes.find(v => v.name === mount.name);
        return db[key('ConfigMap', volume?.configMap?.name || '', ns)]?.data?.[target.slice(mount.mountPath.length + 1)];
      })
      .find(content => content !== undefined) ?? image.files[target];
    if (output === undefined) {
      console.error('cat: ' + file + ': No such file or directory');
      process.exit(1);
    }
  }
} else if (!['wait', 'rollout'].includes(args[0])) {
  console.error('Unexpected kubectl invocation: ' + args.join(' '));
  process.exit(1);
}
fs.writeFileSync(process.env.FAKE_DB, JSON.stringify(db));
fs.writeFileSync(operatorFile, JSON.stringify(operator));
if (output) console.log(typeof output === 'string' ? output : JSON.stringify(output));
`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: `${dir}${path.delimiter}${process.env.PATH}`,
    KUBECONFIG: path.join(dir, "unused-kubeconfig"),
    E2E_REMOTE_STATE_DIR: stateDir,
    BASE_URL: "",
    FAKE_DB: dbFile,
    FAKE_LOG: logFile,
  };
  return {
    dir,
    stateDir,
    state: () =>
      JSON.parse(fs.readFileSync(path.join(stateDir, "state.json"), "utf8")),
    read: () => JSON.parse(fs.readFileSync(dbFile, "utf8")),
    write: (db) => fs.writeFileSync(dbFile, JSON.stringify(db)),
    calls: () =>
      fs
        .readFileSync(logFile, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse),
    run: (action, overrides = {}) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          fetchMock,
          new URL("cluster.mjs", import.meta.url).pathname,
          action,
        ],
        {
          env: { ...env, ...overrides },
          encoding: "utf8",
        },
      ),
    make: (args) =>
      spawnSync("make", args, {
        cwd: repo,
        env: { ...env, NODE_OPTIONS: `--import=${fetchMock}` },
        encoding: "utf8",
      }),
  };
}

const isDex = (resource) => /^dex(-|$)/.test(resource.metadata.name);

test("refuses fixture collisions before any create", (t) => {
  const h = harness(t);
  h.write({ "namespace//toystore": { metadata: { name: "toystore" } } });
  const result = h.run("setup");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already exists/);
  assert.ok(!h.calls().some((call) => call.includes("create")));
  assert.ok(!fs.existsSync(h.stateDir));
});

test("missing MCP APIs fail without creating fixtures", (t) => {
  const h = harness(t);
  const result = h.run("setup", {
    FAKE_MISSING_CRD: "mcpserverregistrations.mcp.kuadrant.io",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required CRD missing/);
  assert.ok(!h.calls().some((call) => call.includes("create")));
});

test("setup and cleanup own fixtures without changing installed operators", (t) => {
  const h = harness(t);
  const unrelated = { kind: "Namespace", metadata: { name: "existing-work" } };
  h.write({ "namespace//existing-work": unrelated });
  const setup = h.run("setup");
  assert.equal(setup.status, 0, setup.stderr);
  const resources = Object.values(h.read());
  assert.ok(!JSON.stringify(resources).includes("oinc.io/metallb"));
  assert.ok(
    !resources.some((r) =>
      ["ClusterRole", "ClusterRoleBinding", "ServiceAccount"].includes(r.kind),
    ),
  );
  assert.ok(resources.some((r) => r.kind === "MCPServerRegistration"));
  assert.ok(
    !resources.some(
      (r) => r.kind === "CustomResourceDefinition" || r.kind === "Kuadrant",
    ),
  );
  const teardown = h.run("teardown");
  assert.equal(teardown.status, 0, teardown.stderr);
  assert.deepEqual(h.read(), { "namespace//existing-work": unrelated });
  assert.ok(!fs.existsSync(h.stateDir));
});

test("partial setup can be cleaned using the saved inventory", (t) => {
  const h = harness(t);
  assert.equal(h.run("setup", { FAKE_FAIL_KIND: "APIProduct" }).status, 1);
  assert.ok(fs.existsSync(h.stateDir));
  assert.equal(h.run("teardown").status, 0);
  assert.deepEqual(h.read(), {});
});

for (const partial of [false, true]) {
  test(`cleanup recovers lost state after ${partial ? "partial" : "complete"} setup`, (t) => {
    const h = harness(t);
    const unrelated = {
      kind: "Namespace",
      metadata: { name: "existing-work" },
    };
    h.write({ "namespace//existing-work": unrelated });
    const setup = h.run(
      "setup",
      partial ? { FAKE_FAIL_KIND: "APIProduct" } : {},
    );
    assert.equal(setup.status, partial ? 1 : 0, setup.stderr);
    fs.rmSync(h.stateDir, { recursive: true });

    const collision = h.run("setup");
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /make remote-teardown/);

    const before = h.calls().length;
    const teardown = h.run("teardown");
    assert.equal(teardown.status, 0, teardown.stderr);
    assert.match(teardown.stdout, /Recovered cleanup record/);
    assert.deepEqual(h.read(), { "namespace//existing-work": unrelated });
    assert.ok(!fs.existsSync(h.stateDir));
    assert.ok(
      h
        .calls()
        .slice(before)
        .every((call) =>
          ["config", "get", "delete"].includes(
            call[0] === "--context" ? call[3] : call[0],
          ),
        ),
    );
    const retry = h.run("setup");
    assert.equal(retry.status, 0, retry.stderr);
  });
}

for (const ownership of ["unowned", "different run"]) {
  test(`cleanup without local state refuses ${ownership} fixtures before deleting anything`, (t) => {
    const h = harness(t);
    assert.equal(h.run("setup").status, 0);
    fs.rmSync(h.stateDir, { recursive: true });
    const db = h.read();
    const fixture = db["namespace//toystore"];
    if (ownership === "unowned") delete fixture.metadata.labels;
    else
      fixture.metadata.labels["kuadrant.io/backstage-e2e-run"] = "another-run";
    h.write(db);

    const result = h.run("teardown");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unowned|different runs/);
    assert.ok(!h.calls().some((call) => call.includes("delete")));
    assert.ok(!fs.existsSync(h.stateDir));
    assert.deepEqual(h.read(), db);
  });
}

test("interrupted recovery retains UIDs for a safe cleanup retry", (t) => {
  const h = harness(t);
  assert.equal(h.run("setup").status, 0);
  fs.rmSync(h.stateDir, { recursive: true });
  const interrupted = h.run("teardown", { FAKE_FAIL_DELETE_KIND: "Namespace" });
  assert.equal(interrupted.status, 1);
  assert.ok(fs.existsSync(path.join(h.stateDir, "state.json")));

  const db = h.read();
  db["namespace//toystore"].metadata.uid = "replacement";
  h.write(db);
  const before = h.calls().length;
  const retry = h.run("teardown");
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /replaced or unowned/);
  assert.ok(
    !h
      .calls()
      .slice(before)
      .some((call) => call.includes("delete")),
  );
});

test("cleanup without state or fixtures does not create a recovery record", (t) => {
  const h = harness(t);
  const result = h.run("teardown");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No remote fixtures found/);
  assert.ok(!fs.existsSync(h.stateDir));
  assert.ok(!h.calls().some((call) => call.includes("delete")));
});

test("cleanup rejects changed context, changed cluster and replaced resources", (t) => {
  const h = harness(t);
  const setup = h.run("setup");
  assert.equal(setup.status, 0, setup.stderr);
  for (const overrides of [
    { FAKE_CONTEXT: "other" },
    { FAKE_CLUSTER_UID: "replacement" },
  ]) {
    const result = h.run("teardown", overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /original cluster/);
  }
  const db = h.read();
  db["namespace//toystore"].metadata.uid = "replacement";
  h.write(db);
  const result = h.run("teardown");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /replaced or unowned/);
  assert.ok(!h.calls().some((call) => call.includes("delete")));
});

test("fixture-only setup preserves the deployment authentication and RBAC", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const setup = h.run("setup");
  assert.equal(setup.status, 0, setup.stderr);
  const db = h.read();
  assert.ok(!Object.values(db).some(isDex));
  assert.deepEqual(db[backstage], rhdh()[backstage]);
  assert.ok(
    !h
      .calls()
      .some(
        (call) =>
          call.includes("ingresses.config.openshift.io") ||
          call.includes("routes.route.openshift.io") ||
          call.includes("exec") ||
          call.includes("rollout") ||
          call.includes("patch"),
      ),
  );
  assert.deepEqual(h.state().configMaps, []);
  assert.match(setup.stdout, /make e2e-remote BASE_URL/);
});

test("setup with BASE_URL points the RHDH instance behind it at owned Dex", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const setup = h.run("setup", { BASE_URL: `${deployed}/` });
  assert.equal(setup.status, 0, setup.stderr);
  const db = h.read();
  const { runID } = h.state();
  const ns = "kuadrant-backstage-e2e";
  const dex = Object.values(db).filter(isDex);
  assert.deepEqual(dex.map((r) => `${r.kind}/${r.metadata.name}`).sort(), [
    "ConfigMap/dex-config",
    "ConfigMap/dex-web",
    "Deployment/dex",
    "Route/dex",
    "Service/dex",
  ]);
  for (const resource of dex) {
    assert.equal(resource.metadata.namespace, ns);
    assert.equal(
      resource.metadata.labels["kuadrant.io/backstage-e2e-run"],
      runID,
    );
  }
  const volumes = db[`deployment/${ns}/dex`].spec.template.spec.volumes;
  for (const volume of volumes.filter((v) => v.configMap))
    assert.ok(db[`configmap/${ns}/${volume.configMap.name}`]);
  // restricted-v2 mounts the root read-only; the dex entrypoint writes to /tmp
  assert.ok(volumes.some((v) => v.name === "tmp" && v.emptyDir));
  assert.equal(
    db[`configmap/${ns}/dex-web`].data["password.html"],
    fs.readFileSync(
      path.join(repo, "kuadrant-dev-setup/dex/web/templates/password.html"),
      "utf8",
    ),
  );
  const route = db[`route/${ns}/dex`];
  assert.equal(
    route.spec.host,
    "dex-kuadrant-backstage-e2e.apps.release-test.example",
  );
  assert.deepEqual(route.spec.tls, {
    termination: "edge",
    insecureEdgeTerminationPolicy: "Redirect",
  });
  const config = yaml.load(
    db[`configmap/${ns}/dex-config`].data["config.yaml"],
  );
  assert.equal(config.issuer, issuer);
  assert.deepEqual(config.staticPasswords, dexConfig.staticPasswords);
  const client = (c) => c.id === "backstage";
  assert.deepEqual(config.staticClients.find(client).redirectURIs, [
    ...dexConfig.staticClients.find(client).redirectURIs,
    "https://rhdh.example.com/api/auth/oidc/handler/frame",
  ]);

  // two owned configmaps, referenced after the instance's own
  const appConfig = db["configmap/rhdh/kuadrant-e2e-app-config"];
  const files = db["configmap/rhdh/kuadrant-e2e-files"];
  for (const configMap of [appConfig, files])
    assert.equal(
      configMap.metadata.labels["kuadrant.io/backstage-e2e-run"],
      runID,
    );
  assert.deepEqual(files.data, {
    "kuadrant-users.yaml": fs.readFileSync(
      path.join(repo, "catalog-entities/kuadrant-users.yaml"),
      "utf8",
    ),
    "rbac-policy.csv": fs.readFileSync(
      path.join(repo, "rbac-policy.csv"),
      "utf8",
    ),
  });
  assert.deepEqual(db[backstage].spec.application, {
    ...rhdh()[backstage].spec.application,
    appConfig: {
      mountPath: "/opt/app-root/src",
      configMaps: [
        { name: "rhdh-app-config" },
        { name: "kuadrant-e2e-app-config" },
      ],
    },
    extraFiles: {
      mountPath: "/opt/app-root/etc",
      configMaps: [
        { name: "rbac-policies" },
        { name: "kuadrant-e2e-files", mountPath: rhdhFiles },
      ],
    },
  });
  const patch = h.calls().find((call) => call.includes("patch"));
  assert.deepEqual(JSON.parse(patch[patch.indexOf("-p") + 1])[0], {
    op: "test",
    path: "/metadata/generation",
    value: 1,
  });
  assert.deepEqual(
    h.state().configMaps.map((configMap) => configMap.metadata),
    ["kuadrant-e2e-app-config", "kuadrant-e2e-files"].map((name) => ({
      name,
      namespace: "rhdh",
      uid: `configmap/rhdh/${name}`,
    })),
  );

  // rhdh changes only once dex is verified, and setup waits for the restart
  const calls = h.calls().map((call) => call.join(" "));
  const at = (pattern) => calls.findIndex((call) => pattern.test(call));
  assert.ok(
    at(/rollout status deployment\/dex /) < at(/ConfigMap\/kuadrant-e2e-/),
  );
  assert.ok(at(/ConfigMap\/kuadrant-e2e-files$/) < at(/ patch /));
  assert.ok(
    at(/ patch /) <
      at(/rollout status deployment\/backstage-developer-hub -n rhdh /),
  );

  const app = yaml.load(appConfig.data["kuadrant-e2e-app-config.yaml"]);
  assert.equal(app.signInPage, "oidc");
  assert.ok(app.auth.session.secret.length >= 32);
  assert.deepEqual(app.auth.providers.oidc[app.auth.environment], {
    metadataUrl: `${issuer}/.well-known/openid-configuration`,
    clientId: "backstage",
    clientSecret: "backstage-dev-secret",
    title: "OIDC",
    additionalScopes: ["offline_access"],
    signIn: {
      resolvers: [{ resolver: "emailMatchingUserEntityProfileEmail" }],
    },
  });
  // the image's location stays, since an app-config array replaces earlier ones
  assert.deepEqual(app.catalog.locations, [shipped, personas]);
  assert.deepEqual(app.permission, {
    enabled: true,
    rbac: {
      admin: { superUsers: [{ name: "user:default/admin" }] },
      "policies-csv-file": `${rhdhFiles}/rbac-policy.csv`,
      policyFileReload: true,
    },
  });
  assert.match(setup.stdout, /Verified: Dex/);
  assert.match(
    setup.stdout,
    /Verified: https:\/\/rhdh\.example\.com sends sign-in to Dex/,
  );
  // the session secret stays in the cluster
  assert.deepEqual(fs.readdirSync(h.stateDir), ["state.json"]);
  for (const output of [
    setup.stdout,
    setup.stderr,
    fs.readFileSync(path.join(h.stateDir, "state.json"), "utf8"),
  ])
    assert.ok(!output.includes(app.auth.session.secret));
});

test("setup waits for the operator to render RHDH before its rollout", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const setup = h.run("setup", { BASE_URL: deployed, FAKE_OPERATOR_LAG: "3" });
  assert.equal(setup.status, 0, setup.stderr);
  const calls = h.calls().map((call) => call.join(" "));
  const patch = calls.findIndex((call) => / patch /.test(call));
  const rollout = calls.findIndex((call) =>
    /rollout status deployment\/backstage-developer-hub /.test(call),
  );
  const reads = calls
    .slice(patch, rollout)
    .filter((call) => / get deployment backstage-developer-hub /.test(call));
  assert.equal(reads.length, 4);
});

test("setup takes the personas and RBAC policy from CATALOG_USERS and RBAC_POLICY", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const users = path.join(h.dir, "users.yaml");
  const policy = path.join(h.dir, "policy.csv");
  fs.writeFileSync(users, "kind: User\nmetadata:\n  name: tester\n");
  fs.writeFileSync(policy, "g, user:default/admin, role:default/release\n");
  const setup = h.run("setup", {
    BASE_URL: deployed,
    CATALOG_USERS: users,
    RBAC_POLICY: policy,
  });
  assert.equal(setup.status, 0, setup.stderr);
  assert.deepEqual(h.read()["configmap/rhdh/kuadrant-e2e-files"].data, {
    "kuadrant-users.yaml": "kind: User\nmetadata:\n  name: tester\n",
    "rbac-policy.csv": "g, user:default/admin, role:default/release\n",
  });
});

const instanceConfig = (db, text) => {
  db["configmap/rhdh/rhdh-app-config"].data["app-config.yaml"] = text;
};
const github = {
  type: "url",
  target: "https://github.com/example/catalog/blob/main/all.yaml",
};
const githubConfig = yaml.dump({ catalog: { locations: [github] } });
const backend = "deployment/rhdh/backstage-developer-hub";

for (const [title, change, overrides, kept] of [
  [
    "setup keeps the catalog locations of RHDH's image ahead of the personas",
    () => {},
    {},
    [shipped],
  ],
  [
    "setup keeps only the last file's catalog locations",
    // a key of its own, so the file loads after the image's rather than over it
    (db) => {
      db["configmap/rhdh/rhdh-app-config"].data = {
        "app-config-rhdh.yaml": githubConfig,
      };
    },
    {},
    [github],
  ],
  [
    "setup keeps no catalog locations that a later file sets to null",
    (db) => instanceConfig(db, "catalog:\n  locations: null\n"),
    {},
    [],
  ],
  [
    "setup keeps no catalog locations once a later file sets the catalog to null",
    (db) => instanceConfig(db, "catalog: null\n"),
    {},
    [],
  ],
  [
    "setup reads catalog locations from --config=file arguments",
    () => {},
    {
      FAKE_IMAGE: JSON.stringify({
        entrypoint: [
          "node",
          "packages/backend",
          "--config=app-config.example.yaml",
        ],
      }),
    },
    [shipped],
  ],
  [
    "setup parses tags as backstage does, without quoting the file",
    (db) =>
      instanceConfig(
        db,
        `auth:\n  token: !vault secret/token\n${githubConfig}`,
      ),
    {},
    [github],
  ],
  [
    "setup reads a file indented throughout as it stands",
    (db) =>
      instanceConfig(
        db,
        `app:\n  title: Developer Hub\n${githubConfig}`.replace(/^/gm, "  "),
      ),
    {},
    [github],
  ],
  [
    "setup ignores an empty APP_CONFIG_catalog_locations, as backstage does",
    () => {},
    { FAKE_BACKEND_ENV: JSON.stringify({ APP_CONFIG_catalog_locations: "" }) },
    [shipped],
  ],
]) {
  test(title, (t) => {
    const h = harness(t);
    const db = rhdh();
    change(db);
    h.write(db);
    const setup = h.run("setup", { BASE_URL: deployed, ...overrides });
    assert.equal(setup.status, 0, setup.stderr);
    const app = yaml.load(
      h.read()["configmap/rhdh/kuadrant-e2e-app-config"].data[
        "kuadrant-e2e-app-config.yaml"
      ],
    );
    assert.deepEqual(app.catalog.locations, [...kept, personas]);
    assert.ok(!setup.stderr.includes("secret/token"));
    // read in a ready pod of the backend, before anything changes
    const calls = h.calls();
    const execs = calls.filter((call) => call.includes("exec"));
    assert.ok(execs.some((call) => call.includes("sh")));
    assert.ok(execs.some((call) => call.includes("/proc/1/cmdline")));
    for (const call of execs)
      assert.deepEqual(call.slice(3, 10), [
        "exec",
        "backstage-developer-hub-0",
        "-n",
        "rhdh",
        "-c",
        "backstage-backend",
        "--",
      ]);
    assert.ok(
      calls.lastIndexOf(execs.at(-1)) <
        calls.findIndex((call) => call.includes("create")),
    );
  });
}

for (const [label, change, overrides, error] of [
  [
    "a deployment still rolling out",
    (db) => {
      db[backend].status.updatedReplicas = 0;
    },
    {},
    /Deployment rhdh\/backstage-developer-hub has no ready pod from a finished rollout/,
  ],
  [
    "a deployment whose latest spec has no rollout yet",
    (db) => {
      db[backend].metadata.generation = 2;
    },
    {},
    /has no ready pod from a finished rollout/,
  ],
  [
    "a deployment scaled to zero",
    (db) => {
      db[backend].spec.replicas = 0;
      db[backend].status = { observedGeneration: 1 };
    },
    {},
    /has no ready pod from a finished rollout/,
  ],
  [
    "an RHDH backend with no ready pod",
    () => {},
    { FAKE_BACKEND_STOPPED: "1" },
    /has no ready pod from a finished rollout/,
  ],
  [
    "catalog locations set through APP_CONFIG_ variables",
    () => {},
    {
      FAKE_BACKEND_ENV: JSON.stringify({ APP_CONFIG_catalog_locations: "[]" }),
    },
    /Backstage rhdh\/developer-hub sets APP_CONFIG_catalog_locations, which can override the catalog locations setup adds/,
  ],
  [
    "a backend that names no --config files",
    (db) => delete db[backend].spec.template.spec.containers[0].args,
    {
      FAKE_OPERATOR_STOPPED: "1",
      FAKE_IMAGE: JSON.stringify({ entrypoint: ["/pause"] }),
    },
    /Backstage rhdh\/developer-hub runs \/pause without --config files/,
  ],
  [
    "a pod still running with the e2e configuration",
    (db) =>
      db[backend].spec.template.spec.containers[0].args.push(
        "--config",
        "/opt/app-root/src/kuadrant-e2e-app-config.yaml",
      ),
    { FAKE_OPERATOR_STOPPED: "1" },
    /Pod rhdh\/backstage-developer-hub-0 still runs with kuadrant-e2e-app-config/,
  ],
  [
    "configuration loaded from a URL",
    () => {},
    {
      FAKE_IMAGE: JSON.stringify({
        entrypoint: [
          "node",
          "packages/backend",
          "--config",
          "https://config.example.com/app-config.yaml",
        ],
      }),
    },
    /loads configuration from https:\/\/config\.example\.com\/app-config\.yaml/,
  ],
  [
    "catalog locations set through $include",
    (db) =>
      instanceConfig(
        db,
        "catalog:\n  locations:\n    $include: locations.yaml\n",
      ),
    {},
    /app-config\.yaml in Backstage rhdh\/developer-hub sets catalog locations through \$include or \$file/,
  ],
  [
    "a catalog location that reads $file",
    (db) =>
      instanceConfig(
        db,
        yaml.dump({
          catalog: {
            locations: [{ type: "url", target: { $file: "target.txt" } }],
          },
        }),
      ),
    {},
    /sets catalog locations through \$include or \$file/,
  ],
  [
    "a catalog included whole",
    (db) => instanceConfig(db, "catalog:\n  $include: catalog.yaml\n"),
    {},
    /sets catalog locations through \$include or \$file/,
  ],
  [
    "a whole file included",
    (db) => instanceConfig(db, "$include: other.yaml\n"),
    {},
    /sets catalog locations through \$include or \$file/,
  ],
  [
    "catalog locations that are not a list",
    (db) => instanceConfig(db, "catalog:\n  locations: ${CATALOG_LOCATIONS}\n"),
    {},
    /sets catalog\.locations to something other than a list of locations/,
  ],
  [
    "configuration it cannot parse, without quoting it",
    (db) => instanceConfig(db, "auth:\n  clientSecret: s3cr3t-value: x\n"),
    {},
    /Cannot parse app-config\.yaml from Backstage rhdh\/developer-hub: [^\n]+ at line 2, column \d+:\n/,
  ],
]) {
  test(`setup refuses ${label} before creating anything`, (t) => {
    const h = harness(t);
    const db = rhdh();
    change(db);
    h.write(db);
    const result = h.run("setup", { BASE_URL: deployed, ...overrides });
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.ok(!result.stderr.includes("s3cr3t-value"));
    assert.ok(
      !h
        .calls()
        .some((call) => call.includes("create") || call.includes("patch")),
    );
    assert.ok(!fs.existsSync(h.stateDir));
    assert.deepEqual(h.read(), db);
  });
}

for (const [label, overrides, error] of [
  [
    "BASE_URL without a scheme",
    { BASE_URL: "rhdh.example.com" },
    /BASE_URL must be/,
  ],
  [
    "BASE_URL with credentials",
    { BASE_URL: "https://user:password@rhdh.example.com" },
    /BASE_URL must be/,
  ],
  [
    "BASE_URL with a path",
    { BASE_URL: `${deployed}/catalog` },
    /BASE_URL must be/,
  ],
  [
    "no cluster ingress domain",
    { BASE_URL: deployed, FAKE_INGRESS_DOMAIN: "" },
    /ingress domain/,
  ],
  [
    "no RHDH operator",
    { BASE_URL: deployed, FAKE_MISSING_CRD: "backstages.rhdh.redhat.com" },
    /RHDH operator/,
  ],
  [
    "a BASE_URL no Backstage instance serves",
    { BASE_URL: "https://backstage.example.com" },
    /No RHDH Backstage instance serves backstage\.example\.com/,
  ],
  [
    "a missing RBAC_POLICY",
    { BASE_URL: deployed, RBAC_POLICY: "/nonexistent/rbac-policy.csv" },
    /\/nonexistent\/rbac-policy\.csv/,
  ],
]) {
  test(`setup with ${label} fails before creating anything`, (t) => {
    const h = harness(t);
    h.write(rhdh());
    const result = h.run("setup", overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.ok(!result.stderr.includes("password"));
    assert.ok(
      !h
        .calls()
        .some((call) => call.includes("create") || call.includes("patch")),
    );
    assert.ok(!fs.existsSync(h.stateDir));
  });
}

for (const [label, change, error] of [
  [
    "a route the RHDH operator does not own",
    (db) =>
      delete db["route/rhdh/backstage-developer-hub"].metadata.ownerReferences,
    /No RHDH Backstage instance serves rhdh\.example\.com/,
  ],
  [
    "an RHDH instance already using kuadrant-e2e ConfigMaps",
    (db) =>
      db[backstage].spec.application.appConfig.configMaps.push({
        name: "kuadrant-e2e-app-config",
      }),
    /Backstage rhdh\/developer-hub already references kuadrant-e2e-app-config/,
  ],
  [
    "an existing kuadrant-e2e ConfigMap",
    (db) => {
      db["configmap/rhdh/kuadrant-e2e-files"] = {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: { name: "kuadrant-e2e-files", namespace: "rhdh" },
        data: {},
      };
    },
    /ConfigMap rhdh\/kuadrant-e2e-files already exists/,
  ],
]) {
  test(`setup refuses ${label} before creating anything`, (t) => {
    const h = harness(t);
    const db = rhdh();
    change(db);
    h.write(db);
    const result = h.run("setup", { BASE_URL: deployed });
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.ok(
      !h
        .calls()
        .some((call) => call.includes("create") || call.includes("patch")),
    );
    assert.ok(!fs.existsSync(h.stateDir));
    assert.deepEqual(h.read(), db);
  });
}

test("setup warns, but completes, when this machine cannot verify Dex", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const result = h.run("setup", {
    BASE_URL: deployed,
    FAKE_DEX_FETCH_ERROR: "self-signed certificate in certificate chain",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /self-signed certificate in certificate chain/);
  assert.match(result.stderr, /ingress CA/);
  assert.match(result.stderr, /NODE_EXTRA_CA_CERTS/);
  assert.ok(h.read()["configmap/rhdh/kuadrant-e2e-app-config"]);
});

test("setup waits for the router to serve Dex", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const result = h.run("setup", {
    BASE_URL: deployed,
    FAKE_DEX_UNAVAILABLE: "3",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified: Dex/);
});

for (const [label, overrides, error] of [
  [
    "serves another issuer",
    { FAKE_DEX_ISSUER: "https://dex.other.example" },
    /reports issuer https:\/\/dex\.other\.example, expected https:\/\/dex-kuadrant-backstage-e2e\./,
  ],
  [
    "is never served by the router",
    { FAKE_DEX_UNAVAILABLE: "1000" },
    /HTTP 503.*route dex in namespace kuadrant-backstage-e2e/,
  ],
]) {
  test(`setup fails, leaving RHDH alone, when Dex ${label}`, (t) => {
    const h = harness(t);
    h.write(rhdh());
    const result = h.run("setup", { BASE_URL: deployed, ...overrides });
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    const db = h.read();
    assert.deepEqual(db[backstage], rhdh()[backstage]);
    assert.ok(!Object.keys(db).some((id) => id.includes("kuadrant-e2e-")));
  });
}

test("setup waits for RHDH to serve its new configuration", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const result = h.run("setup", {
    BASE_URL: deployed,
    FAKE_RHDH_UNAVAILABLE: "3",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sends sign-in to Dex/);
});

test("setup warns, but completes, when this machine cannot verify RHDH sign-in", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const result = h.run("setup", {
    BASE_URL: deployed,
    FAKE_RHDH_FETCH_ERROR: "self-signed certificate in certificate chain",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /self-signed certificate in certificate chain/);
  assert.match(result.stderr, /https:\/\/rhdh\.example\.com/);
});

test("setup fails, leaving RHDH for teardown, when RHDH does not send sign-in to Dex", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const setup = h.run("setup", { BASE_URL: deployed, FAKE_RHDH_STATUS: "500" });
  assert.equal(setup.status, 1);
  assert.match(setup.stderr, /HTTP 500/);
  assert.match(setup.stderr, /NODE_EXTRA_CA_CERTS/);
  assert.match(setup.stderr, /make remote-teardown/);
  const teardown = h.run("teardown");
  assert.equal(teardown.status, 0, teardown.stderr);
  assert.deepEqual(withoutVersions(h.read()), withoutVersions(rhdh()));
});

test("setup does not patch a Backstage CR that changed after it was read", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const setup = h.run("setup", {
    BASE_URL: deployed,
    FAKE_CONCURRENT_EDIT: "1",
  });
  assert.equal(setup.status, 1);
  assert.match(setup.stderr, /Cannot patch Backstage rhdh\/developer-hub/);
  assert.deepEqual(h.read()[backstage], rhdh()[backstage]);
  const teardown = h.run("teardown");
  assert.equal(teardown.status, 0, teardown.stderr);
  assert.deepEqual(h.read(), rhdh());
});

test("operator status writes do not stop setup or teardown patching the Backstage CR", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const setup = h.run("setup", { BASE_URL: deployed, FAKE_STATUS_WRITE: "1" });
  assert.equal(setup.status, 0, setup.stderr);
  const teardown = h.run("teardown", { FAKE_STATUS_WRITE: "1" });
  assert.equal(teardown.status, 0, teardown.stderr);
  assert.deepEqual(withoutVersions(h.read()), withoutVersions(rhdh()));
});

for (const lost of [false, true]) {
  test(`teardown restores RHDH before it deletes the ConfigMaps and Dex${lost ? " after losing local state" : ""}`, (t) => {
    const h = harness(t);
    const unrelated = {
      kind: "Namespace",
      metadata: { name: "existing-work" },
    };
    const initial = { ...rhdh(), "namespace//existing-work": unrelated };
    h.write(initial);
    const setup = h.run("setup", { BASE_URL: deployed });
    assert.equal(setup.status, 0, setup.stderr);
    if (lost) fs.rmSync(h.stateDir, { recursive: true });
    const before = h.calls().length;
    const teardown = h.run("teardown");
    assert.equal(teardown.status, 0, teardown.stderr);
    assert.deepEqual(withoutVersions(h.read()), withoutVersions(initial));
    assert.ok(!fs.existsSync(h.stateDir));
    const calls = h
      .calls()
      .slice(before)
      .map((call) => call.join(" "));
    const at = (pattern) => calls.findIndex((call) => pattern.test(call));
    const patch = at(/ patch backstages\.rhdh\.redhat\.com developer-hub /);
    const pods = calls.findLastIndex((call) => / get pods -n rhdh /.test(call));
    assert.ok(patch >= 0);
    assert.ok(patch < pods);
    assert.ok(pods < at(/ delete configmap kuadrant-e2e-/));
    assert.ok(
      at(/ delete configmap kuadrant-e2e-files /) <
        at(/ delete Namespace kuadrant-backstage-e2e /),
    );
  });
}

test("teardown waits for RHDH pods to stop using the e2e configuration", (t) => {
  const h = harness(t);
  h.write(rhdh());
  assert.equal(h.run("setup", { BASE_URL: deployed }).status, 0);
  const before = h.calls().length;
  const teardown = h.run("teardown", { FAKE_POD_LAG: "3" });
  assert.equal(teardown.status, 0, teardown.stderr);
  const calls = h
    .calls()
    .slice(before)
    .map((call) => call.join(" "));
  const deleted = calls.findIndex((call) =>
    / delete configmap kuadrant-e2e-/.test(call),
  );
  const reads = calls
    .slice(0, deleted)
    .filter((call) => / get pods -n rhdh /.test(call));
  assert.equal(reads.length, 4);
});

test("teardown keeps changes made to the Backstage CR during the run", (t) => {
  const h = harness(t);
  h.write(rhdh());
  assert.equal(h.run("setup", { BASE_URL: deployed }).status, 0);
  const db = h.read();
  assert.deepEqual(db[backstage].spec.application.appConfig.configMaps.at(-1), {
    name: "kuadrant-e2e-app-config",
  });
  db[backstage].spec.application.appConfig.configMaps.push({
    name: "later-config",
  });
  db[backstage].metadata.resourceVersion = "7";
  db[backstage].metadata.generation += 1;
  db["configmap/rhdh/later-config"] = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "later-config", namespace: "rhdh" },
    data: { "later.yaml": "{}\n" },
  };
  h.write(db);
  const teardown = h.run("teardown");
  assert.equal(teardown.status, 0, teardown.stderr);
  const { application } = h.read()[backstage].spec;
  assert.deepEqual(application.appConfig.configMaps, [
    { name: "rhdh-app-config" },
    { name: "later-config" },
  ]);
  assert.deepEqual(
    application.extraFiles,
    rhdh()[backstage].spec.application.extraFiles,
  );
});

test("teardown keeps Dex until the operator has rolled RHDH back", (t) => {
  const h = harness(t);
  h.write(rhdh());
  assert.equal(h.run("setup", { BASE_URL: deployed }).status, 0);
  const stopped = h.run("teardown", { FAKE_OPERATOR_STOPPED: "1" });
  assert.equal(stopped.status, 1);
  assert.match(
    stopped.stderr,
    /Deployment rhdh\/backstage-developer-hub still mounts kuadrant-e2e-app-config/,
  );
  assert.match(stopped.stderr, /RHDH operator/);
  const db = h.read();
  assert.ok(db["namespace//kuadrant-backstage-e2e"]);
  assert.ok(db["configmap/rhdh/kuadrant-e2e-app-config"]);
  assert.ok(fs.existsSync(h.stateDir));
  const retry = h.run("teardown");
  assert.equal(retry.status, 0, retry.stderr);
  assert.deepEqual(withoutVersions(h.read()), withoutVersions(rhdh()));
});

for (const [label, lost, change, error] of [
  [
    "an unowned kuadrant-e2e ConfigMap",
    false,
    (db) => delete db["configmap/rhdh/kuadrant-e2e-files"].metadata.labels,
    /replaced or unowned ConfigMap\/kuadrant-e2e-files/,
  ],
  [
    "an unowned kuadrant-e2e ConfigMap after losing local state",
    true,
    (db) => delete db["configmap/rhdh/kuadrant-e2e-files"].metadata.labels,
    /Backstage rhdh\/developer-hub references ConfigMap kuadrant-e2e-files, which this run did not create/,
  ],
  [
    "another Backstage instance using a kuadrant-e2e ConfigMap",
    false,
    (db) => {
      db["backstage/other/portal"] = {
        apiVersion: "rhdh.redhat.com/v1alpha5",
        kind: "Backstage",
        metadata: {
          name: "portal",
          namespace: "other",
          uid: "portal-uid",
          resourceVersion: "1",
        },
        spec: {
          application: {
            appConfig: { configMaps: [{ name: "kuadrant-e2e-app-config" }] },
          },
        },
      };
    },
    /Backstage other\/portal references ConfigMap kuadrant-e2e-app-config, which this run did not create/,
  ],
]) {
  test(`teardown refuses ${label} before changing anything`, (t) => {
    const h = harness(t);
    h.write(rhdh());
    assert.equal(h.run("setup", { BASE_URL: deployed }).status, 0);
    if (lost) fs.rmSync(h.stateDir, { recursive: true });
    const db = h.read();
    change(db);
    h.write(db);
    const before = h.calls().length;
    const result = h.run("teardown");
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
    assert.ok(
      !h
        .calls()
        .slice(before)
        .some((call) => call.includes("patch") || call.includes("delete")),
    );
    assert.deepEqual(h.read(), db);
  });
}

test("make remote-setup passes BASE_URL, CATALOG_USERS and RBAC_POLICY through", (t) => {
  const h = harness(t);
  h.write(rhdh());
  const users = path.join(h.dir, "users.yaml");
  const policy = path.join(h.dir, "policy.csv");
  fs.writeFileSync(users, "kind: User\nmetadata:\n  name: tester\n");
  fs.writeFileSync(policy, "g, user:default/admin, role:default/release\n");
  const result = h.make([
    "remote-setup",
    `BASE_URL=${deployed}`,
    `CATALOG_USERS=${users}`,
    `RBAC_POLICY=${policy}`,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const db = h.read();
  const app = yaml.load(
    db["configmap/rhdh/kuadrant-e2e-app-config"].data[
      "kuadrant-e2e-app-config.yaml"
    ],
  );
  assert.equal(
    app.auth.providers.oidc[app.auth.environment].metadataUrl,
    `${issuer}/.well-known/openid-configuration`,
  );
  assert.deepEqual(db["configmap/rhdh/kuadrant-e2e-files"].data, {
    "kuadrant-users.yaml": "kind: User\nmetadata:\n  name: tester\n",
    "rbac-policy.csv": "g, user:default/admin, role:default/release\n",
  });
});

for (const lost of [false, true]) {
  test(`teardown deletes this run's MCP resources before any namespace${lost ? " after losing local state" : ""}`, (t) => {
    const h = harness(t);
    assert.equal(h.run("setup").status, 0);
    const { runID } = h.state();
    if (lost) fs.rmSync(h.stateDir, { recursive: true });
    const before = h.calls().length;
    const teardown = h.run("teardown");
    assert.equal(teardown.status, 0, teardown.stderr);
    assert.deepEqual(h.read(), {});
    const deletes = h
      .calls()
      .slice(before)
      .map((call) => (call[0] === "--context" ? call.slice(3) : call))
      .filter((call) => call[0] === "delete");
    const mcp = deletes.filter((call) => call[1].includes("mcp.kuadrant.io"));
    const firstNamespace = deletes.findIndex((call) => call[1] === "Namespace");
    assert.ok(mcp.length);
    assert.ok(deletes.indexOf(mcp.at(-1)) < firstNamespace);
    for (const call of mcp) {
      assert.ok(call.includes(`kuadrant.io/backstage-e2e-run=${runID}`));
      assert.ok(call.some((arg) => arg.startsWith("--timeout=")));
    }
    assert.match(
      teardown.stdout,
      /mcpserverregistration\.mcp\.kuadrant\.io "toystore-mcp-server" deleted/,
    );
    assert.match(
      teardown.stdout,
      /mcpgatewayextension\.mcp\.kuadrant\.io "mcp-gateway" deleted/,
    );
    assert.ok(!teardown.stdout.includes("No resources found"));
  });
}

for (const removed of [
  ["mcpgatewayextensions.mcp.kuadrant.io"],
  [
    "mcpserverregistrations.mcp.kuadrant.io",
    "mcpgatewayextensions.mcp.kuadrant.io",
  ],
]) {
  test(`teardown completes after ${removed.map((crd) => crd.split(".")[0]).join(" and ")} were uninstalled`, (t) => {
    const h = harness(t);
    assert.equal(h.run("setup").status, 0);
    const db = h.read();
    for (const [id, obj] of Object.entries(db)) {
      if (removed.includes(`${obj.kind.toLowerCase()}s.mcp.kuadrant.io`))
        delete db[id];
    }
    h.write(db);
    const teardown = h.run("teardown", { FAKE_MISSING_CRD: removed.join(",") });
    assert.equal(teardown.status, 0, teardown.stderr);
    assert.deepEqual(h.read(), {});
  });
}

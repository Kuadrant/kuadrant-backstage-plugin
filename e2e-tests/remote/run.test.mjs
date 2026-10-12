import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Component: integration. Exercise the Make target without servers or a cluster.
function harness(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backstage-target-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const callsFile = path.join(dir, "calls.jsonl");
  for (const command of ["yarn", "kubectl", "docker", "oinc", "curl"]) {
    fs.writeFileSync(
      path.join(dir, command),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify({
  command: ${JSON.stringify(command)}, args, cwd: process.cwd(),
  baseURL: process.env.BASE_URL, htmlOpen: process.env.PLAYWRIGHT_HTML_OPEN
}) + '\\n');
process.exit(${JSON.stringify(command)} === 'yarn' && args[0] === 'test'
  ? Number(process.env.FAKE_TEST_EXIT || 0) : 99);
`,
      { mode: 0o755 },
    );
  }
  return {
    calls: () =>
      fs.existsSync(callsFile)
        ? fs.readFileSync(callsFile, "utf8").trim().split("\n").map(JSON.parse)
        : [],
    run: (args = [], env = {}) =>
      spawnSync("make", ["e2e-remote", ...args], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: {
          ...process.env,
          BASE_URL: "",
          PATH: `${dir}${path.delimiter}${process.env.PATH}`,
          FAKE_CALLS: callsFile,
          E2E_REMOTE_STATE_DIR: path.join(dir, "no-local-state"),
          ...env,
        },
        encoding: "utf8",
      }),
  };
}

test("remote target requires an explicit Backstage URL", (t) => {
  const h = harness(t);
  const result = h.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set BASE_URL to the deployed Backstage URL/);
  assert.deepEqual(h.calls(), []);
});

test("remote target forwards its URL and filters without starting an app or touching Kubernetes", (t) => {
  const h = harness(t);
  const result = h.run([
    "BASE_URL=https://backstage.example.com/",
    "PLAYWRIGHT_ARGS=--grep 'Smoke test' --list",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(h.calls(), [
    {
      command: "yarn",
      args: ["test", "--grep", "Smoke test", "--list"],
      cwd: fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, ""),
      baseURL: "https://backstage.example.com",
      htmlOpen: "never",
    },
  ]);
  assert.match(
    result.stdout,
    /Backstage under test: https:\/\/backstage.example.com/,
  );
});

test("remote target accepts BASE_URL from the environment and reports failed tests", (t) => {
  const h = harness(t);
  const result = h.run([], {
    BASE_URL: "https://backstage.example.com",
    FAKE_TEST_EXIT: "23",
    PLAYWRIGHT_HTML_OPEN: "always",
  });
  assert.notEqual(result.status, 0);
  assert.equal(h.calls().length, 1);
  assert.equal(h.calls()[0].htmlOpen, "never");
  assert.match(result.stderr, /Error 23/);
});

for (const url of [
  "backstage.example.com",
  "file:///tmp/backstage",
  "https://user:password@backstage.example.com",
  "https://backstage.example.com/catalog",
  "https://backstage.example.com?target=local",
]) {
  test(`remote target rejects invalid origin ${new URL(url, "https://example.com").pathname}`, (t) => {
    const h = harness(t);
    const result = h.run([], { BASE_URL: url });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BASE_URL must be/);
    assert.ok(!result.stderr.includes("user:password"));
    assert.deepEqual(h.calls(), []);
  });
}

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { backstageOrigin } from "./origin.mjs";

try {
  if (!process.env.BASE_URL)
    throw new Error(
      "Set BASE_URL to the deployed Backstage URL: make e2e-remote BASE_URL=https://backstage.example.com",
    );
  const origin = backstageOrigin(process.env.BASE_URL);

  console.log(`Backstage under test: ${origin}`);
  const result = spawnSync("yarn", ["test", ...process.argv.slice(2)], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL: origin,
      PLAYWRIGHT_HTML_OPEN: "never",
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}

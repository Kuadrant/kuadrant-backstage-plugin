import { chromium, type FullConfig } from "@playwright/test";
import * as fs from "fs";
import { Common } from "./utils/common";
import {
  PERSONAS,
  personaEmail,
  storageStatePath,
  AUTH_DIR,
} from "./support/auth/personas";

/**
 * Log in once per persona through dex and save each session to disk, so specs
 * can start already authenticated instead of running the popup OAuth flow on
 * every test.
 *
 * This is what makes parallel workers viable: the per-test dexQuickLogin was
 * racing (multiple popup logins hitting one dex at once). Here the login runs
 * five times total, serially, before any worker starts.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.BASE_URL || "http://localhost:3000";
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const persona of PERSONAS) {
      const context = await browser.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      const common = new Common(page);
      await common.dexQuickLogin(personaEmail(persona));
      // indexedDB included because backstage keeps session state there, not
      // only in cookies.
      await context.storageState({
        path: storageStatePath(persona),
        indexedDB: true,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;

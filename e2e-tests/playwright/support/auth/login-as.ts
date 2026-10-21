import * as fs from "fs";
import type { Page } from "@playwright/test";
import { PERSONAS, type Persona, storageStatePath } from "./personas";

type StoredState = {
  cookies: Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

/** Accept either a persona ("admin") or its email ("admin@kuadrant.local"). */
function toPersona(who: Persona | string): Persona {
  const name = who.includes("@") ? who.split("@")[0] : who;
  if (!(PERSONAS as readonly string[]).includes(name)) {
    throw new Error(`loginAs: unknown persona "${who}"`);
  }
  return name as Persona;
}

/**
 * Authenticate `page` as a persona by loading the session global-setup saved,
 * with NO live dex login.
 *
 * This replaces per-test `dexQuickLogin`. A live login mints a fresh dex offline
 * session for that user and dex keeps only one per (client, user, connector), so
 * it invalidates the refresh token in every other worker's saved session for the
 * same persona - which is exactly what broke parallel workers. Swapping the saved
 * cookies + localStorage onto the page instead keeps every persona's session
 * valid for the whole run.
 */
export async function loginAs(
  page: Page,
  who: Persona | string,
): Promise<void> {
  const persona = toPersona(who);
  const state: StoredState = JSON.parse(
    fs.readFileSync(storageStatePath(persona), "utf-8"),
  );

  const context = page.context();
  await context.clearCookies();
  await context.addCookies(state.cookies);

  // localStorage is per-origin and only writable from a document on that origin.
  // Load the app once first: the cookies are set but the `SignInPage:provider`
  // key is not, so it lands on sign-in without firing authenticated calls. Then
  // seed localStorage and reload, which lets the SignInPage silently restore the
  // session from the refresh cookie.
  await page.goto("/");
  const localStorageEntries = state.origins?.[0]?.localStorage;
  if (localStorageEntries?.length) {
    await page.evaluate((entries) => {
      window.localStorage.clear();
      for (const { name, value } of entries) {
        window.localStorage.setItem(name, value);
      }
    }, localStorageEntries);
    await page.reload();
  }

  await page.waitForSelector("nav a", { timeout: 20000 });
}

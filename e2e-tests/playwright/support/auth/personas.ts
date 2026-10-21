import * as path from "path";
import { fileURLToPath } from "url";

/**
 * The five dex quick-login personas. Their group membership maps to roles in
 * rbac-policy.csv. Kept in one place so global-setup can pre-authenticate each
 * one and specs can load the matching session.
 */
export const PERSONAS = [
  "admin",
  "owner1",
  "owner2",
  "consumer1",
  "consumer2",
] as const;

export type Persona = (typeof PERSONAS)[number];

export const personaEmail = (persona: Persona): string =>
  `${persona}@kuadrant.local`;

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where global-setup writes each persona's saved session. Git-ignored: these
 * are live sessions, not fixtures.
 */
export const AUTH_DIR = path.resolve(here, "../../.auth");

export const storageStatePath = (persona: Persona): string =>
  path.join(AUTH_DIR, `${persona}.json`);

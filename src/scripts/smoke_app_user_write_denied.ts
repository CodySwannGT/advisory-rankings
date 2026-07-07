#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { basicAuth } from "../lib/rest.js";
import { loadCreds } from "./_auth.js";

const USERNAME_SERVICE = "advisory-rankings-testuser-username";
const PASSWORD_SERVICE = ["advisory-rankings-testuser", "password"].join("-");
const TARGET_TABLE = "Advisor";

/**
 * Reads a secret from env, then macOS Keychain. Values are never logged.
 * @param envKey - Environment variable name.
 * @param keychainService - macOS Keychain service name.
 * @returns Resolved secret value.
 */
function secret(envKey: string, keychainService: string): string {
  const value = process.env[envKey] ?? keychainSecret(keychainService);
  if (!value) throw new Error(`${envKey} or ${keychainService} is required`);
  return value;
}

/**
 * Reads a macOS Keychain generic-password item.
 * @param service - Keychain service name.
 * @returns Secret value or undefined when unavailable.
 */
function keychainSecret(service: string): string | undefined {
  try {
    return execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).replace(/\r?\n$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Trims trailing slashes from a configured URL.
 * @param value - URL value.
 * @returns URL without trailing slash.
 */
function stripTrailingSlashes(value: string): string {
  return value.endsWith("/") ? stripTrailingSlashes(value.slice(0, -1)) : value;
}

const creds = loadCreds();
const base = stripTrailingSlashes(
  process.env.BASE_URL ?? process.env.HDB_TARGET_URL ?? creds.clusterUrl
);
const username = secret("APP_USER_USERNAME", USERNAME_SERVICE);
const password = secret("APP_USER_PASSWORD", PASSWORD_SERVICE);
const auth = basicAuth(username, password);
const id = `rbac-denied-${randomUUID()}`;

const response = await fetch(`${base}/${TARGET_TABLE}/${id}`, {
  method: "PUT",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: auth,
  },
  body: JSON.stringify({
    id,
    legalName: "RBAC Smoke Should Not Persist",
    careerStatus: "active",
  }),
});

console.error(`[smoke_app_user_write_denied] PUT /${TARGET_TABLE}/${id}`);
if (response.status !== 403) {
  const body = await response.text();
  throw new Error(
    `expected 403 for app_user write denial, got ${response.status}: ${body.slice(0, 200)}`
  );
}
console.log("app_user write-denial smoke passed");

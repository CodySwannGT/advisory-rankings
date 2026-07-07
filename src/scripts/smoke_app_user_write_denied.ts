#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { basicAuth } from "../lib/rest.js";
import { loadCreds } from "./_auth.js";

const USERNAME_SERVICE = "advisory-rankings-testuser-username";
const PASSWORD_SERVICE = ["advisory-rankings-testuser", "password"].join("-");
const TARGET_TABLE = "Advisor";
const REQUEST_TIMEOUT_MS = 15_000;

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

/**
 * Requires an admin credential for cleanup paths.
 * @param value - Optional credential value.
 * @param name - Credential name for diagnostics.
 * @returns Present credential value.
 */
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
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
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  if (response.ok) await cleanupUnexpectedWrite(id, response.status, body);
  throw new Error(
    `expected 403 for app_user write denial, got ${response.status}: ${body.slice(0, 200)}`
  );
}
console.log("app_user write-denial smoke passed");

/**
 * Removes a row that should not have been writable by app_user.
 * @param rowId - Disposable Advisor id to delete.
 * @param writeStatus - Unexpected write response status.
 * @param writeBody - Unexpected write response body.
 */
async function cleanupUnexpectedWrite(
  rowId: string,
  writeStatus: number,
  writeBody: string
): Promise<void> {
  const adminAuth = basicAuth(
    required(creds.username, "HARPER_ADMIN_USERNAME"),
    required(creds.password, "HARPER_ADMIN_PASSWORD")
  );
  const cleanup = await fetch(`${base}/${TARGET_TABLE}/${rowId}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: adminAuth,
    },
  });
  if (![200, 204, 404].includes(cleanup.status)) {
    const cleanupBody = await cleanup.text();
    throw new Error(
      `expected 403 for app_user write denial, got ${writeStatus}: ${writeBody.slice(0, 200)}; cleanup DELETE returned ${cleanup.status}: ${cleanupBody.slice(0, 200)}`
    );
  }
}

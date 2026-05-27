#!/usr/bin/env node
/**
 * Mint a Harper-native operation_token via the documented
 * `create_authentication_tokens` op and print it on stdout.
 *
 * Usage:
 *   TOKEN=$(bun run --silent token)
 *   curl -H "Authorization: Bearer $TOKEN" \
 *        https://<cluster>/Feed
 *
 *   # or, both tokens as JSON:
 *   bun run token -- --json
 *
 * Reads creds from ~/.harper-fabric-credentials or env. See
 * src/scripts/_auth.ts for why this routes through Studio (Fabric
 * doesn't expose the ops API on :443 or :9925-from-here).
 */
import { createAuthTokens } from "./_auth.js";

/**
 * Subset of the Harper `create_authentication_tokens` response body
 * that this script depends on. `_auth.ts` is still `@ts-nocheck`'d, so
 * the producer's return is `any`; we narrow it here at the consumer.
 */
interface AuthTokenPair {
  readonly operation_token: string;
  readonly refresh_token?: string;
}

/**
 * Type predicate that confirms an unknown value is an {@link AuthTokenPair}
 * by checking the presence and shape of `operation_token`.
 *
 * @param value - Candidate response body from `createAuthTokens()`.
 * @returns `true` when `value` is an object with a string `operation_token`.
 */
const isAuthTokenPair = (value: unknown): value is AuthTokenPair => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("operation_token" in value)) {
    return false;
  }
  return typeof value.operation_token === "string";
};

const raw: unknown = await createAuthTokens();
if (!isAuthTokenPair(raw)) {
  throw new Error(
    "createAuthTokens() did not return an operation_token; check _auth.ts response shape"
  );
}
const tokens: AuthTokenPair = raw;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(tokens, null, 2));
} else {
  console.log(tokens.operation_token);
}

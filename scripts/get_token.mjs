#!/usr/bin/env node
/**
 * Mint a Harper-native operation_token via the documented
 * `create_authentication_tokens` op and print it on stdout.
 *
 * Usage:
 *   TOKEN=$(node scripts/get_token.mjs)
 *   curl -H "Authorization: Bearer $TOKEN" \
 *        https://<cluster>/Feed
 *
 *   # or, both tokens as JSON:
 *   node scripts/get_token.mjs --json
 *
 * Reads creds from ~/.harper-fabric-credentials or env. See
 * scripts/_auth.mjs for why this routes through Studio (Fabric
 * doesn't expose the ops API on :443 or :9925-from-here).
 */
import { createAuthTokens } from './_auth.mjs';

const tokens = await createAuthTokens();
if (process.argv.includes('--json')) {
	console.log(JSON.stringify(tokens, null, 2));
} else {
	console.log(tokens.operation_token);
}

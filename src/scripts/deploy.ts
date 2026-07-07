#!/usr/bin/env node
/* eslint-disable code-organization/enforce-statement-order, functional/immutable-data, functional/prefer-readonly-type, max-lines -- Deploy orchestration is intentionally linear and logs operations in execution order. */
/**
 * Deploy the local harper-app/ component to the Fabric cluster.
 *
 *   - Control-plane call (deploy_component) → Studio :443 proxy with
 *     a session cookie. That's the only Fabric-exposed path: the
 *     cluster's ops API at :9925 is firewalled from datacenter egress
 *     (see fabric-runbook §5), and the cluster's own :443 returns 404
 *     for ops calls. Fabric does not expose long-lived API tokens.
 *   - Control-plane restart/recovery → `restart` after upload, then a
 *     direct public-node deploy if replication leaves the public runtime stale.
 *   - Data-plane verification (post-restart /Firm/, /Feed) → native
 *     Harper JWT bearer minted via `create_authentication_tokens`.
 *     That's the documented Harper auth flow for REST routes.
 *
 * See src/scripts/_auth.ts for the helpers and the rationale.
 *
 * Usage:
 *   bun run deploy                     # ./harper-app
 *   PROJECT=advisor-app DIR=./harper-app bun run deploy
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCreds, StudioSession } from "./_auth.js";
import { isFreshnessCheckableDirectDeployFailure } from "../lib/deploy-result.js";
import { recoverPublicRuntime } from "../lib/deploy-runtime-recovery.js";
import {
  appUserRoleOperationPayload,
  findLiveAppUserRole,
  loadCommittedAppUserRole,
  normalizeLiveAppUserRole,
  roleDrift,
} from "../lib/harper-role-map.js";

const TAR_PATH = "/usr/bin/tar";
const PROJECT = process.env.PROJECT || "advisor-app";
const DIR = process.env.DIR || "harper-app";
const PACKAGE_JSON = "package.json";
const parsedRestartTimeoutMs = Number(
  process.env.HARPER_RESTART_TIMEOUT_MS ?? 60000
);
const RESTART_TIMEOUT_MS =
  Number.isFinite(parsedRestartTimeoutMs) && parsedRestartTimeoutMs > 0
    ? parsedRestartTimeoutMs
    : 15000;
const parsedDeployTimeoutMs = Number(
  process.env.HARPER_DEPLOY_TIMEOUT_MS ?? 420000
);
const DEPLOY_TIMEOUT_MS =
  Number.isFinite(parsedDeployTimeoutMs) && parsedDeployTimeoutMs > 0
    ? parsedDeployTimeoutMs
    : 420000;
const FRESHNESS_POLL_ATTEMPTS = 18;
const FRESHNESS_POLL_INTERVAL_MS = 5000;
const PUBLIC_RUNTIME_FRESH_ROUNDS = 3;
const PUBLIC_RUNTIME_FRESH_ROUND_DELAY_MS = 5000;
const FEED_READINESS_TIMEOUT_MS = 10000;
// Secondary resource routes (e.g. /AdvisorComparison) cold-start after a
// restart and can take seconds to answer their first request. Poll them with a
// short per-attempt timeout so a single slow first hit retries instead of
// hanging the full restart-scale budget and failing an otherwise healthy deploy.
const ROUTE_READINESS_ATTEMPTS = 6;
const ROUTE_READINESS_INTERVAL_MS = 5000;
const ROUTE_READINESS_TIMEOUT_MS = 15000;
const creds = loadCreds();

/**
 * Deployment archive metadata needed for upload and progress output.
 */
interface DeployPackage {
  readonly bytes: number;
  readonly payload: string;
  readonly payloadBytes: number;
}

/**
 * Minimal Fabric response shape returned by deploy_component.
 */
interface DeployResult {
  readonly body: unknown;
  readonly status: number;
}

/**
 * Public feed response fields used for post-deploy verification.
 */
interface FeedJson {
  readonly count?: number;
  readonly items?: readonly unknown[];
}

/** Browser version module content written by the build step. */
interface VersionModule {
  readonly expected: string;
  readonly observed: string;
  /**
   * Whether the served main bundle (`index.js`) byte-matches the locally built
   * one. `version.js` is tiny and replicates to the serving node first; the
   * larger bundle lags, so matching it confirms the component fully propagated
   * (not just the version marker) before smoke runs.
   */
  readonly bundleFresh: boolean;
}

/**
 * Builds the deploy archive while excluding local-only dependencies and caches.
 * @param dir - Harper component directory to package.
 * @returns The compressed archive bytes ready to send to Fabric.
 */
function buildTarball(dir: string): Buffer {
  // Skip node_modules (Harper installs its own runtime; bootstrap.sh
  // symlinks one in, but it's invalid on the cluster) and other
  // caches that don't belong in a deploy.
  const tmp = mkdtempSync(join(tmpdir(), "hdb-deploy-"));
  const out = join(tmp, "pkg.tar.gz");
  const args = [
    "--exclude=./node_modules",
    "--exclude=./.git",
    "--exclude=./.harperdb",
    "--exclude=./tests/screenshots",
    "--exclude=./._*",
    "--exclude=./**/._*",
    "-czf",
    out,
    "-C",
    dir,
    ".",
  ];
  const r = spawnSync(TAR_PATH, args, {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (r.status !== 0) throw new Error(`tar failed (${r.status})`);
  const bytes = readFileSync(out);
  rmSync(tmp, { recursive: true, force: true });
  return bytes;
}

/**
 * Formats byte counts for the short deployment progress log.
 * @param n - Number of bytes to display.
 * @returns A compact byte, kilobyte, or megabyte label.
 */
function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

/**
 * Builds the base64 payload and byte counts used by Fabric deployment.
 * @returns Archive metadata for logging and upload.
 */
function buildDeployPackage(): DeployPackage {
  const tgz = buildTarball(DIR);
  const payload = tgz.toString("base64");
  return { bytes: tgz.length, payload, payloadBytes: payload.length };
}

/**
 * Sends the prepared package through the Studio cluster operation API.
 * @param studio - Authenticated Studio session.
 * @param payload - Base64-encoded deployment archive.
 * @returns Fabric status and response body.
 */
async function submitDeploy(
  studio: StudioSession,
  payload: string
): Promise<DeployResult> {
  return (await studio.clusterOp(creds.clusterId, "deploy_component", {
    project: PROJECT,
    payload,
    restart: "rolling",
    replicated: true,
  })) as DeployResult;
}

/**
 * Converts the public cluster URL into the direct Operations API endpoint.
 * @returns Public node Operations API URL.
 */
function directOpsUrl(): string {
  const url = new URL(creds.clusterUrl);
  url.port = "9925";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/**
 * Builds the Basic auth header for the public node's Operations API.
 *
 * The direct path authenticates with the admin username/password against the
 * node's :9925 Operations API directly. Minting a JWT through the Studio proxy
 * (`create_authentication_tokens`) fails on this Fabric cluster with
 * "Instance domain socket does not exist", so Basic auth is used instead.
 * @returns A `Basic <base64>` Authorization header value.
 */
function directAuthHeader(): string {
  const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString(
    "base64"
  );
  return `Basic ${encoded}`;
}

/**
 * Runs an operation directly against the public Harper node.
 *
 * Studio deploys currently land on the east node, while the public app is
 * served from the west node. When clustering replication is disconnected, this
 * direct path updates the runtime that smoke tests hit.
 * @param operation - Harper operation name.
 * @param extra - Additional operation fields.
 * @param timeoutMs - Optional request timeout.
 * @returns Status and parsed response body.
 */
async function directClusterOp(
  operation: string,
  extra: Readonly<Record<string, unknown>> = {},
  timeoutMs?: number
): Promise<DeployResult> {
  const controller =
    timeoutMs === undefined ? undefined : new AbortController();
  const timeout =
    timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(directOpsUrl(), {
      method: "POST",
      headers: {
        Authorization: directAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operation, ...extra }),
      signal: controller?.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Explicitly restarts the Harper service after a component upload.
 *
 * Fabric accepts `restart: true` on `deploy_component`, but the public app can
 * continue serving the previous static/resource module set after the operation
 * reports success. A second control-plane restart makes the deploy gate wait on
 * the runtime that users and smoke tests actually hit.
 * @param studio - Authenticated Studio session.
 * @returns Fabric status and response body.
 */
async function restartHarper(studio: StudioSession): Promise<DeployResult> {
  return (await studio.clusterOp(
    creds.clusterId,
    "restart",
    { replicated: true },
    { timeoutMs: RESTART_TIMEOUT_MS }
  )) as DeployResult;
}

/**
 * Prints Fabric deployment output and exposes the status for exit handling.
 * @param dep - Fabric deployment response.
 * @returns The HTTP status returned by Fabric.
 */
function logDeployResult(dep: DeployResult): number {
  console.log(`  status: ${dep.status}`);
  console.log(`  body:   ${JSON.stringify(dep.body).slice(0, 300)}`);
  return dep.status;
}

/**
 * Detects a timed-out restart request. Fabric can restart the service before
 * flushing the proxy response, so the deploy gate should move to data-plane
 * polling instead of hanging indefinitely.
 * @param error - Unknown thrown value from fetch/AbortController.
 * @returns True when the restart request was aborted by our timeout.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Detects a dropped direct Operations API connection during restart.
 * @param error - Unknown thrown value from fetch.
 * @returns True when the restart likely closed the socket before a response.
 */
function isFetchDisconnect(error: unknown): boolean {
  return error instanceof TypeError && error.message === "fetch failed";
}

/**
 * Issues an explicit post-upload service restart through Fabric.
 * @param studio - Authenticated Studio session.
 * @returns The HTTP status returned by Fabric.
 */
async function restartDeployedService(studio: StudioSession): Promise<number> {
  console.log("▶ restart Harper runtime");
  try {
    return logDeployResult(await restartHarper(studio));
  } catch (error) {
    if (!isAbortError(error)) throw error;
    console.log(
      `  restart request timed out after ${RESTART_TIMEOUT_MS}ms; continuing to data-plane readiness checks`
    );
    return 200;
  }
}

/**
 * Deploys the component directly to the public node when Studio replication is
 * disconnected.
 * @returns The HTTP status returned by Harper.
 */
async function deployPublicRuntime(): Promise<number> {
  const deployPackage = buildDeployPackage();
  console.log(`▶ direct deploy_component ${directOpsUrl()} project=${PROJECT}`);
  const result = await directClusterOp(
    "deploy_component",
    {
      project: PROJECT,
      payload: deployPackage.payload,
      restart: true,
    },
    DEPLOY_TIMEOUT_MS
  );
  const status = logDeployResult(result);
  if (isFreshnessCheckableDirectDeployFailure(status, result.body)) {
    console.warn(
      "  direct deploy reached the origin node but replication failed; continuing to runtime freshness checks"
    );
    return await restartPublicRuntime();
  }
  return status;
}

/**
 * Restarts the public node after a direct deploy.
 * @returns The HTTP status returned by Harper, or 200 on timeout.
 */
async function restartPublicRuntime(): Promise<number> {
  console.log("▶ direct restart public Harper runtime");
  try {
    return logDeployResult(
      await directClusterOp("restart", {}, RESTART_TIMEOUT_MS)
    );
  } catch (error) {
    if (!isAbortError(error) && !isFetchDisconnect(error)) throw error;
    const reason = isAbortError(error)
      ? `timed out after ${RESTART_TIMEOUT_MS}ms`
      : "dropped the Operations API connection";
    console.log(
      `  restart request ${reason}; continuing to data-plane readiness checks`
    );
    return 200;
  }
}

/**
 * Packages and submits the component through the Fabric Studio proxy.
 * @param studio - Authenticated Studio session.
 * @returns Fabric deployment response.
 */
async function deployComponent(studio: StudioSession): Promise<DeployResult> {
  const deployPackage = buildDeployPackage();

  console.log(`▶ packaging ${DIR}/`);
  console.log(
    `  package: ${fmtBytes(deployPackage.bytes)} → ${fmtBytes(deployPackage.payloadBytes)} base64`
  );

  console.log(`▶ deploy_component project=${PROJECT}`);
  const result = await submitDeployWithDisconnectTolerance(
    studio,
    deployPackage.payload
  );
  logDeployResult(result);
  return result;
}

/**
 * Submits the component package while tolerating Studio proxy disconnects that happen after upload acceptance.
 * @param studio - Authenticated Studio session.
 * @param payload - Base64-encoded deployment archive.
 * @returns Fabric response, or an indeterminate success that must be proven by freshness checks.
 */
async function submitDeployWithDisconnectTolerance(
  studio: StudioSession,
  payload: string
): Promise<DeployResult> {
  try {
    return await submitDeploy(studio, payload);
  } catch (error) {
    if (!isFetchDisconnect(error)) throw error;
    console.warn(
      "  deploy_component request dropped while waiting for Fabric; continuing to runtime freshness checks"
    );
    return {
      status: 200,
      body: {
        message:
          "deploy_component request dropped after upload; runtime freshness checks will confirm whether the component landed",
      },
    };
  }
}

/**
 * Polls the public feed until the restarted component is serving traffic.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @param attempt - Current retry attempt, used to cap polling.
 * @returns The first successful feed response, or the final failed response.
 */
async function waitForFeed(
  clusterUrl: string,
  attempt = 0
): Promise<Response | null> {
  if (attempt >= 30) return null;

  await new Promise(resolve => setTimeout(resolve, 2000));
  const feed = await fetchWithTimeout(
    `${clusterUrl}/Feed`,
    {
      headers: { Accept: "application/json" },
    },
    FEED_READINESS_TIMEOUT_MS
  ).catch(() => null);
  if (feed?.ok) {
    console.log(`  back up after ${attempt * 2 + 2}s`);
    return feed;
  }
  process.stdout.write(".");
  return waitForFeed(clusterUrl, attempt + 1);
}

/**
 * Logs the feed polling banner before delegating to the retry loop.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @returns The first successful feed response, or null when polling expires.
 */
async function waitForLoggedFeed(clusterUrl: string): Promise<Response | null> {
  console.log(`▶ waiting for ${clusterUrl}/Feed to respond …`);
  return await waitForFeed(clusterUrl);
}

/**
 * Prints the final public feed summary after a healthy restart.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @param feed - Successful feed response.
 */
async function logFeedSummary(
  clusterUrl: string,
  feed: Response
): Promise<void> {
  const j = (await feed.json()) as FeedJson;

  console.log(
    `▶ ${clusterUrl}/Feed → HTTP 200, count=${j.count}, items=${j.items?.length ?? 0}`
  );
}

/**
 * Reads the expected app version from package.json.
 * @returns Package version built into the browser bundle.
 */
async function expectedAppVersion(): Promise<string> {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as Readonly<{
    version?: string;
  }>;
  return manifest.version || "0.0.0";
}

/**
 * Extracts APP_VERSION from the generated browser module.
 * @param source - JavaScript module text from /version.js.
 * @returns Version string, or empty string when the module is malformed.
 */
function parseVersionModule(source: string): string {
  return /APP_VERSION\s*=\s*["']([^"']+)["']/.exec(source)?.[1] ?? "";
}

/**
 * Fetches a URL with a bounded timeout so a stalled rollout route fails fast
 * instead of wedging the deploy verification phase.
 * @param url - URL to fetch.
 * @param init - Optional fetch init (headers, method).
 * @param timeoutMs - Abort timeout in milliseconds.
 * @returns The fetch Response.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = RESTART_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches and parses the public version module.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @returns Expected and observed version strings.
 */
async function deployedVersion(clusterUrl: string): Promise<VersionModule> {
  const expected = await expectedAppVersion();
  const [versionResponse, bundleResponse] = await Promise.all([
    fetchWithTimeout(`${clusterUrl}/version.js`, {
      headers: { Accept: "application/javascript" },
    }),
    fetchWithTimeout(`${clusterUrl}/index.js`, {
      headers: { Accept: "text/javascript" },
    }),
  ]);
  const observed = versionResponse.ok
    ? parseVersionModule(await versionResponse.text())
    : "";
  const bundleFresh =
    bundleResponse.ok &&
    (await bundleResponse.text()) === readFileSync(localBundlePath(), "utf8");
  return { expected, observed, bundleFresh };
}

/**
 * Absolute path to the locally built main browser bundle, used as the
 * replication-complete marker for freshness verification.
 * @returns Path to `<DIR>/web/index.js`.
 */
function localBundlePath(): string {
  return join(DIR, "web", "index.js");
}

/**
 * Summarizes a route-readiness failure for the retry log without leaking stacks.
 * @param error - Unknown thrown value from fetch/AbortController.
 * @returns A short, human-readable cause.
 */
function describeRouteError(error: unknown): string {
  if (isAbortError(error)) return "request timed out";
  if (isFetchDisconnect(error)) return "connection dropped";
  return error instanceof Error ? error.message : String(error);
}

/**
 * Verifies a public GET route returns 200 after deploy, polling to absorb the
 * cold-start latency a freshly restarted resource route shows on its first
 * request. The version + bundle freshness gate has already proven the component
 * propagated to the serving node, so a single slow or transient first hit must
 * retry rather than fail an otherwise healthy deploy.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @param path - Absolute path to check.
 * @param attempts - Remaining poll attempts.
 * @returns Nothing once the route answers 200, else throws after the budget.
 */
async function verifyPublicRoute(
  clusterUrl: string,
  path: string,
  attempts = ROUTE_READINESS_ATTEMPTS
): Promise<void> {
  const outcome = await fetchWithTimeout(
    `${clusterUrl}${path}`,
    { headers: { Accept: "application/json, text/javascript, */*" } },
    ROUTE_READINESS_TIMEOUT_MS
  ).then(
    response => ({ ready: response.ok, detail: `HTTP ${response.status}` }),
    (error: unknown) => ({ ready: false, detail: describeRouteError(error) })
  );
  if (outcome.ready) return;
  if (attempts <= 1) {
    throw new Error(`${path} did not become ready: ${outcome.detail}`);
  }
  console.log(
    `  ${path} not ready (${outcome.detail}); retrying … (${attempts - 1} left)`
  );
  await new Promise(resolve =>
    setTimeout(resolve, ROUTE_READINESS_INTERVAL_MS)
  );
  return verifyPublicRoute(clusterUrl, path, attempts - 1);
}

/**
 * Verifies that the public runtime is serving this build, not stale files.
 * @param clusterUrl - Base URL for the deployed Harper component.
 */
async function verifyRuntimeFreshness(clusterUrl: string): Promise<void> {
  // Poll until the public node serves this build. When the direct :9925 path
  // is unreachable (CI), the freshly deployed component reaches the serving
  // node via cluster replication, which can lag the deploy by a few seconds.
  const version = await pollDeployedVersion(
    clusterUrl,
    FRESHNESS_POLL_ATTEMPTS
  );
  console.log(
    `▶ ${clusterUrl}/version.js → ${version.observed || "missing"} (expected ${version.expected}); bundle fresh: ${version.bundleFresh}`
  );
  if (version.observed !== version.expected) {
    throw new Error(
      `deployed version mismatch: expected ${version.expected}, observed ${version.observed || "missing"}`
    );
  }
  if (!version.bundleFresh) {
    throw new Error(
      "deployed bundle (index.js) does not match this build; cluster replication did not propagate the full component to the serving node in time"
    );
  }

  await verifyPublicRoute(clusterUrl, "/");
  await verifyPublicRoute(clusterUrl, "/app.css");
  await verifyPublicRoute(clusterUrl, "/compare.js");
  await verifyPublicRoute(clusterUrl, "/AdvisorComparison");
  await verifyPublicRoute(clusterUrl, "/source-triage");
  await verifyPublicRoute(clusterUrl, "/firms/deploy-route-probe");
  await verifyPublicRoute(clusterUrl, "/advisors/deploy-route-probe");
  await verifyPublicRoute(clusterUrl, "/articles/deploy-route-probe");
  await verifyStablePublicRuntime(clusterUrl);
  console.log("▶ public static assets and comparison resources verified");
}

/**
 * Verifies repeated public reads keep returning this build. A single fresh
 * response can come from one node while the public URL later routes to a stale
 * peer, so the deploy gate samples consecutive rounds before it reports green.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @param rounds - Consecutive fresh rounds still required.
 * @returns Promise that resolves when all sampled rounds are fresh.
 */
async function verifyStablePublicRuntime(
  clusterUrl: string,
  rounds = PUBLIC_RUNTIME_FRESH_ROUNDS
): Promise<void> {
  const version = await deployedVersion(clusterUrl);
  if (
    version.observed !== version.expected ||
    version.observed === "" ||
    !version.bundleFresh
  ) {
    throw new Error(
      `public runtime drifted after deploy: expected ${version.expected}, observed ${version.observed || "missing"}, bundle fresh: ${version.bundleFresh}`
    );
  }
  if (rounds <= 1) {
    console.log(
      `▶ public runtime stayed fresh for ${PUBLIC_RUNTIME_FRESH_ROUNDS} consecutive rounds`
    );
    return;
  }
  await new Promise(resolve =>
    setTimeout(resolve, PUBLIC_RUNTIME_FRESH_ROUND_DELAY_MS)
  );
  return verifyStablePublicRuntime(clusterUrl, rounds - 1);
}

/**
 * Polls the public version module until it matches the expected build or the
 * attempt budget is exhausted, giving cluster replication time to propagate
 * the freshly deployed component to the serving node.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @param attempts - Remaining poll attempts.
 * @returns The last observed expected/observed version pair.
 */
async function pollDeployedVersion(
  clusterUrl: string,
  attempts: number
): Promise<VersionModule> {
  const version = await deployedVersion(clusterUrl).catch(() => ({
    expected: "",
    observed: "",
    bundleFresh: false,
  }));
  if (
    version.observed === version.expected &&
    version.observed !== "" &&
    version.bundleFresh
  ) {
    return version;
  }
  if (attempts <= 1) return version;
  console.log(
    `  /version.js → ${version.observed || "missing"} (expected ${version.expected}), bundle fresh: ${version.bundleFresh}; waiting for replication … (${attempts - 1} left)`
  );
  await new Promise(resolve => setTimeout(resolve, FRESHNESS_POLL_INTERVAL_MS));
  return pollDeployedVersion(clusterUrl, attempts - 1);
}

/**
 * Deploys the component, preferring the instance's direct Operations API.
 *
 * The direct `:9925` path is primary because it lands straight on the public
 * serving node (so the freshness gate never waits on east→west replication)
 * and bypasses the Fabric Studio proxy, which intermittently loses its
 * instance domain socket and then returns 500 ("Instance domain socket does
 * not exist.") for every control op — failing deploys even though the runtime
 * is healthy (see fabric-runbook §5). GitHub-hosted runners can reach `:9925`
 * (verified), so this is the primary CI path too. The Studio proxy remains a
 * fallback for any environment that cannot reach `:9925`; force it with
 * `DEPLOY_VIA=studio`.
 * @param studio - Authenticated Studio session, used only for the fallback.
 * @returns Whether the component was deployed successfully.
 */
async function deployAndRestart(studio: StudioSession): Promise<boolean> {
  if (await tryDirectDeploy()) return true;
  console.warn("  falling back to the Studio control-plane proxy deploy");
  return deployViaStudio(studio);
}

/**
 * Attempts the primary direct `:9925` deploy, reporting whether it succeeded.
 * A non-200 status or an unreachable port resolves to `false` so the caller
 * falls back to the Studio proxy; only unexpected errors propagate.
 * @returns True when the direct deploy returned HTTP 200.
 */
async function tryDirectDeploy(): Promise<boolean> {
  if (process.env.DEPLOY_VIA === "studio") {
    console.log("▶ DEPLOY_VIA=studio — skipping the direct ops deploy");
    return false;
  }
  try {
    const status = await deployPublicRuntime();
    if (status === 200) return true;
    console.warn(`  direct ops deploy returned ${status}`);
    return false;
  } catch (error) {
    if (!isFetchDisconnect(error) && !isAbortError(error)) throw error;
    console.warn(`  direct ops API unreachable (${describeRouteError(error)})`);
    return false;
  }
}

/**
 * Deploys and restarts through the Fabric Studio control-plane proxy. Used as
 * a fallback when the direct `:9925` ops API is unavailable.
 * @param studio - Authenticated Studio session.
 * @returns Whether the Studio deploy succeeded.
 */
async function deployViaStudio(studio: StudioSession): Promise<boolean> {
  const result = await deployComponent(studio);
  if (result.status !== 200) return false;
  // deploy_component already restarts the runtime (restart: "rolling"); the
  // explicit restart is best-effort and Fabric can return 500 for the
  // cluster-level `restart`, so a non-200 here must not abort — the freshness
  // gate is the real correctness guard.
  const restartStatus = await restartDeployedService(studio);
  if (restartStatus !== 200) {
    console.warn(
      `  Studio restart returned ${restartStatus}; deploy_component already restarted the runtime, continuing`
    );
  }
  return true;
}

/**
 * Verifies that the public feed responds after deployment restart.
 * @param clusterUrl - Base URL for the deployed Harper component.
 */
async function verifyFeed(clusterUrl: string): Promise<void> {
  const feed = await waitForLoggedFeed(clusterUrl);
  console.log();
  if (!feed || !feed.ok) {
    console.log(
      "  /Feed never came back up:",
      feed?.status,
      (await feed?.text())?.slice(0, 300)
    );
    process.exitCode = 1;
    return;
  }
  await logFeedSummary(clusterUrl, feed);
  await verifyRuntimeFreshness(clusterUrl);
}

/**
 * Explicitly applies the committed `app_user` role after component deploy.
 *
 * The component roles extension loads the initial role file, but a live deploy
 * showed it did not update an existing role with a newly exported table grant.
 * Keep the committed map authoritative by upserting the role, then re-reading
 * the live role with the same drift logic CI uses.
 * @param studio - Authenticated Studio session.
 * @returns True when live RBAC matches the committed map after sync.
 */
async function syncAppUserRole(studio: StudioSession): Promise<boolean> {
  const expected = loadCommittedAppUserRole();
  const before = await listRolesForSync(studio, "before");
  if (before === undefined) return false;

  const liveRole = findLiveAppUserRole(before.body);
  if (!(await applyAppUserRole(studio, expected, liveRole))) return false;

  const after = await listRolesForSync(studio, "after");
  if (after === undefined) return false;

  return verifyAppUserRoleSync(expected, after.body);
}

/**
 * Reads live Harper roles for the deploy role-sync step.
 * @param studio - Authenticated Studio session.
 * @param phase - Log label for the read.
 * @returns The `list_roles` response when successful.
 */
async function listRolesForSync(
  studio: StudioSession,
  phase: "before" | "after"
): Promise<Readonly<{ body: unknown }> | undefined> {
  const response = await studio.clusterOp(
    creds.clusterId,
    "list_roles",
    {},
    { timeoutMs: DEPLOY_TIMEOUT_MS }
  );
  if (response.status === 200) return response;
  console.error(
    `list_roles failed ${phase} role sync: ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`
  );
  return undefined;
}

/**
 * Applies the committed app-user role to Harper.
 * @param studio - Authenticated Studio session.
 * @param expected - Committed role map.
 * @param liveRole - Existing live role row when present.
 * @returns True when the mutation succeeds.
 */
async function applyAppUserRole(
  studio: StudioSession,
  expected: ReturnType<typeof loadCommittedAppUserRole>,
  liveRole: ReturnType<typeof findLiveAppUserRole>
): Promise<boolean> {
  const operation = liveRole ? "alter_role" : "add_role";
  const roleId = typeof liveRole?.id === "string" ? liveRole.id : "app_user";
  console.log(`▶ ${operation} app_user role from harper-app/roles.yaml`);
  const mutation = await studio.clusterOp(
    creds.clusterId,
    operation,
    appUserRoleOperationPayload(expected, roleId),
    { timeoutMs: DEPLOY_TIMEOUT_MS }
  );
  if (mutation.status === 200) return true;
  console.error(
    `${operation} failed: ${mutation.status} ${JSON.stringify(mutation.body).slice(0, 300)}`
  );
  return false;
}

/**
 * Verifies that the live role now matches the committed role.
 * @param expected - Committed role map.
 * @param roles - Raw `list_roles` response body.
 * @returns True when no drift remains.
 */
function verifyAppUserRoleSync(
  expected: ReturnType<typeof loadCommittedAppUserRole>,
  roles: unknown
): boolean {
  const drift = roleDrift(expected, normalizeLiveAppUserRole(roles));
  if (drift.length > 0) {
    console.error("app_user role still drifts after sync:");
    for (const line of drift) console.error(`  - ${line}`);
    return false;
  }
  console.log(
    `  app_user role synced (${Object.keys(expected.data.tables).length} tables)`
  );
  return true;
}

/**
 * Runs credential validation, component upload, and post-deploy health check.
 */
async function main(): Promise<void> {
  if (!creds.username || !creds.password) {
    console.error(
      "missing HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD (env or ~/.harper-fabric-credentials)"
    );
    process.exitCode = 2;
    return;
  }

  const studio = await new StudioSession(creds).login();
  console.log(`▶ Studio login as ${creds.username}`);

  if (!(await deployAndRestart(studio))) {
    process.exitCode = 1;
    return;
  }
  if (!(await syncAppUserRole(studio))) {
    process.exitCode = 1;
    return;
  }

  if (!creds.clusterUrl) {
    console.log(
      "  (HARPER_CLUSTER_URL not set; skipping post-deploy verification)"
    );
    return;
  }

  try {
    await verifyFeed(creds.clusterUrl);
  } catch (error) {
    const recovered = await recoverPublicRuntime(error, {
      deployPublicRuntime,
      restartPublicRuntime,
      verifyFeed: () => verifyFeed(creds.clusterUrl),
    });
    if (!recovered) {
      process.exitCode = 1;
    }
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exitCode = 1;
});
/* eslint-enable code-organization/enforce-statement-order, functional/immutable-data, functional/prefer-readonly-type, max-lines -- Re-enable after deploy orchestration module. */

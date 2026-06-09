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
import { recoverPublicRuntime } from "../lib/deploy-runtime-recovery.js";

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
const FEED_READINESS_TIMEOUT_MS = 10000;
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
 * Detects Fabric replication failures embedded in a successful deploy response.
 * @param dep - Fabric deployment response.
 * @returns True when at least one replica failed.
 */
function hasReplicationFailures(dep: DeployResult): boolean {
  if (dep.body === null || typeof dep.body !== "object") return false;
  if (!("replicated" in dep.body) || !Array.isArray(dep.body.replicated)) {
    return false;
  }
  return dep.body.replicated.some(
    replica =>
      replica !== null &&
      typeof replica === "object" &&
      "status" in replica &&
      replica.status !== "success"
  );
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
  return logDeployResult(
    await directClusterOp(
      "deploy_component",
      {
        project: PROJECT,
        payload: deployPackage.payload,
        restart: true,
      },
      DEPLOY_TIMEOUT_MS
    )
  );
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
 * Verifies a public GET route returns 200 after deploy.
 * @param clusterUrl - Base URL for the deployed Harper component.
 * @param path - Absolute path to check.
 */
async function verifyPublicRoute(
  clusterUrl: string,
  path: string
): Promise<void> {
  const response = await fetchWithTimeout(`${clusterUrl}${path}`, {
    headers: { Accept: "application/json, text/javascript, */*" },
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
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

  await verifyPublicRoute(clusterUrl, "/compare.js");
  await verifyPublicRoute(clusterUrl, "/AdvisorComparison");
  console.log("▶ public comparison assets/resources verified");
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
 * Uploads the component and restarts the Harper runtime.
 * @param studio - Authenticated Studio session.
 * @returns Whether both control-plane operations succeeded.
 */
async function deployAndRestart(studio: StudioSession): Promise<boolean> {
  const result = await deployComponent(studio);
  if (result.status !== 200) return false;
  // The explicit Studio restart is best-effort: deploy_component already
  // restarts the runtime (restart: true), and verifyRuntimeFreshness is the
  // real correctness guard. Fabric returns 500 for the cluster-level `restart`
  // op, so a non-200 here must not abort before the direct public-node
  // fallback — that fallback is what updates the node smoke tests actually hit
  // when replication is disconnected.
  const restartStatus = await restartDeployedService(studio);
  if (restartStatus !== 200) {
    console.warn(
      `  Studio restart returned ${restartStatus}; deploy_component already restarted the runtime, continuing`
    );
  }
  if (!hasReplicationFailures(result)) return true;

  // Replica push failed in the deploy_component response. Try to update the
  // public node directly — this works from a network that can reach :9925, but
  // that port is firewalled from datacenter egress (CI), so treat it as
  // best-effort: if it's unreachable we fall through to the freshness gate,
  // which waits for cluster replication to propagate the component to the
  // serving node and fails the deploy only if it never does.
  if (process.env.SKIP_DIRECT_PUBLIC_DEPLOY === "1") {
    console.warn(
      "  SKIP_DIRECT_PUBLIC_DEPLOY=1 — skipping direct public-node deploy; relying on cluster replication + freshness gate (simulates CI)"
    );
    return true;
  }
  console.warn(
    "Fabric reported replica deployment failures; attempting direct public-node deploy"
  );
  try {
    if ((await deployPublicRuntime()) === 200) {
      await restartPublicRuntime();
    }
  } catch (error) {
    console.warn(
      `  direct public-node deploy unavailable from this network (${String(error)}); relying on cluster replication + freshness gate`
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

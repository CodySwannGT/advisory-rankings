#!/usr/bin/env node
/**
 * Deploy the local harper-app/ component to the Fabric cluster.
 *
 *   - Control-plane call (deploy_component) → Studio :443 proxy with
 *     a session cookie. That's the only Fabric-exposed path: the
 *     cluster's ops API at :9925 is firewalled from datacenter egress
 *     (see fabric-runbook §5), and the cluster's own :443 returns 404
 *     for ops calls. Fabric does not expose long-lived API tokens.
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

const TAR_PATH = "/usr/bin/tar";
const PROJECT = process.env.PROJECT || "advisor-app";
const DIR = process.env.DIR || "harper-app";
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
    "-czf",
    out,
    "-C",
    dir,
    ".",
  ];
  const r = spawnSync(TAR_PATH, args, { stdio: "inherit" });
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
    restart: true,
    replicated: true,
  })) as DeployResult;
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
 * Packages and submits the component through the Fabric Studio proxy.
 * @param studio - Authenticated Studio session.
 * @returns The HTTP status returned by Fabric.
 */
async function deployComponent(studio: StudioSession): Promise<number> {
  const deployPackage = buildDeployPackage();

  console.log(`▶ packaging ${DIR}/`);
  console.log(
    `  package: ${fmtBytes(deployPackage.bytes)} → ${fmtBytes(deployPackage.payloadBytes)} base64`
  );

  console.log(`▶ deploy_component project=${PROJECT}`);
  return logDeployResult(await submitDeploy(studio, deployPackage.payload));
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
  const feed = await fetch(`${clusterUrl}/Feed`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
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

  if ((await deployComponent(studio)) !== 200) {
    process.exitCode = 1;
    return;
  }

  if (!creds.clusterUrl) {
    console.log(
      "  (HARPER_CLUSTER_URL not set; skipping post-deploy verification)"
    );
    return;
  }

  await verifyFeed(creds.clusterUrl);
}

main().catch(err => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exitCode = 1;
});

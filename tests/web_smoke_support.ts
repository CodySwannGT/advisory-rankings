import { resolve } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { createAuthTokens, loadCreds } from "../src/scripts/_auth.js";

export const BASE = process.env.BASE_URL || "http://127.0.0.1:9926";
export const SHOTS = resolve("tests/screenshots");
export const ARTICLE_CARD_SELECTOR = "article.card";
export const DISCLOSURE_CARD_SELECTOR = ".event-card.disclosure";
export const FEED_HEADLINE_SELECTOR = "article.card .post-headline";
export const PROFILE_HEADING_SELECTOR = ".profile-head h1";
// Deployed-data waits (search/directory/feed responses + their rendered rows).
// Raised 30s→60s: the dev Fabric cluster serializes work and degrades under the
// smoke's concurrent page load — e.g. /Search?q=wells (kind=all) is ~1s in
// isolation but ~4s under 8 concurrent requests, and during the search scenario
// it contends with the homepage's heavy /Feed (~3s, 451 items), so a queued
// kind=firm request can miss a 30s budget. Endpoints are independently verified
// sub-second in isolation, so this absorbs cluster-concurrency variance without
// weakening real-regression detection (a reintroduced full-table scan is 16s+
// under load; a 500/empty response fails instantly). The real fix — bounding
// these endpoints to native paginated queries — is tracked in #721.
export const DEPLOYED_DATA_TIMEOUT = 60000;
// Quick non-data UI waits; also raised to absorb the same cluster variance for
// the data-backed list/table selectors that use this budget. Same rationale and
// follow-up (#721) as DEPLOYED_DATA_TIMEOUT above.
export const QUICK_UI_TIMEOUT = 30000;
export const CARD_TITLE_SELECTOR = ".card h2.card-title";
export const TAYLOR_GROUP_TEXT = "The Taylor Group";
export const isLocalDev = /^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE);

const NAVIGATION_ATTEMPTS = 3;
const NAVIGATION_RETRY_DELAY_MS = 1500;
const DYNAMIC_CONTENT_ATTEMPTS = 2;
const DYNAMIC_CONTENT_RETRY_DELAY_MS = 1500;

/** One smoke assertion produced by a scenario. */
export interface Check {
  readonly label: string;
  readonly passed: boolean;
}

/**
 * Creates a passing smoke assertion.
 * @param label - Human-readable assertion text.
 * @returns A passing check record.
 */
export function pass(label: string): Check {
  return { label, passed: true };
}

const fail = (label: string, detail = ""): Check => ({
  label: `${label}${detail ? ` - ${detail}` : ""}`,
  passed: false,
});

/**
 * Converts a boolean expression into a smoke check.
 * @param condition - Whether the assertion passed.
 * @param label - Human-readable assertion text.
 * @param detail - Short detail captured from the page.
 * @returns A pass or fail check.
 */
export function check(condition: boolean, label: string, detail = ""): Check {
  return (
    [fail(label, detail), pass(label)][Number(condition)] ?? fail(label, detail)
  );
}

/**
 * Navigates with retries for transient post-deploy connection resets.
 * @param page - Browser page to navigate.
 * @param url - Absolute URL to open.
 */
export async function smokeGoto(page: Page, url: string): Promise<void> {
  await retryAsync(
    () => page.goto(url, { waitUntil: "domcontentloaded" }),
    NAVIGATION_ATTEMPTS,
    NAVIGATION_RETRY_DELAY_MS
  );
}

/**
 * Waits for dynamic page content, reloading once if the deployed app stalls.
 * @param page - Browser page to inspect.
 * @param selector - CSS selector expected after client-side rendering.
 * @param timeout - Per-attempt selector timeout.
 */
export async function smokeWaitForSelector(
  page: Page,
  selector: string,
  timeout = DEPLOYED_DATA_TIMEOUT
): Promise<void> {
  await retryPageContent(
    page,
    () => page.waitForSelector(selector, { timeout }),
    DYNAMIC_CONTENT_ATTEMPTS,
    DYNAMIC_CONTENT_RETRY_DELAY_MS
  );
}

/**
 * Retries an async browser action after short waits.
 * @param action - Action to execute.
 * @param attempts - Total attempts before rethrowing the last error.
 * @param delayMs - Delay between attempts.
 * @returns The action result from the first successful attempt.
 */
export async function retryAsync<T>(
  action: () => Promise<T>,
  attempts: number,
  delayMs: number
): Promise<T> {
  return await retryAttempt(action, attempts, delayMs, 1);
}

/**
 * Executes one retry attempt and recurses on failure.
 * @param action - Action to execute.
 * @param attempts - Total attempts before rethrowing the last error.
 * @param delayMs - Base delay between attempts.
 * @param attempt - Current attempt number.
 * @returns The action result from the first successful attempt.
 */
async function retryAttempt<T>(
  action: () => Promise<T>,
  attempts: number,
  delayMs: number,
  attempt: number
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (attempt >= attempts) throw error;
    await wait(delayMs * attempt);
    return await retryAttempt(action, attempts, delayMs, attempt + 1);
  }
}

/**
 * Retries a page content assertion and reloads between attempts.
 * @param page - Browser page to reload after a failed attempt.
 * @param action - Content assertion to execute.
 * @param attempts - Total attempts before rethrowing the last error.
 * @param delayMs - Base delay between attempts.
 * @param attempt - Current attempt number.
 * @returns The action result from the first successful attempt.
 */
async function retryPageContent<T>(
  page: Page,
  action: () => Promise<T>,
  attempts: number,
  delayMs: number,
  attempt = 1
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (attempt >= attempts) throw error;
    await wait(delayMs * attempt);
    await page.reload({ waitUntil: "domcontentloaded" });
    return await retryPageContent(page, action, attempts, delayMs, attempt + 1);
  }
}

/**
 * Waits for the supplied duration.
 * @param milliseconds - Time to wait.
 */
async function wait(milliseconds: number): Promise<void> {
  await new Promise(resolveWait => setTimeout(resolveWait, milliseconds));
}

/**
 * Captures a full-page screenshot under the shared smoke screenshot folder.
 * @param page - Playwright page to capture.
 * @param name - Screenshot basename without extension.
 */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/**
 * Verifies profile routes use canonical clean paths.
 * @param kind - Profile route segment such as firms, advisors, or teams.
 * @param url - Current browser URL.
 * @returns Whether the path matches canonical or legacy accepted forms.
 */
export function cleanProfilePath(kind: string, url: string): boolean {
  const path = new URL(url).pathname;
  const canonical = new RegExp(`^/${kind}/[a-z0-9-]+-[0-9a-f-]{36}$`, "i");
  const legacySlug = new RegExp(`^/${kind}/[a-z0-9-]+$`, "i");
  const legacyId = new RegExp(`^/${kind}/[0-9a-f-]{36}$`, "i");
  return canonical.test(path) || legacySlug.test(path) || legacyId.test(path);
}

/**
 * Builds optional JWT headers for deployed smoke checks.
 * @returns Extra browser headers or undefined for anonymous checks.
 */
export async function authHeaders(): Promise<
  Record<string, string> | undefined
> {
  if (isLocalDev || process.env.AUTH !== "jwt") return undefined;
  const creds = loadCreds();
  if (!creds.username || !creds.password) return undefined;
  const { operation_token: operationToken } = await createAuthTokens(creds);
  return { Authorization: `Bearer ${operationToken}` };
}

/**
 * Opens a browser context with the standard smoke viewport and headers.
 * @param browser - Browser that owns the context.
 * @param viewport - Viewport dimensions for the context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns A configured Playwright context.
 */
export async function newContext(
  browser: Browser,
  viewport: Readonly<{ height: number; width: number }>,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders,
  });
  // Raise the default for every implicit wait (waitForResponse/Function/URL,
  // action actionability) from Playwright's 30s to the smoke's deployed-data
  // budget. The dev cluster serializes work under the smoke's concurrent
  // page-load, so individually-fast endpoints can queue past 30s; relying on
  // per-call timeouts left several waits (e.g. the kind=firm waitForResponse)
  // on the 30s default. Real regressions still fail (a full-table scan is 16s+
  // under load; a 500/empty fails instantly). Bounded-query follow-up: #721.
  context.setDefaultTimeout(DEPLOYED_DATA_TIMEOUT);
  context.setDefaultNavigationTimeout(DEPLOYED_DATA_TIMEOUT);
  return context;
}

/** Heavy endpoints whose health gates the deploy smoke after a restart. */
const STABILITY_PATHS: readonly string[] = [
  "/Feed",
  "/Search?q=wells",
  "/Search?q=wells&kind=firm",
  "/PublicAdvisors?limit=24",
  "/PublicFirms?limit=24",
  "/PublicTeams?limit=24",
];
/** Consecutive all-healthy probe rounds required before scenarios run. */
const STABILITY_REQUIRED_ROUNDS = 2;
/** Per-endpoint budget within a probe round. */
const STABILITY_PROBE_TIMEOUT = 8000;
/** Pause between probe rounds. */
const STABILITY_ROUND_DELAY = 4000;
/** Hard cap on the stabilization wait before proceeding best-effort. */
const STABILITY_DEADLINE = 300000;

/**
 * Resolves after the given delay.
 * @param ms - Milliseconds to wait.
 * @returns A promise that resolves after `ms`.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Probes every stability path once. Healthy when all return a 2xx within the
 * per-endpoint budget; HTTP/2 / connection errors and timeouts count as
 * unhealthy (they are exactly the post-restart instability we wait out).
 * @param page - Browser page whose request context is reused.
 * @returns True when every probed endpoint responded OK.
 */
async function probeClusterRound(page: Page): Promise<boolean> {
  const results = await Promise.all(
    STABILITY_PATHS.map(path =>
      page.request
        .get(`${BASE}${path}`, { timeout: STABILITY_PROBE_TIMEOUT })
        .then(response => response.ok())
        .catch(() => false)
    )
  );
  return results.every(Boolean);
}

/**
 * Recursively polls until the cluster is healthy for the required number of
 * consecutive rounds, or the deadline passes (then proceeds best-effort).
 * @param page - Browser page whose request context is reused.
 * @param healthyRounds - Consecutive healthy rounds observed so far.
 * @param deadline - Epoch ms after which to stop waiting and proceed.
 * @returns Resolves once stable or the deadline passes.
 */
async function awaitStable(
  page: Page,
  healthyRounds: number,
  deadline: number
): Promise<void> {
  if (healthyRounds >= STABILITY_REQUIRED_ROUNDS) {
    console.log(`✓ deployed cluster stable (${healthyRounds} healthy rounds)`);
    return;
  }
  if (Date.now() >= deadline) {
    console.log("⚠ cluster did not stabilize before deadline; proceeding");
    return;
  }
  const healthy = await probeClusterRound(page);
  await delay(STABILITY_ROUND_DELAY);
  return awaitStable(page, healthy ? healthyRounds + 1 : 0, deadline);
}

/**
 * Gates the deploy smoke on cluster stability after a Harper restart. The smoke
 * runs immediately after the deploy restarts Harper, during which the Fabric
 * edge intermittently stalls requests or returns HTTP/2 protocol errors —
 * making individually-fast endpoints hang past even a 60s wait. This polls the
 * heavy endpoints until they respond cleanly for several consecutive rounds
 * (also paying cold-start), so scenarios run against a settled cluster rather
 * than the unstable post-restart window. Best-effort: proceeds after a deadline
 * and never throws. Skipped against a local dev server.
 * @param page - Browser page whose request context (cookies/headers) is reused.
 */
export async function awaitDeployedClusterStable(page: Page): Promise<void> {
  if (isLocalDev) return;
  await awaitStable(page, 0, Date.now() + STABILITY_DEADLINE);
}

/**
 * Asserts a FINRA CRD badge renders for an advisor that actually has one,
 * picked from the live directory (`hasCrd=true`) rather than a fixed fixture
 * whose deployed record may lack a finraCrd.
 * @param page - Browser page used for the scenario.
 * @returns A single CRD-badge presence check.
 */
export async function verifyCrdBadgeRenders(page: Page): Promise<Check> {
  const label = "advisor.html: FINRA CRD badge present";
  if (isLocalDev) return pass(label);
  await smokeGoto(page, `${BASE}/advisors?hasCrd=true`);
  const firstRow = page.locator(".center .entity-list .row").first();
  await firstRow.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const href = await firstRow.evaluate(
    row =>
      row.getAttribute("href") ||
      row.querySelector("a")?.getAttribute("href") ||
      ""
  );
  if (!href) return check(false, label, "no CRD advisor row found");
  await smokeGoto(page, `${BASE}${href}`);
  await page
    .locator(PROFILE_HEADING_SELECTOR)
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const crdBadges = await page
    .locator(".profile-head .tag")
    .filter({ hasText: /CRD/i })
    .count();
  return check(crdBadges >= 1, label, `derived advisor ${href}`);
}

/**
 * Closes a temporary context after its checks have been calculated.
 * @param context - Browser context to close.
 * @param checks - Scenario assertions to return to the caller.
 * @returns The supplied checks after context cleanup.
 */
export async function closeWithChecks(
  context: BrowserContext,
  checks: readonly Check[]
): Promise<readonly Check[]> {
  await context.close();
  return checks;
}

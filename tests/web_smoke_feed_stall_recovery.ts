/**
 * Deterministic regression guard for the deploy-cutover hang.
 *
 * The incident: a Harper Fabric deploy restarts the serving node; the first
 * request after the restart cold-starts and was observed hanging ~30s before
 * responding. The web client's `api()` had no fetch timeout, so that one
 * stalled request pinned the whole page open and dead-ended the feed and
 * session UI ("Could not load feed" + "Session status is temporarily
 * unavailable") for the full stall.
 *
 * The deploy smoke could never catch this: `awaitDeployedClusterStable` waits
 * the cold-start window out *before* any scenario runs, and the only other
 * feed-fault test injects an instant 503 (a returned error status, not a
 * stall). This scenario closes that gap deterministically — it does not race a
 * real cutover.
 *
 * It shrinks the client's per-attempt timeout via the `__AB_REQUEST_TIMEOUT_MS__`
 * hook, stalls the FIRST `/Feed` past that window, and asserts the feed renders
 * **on its own** — using a plain `waitForSelector` with NO reload. The smoke's
 * usual `smokeWaitForSelector` reloads the page on a stall, which would recover
 * the feed via a fresh page load and mask whether the client recovered; this
 * test deliberately avoids that so the ONLY thing that can satisfy the
 * assertion is the client aborting the stalled request and retrying in place.
 * Remove the per-attempt timeout/abort and the first `/Feed` blocks until this
 * wait expires — the exact regression that shipped.
 *
 * Note: this asserts behavior of the *served* client bundle, so it is
 * meaningful only against a build that carries the timeout (the post-deploy
 * smoke and the local-Harper `test:e2e`), not against an older deployed bundle.
 */
import type { Browser, Page, Route } from "playwright";
import {
  BASE,
  FEED_HEADLINE_SELECTOR,
  ARTICLE_CARD_SELECTOR,
  check,
  closeWithChecks,
  newContext,
  shot,
  smokeGoto,
  type Check,
} from "./web_smoke_support.js";

/** Shortened per-attempt client timeout for the test (ms). */
const TEST_REQUEST_TIMEOUT_MS = 1000;
/** First-request stall, comfortably past the client timeout (ms). */
const FEED_STALL_MS = 2500;
/**
 * How long to wait for the in-place client retry to render the feed. Generous
 * enough for the retry's real backend round-trip under load; on a regression
 * (no abort) the stalled request never yields and this elapses, failing fast
 * enough to be a usable gate.
 */
const RECOVERY_TIMEOUT_MS = 25000;

/**
 * Drives the stalled-then-recovered `/Feed` scenario in an isolated context.
 *
 * The client timeout is shortened via an init script so the abort fires fast;
 * the first `/Feed` is held past that window (so the client aborts it) while
 * the retry falls through to the backend and succeeds — with no page reload.
 * @param browser - Browser used for the isolated, route-mocked context.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @returns Stall-recovery assertions.
 */
export async function smokeFeedStallRecovery(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  await page.addInitScript(timeoutMs => {
    Object.assign(globalThis, { __AB_REQUEST_TIMEOUT_MS__: timeoutMs });
  }, TEST_REQUEST_TIMEOUT_MS);

  await routeOneStalledFeed(page);

  await smokeGoto(page, `${BASE}/`);
  // Plain wait — NO reload. Only an in-place client retry can satisfy this.
  const recovered = await page
    .waitForSelector(FEED_HEADLINE_SELECTOR, { timeout: RECOVERY_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  await shot(page, "10-feed-stall-recovery");
  const recoveredCards = await page.locator(ARTICLE_CARD_SELECTOR).count();

  return await closeWithChecks(context, [
    check(
      recovered,
      "stalled /Feed is aborted and retried in place (no reload) so the feed renders",
      `clientTimeout=${TEST_REQUEST_TIMEOUT_MS}ms, stall=${FEED_STALL_MS}ms`
    ),
    check(
      recoveredCards >= 1,
      "feed shows rows after the client recovers from the stall",
      `cards=${recoveredCards}`
    ),
  ]);
}

async function routeOneStalledFeed(page: Page): Promise<void> {
  const stallOnce = async (route: Route): Promise<void> => {
    await sleep(FEED_STALL_MS);
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], nextCursor: null, hasMore: false }),
      })
      .catch(() => undefined);
  };
  await page.route("**/Feed", stallOnce, { times: 1 });
}

/**
 * Resolves after the given delay. A route handler cannot use Playwright's
 * page-scoped waits, so the stall uses a plain timer.
 * @param ms - Milliseconds to wait.
 * @returns A promise that resolves after `ms`.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

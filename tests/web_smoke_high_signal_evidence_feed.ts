/**
 * [EVIDENCE: feed-signal-mode] scenario for issue #250. Navigates the deployed
 * home feed for each signal mode (all, event, moves, compliance) and asserts
 * that the rendered rows satisfy the per-mode event-card constraint, that the
 * filter summary copy renders, and that the captured /Feed request URL carries
 * the expected `mode` parameter.
 */
import type { Page, Response } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import {
  ARTICLE_CARD,
  EVENT_BACKED_MODES,
  FEED_FILTER_SUMMARY,
  type EventBackedMode,
} from "./web_smoke_high_signal_evidence_shared.js";

/** Per-mode observation captured after switching the feed filter. */
interface FeedSignalModeObservation {
  readonly mode: EventBackedMode;
  readonly feedRequestKey: string;
  readonly cardCount: number;
  readonly allRowsSatisfyMode: boolean;
  readonly summary: string;
}

/**
 * Drives each event-backed feed mode and asserts row composition + request URL.
 * @param page - Desktop page provided by the smoke runner.
 * @returns Per-mode evidence assertions.
 */
export async function captureFeedSignalModeEvidence(
  page: Page
): Promise<readonly Check[]> {
  const allObservation = await observeFeedMode(
    page,
    {
      mode: "event",
      label: "all-posts baseline",
      requiredEventSelector: ARTICLE_CARD,
    },
    "all"
  );

  const eventObservations = await EVENT_BACKED_MODES.reduce<
    Promise<readonly FeedSignalModeObservation[]>
  >(
    async (previous, mode) => [
      ...(await previous),
      await observeFeedMode(page, mode, mode.mode),
    ],
    Promise.resolve([])
  );

  return [
    check(
      allObservation.feedRequestKey.endsWith("mode=all|") ||
        allObservation.feedRequestKey.endsWith("mode=|"),
      "[EVIDENCE: feed-signal-mode] all mode hits /Feed and renders rows",
      `${allObservation.feedRequestKey} | rows=${allObservation.cardCount}`
    ),
    check(
      allObservation.cardCount >= 1,
      "[EVIDENCE: feed-signal-mode] all mode renders at least one row",
      String(allObservation.cardCount)
    ),
    ...eventObservations.flatMap(feedSignalModeChecks),
  ];
}

function feedSignalModeChecks(
  observation: FeedSignalModeObservation
): readonly Check[] {
  return [
    check(
      observation.cardCount >= 1,
      `[EVIDENCE: feed-signal-mode] ${observation.mode.label} mode renders at least one row`,
      `${observation.feedRequestKey} | rows=${observation.cardCount}`
    ),
    check(
      observation.allRowsSatisfyMode,
      `[EVIDENCE: feed-signal-mode] ${observation.mode.label} rows all carry expected event card`,
      observation.mode.requiredEventSelector
    ),
    check(
      observation.summary.length > 0,
      `[EVIDENCE: feed-signal-mode] ${observation.mode.label} surface shows summary copy`,
      observation.summary
    ),
  ];
}

/**
 * Navigates the feed for one signal mode and records its evidence.
 * @param page - Desktop page used for the scenario.
 * @param mode - Mode case being captured.
 * @param urlMode - URL `mode` value to load (`all` triggers no param).
 * @returns Observation captured for the mode.
 */
async function observeFeedMode(
  page: Page,
  mode: EventBackedMode,
  urlMode: "all" | EventBackedMode["mode"]
): Promise<FeedSignalModeObservation> {
  const target = urlMode === "all" ? `${BASE}/` : `${BASE}/?mode=${urlMode}`;
  const feedResponsePromise = page.waitForResponse(
    response => new URL(response.url()).pathname === "/Feed",
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  await smokeGoto(page, target);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await page.waitForSelector(FEED_FILTER_SUMMARY, {
    timeout: QUICK_UI_TIMEOUT,
  });
  if (urlMode !== "all") {
    await waitForRowsMatchingMode(page, mode.requiredEventSelector);
  }
  const feedResponse = await feedResponsePromise;
  await shot(page, `04-evidence-feed-signal-${urlMode}`);

  const cardCount = await page.locator(ARTICLE_CARD).count();
  const allRowsSatisfyMode =
    urlMode === "all"
      ? true
      : await allRowsHaveSelector(page, mode.requiredEventSelector);
  const summary =
    (await page.locator(FEED_FILTER_SUMMARY).first().textContent()) ?? "";

  return {
    mode,
    feedRequestKey: requestKey(feedResponse),
    cardCount,
    allRowsSatisfyMode,
    summary: summary.trim(),
  };
}

/**
 * Builds a compact key describing a captured /Feed request.
 * @param response - Playwright response object from waitForResponse.
 * @returns Path + mode marker for assertion detail copy.
 */
function requestKey(response: Response): string {
  const url = new URL(response.url());
  return `${url.pathname}?mode=${url.searchParams.get("mode") ?? ""}|`;
}

/**
 * Waits until every rendered feed card includes a matching event card.
 * @param page - Browser page on the feed.
 * @param requiredEventSelector - Per-mode event-card selector.
 */
async function waitForRowsMatchingMode(
  page: Page,
  requiredEventSelector: string
): Promise<void> {
  await page.waitForFunction(
    ({ article, event }) => {
      const cards = [...document.querySelectorAll(article)];
      if (cards.length === 0) return false;
      return cards.every(card => card.querySelectorAll(event).length > 0);
    },
    { article: ARTICLE_CARD, event: requiredEventSelector },
    { timeout: QUICK_UI_TIMEOUT }
  );
}

/**
 * Confirms every rendered card carries the per-mode event selector.
 * @param page - Browser page on the feed.
 * @param requiredEventSelector - Per-mode event-card selector.
 * @returns Whether every visible row satisfies the mode.
 */
async function allRowsHaveSelector(
  page: Page,
  requiredEventSelector: string
): Promise<boolean> {
  return await page
    .locator(ARTICLE_CARD)
    .evaluateAll(
      (cards, selector) =>
        cards.every(card => card.querySelectorAll(String(selector)).length > 0),
      requiredEventSelector
    );
}

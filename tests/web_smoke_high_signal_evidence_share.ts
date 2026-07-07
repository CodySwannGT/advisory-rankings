/**
 * [EVIDENCE: feed-filter-url-state] scenario for issue #250. Applies the feed
 * mode + category filters via the UI, captures the URL, then proves the URL
 * deterministically restores the same filter state across (a) an in-place
 * reload and (b) a freshly opened browser context (a shared link).
 */
import type { Browser, Page } from "playwright";
import {
  BASE,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  newContext,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import {
  FEED_CATEGORY_SELECT,
  FEED_FILTER_SUMMARY,
  FEED_MODE_SELECT,
} from "./web_smoke_high_signal_evidence_shared.js";

/** Restored state observed in the share-target browser context. */
interface RestoredUrlState {
  readonly modeRestored: boolean;
  readonly categoryRestored: boolean;
  readonly modeValue: string;
  readonly categoryValue: string;
  readonly summaryPresent: boolean;
  readonly summary: string;
}

/**
 * Verifies that a filtered URL restores the same filter state in a fresh
 * browser context (simulating a shared link).
 * @param page - Desktop page used to derive a real category value.
 * @param browser - Browser used to open the share-target context.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @returns URL-state evidence assertions.
 */
export async function captureFeedFilterUrlStateEvidence(
  page: Page,
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const category = await firstAvailableCategory(page);

  if (!category) {
    return [
      check(
        false,
        "[EVIDENCE: feed-filter-url-state] no category available in deployed feed",
        "category-discovery returned empty string"
      ),
    ];
  }

  await page.locator(FEED_MODE_SELECT).selectOption("event");
  await page.locator(FEED_CATEGORY_SELECT).selectOption(category);
  await waitForFeedFilterUrl(page, category);
  const shareUrl = page.url();
  await shot(page, "04-evidence-feed-filter-url-source");

  await page.reload({ waitUntil: "domcontentloaded" });
  // Wait for the filter card itself, not feed headlines, so that an empty
  // filtered set (legitimately possible when a non-event-backed category is
  // forced into event mode) still proves URL state was restored.
  await page.waitForSelector(FEED_FILTER_SUMMARY, {
    timeout: QUICK_UI_TIMEOUT,
  });
  const reloadMode = await page.locator(FEED_MODE_SELECT).inputValue();
  const reloadCategory = await page.locator(FEED_CATEGORY_SELECT).inputValue();

  const restored = await openShareUrlInFreshContext(
    browser,
    extraHTTPHeaders,
    shareUrl
  );

  return feedFilterUrlStateChecks(
    shareUrl,
    category,
    reloadMode,
    reloadCategory,
    restored
  );
}

/**
 * Waits for feed filter controls to serialize into the current URL.
 * @param page - Browser page with feed filters.
 * @param category - Selected category value.
 */
async function waitForFeedFilterUrl(
  page: Page,
  category: string
): Promise<void> {
  await page.waitForURL(
    url => {
      const params = new URL(url).searchParams;
      return (
        params.get("mode") === "event" && params.get("category") === category
      );
    },
    { timeout: QUICK_UI_TIMEOUT }
  );
}

function feedFilterUrlStateChecks(
  shareUrl: string,
  category: string,
  reloadMode: string,
  reloadCategory: string,
  restored: RestoredUrlState
): readonly Check[] {
  return [
    check(
      shareUrl.includes("mode=event") &&
        shareUrl.includes(`category=${category}`),
      "[EVIDENCE: feed-filter-url-state] active filters serialize into URL",
      shareUrl
    ),
    check(
      reloadMode === "event" && reloadCategory === category,
      "[EVIDENCE: feed-filter-url-state] reload restores filter selects",
      `mode=${reloadMode} category=${reloadCategory}`
    ),
    check(
      restored.modeRestored && restored.categoryRestored,
      "[EVIDENCE: feed-filter-url-state] shared URL restores filters in fresh session",
      `mode=${restored.modeValue} category=${restored.categoryValue}`
    ),
    check(
      restored.summaryPresent,
      "[EVIDENCE: feed-filter-url-state] shared URL renders filter summary",
      restored.summary
    ),
  ];
}

/**
 * Captures the deployed feed payload and returns a category that has at
 * least one event-backed row (so `?mode=event&category=<...>` is non-empty
 * after reload). Falls back to any non-`unknown` category, then `unknown`.
 * @param page - Desktop page positioned on the feed.
 * @returns A category present in the deployed payload, or "" if none.
 */
async function firstAvailableCategory(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const response = await fetch("/Feed");
    const body = (await response.json()) as {
      readonly items?: readonly {
        readonly article?: { readonly category?: string };
        readonly eventCards?: readonly unknown[];
      }[];
    };
    const items = Array.isArray(body.items) ? body.items : [];
    const eventBacked = items
      .filter(item => (item.eventCards ?? []).length > 0)
      .map(item => item.article?.category ?? "")
      .find(category => category.length > 0 && category !== "unknown");
    if (eventBacked) return eventBacked;
    const anyKnown = items
      .map(item => item.article?.category ?? "")
      .find(category => category.length > 0 && category !== "unknown");
    if (anyKnown) return anyKnown;
    const fallback = items
      .map(item => item.article?.category ?? "")
      .find(category => category.length > 0);
    return fallback ?? "";
  });
}

/**
 * Opens the share-target URL in a fresh browser context and inspects the
 * restored filter state.
 * @param browser - Browser used to create the new context.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @param shareUrl - Filtered URL produced by the source session.
 * @returns Restored filter state observed in the fresh context.
 */
async function openShareUrlInFreshContext(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined,
  shareUrl: string
): Promise<RestoredUrlState> {
  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  try {
    await smokeGoto(page, shareUrl);
    await page.waitForSelector(FEED_FILTER_SUMMARY, {
      timeout: QUICK_UI_TIMEOUT,
    });
    await shot(page, "04-evidence-feed-filter-url-restore");
    const modeValue = await page.locator(FEED_MODE_SELECT).inputValue();
    const categoryValue = await page.locator(FEED_CATEGORY_SELECT).inputValue();
    const params = new URL(shareUrl).searchParams;
    const expectedMode = params.get("mode") ?? "";
    const expectedCategory = params.get("category") ?? "";
    const summary =
      (await page.locator(FEED_FILTER_SUMMARY).first().textContent()) ?? "";
    return {
      modeRestored: modeValue === expectedMode,
      categoryRestored: categoryValue === expectedCategory,
      modeValue,
      categoryValue,
      summaryPresent: summary.trim().length > 0,
      summary: summary.trim(),
    };
  } finally {
    await context.close();
  }
}

/**
 * [EVIDENCE: filtered-empty-and-error] scenario for issue #250. Captures one
 * explicit empty-filter state (mode + category combination that has no rows)
 * and one transient `/Feed` failure-then-recovery cycle (single-shot route
 * fulfillment that unroutes itself so the next request succeeds).
 */
import type { Browser, Page, Route } from "playwright";
import {
  BASE,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  newContext,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import {
  ARTICLE_CARD,
  FEED_CATEGORY_SELECT,
  FEED_ERROR_SELECTOR,
  FEED_ERROR_TITLE,
  FEED_FILTER_EMPTY_TEXT,
  FEED_MODE_SELECT,
} from "./web_smoke_high_signal_evidence_shared.js";

/**
 * Captures one explicit empty-filter state and a transient-error recovery
 * cycle for the feed surface.
 * @param page - Desktop page used for the empty-state scenario.
 * @param browser - Browser used for the route-mocked error/recovery scenario.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @returns Empty-state + transient-error evidence assertions.
 */
export async function captureFilteredEmptyAndErrorEvidence(
  page: Page,
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const emptyChecks = await captureEmptyFilterEvidence(page);
  const errorChecks = await captureTransientErrorRecoveryEvidence(
    browser,
    extraHTTPHeaders
  );
  return [...emptyChecks, ...errorChecks];
}

/**
 * Drives a category/mode combination known to produce no rows.
 * @param page - Desktop page used for the scenario.
 * @returns Empty-state evidence assertions.
 */
async function captureEmptyFilterEvidence(
  page: Page
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const emptyCategory = await categoryWithoutMoves(page);
  if (!emptyCategory) {
    return [
      check(
        false,
        "[EVIDENCE: filtered-empty-and-error] no category-without-moves found",
        "deployed feed has a transition event in every category"
      ),
    ];
  }
  await page.locator(FEED_MODE_SELECT).selectOption("moves");
  await page.locator(FEED_CATEGORY_SELECT).selectOption(emptyCategory);
  await page.waitForSelector(FEED_FILTER_EMPTY_TEXT, {
    timeout: QUICK_UI_TIMEOUT,
  });
  await shot(page, "04-evidence-feed-empty-filter");
  const emptyVisible =
    (await page.locator(FEED_FILTER_EMPTY_TEXT).count()) >= 1;

  return [
    check(
      emptyVisible,
      "[EVIDENCE: filtered-empty-and-error] zero-result filter renders explicit empty state",
      `moves / ${emptyCategory}`
    ),
  ];
}

/**
 * Finds an article category that has zero `transition` event-card rows in the
 * deployed feed.
 * @param page - Desktop page used to fetch /Feed in-browser.
 * @returns Category value or "" if every category has a move.
 */
async function categoryWithoutMoves(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const response = await fetch("/Feed");
    const body = (await response.json()) as {
      readonly items?: readonly {
        readonly article?: { readonly category?: string };
        readonly eventCards?: readonly { readonly kind?: string }[];
      }[];
    };
    const items = Array.isArray(body.items) ? body.items : [];
    const allCategories = new Set(
      items
        .map(item => item.article?.category)
        .filter(
          (category): category is string =>
            typeof category === "string" && category.length > 0
        )
    );
    const moveCategories = new Set(
      items
        .filter(item =>
          (item.eventCards ?? []).some(
            (event: { readonly kind?: string }) => event.kind === "transition"
          )
        )
        .map(item => item.article?.category)
        .filter(
          (category): category is string =>
            typeof category === "string" && category.length > 0
        )
    );
    const empty = [...allCategories].find(
      category => !moveCategories.has(category)
    );
    return empty ?? "";
  });
}

/**
 * Forces a transient `/Feed` failure inside a route-mocked context, captures
 * the canonical error state, then lets subsequent requests succeed and
 * confirms the feed re-renders rows after a Retry click. The route handler
 * unroutes itself on its first invocation so no mutable counter is required.
 * @param browser - Browser used for the isolated context.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @returns Transient-error recovery evidence assertions.
 */
async function captureTransientErrorRecoveryEvidence(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  const oneShotFailure = async (route: Route): Promise<void> => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "transient-evidence" }),
    });
  };
  await page.route("**/Feed", oneShotFailure, { times: 1 });

  await smokeGoto(page, `${BASE}/`);
  await page.waitForSelector(FEED_ERROR_SELECTOR, {
    timeout: QUICK_UI_TIMEOUT,
  });
  await shot(page, "04-evidence-feed-transient-error");
  const errorTitlePresent = (await page.locator(FEED_ERROR_TITLE).count()) >= 1;
  const retryButton = page.getByRole("button", { name: "Retry" }).first();
  const retryVisible = (await retryButton.count()) >= 1;
  if (retryVisible) {
    await retryButton.click();
  } else {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await shot(page, "04-evidence-feed-transient-recovery");
  const recoveredCards = await page.locator(ARTICLE_CARD).count();

  return await closeWithChecks(context, [
    check(
      errorTitlePresent,
      "[EVIDENCE: filtered-empty-and-error] transient /Feed failure renders canonical error state",
      `retry=${retryVisible}`
    ),
    check(
      recoveredCards >= 1,
      "[EVIDENCE: filtered-empty-and-error] feed recovers after the transient failure",
      `cards=${recoveredCards}`
    ),
  ]);
}

/**
 * [EVIDENCE: mobile-filter-usability] scenario for issue #250. Repeats the
 * feed-mode change and the Firms search-kind toggle at 390px, asserting URL
 * persistence, the absence of horizontal overflow, and firm-only result rows.
 */
import type { Browser, Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
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
  FEED_FILTER_SUMMARY,
  FEED_MODE_SELECT,
  SEARCH_RESULT_ROWS,
} from "./web_smoke_high_signal_evidence_shared.js";

/**
 * Drives feed filter mode + search-kind toggle inside a 390px viewport.
 * @param browser - Browser used for the mobile context.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @returns Mobile-usability evidence assertions.
 */
export async function captureMobileFilterEvidence(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 390, height: 844 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  return await closeWithChecks(context, [
    ...(await captureMobileFeedFilter(page)),
    ...(await captureMobileSearchKind(page)),
  ]);
}

/**
 * Switches to the recruiting-moves feed mode at 390px and confirms URL state
 * + lack of horizontal overflow.
 * @param page - Mobile page used for the scenario.
 * @returns Mobile feed-filter assertions.
 */
async function captureMobileFeedFilter(page: Page): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await page.locator(FEED_MODE_SELECT).selectOption("moves");
  await page.waitForURL(
    url => new URL(url).searchParams.get("mode") === "moves",
    { timeout: QUICK_UI_TIMEOUT }
  );
  await page.waitForSelector(FEED_FILTER_SUMMARY, {
    timeout: QUICK_UI_TIMEOUT,
  });
  await shot(page, "04-evidence-mobile-feed-filter");

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const summary =
    (await page.locator(FEED_FILTER_SUMMARY).first().textContent()) ?? "";

  return [
    check(
      page.url().includes("mode=moves"),
      "[EVIDENCE: mobile-filter-usability] 390px feed mode change persists in URL",
      page.url()
    ),
    check(
      overflow.scrollWidth <= overflow.clientWidth,
      "[EVIDENCE: mobile-filter-usability] 390px filtered feed has no horizontal overflow",
      `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`
    ),
    check(
      summary.trim().length > 0,
      "[EVIDENCE: mobile-filter-usability] 390px feed filter summary visible",
      summary.trim()
    ),
  ];
}

/**
 * Switches the global search to firm-kind at 390px and confirms filtered rows
 * + aria-pressed state.
 * @param page - Mobile page used for the scenario.
 * @returns Mobile search-kind assertions.
 */
async function captureMobileSearchKind(page: Page): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const input = page.locator("#global-search");
  await input.fill("wells");
  await page
    .locator(SEARCH_RESULT_ROWS)
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const responsePromise = page.waitForResponse(isWellsFirmSearchResponse, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await page.getByRole("button", { name: "Firms" }).click();
  const response = await responsePromise;
  await page
    .locator(SEARCH_RESULT_ROWS)
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "04-evidence-mobile-search-kind-firm");

  const observed = await readMobileSearchKindState(page);

  return [
    check(
      response.status() === 200 && response.url().includes("kind=firm"),
      "[EVIDENCE: mobile-filter-usability] 390px search kind=firm request succeeds",
      `${response.url()} status=${response.status()}`
    ),
    check(
      observed.buttonPressed === "true",
      "[EVIDENCE: mobile-filter-usability] 390px Firms toggle reports aria-pressed",
      observed.buttonPressed
    ),
    check(
      observed.visibleKinds.length >= 1 &&
        observed.visibleKinds.every(
          kind => kind.trim().toLowerCase() === "firm"
        ),
      "[EVIDENCE: mobile-filter-usability] 390px firm mode shows firm-only rows",
      observed.visibleKinds.join(",")
    ),
  ];
}

async function readMobileSearchKindState(page: Page) {
  return {
    buttonPressed:
      (await page
        .getByRole("button", { name: "Firms" })
        .getAttribute("aria-pressed")) ?? "",
    visibleKinds: await page
      .locator(`${SEARCH_RESULT_ROWS} .gs-kind`)
      .allTextContents(),
  };
}

function isWellsFirmSearchResponse(response: { url(): string }): boolean {
  const url = new URL(response.url());
  return (
    url.pathname === "/Search" &&
    url.searchParams.get("q") === "wells" &&
    url.searchParams.get("kind") === "firm"
  );
}

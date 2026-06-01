import type { Browser, Page } from "playwright";
import {
  BASE,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  newContext,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const COMPARISON_TABLE_SELECTOR = ".comparison-table";
const COMPARISON_ROW_SELECTOR = ".comparison-table tbody tr";
const BROKERCHECK_ATTRIBUTION_SELECTOR = ".comparison-source-attribution";
const BROKERCHECK_ATTRIBUTION_TEXT = "FINRA BrokerCheck";
const DESKTOP_SHOT = "comparison-ui-desktop";
const MOBILE_SHOT = "comparison-ui-mobile";

interface FeedPayload {
  readonly items?: readonly FeedItem[];
}

interface FeedItem {
  readonly advisors?: readonly AdvisorChip[];
}

interface AdvisorChip {
  readonly id?: string;
}

/**
 * Exercises the public advisor comparison route with advisor ids selected from
 * the live Feed payload.
 * @param page - Desktop page shared by smoke scenarios.
 * @param browser - Browser used for the mobile viewport check.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for desktop and mobile comparison rendering.
 */
export async function smokeComparison(
  page: Page,
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const ids = await feedAdvisorIds(page);
  if (ids.length < 2) {
    return [check(false, "compare: Feed exposes two advisor ids")];
  }

  const path = `/compare?ids=${ids.slice(0, 2).map(encodeURIComponent).join(",")}`;
  await smokeGoto(page, `${BASE}${path}`);
  await smokeWaitForSelector(page, COMPARISON_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  await shot(page, DESKTOP_SHOT);

  const desktop = await comparisonMetrics(page);
  const mobileContext = await newContext(
    browser,
    { width: 320, height: 900 },
    extraHTTPHeaders
  );
  const mobilePage = await mobileContext.newPage();
  await smokeGoto(mobilePage, `${BASE}${path}`);
  await smokeWaitForSelector(
    mobilePage,
    COMPARISON_TABLE_SELECTOR,
    QUICK_UI_TIMEOUT
  );
  await shot(mobilePage, MOBILE_SHOT);
  const mobile = await comparisonMetrics(mobilePage);

  return [
    check(
      desktop.h1Text === "Advisor comparison",
      "compare: desktop route renders page heading",
      desktop.h1Text
    ),
    check(
      desktop.rowCount >= 6,
      "compare: desktop renders all diligence sections",
      `rows ${desktop.rowCount}`
    ),
    check(
      desktop.neutralMissingStates >= 1,
      "compare: desktop renders neutral missing states",
      `states ${desktop.neutralMissingStates}`
    ),
    check(
      desktop.brokerCheckAttributionCount >= 1,
      "compare: desktop renders BrokerCheck attribution",
      `attributions ${desktop.brokerCheckAttributionCount}`
    ),
    ...(await closeWithChecks(mobileContext, [
      check(
        mobile.scrollWidth <= mobile.clientWidth,
        "compare: mobile page avoids viewport overflow",
        `${mobile.scrollWidth}/${mobile.clientWidth}`
      ),
      check(
        mobile.tableScrollWidth >= mobile.tableClientWidth,
        "compare: mobile table remains horizontally scrollable",
        `${mobile.tableScrollWidth}/${mobile.tableClientWidth}`
      ),
      check(
        mobile.rowCount >= 6,
        "compare: mobile renders all diligence sections",
        `rows ${mobile.rowCount}`
      ),
      check(
        mobile.brokerCheckAttributionCount >= 1,
        "compare: mobile renders BrokerCheck attribution",
        `attributions ${mobile.brokerCheckAttributionCount}`
      ),
    ])),
  ];
}

/**
 * Reads the first two distinct advisor ids mentioned in the Feed payload.
 * @param page - Browser page whose request context can call the app.
 * @returns Advisor ids in feed order.
 */
async function feedAdvisorIds(page: Page): Promise<readonly string[]> {
  const response = await page.request.get(`${BASE}/Feed`);
  if (!response.ok()) return [];
  const payload = (await response.json()) as FeedPayload;
  return [
    ...new Set(
      (payload.items ?? [])
        .flatMap(item => item.advisors ?? [])
        .map(advisor => advisor.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

/**
 * Captures route rendering and overflow metrics.
 * @param page - Browser page rendering the compare route.
 * @returns Comparison route metrics.
 */
async function comparisonMetrics(page: Page) {
  return await page.evaluate(
    ({ attributionSelector, attributionText, tableSelector, rowSelector }) => {
      const table = document.querySelector(tableSelector);
      return {
        h1Text: document.querySelector("h1")?.textContent?.trim() ?? "",
        brokerCheckAttributionCount: [
          ...document.querySelectorAll(attributionSelector),
        ].filter(element => element.textContent?.includes(attributionText))
          .length,
        rowCount: document.querySelectorAll(rowSelector).length,
        neutralMissingStates:
          document.body.textContent?.match(/No .* evidence available/g)
            ?.length ?? 0,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        tableClientWidth: table?.clientWidth ?? 0,
        tableScrollWidth: table?.scrollWidth ?? 0,
      };
    },
    {
      attributionSelector: BROKERCHECK_ATTRIBUTION_SELECTOR,
      attributionText: BROKERCHECK_ATTRIBUTION_TEXT,
      tableSelector: COMPARISON_TABLE_SELECTOR,
      rowSelector: COMPARISON_ROW_SELECTOR,
    }
  );
}

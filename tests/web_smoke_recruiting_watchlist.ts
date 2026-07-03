import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import {
  BASE,
  QUICK_UI_TIMEOUT,
  SHOTS,
  check,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const STANDARD_DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const WATCHLIST_CARD_SELECTOR = ".recruiting-watchlist";
const WATCHLIST_FIRM_ONE = "Wells Fargo Advisors";
const WATCHLIST_FIRM_TWO = "Morgan Stanley";
const WATCHLIST_ITEM_SELECTOR = `${WATCHLIST_CARD_SELECTOR} .watchlist-item`;
const WATCHLIST_METRIC_SELECTOR = `${WATCHLIST_CARD_SELECTOR} .watchlist-metric`;
const WATCHLIST_MOBILE_VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 844 },
] as const;
const WATCHLIST_PAGE_OVERFLOW_BUDGET_PX = 0;
const WATCHLIST_URL = `${BASE}/recruiting?firm=${encodeURIComponent(WATCHLIST_FIRM_ONE)}&firm=${encodeURIComponent(WATCHLIST_FIRM_TWO)}&state=NY`;
const WATCHLIST_NO_MATCH_URL = `${BASE}/recruiting?firm=${encodeURIComponent(WATCHLIST_FIRM_ONE)}&state=ZZ`;
const WATCHLIST_PARTIAL_FIRM_URL = `${BASE}/recruiting?firm=Wells&state=&year=&direction=net`;

export { WATCHLIST_FIRM_ONE, WATCHLIST_FIRM_TWO };

/** Watchlist Recruiting route observations. */
export interface WatchlistRecruitingState {
  readonly restored: {
    readonly coverageCount: number;
    readonly firmValues: readonly string[];
    readonly hasGenerated: boolean;
    readonly hasInbound: boolean;
    readonly hasKnownAum: boolean;
    readonly hasNet: boolean;
    readonly hasOutbound: boolean;
    readonly hasWatchlist: boolean;
    readonly panelCount: number;
  };
  readonly noMatch: {
    readonly firmValue: string | undefined;
    readonly hasEmptyCopy: boolean;
    readonly hasWatchlist: boolean;
  };
  readonly partialFirm: {
    readonly hasChooseFirmCopy: boolean;
    readonly hasSuggestedWellsFirm: boolean;
    readonly hasUnresolvedFirmCopy: boolean;
    readonly hasVisibleRows: boolean;
  };
  readonly updatedFirmValues: readonly string[];
  readonly updatedUrl: URL;
}

/**
 * Reads the URL-restored watchlist state, freshness/coverage indicators, and
 * submit behavior, then the no-match empty state.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Watchlist assertions.
 */
export async function readWatchlistRecruiting(
  page: Page
): Promise<WatchlistRecruitingState> {
  await smokeGoto(page, WATCHLIST_URL);
  await smokeWaitForSelector(page, WATCHLIST_CARD_SELECTOR, QUICK_UI_TIMEOUT);
  const restored = await page.evaluate(() => ({
    coverageCount: document.querySelectorAll(
      ".recruiting-watchlist .watchlist-coverage"
    ).length,
    firmValues: [
      ...document.querySelectorAll<HTMLInputElement>('input[name="firm"]'),
    ].map(input => input.value),
    hasGenerated: Boolean(
      document
        .querySelector(".recruiting-watchlist .watchlist-generated")
        ?.textContent?.includes("Generated")
    ),
    hasWatchlist: document.body.innerText.includes("Recruiting watchlist"),
    hasInbound: document.body.innerText.includes("Inbound"),
    hasOutbound: document.body.innerText.includes("Outbound"),
    hasNet: document.body.innerText.includes("Net"),
    hasKnownAum: /\$\d[\d,.]*(?:\.\d+)?[KMB]?/.test(document.body.innerText),
    panelCount: document.querySelectorAll(".watchlist-item").length,
  }));
  await page.locator('input[name="year"]').fill("2025");
  await page.locator(".filter-button").click();
  await page.waitForURL(/year=2025/, { timeout: QUICK_UI_TIMEOUT });
  const updatedUrl = new URL(page.url());
  const updatedFirmValues = updatedUrl.searchParams.getAll("firm");
  await shot(page, "11-recruiting-watchlist");
  const noMatch = await readNoMatchWatchlist(page);
  const partialFirm = await readPartialFirmWatchlist(page);
  return { restored, noMatch, partialFirm, updatedFirmValues, updatedUrl };
}

/**
 * Reads the no-match watchlist state: a watched firm with an impossible
 * filter still renders the card with explicit empty copy and keeps the firm
 * control editable.
 * @param page - Browser page shared by smoke scenarios.
 * @returns No-match watchlist observations.
 */
async function readNoMatchWatchlist(
  page: Page
): Promise<WatchlistRecruitingState["noMatch"]> {
  await smokeGoto(page, WATCHLIST_NO_MATCH_URL);
  await smokeWaitForSelector(page, WATCHLIST_CARD_SELECTOR, QUICK_UI_TIMEOUT);
  const noMatch = await page.evaluate(() => ({
    firmValue:
      document.querySelector<HTMLInputElement>('input[name="firm"]')?.value,
    hasEmptyCopy: Boolean(
      document.querySelector(".recruiting-watchlist .watchlist-empty")
    ),
    hasWatchlist: document.body.innerText.includes("Recruiting watchlist"),
  }));
  await shot(page, "11-recruiting-watchlist-no-match");
  return noMatch;
}

/**
 * Reads the partial firm-query state from the exploratory QA regression path.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Partial firm observations.
 */
async function readPartialFirmWatchlist(
  page: Page
): Promise<WatchlistRecruitingState["partialFirm"]> {
  await smokeGoto(page, WATCHLIST_PARTIAL_FIRM_URL);
  await smokeWaitForSelector(page, WATCHLIST_CARD_SELECTOR, QUICK_UI_TIMEOUT);
  const partialFirm = await page.evaluate(() => {
    const body = document.body.innerText;
    const options = [
      ...document.querySelectorAll<HTMLOptionElement>(
        "#recruiting-firm-suggestions option"
      ),
    ].map(option => option.value);
    return {
      hasChooseFirmCopy:
        body.includes("Choose a firm") && body.includes("exact suggested name"),
      hasSuggestedWellsFirm: options.some(option =>
        /wells fargo/i.test(option)
      ),
      hasUnresolvedFirmCopy: body.includes("Unresolved firm"),
      hasVisibleRows:
        document.querySelectorAll(".firm-momentum-table tbody tr").length > 0,
    };
  });
  await shot(page, "11-recruiting-watchlist-partial-firm");
  return partialFirm;
}

/** Viewport used by watchlist card mobile smoke checks. */
type WatchlistMobileViewport = (typeof WATCHLIST_MOBILE_VIEWPORTS)[number];

/** Mobile readability and overflow metrics for the Recruiting watchlist card. */
interface WatchlistMobileMetrics {
  readonly controlOverlapCount: number;
  readonly controlsOverflow: number;
  readonly firmGuidanceVisible: boolean;
  readonly itemCount: number;
  readonly keyMetricCount: number;
  readonly pageOverflow: number;
  readonly watchlistOverflow: number;
  readonly zeroWidthMetricCount: number;
}
/** Minimal rectangle shape needed for overlap checks. */
interface RectMetrics {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}
/** Watchlist form row metrics. */
interface WatchlistControlRowMetrics {
  readonly boxes: readonly RectMetrics[];
  readonly overflow: number;
}

/**
 * Checks watchlist cards at mobile breakpoints and restores desktop sizing.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Watchlist mobile assertions.
 */
export async function smokeWatchlistMobile(
  page: Page
): Promise<readonly Check[]> {
  const checks = await WATCHLIST_MOBILE_VIEWPORTS.reduce<
    Promise<readonly Check[]>
  >(
    async (previous, viewport) => [
      ...(await previous),
      ...(await smokeWatchlistMobileViewport(page, viewport)),
    ],
    Promise.resolve([])
  );
  await page.setViewportSize(STANDARD_DESKTOP_VIEWPORT);
  return checks;
}

/**
 * Checks watchlist readability and overflow at one mobile viewport.
 * @param page - Browser page shared by smoke scenarios.
 * @param viewport - Mobile viewport under test.
 * @returns Readability and overflow assertions for the viewport.
 */
async function smokeWatchlistMobileViewport(
  page: Page,
  viewport: WatchlistMobileViewport
): Promise<readonly Check[]> {
  await page.setViewportSize(viewport);
  await smokeGoto(page, WATCHLIST_URL);
  await smokeWaitForSelector(page, WATCHLIST_CARD_SELECTOR, QUICK_UI_TIMEOUT);
  const metrics = await readWatchlistMobileMetrics(page);
  await writeWatchlistMobileArtifacts(page, viewport, metrics);
  return watchlistMobileChecks(metrics, viewport);
}

/**
 * Reads mobile watchlist card and control metrics from the page.
 * @param page - Browser page rendering the watchlist route.
 * @returns Watchlist readability and overflow metrics.
 */
async function readWatchlistMobileMetrics(
  page: Page
): Promise<WatchlistMobileMetrics> {
  const metricWidths = await readWatchlistMetricWidths(page);
  const controlRows = await readWatchlistControlRows(page);
  const firmGuidanceVisible = await readFirmGuidanceVisible(page);
  const itemCount = await page.locator(WATCHLIST_ITEM_SELECTOR).count();
  const pageOverflow = await page.evaluate(() =>
    Math.max(
      0,
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
  );
  const watchlistOverflow = await page
    .locator(WATCHLIST_CARD_SELECTOR)
    .evaluate(watchlist =>
      Math.max(0, watchlist.scrollWidth - watchlist.clientWidth)
    );

  return {
    controlOverlapCount: controlRows.filter(row =>
      hasOverlappingRects(row.boxes)
    ).length,
    controlsOverflow: maxControlOverflow(controlRows),
    firmGuidanceVisible,
    itemCount,
    keyMetricCount: metricWidths.length,
    pageOverflow,
    watchlistOverflow,
    zeroWidthMetricCount: metricWidths.filter(width => width < 1).length,
  };
}

async function readWatchlistMetricWidths(
  page: Page
): Promise<readonly number[]> {
  return await page
    .locator(WATCHLIST_METRIC_SELECTOR)
    .evaluateAll(metrics =>
      metrics.map(metric => metric.getBoundingClientRect().width)
    );
}

async function readWatchlistControlRows(
  page: Page
): Promise<readonly WatchlistControlRow[]> {
  return await page.locator(".watchlist-firm-row").evaluateAll(rows =>
    rows.map(row => ({
      boxes: Array.from(row.children).map(child => {
        const box = child.getBoundingClientRect();
        return {
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          top: box.top,
        };
      }),
      overflow: row.scrollWidth - row.clientWidth,
    }))
  );
}

/**
 * Confirms the watched-firm helper copy is present and visible.
 * @param page - Browser page rendering the Recruiting route.
 * @returns Whether the watched-firm guidance is visible.
 */
async function readFirmGuidanceVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const help = document.querySelector(
      ".recruiting-watchlist-form .filter-field-help"
    );
    const box = help?.getBoundingClientRect();
    const style = help ? getComputedStyle(help) : null;
    return (
      Boolean(box && box.width > 0 && box.height > 0) &&
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      style?.opacity !== "0" &&
      help?.textContent?.includes(
        "Choose an exact firm result from the suggestions."
      ) === true
    );
  });
}

/**
 * Writes screenshots and JSON metrics for a watchlist mobile viewport.
 * @param page - Browser page rendering the watchlist route.
 * @param viewport - Mobile viewport under test.
 * @param metrics - Measured readability and overflow metrics.
 */
async function writeWatchlistMobileArtifacts(
  page: Page,
  viewport: WatchlistMobileViewport,
  metrics: WatchlistMobileMetrics
): Promise<void> {
  const artifactBase = `11-recruiting-watchlist-${viewport.name}`;
  await shot(page, artifactBase);
  await writeFile(
    join(SHOTS, `${artifactBase}.json`),
    `${JSON.stringify({ route: "/recruiting", viewport, metrics }, null, 2)}\n`
  );
}

/**
 * Builds mobile watchlist readability and overflow assertions.
 * @param metrics - Measured watchlist mobile metrics.
 * @param viewport - Mobile viewport under test.
 * @returns Smoke checks for one viewport.
 */
function watchlistMobileChecks(
  metrics: WatchlistMobileMetrics,
  viewport: WatchlistMobileViewport
): readonly Check[] {
  return [
    check(
      metrics.itemCount >= 2 && metrics.keyMetricCount >= 6,
      `recruiting: watchlist cards expose key values at ${viewport.width}px`,
      `items ${metrics.itemCount}, metrics ${metrics.keyMetricCount}`
    ),
    check(
      metrics.zeroWidthMetricCount === 0,
      `recruiting: watchlist metric values stay readable at ${viewport.width}px`,
      `zero-width metrics ${metrics.zeroWidthMetricCount}`
    ),
    check(
      metrics.controlOverlapCount === 0 && metrics.controlsOverflow === 0,
      `recruiting: watchlist controls do not overlap at ${viewport.width}px`,
      `overlaps ${metrics.controlOverlapCount}, controls overflow +${metrics.controlsOverflow}px`
    ),
    check(
      metrics.firmGuidanceVisible,
      `recruiting: watched-firm guidance remains visible at ${viewport.width}px`
    ),
    check(
      metrics.pageOverflow <= WATCHLIST_PAGE_OVERFLOW_BUDGET_PX &&
        metrics.watchlistOverflow <= WATCHLIST_PAGE_OVERFLOW_BUDGET_PX,
      `recruiting: watchlist adds no horizontal overflow at ${viewport.width}px`,
      `page +${metrics.pageOverflow}px, watchlist +${metrics.watchlistOverflow}px`
    ),
  ];
}

/**
 * Checks whether any rectangles in a control row overlap.
 * @param rects - Child element rectangles.
 * @returns Whether any two rectangles overlap.
 */
function hasOverlappingRects(rects: readonly RectMetrics[]): boolean {
  return rects.some((left, leftIndex) =>
    rects.slice(leftIndex + 1).some(right => rectsOverlap(left, right))
  );
}

/**
 * Checks whether two rectangles overlap.
 * @param left - First rectangle.
 * @param right - Second rectangle.
 * @returns Whether the rectangles overlap.
 */
function rectsOverlap(left: RectMetrics, right: RectMetrics): boolean {
  return (
    left.right > right.left &&
    right.right > left.left &&
    left.bottom > right.top &&
    right.bottom > left.top
  );
}

/**
 * Reads the largest horizontal overflow in watchlist controls.
 * @param rows - Watchlist firm control row metrics.
 * @returns Maximum overflow in CSS pixels.
 */
function maxControlOverflow(
  rows: readonly WatchlistControlRowMetrics[]
): number {
  return Math.max(0, ...rows.map(row => row.overflow));
}

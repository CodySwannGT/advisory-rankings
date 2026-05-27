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
const WATCHLIST_URL = `${BASE}/recruiting?firm=${encodeURIComponent(WATCHLIST_FIRM_ONE)}&firm=${encodeURIComponent(WATCHLIST_FIRM_TWO)}&state=NY&year=2026`;

/** Viewport used by watchlist card mobile smoke checks. */
type WatchlistMobileViewport = (typeof WATCHLIST_MOBILE_VIEWPORTS)[number];

/** Mobile readability and overflow metrics for the Recruiting watchlist card. */
interface WatchlistMobileMetrics {
  readonly controlOverlapCount: number;
  readonly controlsOverflow: number;
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
  const metricWidths = await page
    .locator(WATCHLIST_METRIC_SELECTOR)
    .evaluateAll(metrics =>
      metrics.map(metric => metric.getBoundingClientRect().width)
    );
  const controlRows = await page
    .locator(".watchlist-firm-row")
    .evaluateAll(rows =>
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
    itemCount,
    keyMetricCount: metricWidths.length,
    pageOverflow,
    watchlistOverflow,
    zeroWidthMetricCount: metricWidths.filter(width => width < 1).length,
  };
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

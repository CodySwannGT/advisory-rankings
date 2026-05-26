import type { Browser, Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
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
import {
  drawerFocusChecks,
  readDrawerTabTrace,
} from "./web_smoke_mobile_focus.js";
import {
  drawerStateChecks,
  exerciseEscapeDismissal,
  openMobileDrawer,
  readDrawerLinkLabels,
} from "./web_smoke_mobile_state.js";

const DRAWER_SELECTOR = ".nav-drawer";
const DRAWER_FIRMS_LINK_SELECTOR = '.nav-drawer .nav-links a:has-text("Firms")';
const NAV_BURGER_SELECTOR = ".nav-burger";
const NAV_SEARCH_SELECTOR = ".nav .search";

/**
 * Checks the mobile navigation drawer.
 * @param browser - Browser used to create a mobile context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for mobile navigation.
 */
export async function smokeMobile(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const mobile = await newContext(
    browser,
    { width: 320, height: 740 },
    extraHTTPHeaders
  );
  const page = await mobile.newPage();

  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, ARTICLE_CARD_SELECTOR);
  const closedMetrics = await readClosedMobileMetrics(page);
  const closedTabTrace = await readDrawerTabTrace(page);
  await shot(page, "08-mobile-closed");
  await openMobileDrawer(page);
  const drawerLinkLabels = await readDrawerLinkLabels(page);
  const openTabTrace = await readDrawerTabTrace(page);
  const openMetrics = await readOpenMobileMetrics(page);
  await shot(page, "09-mobile-drawer-open");
  const escapeResult = await exerciseEscapeDismissal(page);
  await page.locator(DRAWER_FIRMS_LINK_SELECTOR).click();
  await page.waitForURL(/\/firms$/, { timeout: QUICK_UI_TIMEOUT });

  return await closeWithChecks(mobile, [
    ...(await mobileLayoutChecks(page, { closedMetrics, openMetrics })),
    ...drawerFocusChecks({
      closedTabTrace,
      openTabTrace,
      reclosedTabTrace: escapeResult.closedTabTrace,
    }),
    ...drawerStateChecks({
      drawerLinkLabels,
      escapeResult,
      finalUrl: page.url(),
    }),
  ]);
}

/**
 * Builds smoke checks for mobile layout and drawer visibility.
 * @param page - Browser page to inspect.
 * @param root0 - Metrics captured before and after drawer open.
 * @param root0.closedMetrics - Metrics while drawer is closed.
 * @param root0.openMetrics - Metrics while drawer is open.
 * @returns Mobile layout checks.
 */
async function mobileLayoutChecks(
  page: Page,
  { closedMetrics, openMetrics }: MobileMetrics
): Promise<readonly Check[]> {
  return [
    check(
      closedMetrics.searchWidth >= 220,
      "mobile: search readable at 320px",
      `width ${Math.round(closedMetrics.searchWidth)}px`
    ),
    check(
      await page.locator(NAV_SEARCH_SELECTOR).isVisible(),
      "mobile: search remains visible"
    ),
    check(
      closedMetrics.scrollWidth <= closedMetrics.clientWidth &&
        openMetrics.scrollWidth <= openMetrics.clientWidth,
      "mobile: no horizontal overflow at 320px",
      `closed ${closedMetrics.scrollWidth}/${closedMetrics.clientWidth}, open ${openMetrics.scrollWidth}/${openMetrics.clientWidth}`
    ),
    check(
      await page.locator(NAV_BURGER_SELECTOR).isVisible(),
      "mobile: hamburger visible"
    ),
    check(
      await page.locator(DRAWER_SELECTOR).isVisible(),
      "mobile: drawer opens"
    ),
  ];
}

/** Mobile viewport metrics captured before and after drawer open. */
interface MobileMetrics {
  readonly closedMetrics: ViewportMetrics;
  readonly openMetrics: ViewportMetrics;
}

/** Search and overflow metrics captured from a mobile viewport. */
interface ViewportMetrics {
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly searchWidth: number;
}

/**
 * Reads mobile viewport metrics before the drawer opens.
 * @param page - Browser page to inspect.
 * @returns Search and overflow metrics.
 */
async function readClosedMobileMetrics(page: Page): Promise<ViewportMetrics> {
  return await page.evaluate(searchSelector => {
    const searchBox = document
      .querySelector(searchSelector)
      ?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      searchWidth: searchBox?.width ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, NAV_SEARCH_SELECTOR);
}

/**
 * Reads mobile viewport metrics while the drawer is open.
 * @param page - Browser page to inspect.
 * @returns Overflow metrics.
 */
async function readOpenMobileMetrics(page: Page): Promise<ViewportMetrics> {
  return await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    searchWidth: 0,
  }));
}

#!/usr/bin/env node
/**
 * Playwright smoke test for the public web UI.
 *
 * The test walks the feed, profile pages, article provenance, directory
 * pages, auth affordance, and mobile drawer. Screenshots are written to
 * tests/screenshots for quick visual inspection when a check fails.
 */

import { mkdir } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  SHOTS,
  QUICK_UI_TIMEOUT,
  authHeaders,
  check,
  closeWithChecks,
  newContext,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import {
  smokeArticle,
  smokeAuth,
  smokeCompliance,
  smokeDirectories,
  smokeFeed,
  smokeFirm,
  smokeNotFoundRecovery,
  smokeTeam,
  smokeAdvisor,
} from "./web_smoke_scenarios.js";
import { smokeGlobalSearch } from "./web_smoke_search.js";
import { smokeBreakpoints } from "./web_smoke_breakpoints.js";
import { smokeMobileFocus } from "./web_smoke_mobile_focus.js";
import { smokeRecruiting } from "./web_smoke_recruiting.js";
import { smokeRankings } from "./web_smoke_rankings.js";
import { smokePublicPageHeadings } from "./web_smoke_headings.js";

const DRAWER_OPEN_CLASS = "drawer-open";
const DRAWER_SELECTOR = ".nav-drawer";
const DRAWER_LINKS_SELECTOR =
  ".nav-drawer .nav-links a, .nav-drawer .me-action";
const DRAWER_FIRMS_LINK_SELECTOR = '.nav-drawer .nav-links a:has-text("Firms")';
const NAV_BURGER_SELECTOR = ".nav-burger";
const NAV_SEARCH_SELECTOR = ".nav .search";

/**
 * Checks the mobile navigation drawer.
 * @param browser - Browser used to create a mobile context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for mobile navigation.
 */
async function smokeMobile(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const mobile = await newContext(
    browser,
    { width: 390, height: 844 },
    extraHTTPHeaders
  );
  const page = await mobile.newPage();
  const drawer = page.locator(DRAWER_SELECTOR);
  const search = page.locator(NAV_SEARCH_SELECTOR);

  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, ARTICLE_CARD_SELECTOR);
  const closedMetrics = await readClosedMobileMetrics(page);
  await shot(page, "08-mobile-closed");
  const focusChecks = await smokeMobileFocus(page);
  const drawerLinkLabels = await readDrawerLinkLabels(page);
  const openMetrics = await readOpenMobileMetrics(page);
  await shot(page, "09-mobile-drawer-open");
  const escapeResult = await exerciseEscapeDismissal(page);
  await page.locator(DRAWER_FIRMS_LINK_SELECTOR).click();
  await page.waitForURL(/\/firms$/, { timeout: QUICK_UI_TIMEOUT });

  return await closeWithChecks(mobile, [
    check(
      closedMetrics.searchWidth >= 220,
      "mobile: search readable at 390px",
      `width ${Math.round(closedMetrics.searchWidth)}px`
    ),
    check(await search.isVisible(), "mobile: search remains visible"),
    check(
      closedMetrics.scrollWidth <= closedMetrics.clientWidth &&
        openMetrics.scrollWidth <= openMetrics.clientWidth,
      "mobile: no horizontal overflow at 390px",
      `closed ${closedMetrics.scrollWidth}/${closedMetrics.clientWidth}, open ${openMetrics.scrollWidth}/${openMetrics.clientWidth}`
    ),
    check(
      await page.locator(NAV_BURGER_SELECTOR).isVisible(),
      "mobile: hamburger visible"
    ),
    check(await drawer.isVisible(), "mobile: drawer opens"),
    check(
      !escapeResult.closed.open && escapeResult.closed.expanded === "false",
      "mobile: Escape closes drawer and resets aria-expanded"
    ),
    ...focusChecks,
    check(
      escapeResult.reopened.open && escapeResult.reopened.expanded === "true",
      "mobile: drawer reopens after Escape dismissal"
    ),
    check(
      ["Home", "Firms", "Rankings", "Advisors", "Teams", "Sign in"].every(
        label => drawerLinkLabels.includes(label)
      ),
      "mobile: drawer links visible at 390px",
      drawerLinkLabels.join(", ")
    ),
    check(
      page.url().endsWith("/firms"),
      "mobile: drawer link navigates to Firms"
    ),
  ]);
}

/**
 * Reads mobile viewport metrics before the drawer opens.
 * @param page - Browser page to inspect.
 * @returns Search and overflow metrics.
 */
async function readClosedMobileMetrics(page: Page) {
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
async function readOpenMobileMetrics(page: Page) {
  return await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

/**
 * Reads visible drawer labels for navigation affordance checks.
 * @param page - Browser page to inspect.
 * @returns Drawer link and auth action labels.
 */
async function readDrawerLinkLabels(page: Page) {
  return await page
    .locator(DRAWER_LINKS_SELECTOR)
    .evaluateAll(nodes =>
      nodes.map(node => node.textContent?.trim()).filter(Boolean)
    );
}

/**
 * Opens the mobile drawer and waits for the body state used by the UI.
 * @param page - Browser page to inspect.
 */
async function openMobileDrawer(page: Page): Promise<void> {
  await page.locator(NAV_BURGER_SELECTOR).click();
  await waitForDrawerOpenState(page, true);
}

/**
 * Presses Escape against an open drawer, captures closed state, then reopens it.
 * @param page - Browser page to inspect.
 * @returns Drawer state after Escape and after reopening.
 */
async function exerciseEscapeDismissal(page: Page): Promise<{
  readonly closed: DrawerState;
  readonly reopened: DrawerState;
}> {
  await page.keyboard.press("Escape");
  await waitForDrawerOpenState(page, false);
  const closed = await readDrawerState(page);
  await openMobileDrawer(page);
  return { closed, reopened: await readDrawerState(page) };
}

/** Drawer body class and trigger ARIA state. */
interface DrawerState {
  readonly expanded: string | null | undefined;
  readonly open: boolean;
}

/**
 * Reads the class and ARIA state that define drawer visibility.
 * @param page - Browser page to inspect.
 * @returns Drawer state from DOM markers.
 */
async function readDrawerState(page: Page): Promise<DrawerState> {
  return await page.evaluate(
    ({ drawerOpenClass, navBurgerSelector }) => ({
      open: document.body.classList.contains(drawerOpenClass),
      expanded: document
        .querySelector(navBurgerSelector)
        ?.getAttribute("aria-expanded"),
    }),
    {
      drawerOpenClass: DRAWER_OPEN_CLASS,
      navBurgerSelector: NAV_BURGER_SELECTOR,
    }
  );
}

/**
 * Waits for the drawer body class to match the expected state.
 * @param page - Browser page to inspect.
 * @param open - Whether the drawer should be open.
 */
async function waitForDrawerOpenState(
  page: Page,
  open: boolean
): Promise<void> {
  await page.waitForFunction(
    ({ drawerOpenClass, expectedOpen }) =>
      document.body.classList.contains(drawerOpenClass) === expectedOpen,
    { drawerOpenClass: DRAWER_OPEN_CLASS, expectedOpen: open },
    { timeout: QUICK_UI_TIMEOUT }
  );
}

/**
 * Runs the firm profile scenario and continues into the advisor profile.
 * @param page - Browser page shared by the desktop scenarios.
 * @returns Combined firm and advisor assertions.
 */
async function smokeFirmAndAdvisor(
  page: Parameters<typeof smokeFirm>[0]
): Promise<readonly Check[]> {
  const [firmChecks, pastBlock] = await smokeFirm(page);
  return [...firmChecks, ...(await smokeAdvisor(page, pastBlock))];
}

/**
 * Prints the aggregate smoke result and sets the process exit code on failure.
 * @param checks - All checks collected during the smoke journey.
 */
function printResults(checks: readonly Check[]): void {
  const failures = checks.filter(result => !result.passed);

  console.log("\n──────── SMOKE TEST RESULTS ────────");
  for (const result of checks)
    console.log(`  ${result.passed ? "✓" : "✗"} ${result.label}`);
  console.log(
    `──────── ${failures.length === 0 ? "PASS" : "FAIL"} (${checks.length - failures.length}/${checks.length}) ────────\n`
  );
  console.log("Screenshots written to", SHOTS);
  process.exitCode = failures.length ? 1 : 0;
}

/**
 * Runs the ordered desktop and mobile smoke scenarios.
 * @param browser - Browser used for the mobile scenario.
 * @param page - Browser page shared by desktop scenarios.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns All smoke assertions.
 */
async function runScenarios(
  browser: Browser,
  page: Parameters<typeof smokeFeed>[0],
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  return [
    ...(await smokeFeed(page)),
    ...(await smokeRecruiting(page)),
    ...(await smokeRankings(page, browser, extraHTTPHeaders)),
    ...(await smokeGlobalSearch(page)),
    ...(await smokeFirmAndAdvisor(page)),
    ...(await smokeTeam(page)),
    ...(await smokeArticle(page)),
    ...(await smokeCompliance(page)),
    ...(await smokeDirectories(page)),
    ...(await smokePublicPageHeadings(page)),
    ...(await smokeNotFoundRecovery(page)),
    ...(await smokeAuth(page)),
    ...(await smokeBreakpoints(browser, extraHTTPHeaders)),
    ...(await smokeMobile(browser, extraHTTPHeaders)),
  ];
}

/**
 * Runs all smoke scenarios in a single browser session.
 */
async function main(): Promise<void> {
  const extraHTTPHeaders = await authHeaders();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await newContext(
      browser,
      { width: 1280, height: 900 },
      extraHTTPHeaders
    );
    const page = await context.newPage();

    await mkdir(SHOTS, { recursive: true });
    console.log(
      "▶ smoke against",
      BASE,
      extraHTTPHeaders ? "(JWT bearer)" : "(anonymous, as a real visitor)"
    );
    printResults(await runScenarios(browser, page, extraHTTPHeaders));
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(
    "test runner crashed:",
    err instanceof Error ? err.stack || err.message : err
  );
  process.exitCode = 2;
});

import type { Browser, Locator, Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  newContext,
  type Check,
} from "./web_smoke_support.js";

const BURGER_SELECTOR = ".nav-burger";
const CLOSED_DRAWER_SELECTOR = "body.drawer-open";
const DESKTOP_NAV_SELECTOR = ".nav-drawer";
const DRAWER_FIRMS_LINK = '.nav-drawer .nav-links a:has-text("Firms")';
const LEFT_RAIL_SELECTOR = ".layout > .left";
const RIGHT_RAIL_SELECTOR = ".layout > .right";

/**
 * Expected visible shell state at a named responsive breakpoint.
 */
interface BreakpointExpectation {
  readonly drawerMode: "desktop" | "mobile";
  readonly leftRailVisible: boolean;
  readonly rightRailVisible: boolean;
  readonly width: number;
}

const breakpointMatrix: readonly BreakpointExpectation[] = [
  railBreakpoint(1440, true, true, "desktop"),
  railBreakpoint(1101, true, true, "desktop"),
  railBreakpoint(1100, false, true, "desktop"),
  railBreakpoint(1099, false, true, "desktop"),
  railBreakpoint(801, false, true, "desktop"),
  railBreakpoint(800, false, false, "desktop"),
  railBreakpoint(799, false, false, "desktop"),
  railBreakpoint(701, false, false, "desktop"),
  railBreakpoint(700, false, false, "mobile"),
  railBreakpoint(390, false, false, "mobile"),
  railBreakpoint(320, false, false, "mobile"),
];

/**
 * Builds a compact breakpoint expectation row.
 * @param width - Viewport width in CSS pixels.
 * @param leftRailVisible - Whether the left rail should be visible.
 * @param rightRailVisible - Whether the right rail should be visible.
 * @param drawerMode - Expected navigation mode.
 * @returns Breakpoint expectation for the matrix.
 */
function railBreakpoint(
  width: number,
  leftRailVisible: boolean,
  rightRailVisible: boolean,
  drawerMode: BreakpointExpectation["drawerMode"]
): BreakpointExpectation {
  return { width, leftRailVisible, rightRailVisible, drawerMode };
}

/**
 * Checks rail, drawer, and overflow behavior across responsive boundaries.
 * @param browser - Browser used to create breakpoint contexts.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for the responsive breakpoint matrix.
 */
export async function smokeBreakpoints(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  return await breakpointMatrix.reduce<Promise<readonly Check[]>>(
    async (previousChecks, expectation) => [
      ...(await previousChecks),
      ...(await smokeBreakpoint(browser, expectation, extraHTTPHeaders)),
    ],
    Promise.resolve([])
  );
}

/**
 * Checks the feed shell at one responsive breakpoint.
 * @param browser - Browser used to create a breakpoint context.
 * @param expectation - Expected shell state for the viewport width.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for the breakpoint.
 */
async function smokeBreakpoint(
  browser: Browser,
  expectation: BreakpointExpectation,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: expectation.width, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });

  const burger = page.locator(BURGER_SELECTOR);
  const checks = [
    ...(await railChecks(page, expectation)),
    ...(await navChecks(page, burger, expectation)),
    await overflowCheck(page, expectation.width),
  ];

  return await closeWithChecks(context, [
    ...checks,
    ...(await openedDrawerChecks(page, burger, expectation.width)),
  ]);
}

/**
 * Checks rail visibility for a breakpoint.
 * @param page - Browser page to inspect.
 * @param expectation - Expected rail state.
 * @returns Rail visibility checks.
 */
async function railChecks(
  page: Page,
  expectation: BreakpointExpectation
): Promise<readonly Check[]> {
  return [
    check(
      (await page.locator(LEFT_RAIL_SELECTOR).isVisible()) ===
        expectation.leftRailVisible,
      breakpointLabel(
        expectation.width,
        "left rail",
        expectation.leftRailVisible
      )
    ),
    check(
      (await page.locator(RIGHT_RAIL_SELECTOR).isVisible()) ===
        expectation.rightRailVisible,
      breakpointLabel(
        expectation.width,
        "right rail",
        expectation.rightRailVisible
      )
    ),
  ];
}

/**
 * Checks nav mode for a breakpoint.
 * @param page - Browser page to inspect.
 * @param burger - Hamburger button locator.
 * @param expectation - Expected nav state.
 * @returns Navigation mode checks.
 */
async function navChecks(
  page: Page,
  burger: Locator,
  expectation: BreakpointExpectation
): Promise<readonly Check[]> {
  if (expectation.drawerMode === "mobile") {
    return [
      check(
        await burger.isVisible(),
        `breakpoint ${expectation.width}px: hamburger visible`
      ),
      check(
        await drawerInitiallyClosed(page, burger),
        `breakpoint ${expectation.width}px: drawer initially closed`
      ),
    ];
  }

  return [
    check(
      !(await burger.isVisible()),
      `breakpoint ${expectation.width}px: hamburger hidden`
    ),
    check(
      await page.locator(DESKTOP_NAV_SELECTOR).isVisible(),
      `breakpoint ${expectation.width}px: desktop nav available`
    ),
  ];
}

/**
 * Checks whether the mobile drawer starts closed.
 * @param page - Browser page to inspect.
 * @param burger - Hamburger button locator.
 * @returns Whether the drawer state is closed.
 */
async function drawerInitiallyClosed(
  page: Page,
  burger: Locator
): Promise<boolean> {
  return (
    (await burger.getAttribute("aria-expanded")) === "false" &&
    (await page.locator(CLOSED_DRAWER_SELECTOR).count()) === 0
  );
}

/**
 * Opens and checks the drawer on key mobile breakpoint widths.
 * @param page - Browser page to inspect.
 * @param burger - Hamburger button locator.
 * @param width - Viewport width in CSS pixels.
 * @returns Drawer behavior checks.
 */
async function openedDrawerChecks(
  page: Page,
  burger: Locator,
  width: number
): Promise<readonly Check[]> {
  if (width !== 700 && width !== 320) return [];

  await burger.click();
  await page.waitForFunction(
    () => document.body.classList.contains("drawer-open"),
    null,
    { timeout: QUICK_UI_TIMEOUT }
  );

  return [
    check(
      (await page.locator(CLOSED_DRAWER_SELECTOR).count()) === 1,
      `breakpoint ${width}px: drawer opens from hamburger`
    ),
    check(
      (await burger.getAttribute("aria-expanded")) === "true",
      `breakpoint ${width}px: hamburger reports expanded drawer`
    ),
    check(
      await page.locator(DRAWER_FIRMS_LINK).isVisible(),
      `breakpoint ${width}px: drawer links are usable`
    ),
  ];
}

/**
 * Checks whether the page has unintended document-level horizontal overflow.
 * @param page - Browser page to inspect.
 * @param width - Viewport width in CSS pixels.
 * @returns Overflow smoke check.
 */
async function overflowCheck(page: Page, width: number): Promise<Check> {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  return check(
    overflow.scrollWidth <= overflow.clientWidth,
    `breakpoint ${width}px: no horizontal overflow`,
    `scrollWidth ${overflow.scrollWidth}, clientWidth ${overflow.clientWidth}`
  );
}

/**
 * Formats a rail visibility assertion label.
 * @param width - Viewport width in CSS pixels.
 * @param target - Rail name.
 * @param visible - Expected visibility.
 * @returns Human-readable check label.
 */
function breakpointLabel(
  width: number,
  target: string,
  visible: boolean
): string {
  return `breakpoint ${width}px: ${target} ${visible ? "visible" : "collapsed"}`;
}

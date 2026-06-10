import type { Browser, Locator, Page } from "playwright";
import {
  BASE,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  newContext,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const BURGER_SELECTOR = ".nav-burger";
const CLOSED_DRAWER_SELECTOR = "body.drawer-open";
const DESKTOP_NAV_SELECTOR = ".nav-drawer";
const DRAWER_FIRMS_LINK = '.nav-drawer .nav-links a:has-text("Firms")';
const DRAWER_WATCHLISTS_LINK =
  '.nav-drawer .nav-links a:has-text("Watchlists")';
const DRAWER_COMPLIANCE_LINK =
  '.nav-drawer .nav-links a:has-text("Compliance")';
const LEFT_RAIL_SELECTOR = ".layout > .left";
const RIGHT_RAIL_SELECTOR = ".layout > .right";
const SEARCH_KIND_BUTTON_SELECTOR = ".gs-kind-controls .gs-kind-toggle";
const TABLET_ROUTE_PATHS = [
  "/",
  "/firms",
  "/recruiting",
  "/rankings",
  "/advisors",
  "/teams",
  "/watchlists",
  "/regulatory",
  "/login",
] as const;
const TABLET_ROUTE_WIDTHS = [768, 900, 1280] as const;

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
  railBreakpoint(1301, true, true, "desktop"),
  railBreakpoint(1300, true, true, "mobile"),
  railBreakpoint(1280, true, true, "mobile"),
  railBreakpoint(1101, true, true, "mobile"),
  railBreakpoint(1100, false, true, "mobile"),
  railBreakpoint(1099, false, true, "mobile"),
  railBreakpoint(901, false, true, "mobile"),
  railBreakpoint(900, false, true, "mobile"),
  railBreakpoint(801, false, true, "mobile"),
  railBreakpoint(800, false, false, "mobile"),
  railBreakpoint(799, false, false, "mobile"),
  railBreakpoint(701, false, false, "mobile"),
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
  const breakpointChecks = await breakpointMatrix.reduce<
    Promise<readonly Check[]>
  >(
    async (previousChecks, expectation) => [
      ...(await previousChecks),
      ...(await smokeBreakpoint(browser, expectation, extraHTTPHeaders)),
    ],
    Promise.resolve([])
  );
  return [
    ...breakpointChecks,
    ...(await smokeTabletHeaderRoutes(browser, extraHTTPHeaders)),
  ];
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

  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);

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
  if (
    width !== 1300 &&
    width !== 1100 &&
    width !== 900 &&
    width !== 700 &&
    width !== 320
  )
    return [];

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
    check(
      await page.locator(DRAWER_WATCHLISTS_LINK).isVisible(),
      `breakpoint ${width}px: drawer exposes Watchlists`
    ),
    check(
      await page.locator(DRAWER_COMPLIANCE_LINK).isVisible(),
      `breakpoint ${width}px: drawer exposes Compliance`
    ),
    ...(await activeDrawerRouteChecks(page, burger, width)),
  ];
}

/**
 * Checks active mobile nav state on top-level routes missing from the drawer.
 * @param page - Browser page to inspect.
 * @param burger - Hamburger button locator.
 * @param width - Viewport width in CSS pixels.
 * @returns Route active-state smoke checks.
 */
async function activeDrawerRouteChecks(
  page: Page,
  burger: Locator,
  width: number
): Promise<readonly Check[]> {
  return [
    await activeDrawerRouteCheck(
      page,
      burger,
      width,
      DRAWER_WATCHLISTS_LINK,
      "**/watchlists",
      "Watchlists"
    ),
    await activeDrawerRouteCheck(
      page,
      burger,
      width,
      DRAWER_COMPLIANCE_LINK,
      "**/regulatory",
      "Compliance"
    ),
  ];
}

/**
 * Navigates through a drawer link and verifies the selected route is active.
 * @param page - Browser page to inspect.
 * @param burger - Hamburger button locator.
 * @param width - Viewport width in CSS pixels.
 * @param selector - Drawer link selector.
 * @param urlPattern - Expected destination URL pattern.
 * @param label - Human-readable route label.
 * @returns Active-state smoke check.
 */
async function activeDrawerRouteCheck(
  page: Page,
  burger: Locator,
  width: number,
  selector: string,
  urlPattern: string,
  label: string
): Promise<Check> {
  await Promise.all([
    page.waitForURL(urlPattern, { waitUntil: "domcontentloaded" }),
    page.locator(selector).click(),
  ]);
  await burger.click();
  const active = await page
    .locator(selector)
    .evaluate(element => element.classList.contains("active"));

  return check(
    active,
    `breakpoint ${width}px: ${label} route marks drawer link active`
  );
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
 * Checks public routes at tablet widths for header control overlap and overflow.
 * @param browser - Browser used to create route contexts.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for tablet header readability.
 */
async function smokeTabletHeaderRoutes(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  return await TABLET_ROUTE_WIDTHS.reduce<Promise<readonly Check[]>>(
    async (previousChecks, width) => [
      ...(await previousChecks),
      ...(await smokeTabletHeaderWidth(browser, width, extraHTTPHeaders)),
    ],
    Promise.resolve([])
  );
}

/**
 * Checks the full public route set at one tablet width.
 * @param browser - Browser used to create route contexts.
 * @param width - Viewport width in CSS pixels.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for the route set.
 */
async function smokeTabletHeaderWidth(
  browser: Browser,
  width: number,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  const checks = await TABLET_ROUTE_PATHS.reduce<Promise<readonly Check[]>>(
    async (previousChecks, path) => [
      ...(await previousChecks),
      ...(await smokeTabletHeaderRoute(page, width, path)),
    ],
    Promise.resolve([])
  );

  return await closeWithChecks(context, checks);
}

/**
 * Checks one route for tablet-width header readability and overflow.
 * @param page - Browser page to inspect.
 * @param width - Viewport width in CSS pixels.
 * @param path - Public route path.
 * @returns Smoke assertions for one route.
 */
async function smokeTabletHeaderRoute(
  page: Page,
  width: number,
  path: string
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}${path}`);
  await smokeWaitForSelector(page, ".nav", QUICK_UI_TIMEOUT);
  const metrics = await tabletHeaderMetrics(page);

  return [
    check(
      metrics.scrollWidth <= metrics.clientWidth,
      `tablet header ${width}px ${path}: no horizontal overflow`,
      `scrollWidth ${metrics.scrollWidth}, clientWidth ${metrics.clientWidth}`
    ),
    check(
      metrics.kindButtonsVisible === 4,
      `tablet header ${width}px ${path}: search kind options visible`,
      `visible ${metrics.kindButtonsVisible}`
    ),
    check(
      metrics.kindButtonsSeparated,
      `tablet header ${width}px ${path}: search kind labels do not overlap`,
      metrics.kindButtonBoxes
    ),
    check(
      metrics.kindButtonTextFits,
      `tablet header ${width}px ${path}: search kind labels are not clipped`,
      metrics.kindButtonTextWidths
    ),
    check(
      metrics.searchWidth >= 280,
      `tablet header ${width}px ${path}: search remains readable`,
      `width ${Math.round(metrics.searchWidth)}px`
    ),
  ];
}

/**
 * Reads tablet header boxes for overlap detection.
 * @param page - Browser page to inspect.
 * @returns Header width, overflow, and kind-button layout metrics.
 */
async function tabletHeaderMetrics(page: Page) {
  return await page.evaluate(selector => {
    const buttons = [...document.querySelectorAll(selector)];
    const boxes = buttons.map(button => button.getBoundingClientRect());
    const textWidths = buttons.map(button => {
      if (!(button instanceof HTMLElement)) return "non-html";
      return `${button.textContent?.trim() ?? ""}:${button.clientWidth}/${button.scrollWidth}`;
    });
    const searchBox = document
      .querySelector(".nav .search")
      ?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      kindButtonBoxes: boxes
        .map(box => `${Math.round(box.left)}-${Math.round(box.right)}`)
        .join(", "),
      kindButtonTextFits: buttons.every(button => {
        if (!(button instanceof HTMLElement)) return false;
        return button.scrollWidth <= button.clientWidth;
      }),
      kindButtonTextWidths: textWidths.join(", "),
      kindButtonsSeparated: boxes.every((box, index) => {
        const previous = boxes[index - 1];
        return !previous || previous.right <= box.left;
      }),
      kindButtonsVisible: boxes.filter(box => box.width >= 36).length,
      scrollWidth: document.documentElement.scrollWidth,
      searchWidth: searchBox?.width ?? 0,
    };
  }, SEARCH_KIND_BUTTON_SELECTOR);
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

import type { Page } from "playwright";
import { check, QUICK_UI_TIMEOUT, type Check } from "./web_smoke_support.js";
import {
  readDrawerTabTrace,
  type FocusTraceEntry,
} from "./web_smoke_mobile_focus.js";

const DRAWER_OPEN_CLASS = "drawer-open";
const DRAWER_SELECTOR = ".nav-drawer";
const DRAWER_LINKS_SELECTOR =
  ".nav-drawer .nav-links a, .nav-drawer .me-action";
const NAV_BURGER_SELECTOR = ".nav-burger";

/** Drawer body class and trigger ARIA state. */
interface DrawerState {
  readonly expanded: string | null | undefined;
  readonly open: boolean;
}

/** Result captured after Escape and reopening. */
interface DrawerExerciseResult {
  readonly closed: DrawerState;
  readonly closedTabTrace: readonly FocusTraceEntry[];
  readonly reopened: DrawerState;
}

/** Inputs used for final drawer state checks. */
interface DrawerStateCheckInput {
  readonly drawerLinkLabels: readonly string[];
  readonly escapeResult: DrawerExerciseResult;
  readonly finalUrl: string;
}

/**
 * Builds smoke checks for mobile drawer open/close state.
 * @param root0 - Drawer state inputs.
 * @param root0.drawerLinkLabels - Visible drawer labels after opening.
 * @param root0.escapeResult - Drawer state captured after Escape and reopening.
 * @param root0.finalUrl - URL after clicking the Firms drawer link.
 * @returns Drawer state checks.
 */
export function drawerStateChecks({
  drawerLinkLabels,
  escapeResult,
  finalUrl,
}: DrawerStateCheckInput): readonly Check[] {
  return [
    check(
      !escapeResult.closed.open && escapeResult.closed.expanded === "false",
      "mobile: Escape closes drawer and resets aria-expanded"
    ),
    check(
      escapeResult.reopened.open && escapeResult.reopened.expanded === "true",
      "mobile: drawer reopens after Escape dismissal"
    ),
    check(
      ["Home", "Firms", "Rankings", "Advisors", "Teams", "Sign in"].every(
        label => drawerLinkLabels.includes(label)
      ),
      "mobile: drawer links visible at 320px",
      drawerLinkLabels.join(", ")
    ),
    check(
      finalUrl.endsWith("/firms"),
      "mobile: drawer link navigates to Firms"
    ),
  ];
}

/**
 * Opens the mobile drawer and waits for the slide transition.
 * @param page - Browser page to inspect.
 */
export async function openMobileDrawer(page: Page): Promise<void> {
  await page.locator(NAV_BURGER_SELECTOR).click();
  await waitForDrawerOpenState(page, true);
  await waitForDrawerViewportState(page, true);
}

/**
 * Presses Escape against an open drawer, captures closed state, then reopens it.
 * @param page - Browser page to inspect.
 * @returns Drawer state after Escape and after reopening.
 */
export async function exerciseEscapeDismissal(
  page: Page
): Promise<DrawerExerciseResult> {
  await page.keyboard.press("Escape");
  await waitForDrawerOpenState(page, false);
  const closed = await readDrawerState(page);
  const closedTabTrace = await readDrawerTabTrace(page);
  await openMobileDrawer(page);
  return { closed, closedTabTrace, reopened: await readDrawerState(page) };
}

/**
 * Reads visible drawer labels for navigation affordance checks.
 * @param page - Browser page to inspect.
 * @returns Drawer link and auth action labels.
 */
export async function readDrawerLinkLabels(
  page: Page
): Promise<readonly string[]> {
  return await page
    .locator(DRAWER_LINKS_SELECTOR)
    .evaluateAll(nodes =>
      nodes
        .map(node => node.textContent?.trim())
        .filter((label): label is string => Boolean(label))
    );
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
 * Waits for the drawer slide transition to finish enough for viewport checks.
 * @param page - Browser page to inspect.
 * @param inViewport - Whether the drawer should intersect the viewport.
 */
async function waitForDrawerViewportState(
  page: Page,
  inViewport: boolean
): Promise<void> {
  await page.waitForFunction(
    ({ drawerSelector, expectedInViewport }) => {
      const rect = document
        .querySelector(drawerSelector)
        ?.getBoundingClientRect();
      const intersectsViewport = Boolean(
        rect &&
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
      const fullyVisible = Boolean(
        rect &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth + 1 &&
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight + 1
      );
      return expectedInViewport ? fullyVisible : !intersectsViewport;
    },
    { drawerSelector: DRAWER_SELECTOR, expectedInViewport: inViewport },
    { timeout: QUICK_UI_TIMEOUT }
  );
}

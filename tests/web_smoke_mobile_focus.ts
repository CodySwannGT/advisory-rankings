import type { Page } from "playwright";
import { check, QUICK_UI_TIMEOUT, type Check } from "./web_smoke_support.js";

const DRAWER_OPEN_CLASS = "drawer-open";
const NAV_BURGER_SELECTOR = ".nav-burger";
const MOBILE_TAB_SCAN_LIMIT = 120;

/** Focus trail captured while tabbing through the mobile header. */
interface TabSequence {
  readonly labels: readonly string[];
  readonly reachedHiddenDrawer: boolean;
  readonly reachedVisibleDrawer: boolean;
}

/**
 * Checks mobile drawer focus order while closed, open, and re-closed.
 * @param page - Browser page at the mobile smoke viewport.
 * @returns Smoke assertions for drawer tab containment.
 */
export async function smokeMobileFocus(page: Page): Promise<readonly Check[]> {
  const closedTabSequence = await readDrawerTabSequence(page);
  await setDrawerOpen(page, true);
  const openTabSequence = await readDrawerTabSequence(page);
  await page.keyboard.press("Escape");
  await waitForDrawerOpenState(page, false);
  const reclosedTabSequence = await readDrawerTabSequence(page);
  await setDrawerOpen(page, true);

  return [
    check(
      !closedTabSequence.reachedHiddenDrawer,
      "mobile: closed drawer links are skipped by Tab",
      formatTabSequence(closedTabSequence)
    ),
    check(
      openTabSequence.reachedVisibleDrawer,
      "mobile: open drawer links are reachable by Tab",
      formatTabSequence(openTabSequence)
    ),
    check(
      !reclosedTabSequence.reachedHiddenDrawer,
      "mobile: re-closed drawer links are skipped by Tab",
      formatTabSequence(reclosedTabSequence)
    ),
  ];
}

/**
 * Opens or closes the drawer and waits for the DOM state to settle.
 * @param page - Browser page to inspect.
 * @param open - Desired drawer state.
 */
async function setDrawerOpen(page: Page, open: boolean): Promise<void> {
  if ((await isDrawerOpen(page)) !== open)
    await page.locator(NAV_BURGER_SELECTOR).click();
  await waitForDrawerOpenState(page, open);
}

/**
 * Reads whether the drawer body class is present.
 * @param page - Browser page to inspect.
 * @returns Whether the drawer is open.
 */
async function isDrawerOpen(page: Page): Promise<boolean> {
  return await page.evaluate(
    drawerOpenClass => document.body.classList.contains(drawerOpenClass),
    DRAWER_OPEN_CLASS
  );
}

/**
 * Tabs from the hamburger through nearby header controls and records drawer focus.
 * @param page - Browser page to inspect.
 * @returns Focus labels and whether focus entered the drawer.
 */
async function readDrawerTabSequence(page: Page): Promise<TabSequence> {
  await page.locator(NAV_BURGER_SELECTOR).focus();
  return await Array.from({ length: MOBILE_TAB_SCAN_LIMIT }).reduce<
    Promise<TabSequence>
  >(
    async previousSequence => {
      const previous = await previousSequence;
      await page.keyboard.press("Tab");
      const focus = await readActiveFocus(page);
      return {
        labels: [...previous.labels, focus.label],
        reachedHiddenDrawer:
          previous.reachedHiddenDrawer || (focus.inDrawer && !focus.inViewport),
        reachedVisibleDrawer:
          previous.reachedVisibleDrawer || (focus.inDrawer && focus.inViewport),
      };
    },
    Promise.resolve({
      labels: [],
      reachedHiddenDrawer: false,
      reachedVisibleDrawer: false,
    })
  );
}

/**
 * Reads the focused element label and whether it sits inside the nav drawer.
 * @param page - Browser page to inspect.
 * @returns Active focus metadata.
 */
async function readActiveFocus(page: Page): Promise<{
  readonly inDrawer: boolean;
  readonly inViewport: boolean;
  readonly label: string;
}> {
  return await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return { inDrawer: false, inViewport: false, label: "none" };
    const rect = active.getBoundingClientRect();
    return {
      inDrawer: Boolean(active.closest(".nav-drawer")),
      inViewport: Boolean(
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      ),
      label:
        active.textContent?.trim() ||
        active.getAttribute("aria-label") ||
        active.getAttribute("placeholder") ||
        active.tagName.toLowerCase(),
    };
  });
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
 * Formats a compact tab sequence for smoke failure output.
 * @param sequence - Captured tab sequence.
 * @returns Failure detail string.
 */
function formatTabSequence(sequence: TabSequence): string {
  return sequence.labels.join(" > ");
}

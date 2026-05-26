import type { Page } from "playwright";
import { check, type Check } from "./web_smoke_support.js";

const DRAWER_SELECTOR = ".nav-drawer";
const NAV_BURGER_SELECTOR = ".nav-burger";
const TAB_TRACE_STEPS = 8;

/** One keyboard-focus observation from the mobile tab trace. */
export interface FocusTraceEntry {
  readonly inDrawer: boolean;
  readonly inViewport: boolean;
  readonly label: string;
}

/** Focus traces captured across closed, open, and reclosed drawer states. */
interface DrawerFocusTraces {
  readonly closedTabTrace: readonly FocusTraceEntry[];
  readonly openTabTrace: readonly FocusTraceEntry[];
  readonly reclosedTabTrace: readonly FocusTraceEntry[];
}

/**
 * Builds smoke checks for mobile drawer keyboard focus management.
 * @param root0 - Focus traces for drawer states.
 * @param root0.closedTabTrace - Trace while drawer starts closed.
 * @param root0.openTabTrace - Trace while drawer is open.
 * @param root0.reclosedTabTrace - Trace after Escape closes the drawer.
 * @returns Drawer focus checks.
 */
export function drawerFocusChecks({
  closedTabTrace,
  openTabTrace,
  reclosedTabTrace,
}: DrawerFocusTraces): readonly Check[] {
  return [
    check(
      noHiddenDrawerFocus(closedTabTrace),
      "mobile: closed drawer links skipped in tab order",
      hiddenDrawerFocusLabels(closedTabTrace)
    ),
    check(
      hasVisibleDrawerFocus(openTabTrace),
      "mobile: open drawer links reachable by keyboard",
      focusTraceLabels(openTabTrace)
    ),
    check(
      noHiddenDrawerFocus(reclosedTabTrace),
      "mobile: Escape removes drawer links from tab order",
      hiddenDrawerFocusLabels(reclosedTabTrace)
    ),
  ];
}

/**
 * Reads keyboard traversal after the hamburger button.
 * @param page - Browser page to inspect.
 * @returns Ordered active-element entries from repeated Tab presses.
 */
export async function readDrawerTabTrace(
  page: Page
): Promise<readonly FocusTraceEntry[]> {
  await page.locator(NAV_BURGER_SELECTOR).focus();
  return await Array.from({ length: TAB_TRACE_STEPS }).reduce<
    Promise<readonly FocusTraceEntry[]>
  >(async (previousTrace): Promise<readonly FocusTraceEntry[]> => {
    const trace = await previousTrace;
    await page.keyboard.press("Tab");
    return [...trace, await readActiveFocusEntry(page)];
  }, Promise.resolve([]));
}

/**
 * Reads the currently focused element's drawer and viewport status.
 * @param page - Browser page to inspect.
 * @returns Focus entry for the active element.
 */
async function readActiveFocusEntry(page: Page): Promise<FocusTraceEntry> {
  return await page.evaluate(drawerSelector => {
    const activeElement = document.activeElement;
    const rect = activeElement?.getBoundingClientRect();
    const rawLabel =
      activeElement?.textContent?.trim() ||
      activeElement?.getAttribute?.("aria-label") ||
      activeElement?.getAttribute?.("placeholder") ||
      activeElement?.tagName ||
      "";
    return {
      label: rawLabel.replace(/\s+/g, " "),
      inDrawer: Boolean(activeElement?.closest?.(drawerSelector)),
      inViewport: Boolean(
        rect &&
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      ),
    };
  }, DRAWER_SELECTOR);
}

/**
 * Checks whether the trace avoided hidden drawer targets.
 * @param trace - Focus trace to inspect.
 * @returns Whether no off-canvas drawer target received focus.
 */
function noHiddenDrawerFocus(trace: readonly FocusTraceEntry[]): boolean {
  return trace.every(entry => !entry.inDrawer || entry.inViewport);
}

/**
 * Checks whether the trace reached an open drawer target.
 * @param trace - Focus trace to inspect.
 * @returns Whether a drawer element was focused while visible.
 */
function hasVisibleDrawerFocus(trace: readonly FocusTraceEntry[]): boolean {
  return trace.some(entry => entry.inDrawer && entry.inViewport);
}

/**
 * Formats hidden drawer targets for smoke failure details.
 * @param trace - Focus trace to inspect.
 * @returns Hidden drawer labels, if any.
 */
function hiddenDrawerFocusLabels(trace: readonly FocusTraceEntry[]): string {
  return trace
    .filter(entry => entry.inDrawer && !entry.inViewport)
    .map(entry => entry.label)
    .join(", ");
}

/**
 * Formats the focus trace for smoke details.
 * @param trace - Focus trace to format.
 * @returns Ordered labels from the trace.
 */
function focusTraceLabels(trace: readonly FocusTraceEntry[]): string {
  return trace.map(entry => entry.label).join(" -> ");
}

import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  shot,
  smokeGoto,
} from "./web_smoke_support.js";

const DIRECTORY_ROW_SELECTOR = ".center .entity-list .row";
const STATS_CARD_SELECTOR = ".right .card";

/**
 *
 */
type DirectoryPageName = "firms" | "teams";

/** Browser state read from a filtered directory page. */
interface FilteredDirectoryState {
  readonly activeValue?: string;
  readonly accessibleLabels: boolean;
  readonly channelValue?: string;
  readonly firmValue?: string;
  readonly firstHref: string;
  readonly loaded: number;
  readonly rawMetricsHidden: boolean;
  readonly rowCount: number;
  readonly serviceModelValue?: string;
  readonly total: number;
}

/**
 * Opens a filtered directory, reloads it, and reads restored controls.
 * @param page - Browser page to inspect.
 * @param pageName - Directory route name.
 * @param qs - Filter query used for the directory.
 * @returns Visible filter control values and rendered row count.
 */
export async function captureFilteredState(
  page: Page,
  pageName: DirectoryPageName,
  qs: URLSearchParams
): Promise<FilteredDirectoryState> {
  await smokeGoto(page, `${BASE}/${pageName}?${qs.toString()}`);
  await page.locator(".directory-filters").waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(DIRECTORY_ROW_SELECTOR).first().waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await waitForDirectoryStats(page, directoryTitle(pageName));
  const state = {
    activeValue:
      pageName === "firms"
        ? await page.locator('[name="active"]').inputValue()
        : undefined,
    accessibleLabels: await controlsHaveAccessibleLabels(page, pageName),
    channelValue:
      pageName === "firms"
        ? await page.locator('[name="channel"]').inputValue()
        : undefined,
    firmValue:
      pageName === "teams"
        ? await page.locator('[name="firm"]').inputValue()
        : undefined,
    firstHref: await firstRowHref(page),
    loaded: await readDirectoryStat(page, directoryTitle(pageName), "Showing"),
    rawMetricsHidden: await rawDirectoryMetricsHidden(
      page,
      directoryTitle(pageName)
    ),
    rowCount: await page.locator(DIRECTORY_ROW_SELECTOR).count(),
    serviceModelValue:
      pageName === "teams"
        ? await page.locator('[name="serviceModel"]').inputValue()
        : undefined,
    total: await readDirectoryStat(page, directoryTitle(pageName), "Matches"),
  };
  await shot(page, `06-${pageName}-filtered-url-state`);
  return state;
}

/**
 * Opens a zero-result filter combination and confirms controls remain.
 * @param page - Browser page to inspect.
 * @param pageName - Directory route name.
 * @param expectedCopy - Empty-state copy expected on the page.
 * @param shotName - Screenshot basename.
 * @returns Whether controls remain enabled.
 */
export async function captureEmptyState(
  page: Page,
  pageName: DirectoryPageName,
  expectedCopy: string,
  shotName: string
): Promise<boolean> {
  await smokeGoto(page, `${BASE}/${pageName}?q=zzzz-no-${pageName}-match`);
  await page.getByText(expectedCopy).waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  const controlsAvailable = await controlsRemainAvailable(page);
  await shot(page, shotName);
  return controlsAvailable;
}

/**
 * Opens a filtered directory at a mobile width and checks overflow.
 * @param page - Browser page to inspect.
 * @param pageName - Directory route name.
 * @param qs - Filter query used for the directory.
 * @param width - Mobile viewport width.
 * @param shotName - Screenshot basename.
 * @returns True when content is wider than the viewport.
 */
export async function mobileOverflow(
  page: Page,
  pageName: DirectoryPageName,
  qs: URLSearchParams,
  width: number,
  shotName: string
): Promise<boolean> {
  const previousViewport = page.viewportSize();
  try {
    await page.setViewportSize({ width, height: 900 });
    await smokeGoto(page, `${BASE}/${pageName}?${qs.toString()}`);
    await page.locator(DIRECTORY_ROW_SELECTOR).first().waitFor({
      timeout: DEPLOYED_DATA_TIMEOUT,
    });
    await waitForDirectoryStats(page, directoryTitle(pageName));
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    await shot(page, shotName);
    return hasOverflow;
  } finally {
    if (previousViewport) await page.setViewportSize(previousViewport);
  }
}

/**
 * Checks that filter controls are still interactable.
 * @param page - Browser page to inspect.
 * @returns Whether an enabled filter form remains visible.
 */
async function controlsRemainAvailable(page: Page): Promise<boolean> {
  return await page
    .locator(".directory-filters input, .directory-filters select")
    .first()
    .isEnabled();
}

/**
 * Confirms visible filter labels have explicit control associations.
 * @param page - Browser page to inspect.
 * @param pageName - Directory route name.
 * @returns Whether all expected labels point at form controls.
 */
async function controlsHaveAccessibleLabels(
  page: Page,
  pageName: DirectoryPageName
): Promise<boolean> {
  const labels =
    pageName === "firms"
      ? [
          ["Firm", "firm-filter-q", "q"],
          ["Channel", "firm-filter-channel", "channel"],
          ["HQ state", "firm-filter-state", "state"],
          ["Status", "firm-filter-active", "active"],
        ]
      : [
          ["Current firm", "team-filter-firm", "firm"],
          ["Service model", "team-filter-serviceModel", "serviceModel"],
        ];
  return await page.evaluate(expectedLabels => {
    return expectedLabels.every(([labelText, id, name]) => {
      const labelNode = document.querySelector(`label[for="${id}"]`);
      const control = document.getElementById(id);
      return Boolean(
        labelNode?.textContent?.trim() === labelText &&
        control &&
        ["INPUT", "SELECT"].includes(control.tagName) &&
        control.getAttribute("name") === name
      );
    });
  }, labels);
}

/**
 * Waits for directory match copy to include numeric showing and match counts.
 * @param page - Browser page rendering a directory.
 * @param title - Stats card title.
 */
async function waitForDirectoryStats(page: Page, title: string): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, title: statsTitle }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(statsTitle)
      );
      const statValue = (label: string) => {
        const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
        const key = labels.find(item => item.textContent === label);
        return key?.nextElementSibling?.textContent ?? "";
      };
      return ["Showing", "Matches"].every(label => {
        const match = /\d+/.exec(statValue(label).replace(/,/g, ""));
        return Number.isFinite(match ? Number(match[0]) : NaN);
      });
    },
    { statsSelector: STATS_CARD_SELECTOR, title },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Reads one numeric directory stat.
 * @param page - Browser page rendering a directory.
 * @param title - Stats card title.
 * @param label - Stat label to read.
 * @returns Parsed stat value.
 */
async function readDirectoryStat(
  page: Page,
  title: string,
  label: string
): Promise<number> {
  return await page.evaluate(
    ({ statsSelector, title: statsTitle, statLabel }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(statsTitle)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const key = labels.find(item => item.textContent === statLabel);
      const value = key?.nextElementSibling?.textContent ?? "";
      const match = /\d+/.exec(value.replace(/,/g, ""));
      return match ? Number(match[0]) : NaN;
    },
    { statsSelector: STATS_CARD_SELECTOR, title, statLabel: label }
  );
}

/**
 * Confirms raw implementation counters are absent from the directory rail.
 * @param page - Browser page rendering a directory.
 * @param _title - Stats card title kept for a consistent helper signature.
 * @returns Whether old developer metric labels are hidden.
 */
async function rawDirectoryMetricsHidden(
  page: Page,
  _title: string
): Promise<boolean> {
  return await page.evaluate(() => {
    const rightRailText = document.querySelector(".right")?.textContent ?? "";
    return !/\b(?:Loaded|Total|Page size)\b/.test(rightRailText);
  });
}

/**
 * Reads the first directory row's destination link.
 * @param page - Browser page rendering a directory.
 * @returns The first row href.
 */
async function firstRowHref(page: Page): Promise<string> {
  return (
    (await page
      .locator(DIRECTORY_ROW_SELECTOR)
      .first()
      .locator("xpath=ancestor-or-self::a[1]")
      .getAttribute("href")
      .catch(() => null)) || ""
  );
}

/**
 * Maps directory routes to their stats card title.
 * @param pageName - Directory route name.
 * @returns Stats card title.
 */
function directoryTitle(pageName: DirectoryPageName): string {
  return pageName === "firms" ? "Firm directory" : "Team directory";
}

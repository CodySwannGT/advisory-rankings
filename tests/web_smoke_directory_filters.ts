import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  check,
  shot,
  smokeGoto,
  type Check,
} from "./web_smoke_support.js";

const DIRECTORY_ROW_SELECTOR = ".center .entity-list .row";
const STATS_CARD_SELECTOR = ".right .card";
/** Directory routes covered by the firm/team filter smoke checks. */
type DirectoryPageName = "firms" | "teams";

/** Minimal firm row shape needed for filter smoke assertions. */
interface FirmFixture {
  readonly channel?: string;
  readonly hqState?: string;
}

/** Minimal team row shape needed for filter smoke assertions. */
interface TeamFixture {
  readonly currentFirmName?: string;
  readonly serviceModel?: string;
}

/** Browser state read from a filtered directory page. */
interface FilteredDirectoryState {
  readonly activeValue?: string;
  readonly channelValue?: string;
  readonly firmValue?: string;
  readonly firstHref: string;
  readonly loaded: number;
  readonly rowCount: number;
  readonly serviceModelValue?: string;
  readonly total: number;
}

/**
 * Checks URL-backed filter controls for firm and team directories.
 * @param page - Browser page used for the directory scenario.
 * @returns Smoke assertions for filtered firm and team directories.
 */
export async function smokeFirmTeamDirectoryFilters(
  page: Page
): Promise<readonly Check[]> {
  return [
    ...(await smokeFirmDirectoryFilters(page)),
    ...(await smokeTeamDirectoryFilters(page)),
  ];
}

/**
 * Exercises firm channel/status URL state and empty-state behavior.
 * @param page - Browser page used for the firm directory scenario.
 * @returns Smoke assertions for firm filters.
 */
async function smokeFirmDirectoryFilters(
  page: Page
): Promise<readonly Check[]> {
  const fixture = await firstFirmFilterFixture(page);
  const qs = firmFilterQuery(fixture);
  const filtered = await captureFilteredState(page, "firms", qs);
  const wide390 = await mobileOverflow(
    page,
    "firms",
    qs,
    390,
    "06-firms-filtered-mobile-390"
  );
  const wide320 = await mobileOverflow(
    page,
    "firms",
    qs,
    320,
    "06-firms-filtered-mobile-320"
  );
  const emptyControlsAvailable = await captureEmptyState(
    page,
    "firms",
    "No firms match the selected filters.",
    "06-firms-filtered-empty-state"
  );

  return [
    check(
      !fixture.channel ||
        filtered.channelValue?.toLowerCase() === fixture.channel,
      "firms filters: channel restores from URL",
      filtered.channelValue
    ),
    check(
      filtered.activeValue === "true",
      "firms filters: active status restores"
    ),
    check(filtered.rowCount >= 1, "firms filters: filtered rows render"),
    check(
      filtered.loaded === filtered.rowCount &&
        filtered.total >= filtered.loaded,
      "firms filters: loaded and total counts render",
      `${filtered.loaded}/${filtered.total}`
    ),
    check(
      /^\/firms\/[a-z0-9-]+-[0-9a-f-]{36}$/i.test(filtered.firstHref),
      "firms filters: first row links to canonical firm profile",
      filtered.firstHref
    ),
    check(!wide390, "firms filters: 390px layout has no horizontal overflow"),
    check(!wide320, "firms filters: 320px layout has no horizontal overflow"),
    check(
      emptyControlsAvailable,
      "firms filters: empty state keeps controls available"
    ),
  ];
}

/**
 * Exercises team current-firm URL state and mobile overflow behavior.
 * @param page - Browser page used for the team directory scenario.
 * @returns Smoke assertions for team filters.
 */
async function smokeTeamDirectoryFilters(
  page: Page
): Promise<readonly Check[]> {
  const fixture = await firstTeamFilterFixture(page);
  const qs = teamFilterQuery(fixture);
  const filtered = await captureFilteredState(page, "teams", qs);
  const wide390 = await mobileOverflow(
    page,
    "teams",
    qs,
    390,
    "06-teams-filtered-mobile-390"
  );
  const wide320 = await mobileOverflow(
    page,
    "teams",
    qs,
    320,
    "06-teams-filtered-mobile-320"
  );
  const emptyControlsAvailable = await captureEmptyState(
    page,
    "teams",
    "No teams match the selected filters.",
    "06-teams-filtered-empty-state"
  );

  return [
    check(
      !fixture.currentFirmName ||
        filtered.firmValue === fixture.currentFirmName,
      "teams filters: current firm restores from URL",
      filtered.firmValue
    ),
    check(
      !fixture.serviceModel ||
        filtered.serviceModelValue?.toLowerCase() === fixture.serviceModel,
      "teams filters: service model restores from URL",
      filtered.serviceModelValue
    ),
    check(filtered.rowCount >= 1, "teams filters: filtered rows render"),
    check(
      filtered.loaded === filtered.rowCount &&
        filtered.total >= filtered.loaded,
      "teams filters: loaded and total counts render",
      `${filtered.loaded}/${filtered.total}`
    ),
    check(
      /^\/teams\/[a-z0-9-]+-[0-9a-f-]{36}$/i.test(filtered.firstHref),
      "teams filters: first row links to canonical team profile",
      filtered.firstHref
    ),
    check(!wide390, "teams filters: 390px layout has no horizontal overflow"),
    check(!wide320, "teams filters: 320px layout has no horizontal overflow"),
    check(
      emptyControlsAvailable,
      "teams filters: empty state keeps controls available"
    ),
  ];
}

/**
 * Loads a live firm row with useful filter fields.
 * @param page - Browser page used for resource requests.
 * @returns Firm filter fixture.
 */
async function firstFirmFilterFixture(page: Page): Promise<FirmFixture> {
  const response = await page.request.get(
    `${BASE}/PublicFirms?limit=20&active=true`
  );
  const payload = await response.json();
  const firm = (payload.items || []).find(
    (item: FirmFixture) => item.channel || item.hqState
  );
  return {
    channel: String(firm?.channel || "").toLowerCase(),
    hqState: String(firm?.hqState || "").toUpperCase(),
  };
}

/**
 * Loads a live team row with useful filter fields.
 * @param page - Browser page used for resource requests.
 * @returns Team filter fixture.
 */
async function firstTeamFilterFixture(page: Page): Promise<TeamFixture> {
  const response = await page.request.get(`${BASE}/PublicTeams?limit=50`);
  const payload = await response.json();
  const team = (payload.items || []).find(
    (item: TeamFixture) => item.currentFirmName || item.serviceModel
  );
  return {
    currentFirmName: String(team?.currentFirmName || ""),
    serviceModel: String(team?.serviceModel || "").toLowerCase(),
  };
}

/**
 * Builds a public firm directory query from a fixture row.
 * @param fixture - Firm row used to choose stable filter values.
 * @returns URL query for the filtered firm directory.
 */
function firmFilterQuery(fixture: FirmFixture): URLSearchParams {
  const qs = new URLSearchParams();
  if (fixture.channel) qs.set("channel", fixture.channel);
  if (fixture.hqState) qs.set("state", fixture.hqState);
  qs.set("active", "true");
  return qs;
}

/**
 * Builds a public team directory query from a fixture row.
 * @param fixture - Team row used to choose stable filter values.
 * @returns URL query for the filtered team directory.
 */
function teamFilterQuery(fixture: TeamFixture): URLSearchParams {
  const qs = new URLSearchParams();
  if (fixture.currentFirmName) qs.set("firm", fixture.currentFirmName);
  if (fixture.serviceModel) qs.set("serviceModel", fixture.serviceModel);
  return qs;
}

/**
 * Opens a filtered directory, reloads it, and reads restored controls.
 * @param page - Browser page to inspect.
 * @param pageName - Directory route name.
 * @param qs - Filter query used for the directory.
 * @returns Visible filter control values and rendered row count.
 */
async function captureFilteredState(
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
    channelValue:
      pageName === "firms"
        ? await page.locator('[name="channel"]').inputValue()
        : undefined,
    firmValue:
      pageName === "teams"
        ? await page.locator('[name="firm"]').inputValue()
        : undefined,
    firstHref: await firstRowHref(page),
    loaded: await readDirectoryStat(page, directoryTitle(pageName), "Loaded"),
    rowCount: await page.locator(DIRECTORY_ROW_SELECTOR).count(),
    serviceModelValue:
      pageName === "teams"
        ? await page.locator('[name="serviceModel"]').inputValue()
        : undefined,
    total: await readDirectoryStat(page, directoryTitle(pageName), "Total"),
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
async function captureEmptyState(
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
async function mobileOverflow(
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
 * Waits for loaded and total directory stats to become numeric.
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
      return ["Loaded", "Total"].every(label =>
        Number.isFinite(Number(statValue(label).replace(/,/g, "")))
      );
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
      return Number(value.replace(/,/g, ""));
    },
    { statsSelector: STATS_CARD_SELECTOR, title, statLabel: label }
  );
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

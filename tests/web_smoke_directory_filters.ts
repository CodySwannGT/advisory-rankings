import type { Page } from "playwright";
import { BASE, check, type Check } from "./web_smoke_support.js";
import {
  captureEmptyState,
  captureFilteredState,
  mobileOverflow,
} from "./web_smoke_directory_filter_support.js";

const DIRECTORY_ROW_SELECTOR = ".center .entity-list .row";
const DIRECTORY_FILTER_SELECTOR = ".directory-filters";

/** Minimal firm row shape needed for filter smoke assertions. */
interface FirmFixture {
  readonly channel?: string;
  readonly hqState?: string;
  readonly name?: string;
}

/** Minimal team row shape needed for filter smoke assertions. */
interface TeamFixture {
  readonly currentFirmName?: string;
  readonly name?: string;
  readonly serviceModel?: string;
}

/** Live-filter behavior captured from an interactive directory form. */
interface LiveFilterFacts {
  readonly noApplyButton: boolean;
  readonly rowsRender: boolean;
  readonly selectControls: boolean;
  readonly urlUpdated: boolean;
}

type FilteredState = Awaited<ReturnType<typeof captureFilteredState>>;

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
  const liveFacts = await captureLiveFirmFilterFacts(page, fixture);

  return firmDirectoryChecks({
    emptyControlsAvailable,
    filtered,
    fixture,
    liveFacts,
    wide320,
    wide390,
  });
}

function firmDirectoryChecks(facts: {
  readonly emptyControlsAvailable: boolean;
  readonly filtered: Awaited<ReturnType<typeof captureFilteredState>>;
  readonly fixture: FirmFixture;
  readonly liveFacts: LiveFilterFacts;
  readonly wide320: boolean;
  readonly wide390: boolean;
}): readonly Check[] {
  return [
    check(
      !facts.fixture.channel ||
        facts.filtered.channelValue?.toLowerCase() === facts.fixture.channel,
      "firms filters: channel restores from URL",
      facts.filtered.channelValue
    ),
    check(
      facts.filtered.activeValue === "true",
      "firms filters: active status restores"
    ),
    check(
      facts.filtered.accessibleLabels,
      "firms filters: controls are reachable by visible labels"
    ),
    check(facts.filtered.rowCount >= 1, "firms filters: filtered rows render"),
    check(
      facts.filtered.loaded === facts.filtered.rowCount &&
        facts.filtered.total >= facts.filtered.loaded,
      "firms filters: showing and match copy render",
      `${facts.filtered.loaded}/${facts.filtered.total}`
    ),
    check(
      facts.filtered.rawMetricsHidden,
      "firms filters: developer metrics are hidden"
    ),
    ...firmLiveFilterChecks(facts.liveFacts),
    check(
      /^\/firms\/[a-z0-9-]+-[0-9a-f-]{36}$/i.test(facts.filtered.firstHref),
      "firms filters: first row links to canonical firm profile",
      facts.filtered.firstHref
    ),
    check(
      !facts.wide390,
      "firms filters: 390px layout has no horizontal overflow"
    ),
    check(
      !facts.wide320,
      "firms filters: 320px layout has no horizontal overflow"
    ),
    check(
      facts.emptyControlsAvailable,
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
  const liveFacts = await captureLiveTeamFilterFacts(page, fixture);

  return teamDirectoryFilterChecks(
    fixture,
    filtered,
    { wide390, wide320, emptyControlsAvailable },
    liveFacts
  );
}

function teamDirectoryFilterChecks(
  fixture: TeamFixture,
  filtered: FilteredState,
  layout: {
    readonly wide390: boolean;
    readonly wide320: boolean;
    readonly emptyControlsAvailable: boolean;
  },
  liveFacts: LiveFilterFacts
): readonly Check[] {
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
      "teams filters: showing and match copy render",
      `${filtered.loaded}/${filtered.total}`
    ),
    check(
      filtered.rawMetricsHidden,
      "teams filters: developer metrics are hidden"
    ),
    ...teamLiveFilterChecks(liveFacts),
    check(
      /^\/teams\/[a-z0-9-]+-[0-9a-f-]{36}$/i.test(filtered.firstHref),
      "teams filters: first row links to canonical team profile",
      filtered.firstHref
    ),
    check(
      !layout.wide390,
      "teams filters: 390px layout has no horizontal overflow"
    ),
    check(
      !layout.wide320,
      "teams filters: 320px layout has no horizontal overflow"
    ),
    check(
      layout.emptyControlsAvailable,
      "teams filters: empty state keeps controls available"
    ),
  ];
}

/**
 * Builds checks for interactive firm filtering.
 * @param facts - Captured live-filter observations.
 * @returns Firm live-filter smoke checks.
 */
function firmLiveFilterChecks(facts: LiveFilterFacts): readonly Check[] {
  return [
    check(
      facts.noApplyButton && facts.urlUpdated && facts.rowsRender,
      "firms filters: firm name filters live without Apply",
      JSON.stringify(facts)
    ),
    check(
      facts.selectControls,
      "firms filters: channel and HQ state are constrained selects"
    ),
  ];
}

/**
 * Builds checks for interactive team filtering.
 * @param facts - Captured live-filter observations.
 * @returns Team live-filter smoke checks.
 */
function teamLiveFilterChecks(facts: LiveFilterFacts): readonly Check[] {
  return [
    check(
      facts.noApplyButton && facts.urlUpdated && facts.rowsRender,
      "teams filters: team name filters live without Apply",
      JSON.stringify(facts)
    ),
    check(
      facts.selectControls,
      "teams filters: service model is a constrained select"
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
    name: String(firm?.name || ""),
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
    name: String(team?.name || ""),
    serviceModel: String(team?.serviceModel || "").toLowerCase(),
  };
}

/**
 * Exercises the firm name live filter and constrained controls.
 * @param page - Browser page used for the directory scenario.
 * @param fixture - Live firm row used to choose a satisfiable query.
 * @returns Live-filter observations.
 */
async function captureLiveFirmFilterFacts(
  page: Page,
  fixture: FirmFixture
): Promise<LiveFilterFacts> {
  const query = (fixture.name || "morgan").slice(0, 4).toLowerCase();
  await page.goto(`${BASE}/firms`, { waitUntil: "domcontentloaded" });
  await page.locator(DIRECTORY_FILTER_SELECTOR).waitFor();
  await page.locator('[name="q"]').fill(query);
  await page.waitForURL(url => url.searchParams.get("q") === query);
  await page.locator(DIRECTORY_ROW_SELECTOR).first().waitFor();
  return await page.evaluate(
    ({ filterSelector, rowSelector }) => ({
      noApplyButton: !Array.from(
        document.querySelectorAll(`${filterSelector} button`)
      ).some(button => button.textContent?.trim() === "Apply"),
      rowsRender: document.querySelectorAll(rowSelector).length > 0,
      selectControls: ["channel", "state"].every(
        name => document.querySelector(`[name="${name}"]`)?.tagName === "SELECT"
      ),
      urlUpdated: new URL(location.href).searchParams.has("q"),
    }),
    {
      filterSelector: DIRECTORY_FILTER_SELECTOR,
      rowSelector: DIRECTORY_ROW_SELECTOR,
    }
  );
}

/**
 * Exercises the team name live filter and constrained controls.
 * @param page - Browser page used for the directory scenario.
 * @param fixture - Live team row used to choose a satisfiable query.
 * @returns Live-filter observations.
 */
async function captureLiveTeamFilterFacts(
  page: Page,
  fixture: TeamFixture
): Promise<LiveFilterFacts> {
  const query = (fixture.name || "team").slice(0, 4).toLowerCase();
  await page.goto(`${BASE}/teams`, { waitUntil: "domcontentloaded" });
  await page.locator(DIRECTORY_FILTER_SELECTOR).waitFor();
  await page.locator('[name="q"]').fill(query);
  await page.waitForURL(url => url.searchParams.get("q") === query);
  await page.locator(DIRECTORY_ROW_SELECTOR).first().waitFor();
  return await page.evaluate(
    ({ filterSelector, rowSelector }) => ({
      noApplyButton: !Array.from(
        document.querySelectorAll(`${filterSelector} button`)
      ).some(button => button.textContent?.trim() === "Apply"),
      rowsRender: document.querySelectorAll(rowSelector).length > 0,
      selectControls:
        document.querySelector('[name="serviceModel"]')?.tagName === "SELECT",
      urlUpdated: new URL(location.href).searchParams.has("q"),
    }),
    {
      filterSelector: DIRECTORY_FILTER_SELECTOR,
      rowSelector: DIRECTORY_ROW_SELECTOR,
    }
  );
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

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import {
  BASE,
  QUICK_UI_TIMEOUT,
  SHOTS,
  check,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import {
  readWatchlistRecruiting,
  smokeWatchlistMobile,
  WATCHLIST_FIRM_ONE,
  WATCHLIST_FIRM_TWO,
  type WatchlistRecruitingState,
} from "./web_smoke_recruiting_watchlist.js";

const STANDARD_DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const RECRUITING_OVERFLOW_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900, tableBudgetPx: 16 },
  { name: "mobile", width: 390, height: 844, tableBudgetPx: 16 },
] as const;

/** Viewport and overflow budget used by recruiting table smoke checks. */
type RecruitingViewport = (typeof RECRUITING_OVERFLOW_VIEWPORTS)[number];
/** Page-level and per-table overflow metrics for one Recruiting viewport. */
interface RecruitingOverflowMetrics {
  readonly clientWidth: number;
  readonly maxTableOverflow: number;
  readonly pageOverflow: number;
  readonly tableCount: number;
  readonly tables: readonly RecruitingTableOverflow[];
}
/** Overflow metrics for one table wrapper on the Recruiting route. */
interface RecruitingTableOverflow {
  readonly clientWidth: number;
  readonly index: number;
  readonly label: string;
  readonly overflow: number;
  readonly scrollWidth: number;
}
/** Default Recruiting route content loaded before overflow-specific checks. */
interface LoadedRecruitingState {
  readonly hasHeader: boolean;
  readonly hasMomentum: boolean;
  readonly hasRecentMoves: boolean;
  readonly hasSourceStatus: boolean;
  readonly hasTaylorGroup: boolean;
  readonly rowCount: number;
}
/** Empty-filter Recruiting route observations. */
interface EmptyRecruitingState {
  readonly hasEmpty: boolean;
  readonly noOverflow: boolean;
  readonly state: string | undefined;
}
/**
 * Verifies the public Recruiting Market Map page and empty filter state.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Recruiting smoke assertions.
 */
export async function smokeRecruiting(page: Page): Promise<readonly Check[]> {
  const loaded = await readLoadedRecruiting(page);
  const overflowChecks = await smokeRecruitingOverflow(page);
  const empty = await readEmptyRecruiting(page);
  const watchlist = await readWatchlistRecruiting(page);
  const watchlistMobileChecks = await smokeWatchlistMobile(page);
  return recruitingChecks(
    loaded,
    empty,
    watchlist,
    overflowChecks,
    watchlistMobileChecks
  );
}

/**
 * Reads the default recruiting page state.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Default page assertions.
 */
async function readLoadedRecruiting(
  page: Page
): Promise<LoadedRecruitingState> {
  await smokeGoto(page, `${BASE}/recruiting`);
  await smokeWaitForSelector(page, ".recruiting-table", QUICK_UI_TIMEOUT);
  const loaded: LoadedRecruitingState = await page.evaluate(() => ({
    hasHeader: document.body.innerText.includes("Recruiting Market Map"),
    hasMomentum: document.body.innerText.includes("Firm momentum"),
    hasRecentMoves: document.body.innerText.includes("Recent moves"),
    hasSourceStatus: document.body.innerText.includes("SOURCE BACKED"),
    hasTaylorGroup: document.body.innerText.includes("The Taylor Group"),
    rowCount: document.querySelectorAll(".recruiting-table tbody tr").length,
  }));
  await shot(page, "10-recruiting-desktop");
  return loaded;
}

/**
 * Reads the empty recruiting filter state.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Empty-state assertions.
 */
async function readEmptyRecruiting(page: Page): Promise<EmptyRecruitingState> {
  await smokeGoto(page, `${BASE}/recruiting?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  return await page.evaluate(() => ({
    hasEmpty: document.body.innerText.includes(
      "No matching public recruiting move data"
    ),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
    noOverflow:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  }));
}

/**
 * Converts recruiting observations into smoke checks.
 * @param loaded - Default page observations.
 * @param empty - Empty-state observations.
 * @param watchlist - Watchlist observations.
 * @param overflowChecks - Desktop and mobile overflow checks.
 * @param watchlistMobileChecks - Mobile watchlist readability checks.
 * @returns Smoke checks.
 */
function recruitingChecks(
  loaded: LoadedRecruitingState,
  empty: EmptyRecruitingState,
  watchlist: WatchlistRecruitingState,
  overflowChecks: readonly Check[],
  watchlistMobileChecks: readonly Check[]
): readonly Check[] {
  const { restored, noMatch, updatedFirmValues, updatedUrl } = watchlist;
  return [
    check(loaded.hasHeader, "recruiting: page header renders"),
    check(loaded.hasMomentum, "recruiting: firm momentum renders"),
    check(loaded.hasRecentMoves, "recruiting: recent moves render"),
    check(
      loaded.rowCount > 0 && loaded.hasTaylorGroup,
      "recruiting: source-backed fixture is visible"
    ),
    check(loaded.hasSourceStatus, "recruiting: source status is visible"),
    ...overflowChecks,
    check(empty.hasEmpty, "recruiting: empty filter explains missing data"),
    check(empty.state === "ZZ", "recruiting: state filter is retained"),
    check(empty.noOverflow, "recruiting: filtered page has no overflow"),
    check(
      restored.hasWatchlist && restored.panelCount >= 2,
      "recruiting: watchlist cards render from URL firms"
    ),
    check(
      restored.firmValues.includes(WATCHLIST_FIRM_ONE) &&
        restored.firmValues.includes(WATCHLIST_FIRM_TWO),
      "recruiting: repeated firm params restore editable controls",
      restored.firmValues.join(", ")
    ),
    check(
      restored.hasInbound &&
        restored.hasOutbound &&
        restored.hasNet &&
        restored.hasKnownAum,
      "recruiting: watchlist exposes directional AUM metrics"
    ),
    check(
      restored.hasGenerated,
      "recruiting: watchlist summary shows generated freshness"
    ),
    check(
      restored.coverageCount >= 1,
      "recruiting: watchlist exposes per-item source coverage",
      `coverage blocks ${restored.coverageCount}`
    ),
    check(
      noMatch.hasWatchlist &&
        noMatch.hasEmptyCopy &&
        noMatch.firmValue === WATCHLIST_FIRM_ONE,
      "recruiting: no-match watchlist shows empty copy with editable firm",
      `watchlist ${noMatch.hasWatchlist}, empty ${noMatch.hasEmptyCopy}, firm ${noMatch.firmValue}`
    ),
    check(
      updatedUrl.searchParams.get("year") === "2025" &&
        updatedFirmValues.includes(WATCHLIST_FIRM_ONE) &&
        updatedFirmValues.includes(WATCHLIST_FIRM_TWO),
      "recruiting: filter submit updates URL and preserves firm set",
      updatedUrl.search
    ),
    ...watchlistMobileChecks,
  ];
}

/**
 * Checks recruiting tables at required breakpoints and restores desktop sizing.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Recruiting overflow assertions.
 */
async function smokeRecruitingOverflow(page: Page): Promise<readonly Check[]> {
  const checks = await RECRUITING_OVERFLOW_VIEWPORTS.reduce<
    Promise<readonly Check[]>
  >(
    async (previous, viewport) => [
      ...(await previous),
      await smokeRecruitingViewport(page, viewport),
    ],
    Promise.resolve([])
  );
  await page.setViewportSize(STANDARD_DESKTOP_VIEWPORT);
  return checks;
}

/**
 * Checks recruiting overflow at one viewport.
 * @param page - Browser page shared by smoke scenarios.
 * @param viewport - Viewport under test.
 * @returns Overflow assertion for the viewport.
 */
async function smokeRecruitingViewport(
  page: Page,
  viewport: RecruitingViewport
): Promise<Check> {
  await page.setViewportSize(viewport);
  await smokeGoto(page, `${BASE}/recruiting`);
  await smokeWaitForSelector(page, ".recruiting-table", QUICK_UI_TIMEOUT);
  const metrics = await readRecruitingOverflow(page);
  await writeRecruitingOverflowArtifacts(page, viewport, metrics);
  return recruitingOverflowCheck(metrics, viewport);
}

/**
 * Reads page and table-wrapper overflow on the recruiting page.
 * @param page - Browser page to inspect.
 * @returns Overflow metrics in CSS pixels.
 */
async function readRecruitingOverflow(page: Page): Promise<{
  readonly clientWidth: number;
  readonly maxTableOverflow: number;
  readonly pageOverflow: number;
  readonly tableCount: number;
  readonly tables: readonly RecruitingTableOverflow[];
}> {
  return await page.evaluate(() => {
    const tables = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".snap-table-scroll:has(.recruiting-table)"
      )
    ).map((wrapper, index) => {
      const heading =
        wrapper.closest(".card")?.querySelector(".card-title")?.textContent ??
        `table ${index + 1}`;
      return {
        clientWidth: wrapper.clientWidth,
        index,
        label: heading.trim(),
        overflow: Math.max(0, wrapper.scrollWidth - wrapper.clientWidth),
        scrollWidth: wrapper.scrollWidth,
      };
    });
    return {
      clientWidth: document.documentElement.clientWidth,
      maxTableOverflow: Math.max(0, ...tables.map(table => table.overflow)),
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      ),
      tableCount: tables.length,
      tables,
    };
  });
}

/**
 * Writes passing screenshots and failure triage artifacts for recruiting overflow.
 * @param page - Browser page rendering the recruiting route.
 * @param viewport - Viewport and budget under test.
 * @param metrics - Measured page and table overflow.
 */
async function writeRecruitingOverflowArtifacts(
  page: Page,
  viewport: RecruitingViewport,
  metrics: RecruitingOverflowMetrics
): Promise<void> {
  const artifactBase = `10-recruiting-overflow-${viewport.name}`;
  await shot(page, artifactBase);
  if (recruitingOverflowPassed(metrics, viewport)) return;

  await writeFile(
    join(SHOTS, `${artifactBase}.json`),
    `${JSON.stringify({ route: "/recruiting", viewport, metrics }, null, 2)}\n`
  );
  await page.screenshot({
    path: join(SHOTS, `${artifactBase}-failure.png`),
    fullPage: true,
  });
}

/**
 * Builds an overflow smoke assertion for a recruiting viewport.
 * @param overflow - Measured page and table overflow.
 * @param viewport - Human-readable viewport label.
 * @returns Smoke check result.
 */
function recruitingOverflowCheck(
  overflow: RecruitingOverflowMetrics,
  viewport: RecruitingViewport
): Check {
  return check(
    recruitingOverflowPassed(overflow, viewport),
    `recruiting: ${viewport.name} table overflow is within ${viewport.tableBudgetPx}px budget`,
    `page +${overflow.pageOverflow}px, max table +${overflow.maxTableOverflow}px, tables ${overflow.tableCount}, viewport ${viewport.width}x${viewport.height}`
  );
}

/**
 * Checks whether measured page and table overflow are inside budget.
 * @param overflow - Measured page and table overflow.
 * @param viewport - Viewport and budget under test.
 * @returns Whether the Recruiting route stayed within its overflow budget.
 */
function recruitingOverflowPassed(
  overflow: RecruitingOverflowMetrics,
  viewport: RecruitingViewport
): boolean {
  return (
    overflow.pageOverflow === 0 &&
    overflow.tableCount > 0 &&
    overflow.maxTableOverflow <= viewport.tableBudgetPx
  );
}

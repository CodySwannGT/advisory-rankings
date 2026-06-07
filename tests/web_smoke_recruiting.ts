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
const RAW_RECRUITING_LABELS = [
  "TRANSITIONEVENT",
  "ARTICLETRANSITIONEVENTMENTION",
  "FIRMALIAS",
];
const INBOUND_RECRUITING_FIRM = "Wells Fargo Advisors";
const OUTBOUND_RECRUITING_FIRM = "Morgan Stanley";
const REPRESENTATIVE_RECRUITING_STATE = "NY";
const REPRESENTATIVE_RECRUITING_YEAR = "2026";
const RECRUITING_TABLE_SELECTOR = ".recruiting-table";

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
  readonly rawLabels: readonly string[];
  readonly rowCount: number;
}
/** Representative non-empty Recruiting filter slice observations. */
interface RecruitingSliceState {
  readonly label: string;
  readonly rowCount: number;
  readonly summaryMoves: string;
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
  const slices = await readRecruitingSlices(page);
  const empty = await readEmptyRecruiting(page);
  const watchlist = await readWatchlistRecruiting(page);
  const watchlistMobileChecks = await smokeWatchlistMobile(page);
  return recruitingChecks(
    loaded,
    slices,
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
  await smokeWaitForSelector(page, RECRUITING_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  const loaded: LoadedRecruitingState = await page.evaluate(
    ({ rawRecruitingLabels, tableSelector }) => ({
      hasHeader: document.body.innerText.includes("Recruiting Market Map"),
      hasMomentum: document.body.innerText.includes("Firm momentum"),
      hasRecentMoves: document.body.innerText.includes("Recent moves"),
      hasSourceStatus: document.body.innerText.includes("Source confirmed"),
      hasTaylorGroup: document.body.innerText.includes("The Taylor Group"),
      rawLabels: rawRecruitingLabels.filter(label =>
        document.body.innerText.includes(label)
      ),
      rowCount: document.querySelectorAll(`${tableSelector} tbody tr`).length,
    }),
    {
      rawRecruitingLabels: RAW_RECRUITING_LABELS,
      tableSelector: RECRUITING_TABLE_SELECTOR,
    }
  );
  await shot(page, "10-recruiting-desktop");
  return loaded;
}

/**
 * Reads representative source-backed Recruiting filter slices.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Non-empty slice observations.
 */
async function readRecruitingSlices(
  page: Page
): Promise<readonly RecruitingSliceState[]> {
  const slices = [
    {
      label: "firm",
      path: `/recruiting?firm=${encodeURIComponent(INBOUND_RECRUITING_FIRM)}`,
    },
    {
      label: "state",
      path: `/recruiting?state=${REPRESENTATIVE_RECRUITING_STATE}`,
    },
    {
      label: "year",
      path: `/recruiting?year=${REPRESENTATIVE_RECRUITING_YEAR}`,
    },
    {
      label: "inbound direction",
      path: `/recruiting?firm=${encodeURIComponent(
        INBOUND_RECRUITING_FIRM
      )}&direction=inbound`,
    },
    {
      label: "outbound direction",
      path: `/recruiting?firm=${encodeURIComponent(
        OUTBOUND_RECRUITING_FIRM
      )}&direction=outbound`,
    },
  ] as const;

  return await slices.reduce<Promise<readonly RecruitingSliceState[]>>(
    async (previous, slice) => [
      ...(await previous),
      await readRecruitingSliceFromPath(page, slice),
    ],
    Promise.resolve([])
  );
}

/**
 * Loads and reads one representative Recruiting filter slice.
 * @param page - Browser page shared by smoke scenarios.
 * @param slice - Slice label and route path.
 * @param slice.label - Human-readable slice label.
 * @param slice.path - Route path for the filtered slice.
 * @returns Rendered slice observations.
 */
async function readRecruitingSliceFromPath(
  page: Page,
  slice: { readonly label: string; readonly path: string }
): Promise<RecruitingSliceState> {
  await smokeGoto(page, `${BASE}${slice.path}`);
  await smokeWaitForSelector(page, RECRUITING_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  return await readRecruitingSlice(page, slice.label);
}

/**
 * Reads one rendered Recruiting filter slice from the current page.
 * @param page - Browser page rendering the slice.
 * @param label - Human-readable slice label.
 * @returns Slice row and summary facts.
 */
async function readRecruitingSlice(
  page: Page,
  label: string
): Promise<RecruitingSliceState> {
  return await page.evaluate(
    ({ sliceLabel, tableSelector }) => {
      const summaryPairs = Array.from(
        document.querySelectorAll<HTMLElement>(".details-card .detail-row")
      );
      const movesPair = summaryPairs.find(row =>
        row.textContent?.includes("Moves")
      );
      const rowCount = document.querySelectorAll(
        `${tableSelector} tbody tr`
      ).length;
      return {
        label: sliceLabel,
        rowCount,
        summaryMoves: movesPair?.textContent?.trim() ?? "",
      };
    },
    { sliceLabel: label, tableSelector: RECRUITING_TABLE_SELECTOR }
  );
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
 * @param slices - Representative filtered slice observations.
 * @param empty - Empty-state observations.
 * @param watchlist - Watchlist observations.
 * @param overflowChecks - Desktop and mobile overflow checks.
 * @param watchlistMobileChecks - Mobile watchlist readability checks.
 * @returns Smoke checks.
 */
function recruitingChecks(
  loaded: LoadedRecruitingState,
  slices: readonly RecruitingSliceState[],
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
    check(
      loaded.rawLabels.length === 0,
      "recruiting: raw source table labels are hidden",
      loaded.rawLabels.join(", ")
    ),
    ...recruitingSliceChecks(slices),
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
 * Converts representative filtered slice observations into smoke checks.
 * @param slices - Rendered Recruiting slice facts.
 * @returns Slice smoke checks.
 */
function recruitingSliceChecks(
  slices: readonly RecruitingSliceState[]
): readonly Check[] {
  return slices.map(slice =>
    check(
      slice.rowCount > 0,
      `recruiting: ${slice.label} slice renders source-backed rows`,
      `rows ${slice.rowCount}, summary ${slice.summaryMoves}`
    )
  );
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
  await smokeWaitForSelector(page, RECRUITING_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
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

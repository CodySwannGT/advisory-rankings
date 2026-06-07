import type { Browser, Page } from "playwright";

import {
  BASE,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  newContext,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const RANKINGS_TABLE_SELECTOR = ".rankings-table";
const UNRESOLVED_ROW_NAME = "Jordan Example";
const NEXT_GEN_SOURCE_LABEL = "AdvisorHub Next Gen 2025";
const RAW_RANKINGS_LABELS = [
  "SOURCE BACKED",
  "MISSING SCALE",
  "UNRESOLVED ENTITY",
  "UNRESOLVED FIRM",
];
const MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 740 },
] as const;

/**
 * Verifies the public Interactive Rankings Explorer page.
 * @param page - Browser page shared by smoke scenarios.
 * @param browser - Browser used to open isolated mobile contexts.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Rankings smoke assertions.
 */
export async function smokeRankings(
  page: Page,
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/rankings`);
  await smokeWaitForSelector(page, RANKINGS_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  const loaded = await readLoadedRankings(page);
  await shot(page, "11-rankings-desktop");

  const drilldown = await followUnresolvedGap(page);

  await smokeGoto(page, `${BASE}/rankings?resolved=unresolved&state=TX`);
  await smokeWaitForSelector(page, RANKINGS_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  const unresolved = await readUnresolvedRankings(page);

  await smokeGoto(page, `${BASE}/rankings?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  const empty = await readEmptyRankings(page);
  await shot(page, "rankings-coverage-empty-state");

  return [
    ...rankingsChecks(loaded, drilldown, unresolved, empty),
    ...(await smokeRankingsMobile(browser, extraHTTPHeaders)),
    ...(await smokeRankingsNoRows(browser, extraHTTPHeaders)),
  ];
}

/**
 * Reads loaded rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Loaded rankings DOM facts.
 */
async function readLoadedRankings(page: Page) {
  return await page.evaluate(
    ({
      nextGenSourceLabel,
      rankingsTableSelector,
      rawRankingsLabels,
      unresolvedRowName,
    }) => ({
      hasHeader: document.body.innerText.includes(
        "Interactive Rankings Explorer"
      ),
      hasNextGen: document.body.innerText.includes("Next Gen"),
      hasCoverageWorkbench:
        document.body.innerText.includes("Coverage workbench"),
      hasCoverageBucket:
        document.querySelectorAll(".rankings-coverage-bucket[href]").length > 0,
      hasGapSample: document.body.innerText.includes(unresolvedRowName),
      hasGapSource: document.body.innerText.includes(nextGenSourceLabel),
      hasLatestLoaded: document.body.innerText.includes("Latest"),
      hasResolved: document.body.innerText.includes("Matched profile"),
      hasSourceBacked: document.body.innerText.includes("Source confirmed"),
      hasUnavailable: document.body.innerText.includes("Unavailable"),
      rawLabels: rawRankingsLabels.filter(label =>
        document.body.innerText.includes(label)
      ),
      profileHref: document.querySelector<HTMLAnchorElement>(
        ".rankings-table tbody a[href*='advisor.html'], .rankings-table tbody a[href*='team.html']"
      )?.href,
      rowCount: document.querySelectorAll(`${rankingsTableSelector} tbody tr`)
        .length,
      unresolvedGapHref: document.querySelector<HTMLAnchorElement>(
        ".rankings-gap-bucket[href*='resolved=unresolved']"
      )?.href,
    }),
    {
      nextGenSourceLabel: NEXT_GEN_SOURCE_LABEL,
      rawRankingsLabels: RAW_RANKINGS_LABELS,
      rankingsTableSelector: RANKINGS_TABLE_SELECTOR,
      unresolvedRowName: UNRESOLVED_ROW_NAME,
    }
  );
}

/**
 * Opens the unresolved source-status gap drill-down.
 * @param page - Browser page to drive.
 * @returns Drill-down DOM facts.
 */
async function followUnresolvedGap(page: Page) {
  await page
    .locator(".rankings-gap-bucket[href*='resolved=unresolved']")
    .first()
    .click();
  await smokeWaitForSelector(page, RANKINGS_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  return await page.evaluate(
    unresolvedRowName => ({
      hasUnresolvedRow: document.body.innerText.includes(unresolvedRowName),
      resolvedFilter: document.querySelector<HTMLSelectElement>(
        'select[name="resolved"]'
      )?.value,
      url: window.location.href,
    }),
    UNRESOLVED_ROW_NAME
  );
}

/**
 * Reads filtered unresolved rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Unresolved rankings DOM facts.
 */
async function readUnresolvedRankings(page: Page) {
  return await page.evaluate(
    unresolvedRowName => ({
      hasUnresolvedRow: document.body.innerText.includes(unresolvedRowName),
      hasUnresolvedStatus: document.body.innerText.includes(
        "Advisor or team not matched yet"
      ),
      hasUnresolvedWorkbench:
        document.body.innerText.includes("Coverage workbench"),
      state: document.querySelector<HTMLInputElement>('input[name="state"]')
        ?.value,
      noOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    }),
    UNRESOLVED_ROW_NAME
  );
}

/**
 * Reads empty rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Empty rankings DOM facts.
 */
async function readEmptyRankings(page: Page) {
  return await page.evaluate(() => ({
    hasEmpty: document.body.innerText.includes(
      "No matching public ranking rows"
    ),
    hasCoverageEmpty: document.body.innerText.includes(
      "No ranking rows are loaded for this coverage slice."
    ),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
  }));
}

/**
 * Converts rankings DOM facts into smoke checks.
 * @param loaded - Loaded page facts.
 * @param drilldown - Coverage drill-down page facts.
 * @param unresolved - Filtered unresolved page facts.
 * @param empty - Empty page facts.
 * @returns Smoke assertions.
 */
function rankingsChecks(loaded, drilldown, unresolved, empty) {
  return [
    check(loaded.hasHeader, "rankings: page header renders"),
    check(loaded.hasNextGen, "rankings: category data renders"),
    check(loaded.hasCoverageWorkbench, "rankings: coverage workbench renders"),
    check(loaded.hasCoverageBucket, "rankings: coverage buckets render"),
    check(
      loaded.hasGapSample && loaded.hasGapSource,
      "rankings: gap samples include row and source labels"
    ),
    check(
      Boolean(loaded.unresolvedGapHref),
      "rankings: unresolved gap exposes drill-down link"
    ),
    check(
      drilldown.resolvedFilter === "unresolved" &&
        drilldown.hasUnresolvedRow &&
        drilldown.url.includes("resolved=unresolved"),
      "rankings: coverage gap drills into unresolved rows"
    ),
    check(loaded.hasLatestLoaded, "rankings: latest loaded context renders"),
    check(loaded.rowCount > 0, "rankings: source-backed rows render"),
    check(loaded.hasResolved, "rankings: resolved status is visible"),
    check(loaded.hasSourceBacked, "rankings: source status is visible"),
    check(loaded.hasUnavailable, "rankings: missing score is explicit"),
    check(
      loaded.rawLabels.length === 0,
      "rankings: raw enum-style labels are hidden",
      loaded.rawLabels.join(", ")
    ),
    check(
      Boolean(loaded.profileHref),
      "rankings: resolved row links to profile"
    ),
    check(
      unresolved.hasUnresolvedRow && unresolved.hasUnresolvedStatus,
      "rankings: unresolved row remains visible"
    ),
    check(unresolved.state === "TX", "rankings: state filter is retained"),
    check(
      unresolved.hasUnresolvedWorkbench,
      "rankings: filtered coverage workbench remains visible"
    ),
    check(
      unresolved.noOverflow,
      "rankings: filtered page has no desktop overflow"
    ),
    check(empty.hasEmpty, "rankings: empty filter explains missing data"),
    check(empty.hasCoverageEmpty, "rankings: empty coverage state renders"),
    check(empty.state === "ZZ", "rankings: empty state retains filter"),
  ];
}

/**
 * Verifies rankings coverage at narrow mobile widths.
 * @param browser - Browser used to create isolated mobile contexts.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Mobile rankings smoke assertions.
 */
async function smokeRankingsMobile(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const viewportChecks = await Promise.all(
    MOBILE_VIEWPORTS.map(viewport =>
      smokeRankingsMobileViewport(browser, extraHTTPHeaders, viewport)
    )
  );
  return viewportChecks.flat();
}

/**
 * Verifies rankings coverage at one mobile width.
 * @param browser - Browser used to create an isolated mobile context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @param viewport - Viewport dimensions to inspect.
 * @returns Mobile rankings smoke assertions.
 */
async function smokeRankingsMobileViewport(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined,
  viewport: (typeof MOBILE_VIEWPORTS)[number]
): Promise<readonly Check[]> {
  const context = await newContext(browser, viewport, extraHTTPHeaders);
  const page = await context.newPage();
  await smokeGoto(page, `${BASE}/rankings`);
  await smokeWaitForSelector(
    page,
    ".rankings-coverage-workbench",
    QUICK_UI_TIMEOUT
  );
  await shot(page, `rankings-coverage-mobile-${viewport.width}`);
  const evidence = await readMobileRankings(page);

  return await closeWithChecks(context, [
    check(
      evidence.hasCounts && evidence.hasLabels && evidence.hasDrilldown,
      `rankings: mobile coverage content readable at ${viewport.width}px`,
      evidence.text.slice(0, 180)
    ),
    check(
      evidence.noOverflow,
      `rankings: mobile page has no horizontal overflow at ${viewport.width}px`,
      `scrollWidth ${evidence.scrollWidth}, clientWidth ${evidence.clientWidth}`
    ),
    check(
      evidence.hasReadableRowStatus,
      `rankings: mobile row statuses are readable at ${viewport.width}px`,
      evidence.tableText.slice(0, 180)
    ),
    check(
      evidence.statusTagsFit,
      `rankings: mobile row status chips fit card bounds at ${viewport.width}px`,
      evidence.clippedStatusLabels.join(", ")
    ),
  ]);
}

/**
 * Reads mobile rankings coverage facts.
 * @param page - Browser page to inspect.
 * @returns Mobile coverage facts.
 */
async function readMobileRankings(page: Page) {
  return await page.evaluate(() => {
    const workbench = document.querySelector(".rankings-coverage-workbench");
    const text = workbench?.textContent || "";
    const table = document.querySelector(".rankings-table");
    const tableText = table?.textContent || "";
    const statusTags = [
      ...document.querySelectorAll<HTMLElement>(".rankings-table .tag"),
    ];
    const clippedStatusLabels = statusTags
      .filter(tag => {
        const rect = tag.getBoundingClientRect();
        return (
          tag.scrollWidth > tag.clientWidth + 1 ||
          rect.left < 0 ||
          rect.right > document.documentElement.clientWidth + 1
        );
      })
      .map(tag => tag.textContent?.trim() || "empty status");
    return {
      clientWidth: document.documentElement.clientWidth,
      hasCounts: /Rows in slice|Buckets|Gap types/i.test(text),
      hasDrilldown:
        document.querySelectorAll(
          ".rankings-coverage-bucket[href], .rankings-gap-bucket[href]"
        ).length > 0,
      hasLabels: /Category coverage|Source-status gaps|Latest loaded/i.test(
        text
      ),
      hasReadableRowStatus:
        tableText.includes("Advisor or team not matched yet") &&
        tableText.includes("Source confirmed"),
      noOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      statusTagsFit: clippedStatusLabels.length === 0,
      clippedStatusLabels,
      scrollWidth: document.documentElement.scrollWidth,
      tableText,
      text,
    };
  });
}

/**
 * Verifies the page renders an explicit no-ranking-rows state.
 * @param browser - Browser used to create an isolated mocked context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns No-row smoke assertions.
 */
async function smokeRankingsNoRows(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  await page.route("**/RankingsExplorer**", async route => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(noRankingRowsPayload()),
    });
  });
  await smokeGoto(page, `${BASE}/rankings`);
  await smokeWaitForSelector(page, ".rankings-coverage-workbench .empty");
  await shot(page, "rankings-coverage-no-rows");
  const evidence = await readEmptyRankings(page);

  return await closeWithChecks(context, [
    check(evidence.hasEmpty, "rankings: no-row state explains missing rows"),
    check(
      evidence.hasCoverageEmpty,
      "rankings: no-row coverage workbench renders explicit empty state"
    ),
  ]);
}

/**
 * Builds the minimal RankingsExplorer payload needed to prove no loaded rows.
 * @returns Empty rankings explorer payload.
 */
function noRankingRowsPayload() {
  return {
    items: [],
    summary: {
      totalEntries: 0,
      resolvedEntries: 0,
      unresolvedEntries: 0,
      representedStates: 0,
    },
    filters: {
      category: "",
      year: "",
      firmQuery: "",
      state: "",
      city: "",
      resolved: "",
      sort: "rank",
    },
    facets: {
      categories: [],
      years: [],
    },
    coverage: {
      totalEntries: 0,
      buckets: [],
      gapBuckets: [],
      emptyState: "No ranking rows are loaded for this coverage slice.",
    },
    topFirms: [],
    source: {
      label: "AdvisorHub rankings",
      url: "https://www.advisorhub.com/advisors-to-watch-rankings/",
    },
    provenance: {
      sourceTables: ["Ranking", "RankingEntry", "FirmAlias"],
      sourceIds: [],
    },
    emptyState: "No matching public ranking rows are available.",
  };
}

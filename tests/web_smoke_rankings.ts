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
const LIST_ATTRIBUTE = "list";
const CITY_OPTIONS_SELECTOR = "#rankings-city-options";
const FIRM_OPTIONS_SELECTOR = "#rankings-firm-options";
const STATE_OPTIONS_SELECTOR = "#rankings-state-options";
const filterInputSelector = (name: string) => `input[name="${name}"]`;
const CITY_FILTER_SELECTOR = filterInputSelector("city");
const FIRM_FILTER_SELECTOR = filterInputSelector("firm");
const STATE_FILTER_SELECTOR = filterInputSelector("state");
const RAW_RANKINGS_LABELS = [
  "SOURCE BACKED",
  "MISSING_SCALE",
  "UNRESOLVED ENTITY",
  "UNRESOLVED FIRM",
  "Rows",
  "Rows in slice",
  "Buckets",
  "Gap types",
  "Source confirmed",
  "Loaded rows",
];
const MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 740 },
] as const;

/**
 * Verifies the public Advisor Rankings Browser page.
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
  await waitForRankingsText(page, "1 rankings match these filters");
  const unresolved = await readUnresolvedRankings(page);

  await smokeGoto(page, `${BASE}/rankings?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  await waitForRankingsText(page, "0 rankings match these filters");
  const empty = await readEmptyRankings(page);
  await shot(page, "rankings-coverage-empty-state");

  return [
    ...rankingsChecks(loaded, drilldown, unresolved, empty),
    ...(await smokeRankingsMobile(browser, extraHTTPHeaders)),
    ...(await smokeRankingsNoRows(browser, extraHTTPHeaders)),
  ];
}

/**
 * Waits for route-specific rankings copy after the async resource render.
 * @param page - Browser page to inspect.
 * @param expected - Visible text proving the target route rendered.
 */
async function waitForRankingsText(
  page: Page,
  expected: string
): Promise<void> {
  await page.waitForFunction(
    text => document.body.innerText.includes(text),
    expected,
    { timeout: QUICK_UI_TIMEOUT }
  );
}

/**
 * Reads loaded rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Loaded rankings DOM facts.
 */
async function readLoadedRankings(page: Page) {
  const evidence = await page.evaluate(
    args => {
      const pageText = document.body.innerText;
      const hasText = (label: string) =>
        pageText.toLowerCase().includes(label.toLowerCase());
      return {
        browseCardTitles: [
          ...document.querySelectorAll<HTMLElement>(
            ".left .card-title, .left .subtitle"
          ),
        ].map(title => title.textContent?.trim() ?? ""),
        degradedBrowseIcons: [
          ...document.querySelectorAll<HTMLElement>(".left .avatar"),
        ]
          .map(avatar => avatar.textContent?.trim() ?? "")
          .filter(icon => ["?", "#", "!"].includes(icon)),
        hasHeader: document.body.innerText.includes("Advisor Rankings Browser"),
        hasPurposeLede: document.body.innerText.includes(
          "Browse public advisor and team ranking appearances"
        ),
        hasNextGen: document.body.innerText.includes("Next Gen"),
        hasDataQualityPanel: document.body.innerText.includes(
          "Ranking data quality"
        ),
        hasSummaryMetricLabels:
          document.body.innerText.includes("Ranked profiles") &&
          document.body.innerText.includes("Matched profiles") &&
          document.body.innerText.includes("Needs match") &&
          document.body.innerText.includes("Markets"),
        hasCoverageBucket:
          document.querySelectorAll(".rankings-coverage-bucket[href]").length >
          0,
        hasCoverageMetricHints:
          document.body.innerText.includes("source-backed rows") &&
          document.body.innerText.includes("category/year groups") &&
          document.body.innerText.includes("profile or score gaps"),
        hasGapSample: document.body.innerText.includes(args.unresolvedRowName),
        hasGapSource: document.body.innerText.includes(args.nextGenSourceLabel),
        hasResolved: hasText("Matched to AdvisorBook profile"),
        hasSourceBacked: hasText("Verified source"),
        hasTopFirmCountLabels:
          document.body.innerText.includes("Wells Fargo Advisors") &&
          document.body.innerText.includes("Example Independent") &&
          document.body.innerText.includes("2 rankings") &&
          document.body.innerText.includes("1 ranking") &&
          document.body.innerText.includes("Matched AdvisorBook firm") &&
          document.body.innerText.includes("Source firm name awaiting match"),
        hasUnavailable: hasText("Missing score"),
        rawLabels: args.rawRankingsLabels.filter(label =>
          document.body.innerText.includes(label)
        ),
        unresolvedGapHref: document.querySelector<HTMLAnchorElement>(
          ".rankings-gap-bucket[href*='resolved=unresolved']"
        )?.href,
      };
    },
    {
      nextGenSourceLabel: NEXT_GEN_SOURCE_LABEL,
      rawRankingsLabels: RAW_RANKINGS_LABELS,
      rankingsTableSelector: RANKINGS_TABLE_SELECTOR,
      unresolvedRowName: UNRESOLVED_ROW_NAME,
    }
  );
  return {
    ...evidence,
    ...(await readRankingsDateEvidence(page)),
    ...(await readRankingsControlEvidence(page)),
    ...(await readRankingsFacetEvidence(page)),
    ...(await readRankingsTableEvidence(page)),
  };
}

/**
 * Reads rankings date-label evidence from visible page text.
 * @param page - Browser page to inspect.
 * @returns Date display facts.
 */
async function readRankingsDateEvidence(page: Page) {
  const pageText = (await page.locator("body").innerText()) || "";
  return {
    hasDataVolumeState: [
      "Data volume",
      "rankings loaded",
      "intentionally small",
    ].every(label => pageText.includes(label)),
    hasHumanImportedDate: /Imported [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(
      pageText
    ),
    hasLatestImportHumanDate:
      /Latest import\s+[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(pageText),
    rawDateLabels:
      pageText.match(/\b(?:\d{4}-\d{2}-\d{2}T|\d{4}-\d{2}-\d{2}\b)/g) ?? [],
  };
}

/**
 * Reads DOM grouping facts for filters and presentation controls.
 * @param page - Browser page to inspect.
 * @returns Sort/filter grouping evidence.
 */
async function readRankingsControlEvidence(page: Page) {
  return await page.evaluate(rankingsTableSelector => {
    const cards = [...document.querySelectorAll<HTMLElement>(".card")];
    const cardByTitle = (title: string) =>
      cards.find(
        card =>
          card
            .querySelector<HTMLElement>(".card-title")
            ?.textContent?.trim() === title
      );
    const filtersCard = cardByTitle("Filters");
    const viewOptionsCard = cardByTitle("View options");
    const table = document.querySelector<HTMLElement>(rankingsTableSelector);
    const filterControlNames = [
      ...(filtersCard?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input:not([type='hidden']), select"
      ) ?? []),
    ].map(control => control.name);
    return {
      filterControlNames,
      hasSeparateSortControl:
        Boolean(viewOptionsCard?.querySelector('select[name="sort"]')) &&
        !filterControlNames.includes("sort"),
      hasSortNearResults:
        Boolean(viewOptionsCard && table) &&
        viewOptionsCard.getBoundingClientRect().top <
          table.getBoundingClientRect().top,
    };
  }, RANKINGS_TABLE_SELECTOR);
}

/**
 * Reads discoverability facts for finite rankings filter facets.
 * @param page - Browser page to inspect.
 * @returns Facet input and suggestion evidence.
 */
async function readRankingsFacetEvidence(page: Page) {
  return await page.evaluate(
    args => {
      const optionsFor = (selector: string) =>
        [
          ...document.querySelectorAll<HTMLOptionElement>(`${selector} option`),
        ].map(option => option.value);
      const firmInput = document.querySelector<HTMLInputElement>(
        args.firmFilterSelector
      );
      const stateInput = document.querySelector<HTMLInputElement>(
        args.stateFilterSelector
      );
      const cityInput = document.querySelector<HTMLInputElement>(
        args.cityFilterSelector
      );
      return {
        cityFacetOptions: optionsFor(args.cityOptionsSelector),
        firmFacetOptions: optionsFor(args.firmOptionsSelector),
        hasFacetLists:
          firmInput?.getAttribute(args.listAttribute) ===
            args.firmOptionsSelector.slice(1) &&
          stateInput?.getAttribute(args.listAttribute) ===
            args.stateOptionsSelector.slice(1) &&
          cityInput?.getAttribute(args.listAttribute) ===
            args.cityOptionsSelector.slice(1),
        stateFacetOptions: optionsFor(args.stateOptionsSelector),
      };
    },
    {
      cityFilterSelector: CITY_FILTER_SELECTOR,
      cityOptionsSelector: CITY_OPTIONS_SELECTOR,
      firmFilterSelector: FIRM_FILTER_SELECTOR,
      firmOptionsSelector: FIRM_OPTIONS_SELECTOR,
      listAttribute: LIST_ATTRIBUTE,
      stateFilterSelector: STATE_FILTER_SELECTOR,
      stateOptionsSelector: STATE_OPTIONS_SELECTOR,
    }
  );
}

/**
 * Reads ranking table link, count, and layout facts.
 * @param page - Browser page to inspect.
 * @returns Table evidence.
 */
async function readRankingsTableEvidence(page: Page) {
  return await page.evaluate(rankingsTableSelector => {
    const table = document.querySelector<HTMLElement>(rankingsTableSelector);
    const scroll = table?.closest<HTMLElement>(".snap-table-scroll");
    const center = table?.closest<HTMLElement>(".center");
    const right = document.querySelector<HTMLElement>(".right");
    const scrollRect = scroll?.getBoundingClientRect();
    const centerRect = center?.getBoundingClientRect();
    const rightRect = right?.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const maxRight = Math.min(rightRect?.left ?? viewportWidth, viewportWidth);
    return {
      profileHref: document.querySelector<HTMLAnchorElement>(
        `${rankingsTableSelector} tbody a[href*='advisor.html'], ${rankingsTableSelector} tbody a[href*='team.html']`
      )?.href,
      rowCount: document.querySelectorAll(`${rankingsTableSelector} tbody tr`)
        .length,
      tableLayout: {
        centerRight: Math.round(centerRect?.right ?? 0),
        isContained:
          Boolean(scrollRect && centerRect) &&
          scrollRect.left >= centerRect.left - 1 &&
          scrollRect.right <= centerRect.right + 1 &&
          scrollRect.right <= maxRight + 1 &&
          document.documentElement.scrollWidth <= viewportWidth,
        rightRailLeft: Math.round(rightRect?.left ?? viewportWidth),
        scrollRight: Math.round(scrollRect?.right ?? 0),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth,
      },
    };
  }, RANKINGS_TABLE_SELECTOR);
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
      hasUnresolvedStatus: document.body.innerText
        .toLowerCase()
        .includes("advisor or team not matched yet"),
      hasFilteredCountState:
        document.body.innerText.includes("rankings match these filters") &&
        document.body.innerText.includes("Filtered by") &&
        Boolean(
          document.querySelector(".rankings-reset-link[href='/rankings']")
        ),
      hasUnresolvedDataQuality: document.body.innerText.includes(
        "Ranking data quality"
      ),
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
    hasEmpty: document.body.innerText.includes("No matching public rankings"),
    hasCoverageEmpty: document.body.innerText.includes(
      "No rankings are loaded for this coverage view."
    ),
    hasFilteredCountState:
      document.body.innerText.includes("0 rankings match these filters") &&
      document.body.innerText.includes("Broaden or reset the view") &&
      Boolean(document.querySelector(".rankings-reset-link[href='/rankings']")),
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
    ...loadedRankingsChecks(loaded),
    ...drilldownRankingsChecks(drilldown),
    ...unresolvedRankingsChecks(unresolved),
    ...emptyRankingsChecks(empty),
  ];
}

/**
 * Converts loaded rankings DOM facts into checks.
 * @param loaded - Loaded page facts.
 * @returns Loaded-page checks.
 */
function loadedRankingsChecks(loaded) {
  return [
    check(
      loaded.hasHeader && loaded.hasPurposeLede,
      "rankings: page purpose and primary workflow render"
    ),
    ...rankingsNavigationChecks(loaded),
    check(loaded.hasNextGen, "rankings: category data renders"),
    check(
      loaded.hasSeparateSortControl && loaded.hasSortNearResults,
      "rankings: sort control is separate from filters",
      JSON.stringify({
        filterControlNames: loaded.filterControlNames,
        hasSeparateSortControl: loaded.hasSeparateSortControl,
        hasSortNearResults: loaded.hasSortNearResults,
      })
    ),
    check(loaded.hasDataQualityPanel, "rankings: data quality panel renders"),
    ...lowInformationPanelChecks(loaded),
    check(
      loaded.hasDataVolumeState,
      "rankings: sparse data volume state explains loaded dataset"
    ),
    finiteFacetCheck(loaded),
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
      loaded.hasHumanImportedDate && loaded.hasLatestImportHumanDate,
      "rankings: import dates are human readable",
      JSON.stringify({
        hasHumanImportedDate: loaded.hasHumanImportedDate,
        hasLatestImportHumanDate: loaded.hasLatestImportHumanDate,
      })
    ),
    check(
      loaded.rawDateLabels.length === 0,
      "rankings: raw date strings are hidden",
      loaded.rawDateLabels.join(", ")
    ),
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
      loaded.tableLayout.isContained,
      "rankings: desktop table stays inside the content column",
      JSON.stringify(loaded.tableLayout)
    ),
  ];
}

/**
 * Converts rankings navigation facts into checks.
 * @param loaded - Loaded page facts.
 * @returns Navigation regression checks.
 */
function rankingsNavigationChecks(loaded) {
  return [
    check(
      !loaded.browseCardTitles.includes("Browse"),
      "rankings: duplicate Browse rail is hidden on desktop",
      loaded.browseCardTitles.join(", ")
    ),
    check(
      loaded.degradedBrowseIcons.length === 0,
      "rankings: no degraded Browse icon placeholders render",
      loaded.degradedBrowseIcons.join(", ")
    ),
  ];
}

/**
 * Converts sparse-module legibility facts into checks.
 * @param loaded - Loaded page facts.
 * @returns Low-information panel regression checks.
 */
function lowInformationPanelChecks(loaded) {
  return [
    check(
      loaded.hasSummaryMetricLabels,
      "rankings: summary metrics expose labeled values"
    ),
    check(
      loaded.hasCoverageMetricHints,
      "rankings: coverage metrics explain what counts mean"
    ),
    check(
      loaded.hasTopFirmCountLabels,
      "rankings: top firms name firms and explain ranking counts"
    ),
  ];
}

/**
 * Converts rankings facet DOM facts into a smoke check.
 * @param loaded - Loaded page facts.
 * @returns Facet discoverability check.
 */
function finiteFacetCheck(loaded) {
  return check(
    loaded.hasFacetLists &&
      loaded.firmFacetOptions.length > 0 &&
      loaded.stateFacetOptions.length > 0 &&
      loaded.cityFacetOptions.length > 0,
    "rankings: finite text filters expose native suggestions",
    JSON.stringify({
      cityFacetOptions: loaded.cityFacetOptions,
      firmFacetOptions: loaded.firmFacetOptions,
      hasFacetLists: loaded.hasFacetLists,
      stateFacetOptions: loaded.stateFacetOptions,
    })
  );
}

/**
 * Converts coverage drill-down DOM facts into checks.
 * @param drilldown - Drill-down page facts.
 * @returns Drill-down checks.
 */
function drilldownRankingsChecks(drilldown) {
  return [
    check(
      drilldown.resolvedFilter === "unresolved" &&
        drilldown.hasUnresolvedRow &&
        drilldown.url.includes("resolved=unresolved"),
      "rankings: coverage gap drills into unresolved rows"
    ),
  ];
}

/**
 * Converts unresolved filter DOM facts into checks.
 * @param unresolved - Filtered unresolved page facts.
 * @returns Unresolved-page checks.
 */
function unresolvedRankingsChecks(unresolved) {
  return [
    check(
      unresolved.hasUnresolvedRow && unresolved.hasUnresolvedStatus,
      "rankings: unresolved row remains visible"
    ),
    check(unresolved.state === "TX", "rankings: state filter is retained"),
    check(
      unresolved.hasUnresolvedDataQuality,
      "rankings: filtered data quality panel remains visible"
    ),
    check(
      unresolved.hasFilteredCountState,
      "rankings: filtered state shows result count and reset action"
    ),
    check(
      unresolved.noOverflow,
      "rankings: filtered page has no desktop overflow"
    ),
  ];
}

/**
 * Converts empty filter DOM facts into checks.
 * @param empty - Empty page facts.
 * @returns Empty-page checks.
 */
function emptyRankingsChecks(empty) {
  return [
    check(empty.hasEmpty, "rankings: empty filter explains missing data"),
    check(empty.hasCoverageEmpty, "rankings: empty coverage state renders"),
    check(
      empty.hasFilteredCountState,
      "rankings: empty filter shows zero-count reset action"
    ),
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
  return await page.evaluate(rankingsTableSelector => {
    const workbench = document.querySelector(".rankings-coverage-workbench");
    const text = workbench?.textContent || "";
    const table = document.querySelector(rankingsTableSelector);
    const tableText = table?.textContent || "";
    const statusTags = [
      ...document.querySelectorAll<HTMLElement>(
        `${rankingsTableSelector} .tag`
      ),
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
      hasCounts: /Rankings in view|Ranking lists|Open match issues/i.test(text),
      hasDrilldown:
        document.querySelectorAll(
          ".rankings-coverage-bucket[href], .rankings-gap-bucket[href]"
        ).length > 0,
      hasLabels:
        /Ranking-list coverage|Profile and source issues|Latest import/i.test(
          text
        ),
      hasReadableRowStatus:
        tableText.toLowerCase().includes("advisor or team not matched yet") &&
        tableText.toLowerCase().includes("verified source"),
      noOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      statusTagsFit: clippedStatusLabels.length === 0,
      clippedStatusLabels,
      scrollWidth: document.documentElement.scrollWidth,
      tableText,
      text,
    };
  }, RANKINGS_TABLE_SELECTOR);
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
      "rankings: no-row data quality panel renders explicit empty state"
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
      cities: [],
      firms: [],
      years: [],
      states: [],
    },
    coverage: {
      totalEntries: 0,
      buckets: [],
      gapBuckets: [],
      emptyState: "No rankings are loaded for this coverage view.",
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
    emptyState: "No matching public rankings are available.",
  };
}

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
const LIST_ATTRIBUTE = "list";
const CITY_OPTIONS_SELECTOR = "#rankings-city-options";
const FIRM_OPTIONS_SELECTOR = "#rankings-firm-options";
const STATE_OPTIONS_SELECTOR = "#rankings-state-options";
const filterInputSelector = (name: string) => `input[name="${name}"]`;
const CITY_FILTER_SELECTOR = filterInputSelector("city");
const FIRM_FILTER_SELECTOR = filterInputSelector("firm");
const STATE_FILTER_SELECTOR = filterInputSelector("state");
const ZERO_RANKINGS_FILTER_TEXT = "0 rankings match these filters";
const RAW_RANKINGS_LABELS = [
  "SOURCE BACKED",
  "MISSING_SCALE",
  "UNRESOLVED ENTITY",
  "UNRESOLVED FIRM",
  "Needs match",
  "Rows",
  "Rows in slice",
  "Buckets",
  "Gap types",
  "Source confirmed",
  "Loaded rows",
  "source-backed rows",
  "source rows",
  "dev dataset",
  "ingestion",
  "matching pipelines",
];
const PLACEHOLDER_NAMES = ["Jordan Example", "Example Independent"];
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
  const sortChange = await changeSortAndReadEvidence(page);

  await smokeGoto(page, `${BASE}/rankings?resolved=unresolved&state=TX`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  await waitForRankingsText(page, ZERO_RANKINGS_FILTER_TEXT);
  const unresolved = await readUnresolvedRankings(page);

  await smokeGoto(page, `${BASE}/rankings?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  await waitForRankingsText(page, ZERO_RANKINGS_FILTER_TEXT);
  const empty = await readEmptyRankings(page);
  await shot(page, "rankings-empty-state");

  return [
    ...rankingsChecks(loaded, sortChange, unresolved, empty),
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
        browseLinks: [
          ...document.querySelectorAll<HTMLAnchorElement>(".left a"),
        ].map(link => link.textContent?.trim() ?? ""),
        hasHeader: document.body.innerText.includes("Advisor Rankings Browser"),
        hasPurposeLede: document.body.innerText.includes(
          "Browse public advisor and team ranking appearances"
        ),
        hasNextGen: document.body.innerText.includes("Next Gen"),
        hasPublicRankingsOnly: !document.body.innerText.includes(
          "Ranking data quality"
        ),
        hasSummaryMetricLabels:
          document.body.innerText.includes("Ranked profiles") &&
          document.body.innerText.includes("Linked profiles") &&
          document.body.innerText.includes("Profiles to link") &&
          document.body.innerText.includes("Markets"),
        hasResolved: hasText("Linked AdvisorBook profile"),
        hasSourceBacked: hasText("Verified source"),
        hasTopFirmCountLabels:
          document.body.innerText.includes("Wells Fargo Advisors") &&
          /\b\d+ rankings?\b/.test(document.body.innerText) &&
          document.body.innerText.includes("Matched AdvisorBook firm"),
        hasScoreSignal:
          hasText("Missing score") || /\b\d{2,3}\.\d\b/.test(pageText),
        placeholderNames: args.placeholderNames.filter(name =>
          document.body.innerText.includes(name)
        ),
        rawLabels: args.rawRankingsLabels.filter(label =>
          document.body.innerText.includes(label)
        ),
      };
    },
    {
      placeholderNames: PLACEHOLDER_NAMES,
      rawRankingsLabels: RAW_RANKINGS_LABELS,
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
      "Use filters to focus the public rankings list",
    ].every(label => pageText.includes(label)),
    hasHumanImportedDate: /Updated [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(pageText),
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
      hasSortApplyButton: Boolean(
        viewOptionsCard?.querySelector('button[type="submit"]')
      ),
      hasSortNearResults:
        Boolean(viewOptionsCard && table) &&
        viewOptionsCard.getBoundingClientRect().top <
          table.getBoundingClientRect().top,
    };
  }, RANKINGS_TABLE_SELECTOR);
}

/**
 * Changes the presentation sort and captures URL/row-order evidence.
 * @param page - Browser page to drive.
 * @returns Sort-change behavior facts.
 */
async function changeSortAndReadEvidence(page: Page) {
  const before = await firstRankingRowText(page);
  await page.locator('select[name="sort"]').selectOption("-rank");
  await page.waitForURL(url => url.searchParams.get("sort") === "-rank", {
    timeout: QUICK_UI_TIMEOUT,
  });
  await smokeWaitForSelector(page, RANKINGS_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  const after = await firstRankingRowText(page);
  return {
    firstRowChanged: before !== after,
    sort: new URL(page.url()).searchParams.get("sort"),
  };
}

/**
 * Reads the first rendered ranking row as a stable order fingerprint.
 * @param page - Browser page to inspect.
 * @returns First row text or an empty string.
 */
async function firstRankingRowText(page: Page): Promise<string> {
  return await page.evaluate(
    rankingsTableSelector =>
      document
        .querySelector<HTMLElement>(`${rankingsTableSelector} tbody tr`)
        ?.textContent?.trim() ?? "",
    RANKINGS_TABLE_SELECTOR
  );
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
 * Reads filtered unresolved rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Unresolved rankings DOM facts.
 */
async function readUnresolvedRankings(page: Page) {
  return await page.evaluate(
    args => ({
      placeholderNames: args.placeholderNames.filter(name =>
        document.body.innerText.includes(name)
      ),
      hasFilteredEmpty: document.body.innerText.includes(
        "No matching public rankings"
      ),
      hasFilteredCountState:
        document.body.innerText.includes(args.zeroRankingsFilterText) &&
        document.body.innerText.includes("Filtered by") &&
        Boolean(
          document.querySelector(".rankings-reset-link[href='/rankings']")
        ),
      state: document.querySelector<HTMLInputElement>('input[name="state"]')
        ?.value,
      noOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    }),
    {
      placeholderNames: PLACEHOLDER_NAMES,
      zeroRankingsFilterText: ZERO_RANKINGS_FILTER_TEXT,
    }
  );
}

/**
 * Reads empty rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Empty rankings DOM facts.
 */
async function readEmptyRankings(page: Page) {
  return await page.evaluate(
    zeroRankingsFilterText => ({
      hasEmpty: document.body.innerText.includes("No matching public rankings"),
      hasFilteredCountState:
        document.body.innerText.includes(zeroRankingsFilterText) &&
        document.body.innerText.includes("Broaden or reset the view") &&
        Boolean(
          document.querySelector(".rankings-reset-link[href='/rankings']")
        ),
      state: document.querySelector<HTMLInputElement>('input[name="state"]')
        ?.value,
    }),
    ZERO_RANKINGS_FILTER_TEXT
  );
}

/**
 * Converts rankings DOM facts into smoke checks.
 * @param loaded - Loaded page facts.
 * @param sortChange - Sort-change behavior facts.
 * @param unresolved - Filtered unresolved page facts.
 * @param empty - Empty page facts.
 * @returns Smoke assertions.
 */
function rankingsChecks(loaded, sortChange, unresolved, empty) {
  return [
    ...loadedRankingsChecks(loaded, sortChange),
    ...unresolvedRankingsChecks(unresolved),
    ...emptyRankingsChecks(empty),
  ];
}

/**
 * Converts loaded rankings DOM facts into checks.
 * @param loaded - Loaded page facts.
 * @param sortChange - Sort-change behavior facts.
 * @returns Loaded-page checks.
 */
function loadedRankingsChecks(loaded, sortChange) {
  return [
    check(
      loaded.hasHeader && loaded.hasPurposeLede,
      "rankings: page purpose and primary workflow render"
    ),
    ...rankingsNavigationChecks(loaded),
    check(loaded.hasNextGen, "rankings: category data renders"),
    ...rankingsSortChecks(loaded, sortChange),
    check(
      loaded.hasPublicRankingsOnly,
      "rankings: public page hides analyst data-quality workbench"
    ),
    ...lowInformationPanelChecks(loaded),
    check(
      loaded.hasDataVolumeState,
      "rankings: public data volume state explains visible rankings"
    ),
    finiteFacetCheck(loaded),
    check(
      loaded.hasHumanImportedDate,
      "rankings: source dates are human readable",
      JSON.stringify({
        hasHumanImportedDate: loaded.hasHumanImportedDate,
      })
    ),
    check(
      loaded.rawDateLabels.length === 0,
      "rankings: raw date strings are hidden",
      loaded.rawDateLabels.join(", ")
    ),
    check(loaded.rowCount > 0, "rankings: public ranking rows render"),
    check(loaded.hasResolved, "rankings: resolved status is visible"),
    check(loaded.hasSourceBacked, "rankings: source status is visible"),
    scoreSignalCheck(loaded),
    check(
      loaded.rawLabels.length === 0,
      "rankings: pipeline and raw enum labels are hidden",
      loaded.rawLabels.join(", ")
    ),
    check(
      loaded.placeholderNames.length === 0,
      "rankings: placeholder entities are hidden",
      loaded.placeholderNames.join(", ")
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
 * Converts loaded score evidence into a smoke check.
 * @param loaded - Loaded rankings facts.
 * @returns Score legibility check.
 */
function scoreSignalCheck(loaded) {
  return check(
    loaded.hasScoreSignal,
    "rankings: score values or missing-score states are explicit"
  );
}

/**
 * Converts rankings sort-control facts into checks.
 * @param loaded - Loaded page facts.
 * @param sortChange - Sort-change behavior facts.
 * @returns Sort behavior checks.
 */
function rankingsSortChecks(loaded, sortChange) {
  return [
    check(
      loaded.hasSeparateSortControl &&
        loaded.hasSortNearResults &&
        !loaded.hasSortApplyButton,
      "rankings: sort control is separate from filters and has no Apply button",
      JSON.stringify({
        filterControlNames: loaded.filterControlNames,
        hasSortApplyButton: loaded.hasSortApplyButton,
        hasSeparateSortControl: loaded.hasSeparateSortControl,
        hasSortNearResults: loaded.hasSortNearResults,
      })
    ),
    check(
      sortChange.sort === "-rank" && sortChange.firstRowChanged,
      "rankings: sort applies immediately on change",
      JSON.stringify(sortChange)
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
      ["Firms", "Recruiting", "Rankings", "Advisors", "Teams"].every(label =>
        loaded.browseLinks.some(link => link.includes(label))
      ),
      "rankings: shared Browse rail exposes standard links",
      loaded.browseLinks.join(", ")
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
 * Converts unresolved filter DOM facts into checks.
 * @param unresolved - Filtered unresolved page facts.
 * @returns Unresolved-page checks.
 */
function unresolvedRankingsChecks(unresolved) {
  return [
    check(
      unresolved.hasFilteredEmpty && unresolved.placeholderNames.length === 0,
      "rankings: unresolved placeholder row stays hidden",
      unresolved.placeholderNames.join(", ")
    ),
    check(unresolved.state === "TX", "rankings: state filter is retained"),
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
    check(
      empty.hasFilteredCountState,
      "rankings: empty filter shows zero-count reset action"
    ),
    check(empty.state === "ZZ", "rankings: empty state retains filter"),
  ];
}

/**
 * Verifies rankings at narrow mobile widths.
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
 * Verifies rankings at one mobile width.
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
  await smokeWaitForSelector(page, RANKINGS_TABLE_SELECTOR, QUICK_UI_TIMEOUT);
  await shot(page, `rankings-mobile-${viewport.width}`);
  const evidence = await readMobileRankings(page);

  return await closeWithChecks(context, [
    check(
      evidence.hasCounts && evidence.hasLabels && evidence.hasDrilldown,
      `rankings: mobile public content readable at ${viewport.width}px`,
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
 * Reads mobile rankings facts.
 * @param page - Browser page to inspect.
 * @returns Mobile rankings facts.
 */
async function readMobileRankings(page: Page) {
  return await page.evaluate(rankingsTableSelector => {
    const pageText = document.body.innerText;
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
      hasCounts: /Ranked profiles|Linked profiles|Profiles to link/i.test(
        pageText
      ),
      hasDrilldown:
        document.querySelectorAll(`${rankingsTableSelector} tbody a[href]`)
          .length > 0,
      hasLabels:
        /Advisor Rankings Browser|Ranking summary|Source transparency/i.test(
          pageText
        ),
      hasReadableRowStatus:
        tableText.toLowerCase().includes("linked advisorbook profile") &&
        tableText.toLowerCase().includes("verified source"),
      noOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      statusTagsFit: clippedStatusLabels.length === 0,
      clippedStatusLabels,
      scrollWidth: document.documentElement.scrollWidth,
      tableText,
      text: pageText,
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
  await smokeWaitForSelector(page, ".empty");
  await shot(page, "rankings-no-rows");
  const evidence = await readEmptyRankings(page);

  return await closeWithChecks(context, [
    check(evidence.hasEmpty, "rankings: no-row state explains missing rows"),
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

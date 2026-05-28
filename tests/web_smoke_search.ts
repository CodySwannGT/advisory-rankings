import type { Browser, Locator, Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  check,
  closeWithChecks,
  cleanProfilePath,
  newContext,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

/** Search result kinds that map directly to public profile route segments. */
type SearchKind = "advisor" | "firm" | "team";

/** Browser-observed evidence for global search kind mode behavior. */
interface SearchKindModeEvidence {
  readonly countHint: string;
  readonly firmModePressed: string | null;
  readonly visibleKinds: readonly (SearchKind | null)[];
}
const SEARCH_RESULTS_SELECTOR = "#global-search-results";
const SEARCH_RESULT_ROWS_SELECTOR = `${SEARCH_RESULTS_SELECTOR} .gs-item`;
const SEARCH_EMPTY_SELECTOR = `${SEARCH_RESULTS_SELECTOR} .gs-empty`;
const SEARCH_COUNT_HINT_SELECTOR = `${SEARCH_RESULTS_SELECTOR} .gs-more`;
const ACTIVE_SEARCH_RESULT_SELECTOR = ".gs-item-active";

/** Budget for the /Search?kind=firm request triggered by clicking the Firms
 *  toggle. The request queues behind the homepage /Feed and the prior
 *  kind=all /Search under the dev cluster's serialized concurrency, so under
 *  GHA-runner network conditions it can exceed the standard DEPLOYED_DATA_TIMEOUT
 *  budget (60s). Use 2x that budget specifically for this waiter; multiple
 *  Release-and-Deploy runs have failed precisely here on the 60s budget. */
const SEARCH_KIND_QUEUE_TIMEOUT = DEPLOYED_DATA_TIMEOUT * 2;

/**
 * Checks global search suggestions and keyboard navigation against backend data.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for global search.
 */
export async function smokeGlobalSearch(page: Page): Promise<readonly Check[]> {
  const input = page.locator("#global-search");
  const namedInput = page.getByRole("combobox", {
    name: "Search advisors, firms, teams",
  });
  const results = page.locator(SEARCH_RESULT_ROWS_SELECTOR);

  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const namedInputCount = await namedInput.count();
  await input.fill("wells");
  await results.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "02-global-search");
  const kindMode = await selectFirmSearchKind(page, results);

  const firstResult = results.first();
  const firstKind = normalizeSearchKind(
    (await firstResult.locator(".gs-kind").textContent()) ?? ""
  );
  const firstHref = await firstResult.getAttribute("href");
  const expectedPath = new URL(firstHref ?? "/", BASE).pathname;
  const dropdownExpanded = await input.evaluate(
    element => element.getAttribute("aria-expanded") === "true"
  );
  const resultCount = await results.count();
  const supportedKinds = kindMode.visibleKinds.filter(
    kind => kind !== null
  ).length;

  await input.press("ArrowDown");
  const activeRows = await page.locator(ACTIVE_SEARCH_RESULT_SELECTOR).count();
  await input.press("Enter");
  await page.waitForURL(url => url.pathname === expectedPath, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  const enteredUrl = page.url();
  const enterOpenedCleanPath =
    firstKind !== null &&
    cleanProfilePath(pluralSearchKind(firstKind), enteredUrl);
  const emptySearchChecks = await smokeSearchEmptyAndDismissChecks(
    page,
    "desktop"
  );

  return [
    check(
      namedInputCount === 1,
      "global search: combobox exposes accessible name"
    ),
    check(dropdownExpanded, "global search: suggestions dropdown opens"),
    check(resultCount >= 1, "global search: selectable suggestions render"),
    check(
      supportedKinds >= 1,
      "global search: advisor, firm, or team result renders"
    ),
    check(
      kindMode.firmModePressed === "true",
      "global search: kind mode toggle reflects selected mode"
    ),
    check(
      kindMode.visibleKinds.every(kind => kind === "firm"),
      "global search: firm mode renders firm-only rows",
      kindMode.visibleKinds.join(",")
    ),
    check(
      /firm matches/i.test(kindMode.countHint),
      "global search: count hint reflects selected kind",
      kindMode.countHint
    ),
    check(activeRows === 1, "global search: ArrowDown selects one result"),
    check(
      enterOpenedCleanPath,
      "global search: Enter opens clean profile route",
      enteredUrl
    ),
    ...emptySearchChecks,
  ];
}

/**
 * Repeats empty-result and Escape-dismiss assertions in a mobile shell context.
 * @param browser - Browser used to create a mobile context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Smoke assertions for mobile search state behavior.
 */
export async function smokeGlobalSearchMobile(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 390, height: 844 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  return await closeWithChecks(context, [
    ...(await smokeSearchEmptyAndDismissChecks(page, "mobile")),
  ]);
}

const normalizeSearchKind = (value: string): SearchKind | null =>
  value.trim().toLowerCase() === "advisor"
    ? "advisor"
    : value.trim().toLowerCase() === "team"
      ? "team"
      : value.trim().toLowerCase() === "firm"
        ? "firm"
        : null;

const pluralSearchKind = (kind: SearchKind): string => `${kind}s`;

/**
 * Switches to firm mode and captures request, row, and count-hint evidence.
 * @param page - Browser page used for the scenario.
 * @param results - Search result rows rendered by the dropdown.
 * @returns Evidence from firm mode selection.
 */
async function selectFirmSearchKind(
  page: Page,
  results: Locator
): Promise<SearchKindModeEvidence> {
  const firmResponse = page.waitForResponse(
    response => {
      const url = new URL(response.url());
      return (
        url.pathname === "/Search" &&
        url.searchParams.get("q") === "wells" &&
        url.searchParams.get("kind") === "firm"
      );
    },
    // The kind=firm response queues behind the homepage /Feed and the prior
    // kind=all /Search under the dev cluster's serialized concurrency. The
    // standard 60s DEPLOYED_DATA_TIMEOUT budget has been exceeded multiple
    // times under GHA-runner conditions, so use the doubled budget here.
    { timeout: SEARCH_KIND_QUEUE_TIMEOUT }
  );
  await page.getByRole("button", { name: "Firms" }).click();
  await firmResponse;
  await results.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  return {
    countHint:
      (await page.locator(SEARCH_COUNT_HINT_SELECTOR).first().textContent()) ??
      "",
    firmModePressed: await page
      .getByRole("button", { name: "Firms" })
      .getAttribute("aria-pressed"),
    visibleKinds: await searchKinds(results),
  };
}

/**
 * Reads normalized entity kind labels from visible global-search rows.
 * @param results - Search result rows rendered by the global search dropdown.
 * @returns Normalized kind values for each row.
 */
async function searchKinds(
  results: Locator
): Promise<readonly (SearchKind | null)[]> {
  return (await results.locator(".gs-kind").allTextContents()).map(kind =>
    normalizeSearchKind(kind)
  );
}

/**
 * Asserts deterministic empty-state and Escape-dismiss behavior for search.
 * @param page - Browser page used for the scenario.
 * @param shell - Shell mode label for assertion output.
 * @returns Smoke assertions for no-result and dismiss state handling.
 */
async function smokeSearchEmptyAndDismissChecks(
  page: Page,
  shell: "desktop" | "mobile"
): Promise<readonly Check[]> {
  const input = page.locator("#global-search");
  const dropdown = page.locator(SEARCH_RESULTS_SELECTOR);
  const rows = page.locator(SEARCH_RESULT_ROWS_SELECTOR);
  const empty = page.locator(SEARCH_EMPTY_SELECTOR).first();

  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);

  await input.fill("zzzzzzzzzzzz-no-match");
  await empty.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await page.waitForFunction(
    selector =>
      /No matches for/.test(
        document.querySelector(selector)?.textContent ?? ""
      ),
    SEARCH_EMPTY_SELECTOR,
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  await shot(page, `02-${shell}-global-search-empty`);
  const emptyStateText = (await empty.textContent()) ?? "";
  const emptyStateRows = await rows.count();

  await input.fill("wells");
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await input.press("ArrowDown");
  const activeBeforeEscape = await page
    .locator(ACTIVE_SEARCH_RESULT_SELECTOR)
    .count();
  await input.press("Escape");
  await page.waitForFunction(
    selector => document.querySelector(selector)?.hasAttribute("hidden"),
    SEARCH_RESULTS_SELECTOR,
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  const activeAfterEscape = await page
    .locator(ACTIVE_SEARCH_RESULT_SELECTOR)
    .count();
  const dropdownHidden = await dropdown.evaluate(node =>
    node.hasAttribute("hidden")
  );

  return [
    check(
      emptyStateRows === 0,
      `${shell}: global search no-result query clears stale suggestion rows`
    ),
    check(
      /No matches for/.test(emptyStateText),
      `${shell}: global search renders explicit empty state`,
      emptyStateText
    ),
    check(
      activeBeforeEscape === 1,
      `${shell}: global search ArrowDown selects one suggestion before Escape`
    ),
    check(
      dropdownHidden,
      `${shell}: global search Escape collapses suggestion surface`
    ),
    check(
      activeAfterEscape === 0,
      `${shell}: global search Escape clears active row state`
    ),
  ];
}

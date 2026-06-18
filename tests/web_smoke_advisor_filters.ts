import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  check,
  shot,
  smokeGoto,
  type Check,
} from "./web_smoke_support.js";
import {
  readAdvisorFilterFacts,
  type AdvisorFilterFacts,
} from "./web_smoke_advisor_filter_facts.js";

const ADVISOR_STATS_TITLE = "Advisor directory";
const DIRECTORY_ROW_SELECTOR = ".center .entity-list .row";
const FILTER_FORM_SELECTOR = ".advisor-directory-filters";
const STATS_CARD_SELECTOR = ".right .card";
const ADVISOR_FACTS = {
  rowSelector: DIRECTORY_ROW_SELECTOR,
  statsSelector: STATS_CARD_SELECTOR,
  title: ADVISOR_STATS_TITLE,
} as const;

interface DirectoryPayload<T> {
  readonly items?: readonly T[];
  readonly nextCursor?: string | null;
  readonly total?: number;
}

interface FirmRow {
  readonly name?: string;
}

/**
 * Fetches a directory payload, failing fast when the response is not ok
 * instead of parsing an error body as directory JSON.
 * @param page - Browser page used for request context.
 * @param url - Directory resource URL to fetch.
 * @returns The parsed directory payload.
 */
async function readDirectoryPayload<T>(
  page: Page,
  url: string
): Promise<DirectoryPayload<T>> {
  const response = await page.request.get(url);
  if (!response.ok()) {
    throw new Error(`directory request failed: ${response.status()} ${url}`);
  }
  return (await response.json()) as DirectoryPayload<T>;
}

/**
 * Checks URL-backed advisor filters, zero-result recovery, and narrow layouts.
 * @param page - Browser page used for the advisor directory scenario.
 * @returns Smoke assertions for advisor filter controls.
 */
export async function smokeAdvisorDirectoryFilters(
  page: Page
): Promise<readonly Check[]> {
  const viewport = page.viewportSize();
  const rows = page.locator(DIRECTORY_ROW_SELECTOR);
  const filterForm = page.locator(FILTER_FORM_SELECTOR);

  // Derive the firm filter from live data rather than hardcoding a firm. This
  // keeps the firm+careerStatus assertion satisfiable against whatever data is
  // deployed.
  const firm = await discoverFilterableFirm(page);
  const filteredUrl = `${BASE}/advisors?firm=${encodeURIComponent(
    firm
  )}&careerStatus=active`;

  await smokeGoto(page, filteredUrl);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await waitForDirectoryTotalCount(page);
  const filteredFacts = await readAdvisorFilterFacts(page, ADVISOR_FACTS);
  await page.reload();
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const restoredFacts = await readAdvisorFilterFacts(page, ADVISOR_FACTS);
  const liveFacts = await captureLiveAdvisorFilterFacts(page);
  await shot(page, "06-advisors-filtered");

  await smokeGoto(page, `${BASE}/advisors?q=zzznomatch&firm=zzznomatch`);
  await page
    .locator(".empty")
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const emptyFacts = await readAdvisorFilterFacts(page, ADVISOR_FACTS);
  await shot(page, "06-advisors-filter-empty");

  const desktopLayout = await sweepAdvisorFilterLayouts(page, filteredUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await smokeGoto(page, filteredUrl);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const mobile390 = await viewportOverflow(page);
  await shot(page, "06-advisors-filtered-mobile-390");

  await page.setViewportSize({ width: 320, height: 720 });
  await smokeGoto(page, filteredUrl);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await filterForm.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const mobile320 = await viewportOverflow(page);
  await shot(page, "06-advisors-filtered-mobile-320");
  if (viewport) await page.setViewportSize(viewport);

  return filterChecks({
    emptyFacts,
    expectedFirm: firm,
    desktopLayout,
    filteredFacts,
    liveFacts,
    mobile320,
    mobile390,
    restoredFacts,
  });
}

/**
 * Finds a firm that demonstrably has at least one active advisor
 * by reading live data through the same public directory resources the page
 * uses. Profile subtitles can reflect employment rows whose firm is not a
 * canonical directory firm, so this probes canonical firm names directly.
 * @param page - Browser page used for discovery.
 * @returns A firm name with active advisors.
 */
async function discoverFilterableFirm(page: Page): Promise<string> {
  const firms = await discoverFirmCandidates(page);
  const matched = await firstFirmWithActiveAdvisors(page, firms);
  if (!matched) throw new Error("no canonical firm has active advisors");
  return matched;
}

/**
 * Reads candidate firm names from the public firm directory.
 * @param page - Browser page used for request context.
 * @returns Canonical firm names to probe.
 */
async function discoverFirmCandidates(page: Page): Promise<readonly string[]> {
  return await discoverFirmCandidatePage(page, null, []);
}

/**
 * Recursively reads canonical firm names from the public firm directory.
 * @param page - Browser page used for request context.
 * @param cursor - Current directory cursor.
 * @param names - Firm names collected so far.
 * @returns Canonical firm names to probe.
 */
async function discoverFirmCandidatePage(
  page: Page,
  cursor: string | null,
  names: readonly string[]
): Promise<readonly string[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const payload = await readDirectoryPayload<FirmRow>(
    page,
    `${BASE}/PublicFirms?${params}`
  );
  const nextNames = [
    ...names,
    ...(payload.items ?? []).map(firm => firm.name ?? "").filter(Boolean),
  ];
  return payload.nextCursor
    ? await discoverFirmCandidatePage(page, payload.nextCursor, nextNames)
    : nextNames;
}

/**
 * Finds the first firm candidate that produces active advisor rows.
 * @param page - Browser page used for request context.
 * @param firms - Candidate canonical firm names.
 * @returns Matching firm name, or an empty string when none match.
 */
async function firstFirmWithActiveAdvisors(
  page: Page,
  firms: readonly string[]
): Promise<string> {
  for (const firm of firms) {
    const url = `${BASE}/PublicAdvisors?firm=${encodeURIComponent(
      firm
    )}&careerStatus=active&limit=1`;
    const payload = await readDirectoryPayload<unknown>(page, url);
    if ((payload.total ?? 0) > 0) return firm;
  }
  return "";
}

/**
 * Builds pass/fail checks from captured advisor-filter facts.
 * @param facts - Captured desktop, reload, empty, and mobile facts.
 * @param facts.desktopLayout - Bounds sweeps for desktop/tablet widths.
 * @param facts.emptyFacts - Empty-filter result facts.
 * @param facts.expectedFirm - Firm name derived from live data for the filter.
 * @param facts.filteredFacts - Initial filtered result facts.
 * @param facts.liveFacts - Interactive live-filter facts.
 * @param facts.mobile320 - Overflow metrics at 320px.
 * @param facts.mobile390 - Overflow metrics at 390px.
 * @param facts.restoredFacts - Filter facts captured after reload.
 * @returns Smoke assertions for the advisor filter journey.
 */
interface FilterCheckFacts {
  readonly desktopLayout: readonly FilterLayoutSweep[];
  readonly emptyFacts: AdvisorFilterFacts;
  readonly expectedFirm: string;
  readonly filteredFacts: AdvisorFilterFacts;
  readonly liveFacts: LiveAdvisorFilterFacts;
  readonly mobile320: ViewportOverflow;
  readonly mobile390: ViewportOverflow;
  readonly restoredFacts: AdvisorFilterFacts;
}

function filterChecks(facts: FilterCheckFacts): readonly Check[] {
  return [
    advisorUrlControlCheck(facts),
    check(
      facts.filteredFacts.accessibleLabels,
      "advisors filters: controls are reachable by visible labels"
    ),
    check(
      facts.filteredFacts.total > 0 && facts.filteredFacts.rowCount > 0,
      "advisors filters: matching rows render",
      `${facts.filteredFacts.rowCount} of ${facts.filteredFacts.total}`
    ),
    check(
      facts.filteredFacts.loaded === facts.filteredFacts.rowCount &&
        facts.filteredFacts.loaded > 0,
      "advisors filters: showing count tracks rendered rows",
      `${facts.filteredFacts.loaded}/${facts.filteredFacts.rowCount}`
    ),
    check(
      facts.filteredFacts.rawMetricsHidden,
      "advisors filters: developer metrics are hidden"
    ),
    ...advisorLiveFilterChecks(facts.liveFacts),
    check(
      /^\/advisors\/[a-z0-9-]+-[0-9a-f-]{36}$/i.test(
        facts.filteredFacts.firstHref
      ),
      "advisors filters: first row links to canonical advisor profile",
      facts.filteredFacts.firstHref
    ),
    check(
      facts.filteredFacts.rowTexts.every(text => /active/i.test(text)),
      "advisors filters: rows reflect status filter"
    ),
    check(
      facts.restoredFacts.firm === facts.filteredFacts.firm &&
        facts.restoredFacts.careerStatus === facts.filteredFacts.careerStatus &&
        facts.restoredFacts.hasCrd === facts.filteredFacts.hasCrd,
      "advisors filters: reload restores controls",
      JSON.stringify(facts.restoredFacts)
    ),
    check(
      facts.emptyFacts.rowCount === 0 &&
        /No advisors match/i.test(facts.emptyFacts.bodyText),
      "advisors filters: zero-result state keeps controls available"
    ),
    check(
      facts.mobile390.scrollWidth <= facts.mobile390.clientWidth &&
        facts.mobile320.scrollWidth <= facts.mobile320.clientWidth,
      "advisors filters: no mobile horizontal overflow at 390px and 320px",
      `390 ${facts.mobile390.scrollWidth}/${facts.mobile390.clientWidth}, 320 ${facts.mobile320.scrollWidth}/${facts.mobile320.clientWidth}`
    ),
    advisorDesktopLayoutCheck(facts.desktopLayout),
  ];
}

function advisorUrlControlCheck(facts: FilterCheckFacts): Check {
  return check(
    facts.filteredFacts.firm === facts.expectedFirm &&
      facts.filteredFacts.careerStatus === "active" &&
      facts.filteredFacts.hasCrd === "",
    "advisors filters: controls reflect URL",
    JSON.stringify(facts.filteredFacts)
  );
}

function advisorDesktopLayoutCheck(
  desktopLayout: readonly FilterLayoutSweep[]
): Check {
  return check(
    desktopLayout.every(sweep => sweep.escapedControls.length === 0),
    "advisors filters: controls stay inside card at desktop and tablet widths",
    desktopLayout
      .map(sweep =>
        sweep.escapedControls.length
          ? `${sweep.width}px escaped ${sweep.escapedControls.join(", ")}`
          : `${sweep.width}px ok`
      )
      .join("; ")
  );
}

/**
 * Builds checks for interactive advisor filtering.
 * @param facts - Captured live-filter observations.
 * @returns Advisor live-filter smoke checks.
 */
function advisorLiveFilterChecks(
  facts: LiveAdvisorFilterFacts
): readonly Check[] {
  return [
    check(
      facts.noApplyButton && facts.urlUpdated && facts.rowsRender,
      "advisors filters: advisor name filters live without Apply",
      JSON.stringify(facts)
    ),
    check(
      facts.firmTypeahead,
      "advisors filters: current firm offers typeahead suggestions"
    ),
  ];
}

/**
 * Checks the advisor filter card at the widths called out in the bug report.
 * @param page - Browser page rendering the advisor directory.
 * @param url - Advisor directory URL with satisfiable filters.
 * @returns Per-width controls that escaped the card bounds.
 */
async function sweepAdvisorFilterLayouts(
  page: Page,
  url: string
): Promise<readonly FilterLayoutSweep[]> {
  const widths = [900, 1024, 1180, 1440] as const;
  return await widths.reduce<Promise<readonly FilterLayoutSweep[]>>(
    async (previousSweeps, width) => {
      const sweeps = await previousSweeps;
      await page.setViewportSize({ width, height: 900 });
      await smokeGoto(page, url);
      await page
        .locator(FILTER_FORM_SELECTOR)
        .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
      return [...sweeps, await readAdvisorFilterLayout(page, width)];
    },
    Promise.resolve([])
  );
}

/**
 * Reads filter control bounds relative to their visible card.
 * @param page - Browser page rendering the advisor directory.
 * @param width - Current viewport width.
 * @returns Controls outside the card bounds at this width.
 */
async function readAdvisorFilterLayout(
  page: Page,
  width: number
): Promise<FilterLayoutSweep> {
  return await page.evaluate(
    ({ selector, viewportWidth }) => {
      const form = document.querySelector(selector);
      const card = form?.closest(".card");
      const cardRect = card?.getBoundingClientRect();
      if (!form || !cardRect) {
        return {
          escapedControls: ["missing filter card"],
          width: viewportWidth,
        };
      }

      const controls = Array.from(
        form.querySelectorAll("input, select, button")
      );
      const escapedControls = controls
        .map(control => {
          const rect = control.getBoundingClientRect();
          const label =
            control.getAttribute("name") ||
            control.textContent?.trim() ||
            control.tagName.toLowerCase();
          const outside =
            rect.left < cardRect.left ||
            rect.right > cardRect.right ||
            rect.top < cardRect.top ||
            rect.bottom > cardRect.bottom;
          return outside ? label : "";
        })
        .filter(Boolean);

      return {
        escapedControls,
        width: viewportWidth,
      };
    },
    { selector: FILTER_FORM_SELECTOR, viewportWidth: width }
  );
}

/**
 * Exercises advisor live filtering without pressing Apply.
 * @param page - Browser page rendering the advisor directory.
 * @returns Live-filter observations.
 */
async function captureLiveAdvisorFilterFacts(
  page: Page
): Promise<LiveAdvisorFilterFacts> {
  await smokeGoto(page, `${BASE}/advisors`);
  await page.locator(FILTER_FORM_SELECTOR).waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await page.locator(DIRECTORY_ROW_SELECTOR).first().waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  const query = await liveAdvisorQuery(page);
  await page.locator('[name="q"]').fill(query);
  await page.waitForURL(url => url.searchParams.get("q") === query, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await page.locator(DIRECTORY_ROW_SELECTOR).first().waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  return await page.evaluate(
    ({ formSelector, query, rowSelector }) => {
      const firmInput = document.querySelector(
        `${formSelector} [name="firm"]`
      ) as HTMLInputElement | null;
      return {
        firmTypeahead: Boolean(firmInput?.getAttribute("list")),
        noApplyButton: !Array.from(
          document.querySelectorAll(`${formSelector} button`)
        ).some(button => button.textContent?.trim() === "Apply"),
        rowsRender: document.querySelectorAll(rowSelector).length > 0,
        urlUpdated: new URL(location.href).searchParams.get("q") === query,
      };
    },
    {
      formSelector: FILTER_FORM_SELECTOR,
      query,
      rowSelector: DIRECTORY_ROW_SELECTOR,
    }
  );
}

async function liveAdvisorQuery(page: Page): Promise<string> {
  const rowText = await page
    .locator(DIRECTORY_ROW_SELECTOR)
    .first()
    .innerText();
  const token = rowText
    .split(/\s+/)
    .map(part => part.replace(/[^A-Za-z'-]/g, ""))
    .find(part => part.length >= 3);
  if (!token) throw new Error("could not derive advisor live-filter query");
  return token;
}

/**
 * Waits for the advisor directory match count to become numeric.
 * @param page - Browser page rendering the advisor directory.
 */
async function waitForDirectoryTotalCount(page: Page): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, title }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(title)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Matches");
      const value = total?.nextElementSibling?.textContent ?? "";
      const match = /\d+/.exec(value.replace(/,/g, ""));
      return Number.isFinite(match ? Number(match[0]) : NaN);
    },
    {
      statsSelector: STATS_CARD_SELECTOR,
      title: ADVISOR_STATS_TITLE,
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Reads document overflow metrics for the current viewport.
 * @param page - Browser page to inspect.
 * @returns Width values used to detect horizontal overflow.
 */
async function viewportOverflow(page: Page): Promise<ViewportOverflow> {
  return await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

/** Advisor filter card layout facts for one viewport width. */
interface FilterLayoutSweep {
  readonly escapedControls: readonly string[];
  readonly width: number;
}

/** Captured interactive advisor filter behavior. */
interface LiveAdvisorFilterFacts {
  readonly firmTypeahead: boolean;
  readonly noApplyButton: boolean;
  readonly rowsRender: boolean;
  readonly urlUpdated: boolean;
}

/** Document width metrics for a responsive viewport. */
interface ViewportOverflow {
  readonly clientWidth: number;
  readonly scrollWidth: number;
}

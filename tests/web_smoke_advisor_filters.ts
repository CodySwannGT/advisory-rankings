import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  check,
  shot,
  smokeGoto,
  type Check,
} from "./web_smoke_support.js";

const ADVISOR_STATS_TITLE = "Advisor directory";
const DIRECTORY_ROW_SELECTOR = ".center .entity-list .row";
const STATS_CARD_SELECTOR = ".right .card";

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
  const filterForm = page.locator(".advisor-directory-filters");

  // Derive the firm filter from live data rather than hardcoding a firm: pick a
  // real active advisor that has a CRD, read their current firm, and filter by
  // it. This keeps the firm+careerStatus+hasCrd assertion satisfiable against
  // whatever data is deployed (a hardcoded firm can have zero CRD-holders and
  // silently render no rows).
  const firm = await discoverFilterableFirm(page);
  const filteredUrl = `${BASE}/advisors?firm=${encodeURIComponent(
    firm
  )}&careerStatus=active&hasCrd=true`;

  await smokeGoto(page, filteredUrl);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await waitForDirectoryTotalCount(page);
  const filteredFacts = await readAdvisorFilterFacts(page);
  await page.reload();
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const restoredFacts = await readAdvisorFilterFacts(page);
  await shot(page, "06-advisors-filtered");

  await smokeGoto(page, `${BASE}/advisors?q=zzznomatch&firm=zzznomatch`);
  await page
    .locator(".empty")
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const emptyFacts = await readAdvisorFilterFacts(page);
  await shot(page, "06-advisors-filter-empty");

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
    filteredFacts,
    mobile320,
    mobile390,
    restoredFacts,
  });
}

/**
 * Finds a firm that demonstrably has at least one active, CRD-holding advisor
 * by reading live data: it loads the active+CRD advisor directory, opens the
 * first result, and returns that advisor's current firm name. Filtering by this
 * firm together with `careerStatus=active&hasCrd=true` is therefore guaranteed
 * to match at least that advisor.
 * @param page - Browser page used for discovery.
 * @returns A firm name with active CRD-holding advisors.
 */
async function discoverFilterableFirm(page: Page): Promise<string> {
  await smokeGoto(page, `${BASE}/advisors?careerStatus=active&hasCrd=true`);
  const firstRow = page.locator(DIRECTORY_ROW_SELECTOR).first();
  await firstRow.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const href = await firstRow.evaluate(
    row =>
      row.getAttribute("href") ||
      row.closest("a")?.getAttribute("href") ||
      row.querySelector("a")?.getAttribute("href") ||
      ""
  );
  if (!href) throw new Error("advisor directory row has no profile link");
  await smokeGoto(page, `${BASE}${href}`);
  const firm = await page
    .locator(".subtitle")
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT })
    .then(() => page.locator(".subtitle").first().textContent());
  const trimmed = (firm ?? "").trim();
  if (!trimmed)
    throw new Error("advisor profile has no current firm to filter by");
  return trimmed;
}

/**
 * Builds pass/fail checks from captured advisor-filter facts.
 * @param facts - Captured desktop, reload, empty, and mobile facts.
 * @param facts.emptyFacts - Empty-filter result facts.
 * @param facts.expectedFirm - Firm name derived from live data for the filter.
 * @param facts.filteredFacts - Initial filtered result facts.
 * @param facts.mobile320 - Overflow metrics at 320px.
 * @param facts.mobile390 - Overflow metrics at 390px.
 * @param facts.restoredFacts - Filter facts captured after reload.
 * @returns Smoke assertions for the advisor filter journey.
 */
function filterChecks(facts: {
  readonly emptyFacts: AdvisorFilterFacts;
  readonly expectedFirm: string;
  readonly filteredFacts: AdvisorFilterFacts;
  readonly mobile320: ViewportOverflow;
  readonly mobile390: ViewportOverflow;
  readonly restoredFacts: AdvisorFilterFacts;
}): readonly Check[] {
  return [
    check(
      facts.filteredFacts.firm === facts.expectedFirm &&
        facts.filteredFacts.careerStatus === "active" &&
        facts.filteredFacts.hasCrd === "true",
      "advisors filters: controls reflect URL",
      JSON.stringify(facts.filteredFacts)
    ),
    check(
      facts.filteredFacts.total > 0 && facts.filteredFacts.rowCount > 0,
      "advisors filters: matching rows render",
      `${facts.filteredFacts.rowCount} of ${facts.filteredFacts.total}`
    ),
    check(
      facts.filteredFacts.loaded === facts.filteredFacts.rowCount &&
        facts.filteredFacts.loaded > 0,
      "advisors filters: loaded count tracks rendered rows",
      `${facts.filteredFacts.loaded}/${facts.filteredFacts.rowCount}`
    ),
    check(
      /^\/advisors\/[a-z0-9-]+-[0-9a-f-]{36}$/i.test(
        facts.filteredFacts.firstHref
      ),
      "advisors filters: first row links to canonical advisor profile",
      facts.filteredFacts.firstHref
    ),
    check(
      facts.filteredFacts.rowTexts.every(
        text => /active/i.test(text) && /CRD/i.test(text)
      ),
      "advisors filters: rows reflect status and CRD filters"
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
  ];
}

/**
 * Waits for the advisor directory total stat to become numeric.
 * @param page - Browser page rendering the advisor directory.
 */
async function waitForDirectoryTotalCount(page: Page): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, title }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(title)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Total");
      const value = total?.nextElementSibling?.textContent ?? "";
      return Number.isFinite(Number(value.replace(/,/g, "")));
    },
    {
      statsSelector: STATS_CARD_SELECTOR,
      title: ADVISOR_STATS_TITLE,
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Reads advisor filter form, result, and empty-state facts.
 * @param page - Browser page rendering the advisor directory.
 * @returns Current filter values and visible result facts.
 */
async function readAdvisorFilterFacts(page: Page): Promise<AdvisorFilterFacts> {
  return await page.evaluate(
    ({ rowSelector, statsSelector, title }) => {
      const valueOf = (name: string) =>
        (document.querySelector(`[name="${name}"]`) as HTMLInputElement | null)
          ?.value || "";
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(title)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Total");
      const loaded = labels.find(label => label.textContent === "Loaded");
      const totalValue = total?.nextElementSibling?.textContent ?? "";
      const loadedValue = loaded?.nextElementSibling?.textContent ?? "";
      const rows = Array.from(document.querySelectorAll(rowSelector));

      return {
        bodyText: document.body.textContent || "",
        careerStatus: valueOf("careerStatus"),
        firm: valueOf("firm"),
        firstHref:
          rows[0]?.closest("a")?.getAttribute("href") ||
          rows[0]?.querySelector("a")?.getAttribute("href") ||
          "",
        hasCrd: valueOf("hasCrd"),
        loaded: Number(loadedValue.replace(/,/g, "")),
        rowCount: rows.length,
        rowTexts: rows
          .slice(0, 5)
          .map(row => row.textContent?.replace(/\s+/g, " ").trim() || ""),
        total: Number(totalValue.replace(/,/g, "")),
      };
    },
    {
      rowSelector: DIRECTORY_ROW_SELECTOR,
      statsSelector: STATS_CARD_SELECTOR,
      title: ADVISOR_STATS_TITLE,
    }
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

/** Captured DOM facts for the advisor filter page. */
interface AdvisorFilterFacts {
  readonly bodyText: string;
  readonly careerStatus: string;
  readonly firm: string;
  readonly firstHref: string;
  readonly hasCrd: string;
  readonly loaded: number;
  readonly rowCount: number;
  readonly rowTexts: readonly string[];
  readonly total: number;
}

/** Document width metrics for a responsive viewport. */
interface ViewportOverflow {
  readonly clientWidth: number;
  readonly scrollWidth: number;
}

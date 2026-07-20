import type { Page } from "playwright";

/** Captured DOM facts for the advisor filter page. */
export interface AdvisorFilterFacts {
  readonly accessibleLabels: boolean;
  readonly bodyText: string;
  readonly careerStatus: string;
  readonly contactReadiness: string;
  readonly freshness: string;
  readonly firm: string;
  readonly firstHref: string;
  readonly hasCrd: string;
  readonly loaded: number;
  readonly profileSubstance: string;
  readonly rawMetricsHidden: boolean;
  readonly rowCount: number;
  readonly rowTexts: readonly string[];
  readonly total: number;
}

interface AdvisorFilterFactSelectors {
  readonly rowSelector: string;
  readonly statsSelector: string;
  readonly title: string;
}

interface AdvisorFilterFactPageArgs extends AdvisorFilterFactSelectors {
  readonly expectedLabels: typeof ADVISOR_FILTER_LABELS;
}

const ADVISOR_FILTER_LABELS = [
  ["Advisor", "advisor-filter-q", "q"],
  ["Current firm", "advisor-filter-firm", "firm"],
  ["Career status", "advisor-filter-careerStatus", "careerStatus"],
  ["CRD", "advisor-filter-hasCrd", "hasCrd"],
  ["Contact", "advisor-filter-contactReadiness", "contactReadiness"],
  ["Profile", "advisor-filter-profileSubstance", "profileSubstance"],
  ["Freshness", "advisor-filter-freshness", "freshness"],
] as const;

/**
 * Reads advisor filter form, result, and empty-state facts.
 * @param page - Browser page rendering the advisor directory.
 * @param selectors - DOM selectors and card title used by the page.
 * @returns Current filter values and visible result facts.
 */
export async function readAdvisorFilterFacts(
  page: Page,
  selectors: AdvisorFilterFactSelectors
): Promise<AdvisorFilterFacts> {
  return await page.evaluate(readAdvisorFilterFactsInPage, {
    ...selectors,
    expectedLabels: ADVISOR_FILTER_LABELS,
  });
}

/**
 * Reads advisor filter facts inside the browser page context.
 * @param args - Selectors and label metadata.
 * @returns Current filter values and visible result facts.
 */
function readAdvisorFilterFactsInPage(
  args: AdvisorFilterFactPageArgs
): AdvisorFilterFacts {
  const { rowSelector, statsSelector, title, expectedLabels } = args;
  const valueOf = (name: string) =>
    document.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value || "";
  const stats = Array.from(document.querySelectorAll(statsSelector)).find(
    card => card.textContent?.includes(title)
  );
  const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
  const counts = advisorFilterCounts(labels);
  const rows = Array.from(document.querySelectorAll(rowSelector));
  return {
    accessibleLabels: advisorFilterLabelsAreAccessible(expectedLabels),
    bodyText: document.body.textContent || "",
    careerStatus: valueOf("careerStatus"),
    contactReadiness: valueOf("contactReadiness"),
    freshness: valueOf("freshness"),
    firm: valueOf("firm"),
    firstHref: rows[0]?.closest("a")?.getAttribute("href") || "",
    hasCrd: valueOf("hasCrd"),
    loaded: counts.loaded,
    profileSubstance: valueOf("profileSubstance"),
    rawMetricsHidden: ["Loaded", "Total", "Page size"].every(
      label => !labels.some(item => item.textContent?.trim() === label)
    ),
    rowCount: rows.length,
    rowTexts: rows
      .slice(0, 5)
      .map(row => row.textContent?.replace(/\s+/g, " ").trim() || ""),
    total: counts.total,
  };
}

function advisorFilterLabelsAreAccessible(
  expectedLabels: AdvisorFilterFactPageArgs["expectedLabels"]
): boolean {
  return expectedLabels.every(([labelText, id, name]) => {
    const control = document.getElementById(id);
    return (
      document.querySelector(`label[for="${id}"]`)?.textContent?.trim() ===
        labelText &&
      ["INPUT", "SELECT"].includes(control?.tagName ?? "") &&
      control?.getAttribute("name") === name
    );
  });
}

function advisorFilterCounts(labels: readonly HTMLElement[]) {
  const countFrom = (value: string) =>
    Number(/\d+/.exec(value.replace(/,/g, ""))?.[0] ?? NaN);
  const total = labels.find(label => label.textContent === "Matches");
  const loaded = labels.find(label => label.textContent === "Showing");
  return {
    loaded: countFrom(loaded?.nextElementSibling?.textContent ?? ""),
    total: countFrom(total?.nextElementSibling?.textContent ?? ""),
  };
}

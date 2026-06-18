import type { Page } from "playwright";

/** Captured DOM facts for the advisor filter page. */
export interface AdvisorFilterFacts {
  readonly accessibleLabels: boolean;
  readonly bodyText: string;
  readonly careerStatus: string;
  readonly firm: string;
  readonly firstHref: string;
  readonly hasCrd: string;
  readonly loaded: number;
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
  return await page.evaluate(({ rowSelector, statsSelector, title }) => {
    const valueOf = (name: string) =>
      (document.querySelector(`[name="${name}"]`) as HTMLInputElement | null)
        ?.value || "";
    const stats = Array.from(document.querySelectorAll(statsSelector)).find(
      card => card.textContent?.includes(title)
    );
    const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
    const total = labels.find(label => label.textContent === "Matches");
    const loaded = labels.find(label => label.textContent === "Showing");
    const totalValue = total?.nextElementSibling?.textContent ?? "";
    const loadedValue = loaded?.nextElementSibling?.textContent ?? "";
    const countFrom = (value: string) => {
      const match = /\d+/.exec(value.replace(/,/g, ""));
      return match ? Number(match[0]) : NaN;
    };
    const rows = Array.from(document.querySelectorAll(rowSelector));

    return {
      accessibleLabels: [
        ["Advisor", "advisor-filter-q", "q"],
        ["Current firm", "advisor-filter-firm", "firm"],
        ["Career status", "advisor-filter-careerStatus", "careerStatus"],
        ["CRD", "advisor-filter-hasCrd", "hasCrd"],
      ].every(([labelText, id, name]) => {
        const labelNode = document.querySelector(`label[for="${id}"]`);
        const control = document.getElementById(id);
        return Boolean(
          labelNode?.textContent?.trim() === labelText &&
          control &&
          ["INPUT", "SELECT"].includes(control.tagName) &&
          control.getAttribute("name") === name
        );
      }),
      bodyText: document.body.textContent || "",
      careerStatus: valueOf("careerStatus"),
      firm: valueOf("firm"),
      firstHref:
        rows[0]?.closest("a")?.getAttribute("href") ||
        rows[0]?.querySelector("a")?.getAttribute("href") ||
        "",
      hasCrd: valueOf("hasCrd"),
      loaded: countFrom(loadedValue),
      rawMetricsHidden: ["Loaded", "Total", "Page size"].every(
        label => !labels.some(item => item.textContent?.trim() === label)
      ),
      rowCount: rows.length,
      rowTexts: rows
        .slice(0, 5)
        .map(row => row.textContent?.replace(/\s+/g, " ").trim() || ""),
      total: countFrom(totalValue),
    };
  }, selectors);
}

import type { AdvisorComparisonItem } from "../types/advisor-comparison.js";
import { fmtDate, humanize } from "./app.js";
import { el } from "./design-system/index.js";

/**
 * Builds the report-wide source appendix.
 * @param items - Compared advisor items.
 * @returns Source appendix section.
 */
export function packetSourceAppendix(
  items: readonly AdvisorComparisonItem[]
): HTMLElement {
  return el(
    "section",
    { class: "report-packet-source-appendix" },
    el("h3", {}, "Source appendix"),
    el(
      "div",
      { class: "report-packet-source-grid" },
      ...items.map(item => packetSourceAppendixAdvisor(item))
    )
  );
}

/**
 * Builds one advisor's source appendix entry.
 * @param item - Compared advisor item.
 * @returns Source appendix advisor entry.
 */
function packetSourceAppendixAdvisor(item: AdvisorComparisonItem): HTMLElement {
  const brokerCheck = item.attribution.brokerCheck;
  const confidence = item.dataConfidence.confidenceSummary;
  const freshness = item.dataConfidence.evidenceFreshness;

  return el(
    "article",
    {
      class: "report-packet-source-advisor",
      "data-advisor-id": item.id,
      "data-status": item.status,
    },
    el("h4", {}, item.displayName),
    el(
      "dl",
      {},
      appendixRow(
        "BrokerCheck",
        brokerCheck
          ? `CRD ${brokerCheck.subjectCrd}; snapshot loaded ${fmtDate(brokerCheck.fetchedAt, { mode: "short" })}.`
          : "Unavailable: no BrokerCheck snapshot loaded for this advisor."
      ),
      appendixRow(
        "Freshness",
        freshness.hasData && freshness.lastCheckedAt
          ? `Evidence checked ${fmtDate(freshness.lastCheckedAt, { mode: "short" })}.`
          : "Uncertain: no freshness check date is available."
      ),
      appendixRow("Article references", articleReferences(item)),
      appendixRow("Field assertions", fieldAssertions(item)),
      appendixRow("Research source checks", researchSourceChecks(item)),
      appendixRow(
        "Data confidence",
        confidence.hasData
          ? `${confidence.total} source-backed field${confidence.total === 1 ? "" : "s"} available.`
          : "Incomplete: no source-backed field confidence summary is available."
      )
    )
  );
}

/**
 * Builds one source appendix row.
 * @param label - Row label.
 * @param children - Row body content.
 * @returns Definition row.
 */
function appendixRow(
  label: string,
  ...children: readonly (HTMLElement | string)[]
): HTMLElement {
  return el(
    "div",
    { class: "report-packet-source-row" },
    el("dt", {}, label),
    el("dd", {}, ...children)
  );
}

/**
 * Lists article provenance in the source appendix.
 * @param item - Compared advisor item.
 * @returns Article reference list or unavailable state.
 */
function articleReferences(item: AdvisorComparisonItem): HTMLElement | string {
  if (!item.attribution.articles.length) {
    return "Unavailable: no article references loaded.";
  }
  return el(
    "ul",
    {},
    ...item.attribution.articles.map(article =>
      el("li", {}, articleLabel(article))
    )
  );
}

/**
 * Lists field-level source assertions in the source appendix.
 * @param item - Compared advisor item.
 * @returns Field assertion list or unavailable state.
 */
function fieldAssertions(item: AdvisorComparisonItem): HTMLElement | string {
  if (!item.attribution.assertions.length) {
    return "Unavailable: no source-backed field assertions loaded.";
  }
  return el(
    "ul",
    {},
    ...item.attribution.assertions.map(assertion =>
      el(
        "li",
        {},
        `${humanize(assertion.fieldName) || assertion.fieldName}: ${humanize(assertion.assertedValue) || String(assertion.assertedValue)} (${humanize(assertion.confidence) || assertion.confidence} confidence; article ${assertion.articleId})`
      )
    )
  );
}

/**
 * Lists research source checks in the source appendix.
 * @param item - Compared advisor item.
 * @returns Research source list or unavailable state.
 */
function researchSourceChecks(
  item: AdvisorComparisonItem
): HTMLElement | string {
  if (!item.attribution.researchSources.length) {
    return "Unavailable: no research source checks loaded.";
  }
  return el(
    "ul",
    {},
    ...item.attribution.researchSources.map(source =>
      el(
        "li",
        {},
        [
          humanize(source.sourceType) || source.sourceType,
          humanize(source.status) || source.status,
          source.checkedAt
            ? `checked ${fmtDate(String(source.checkedAt), { mode: "short" })}`
            : "check date unavailable",
          source.sourcesChecked.length
            ? `sources: ${source.sourcesChecked.join(", ")}`
            : "source list unavailable",
        ].join("; ")
      )
    )
  );
}

/**
 * Formats a loose article row for appendix display.
 * @param article - Article-like payload from AdvisorComparison.
 * @returns Human-readable article label.
 */
function articleLabel(article: unknown): string {
  if (!article || typeof article !== "object") return "Untitled article";
  const record = article as Readonly<Record<string, unknown>>;
  const title =
    valueText(record.headline) ||
    valueText(record.title) ||
    valueText(record.id) ||
    "Untitled article";
  const published = record.publishedDate
    ? `, published ${fmtDate(String(record.publishedDate), { mode: "short" })}`
    : "";
  const source = valueText(record.sourceLabel)
    ? `, source ${valueText(record.sourceLabel)}`
    : "";
  return `${title}${published}${source}`;
}

/**
 * Converts a loose scalar to useful display text.
 * @param value - Unknown value.
 * @returns Display text or empty string.
 */
function valueText(value: unknown): string {
  const text = humanize(value);
  return typeof text === "string" ? text : "";
}

import type {
  AdvisorComparisonItem,
  AdvisorComparisonRegulatory,
} from "../types/advisor-comparison.js";
import { fmtDate, humanize } from "./app.js";

/** One table row in the comparison evidence table. */
export interface ComparisonSection {
  readonly label: string;
  readonly values: readonly string[];
}

/**
 * Builds table row data for every required comparison section.
 * @param items - Advisor comparison items.
 * @returns Section rows.
 */
export function comparisonSections(
  items: readonly AdvisorComparisonItem[]
): readonly ComparisonSection[] {
  return [
    row("Profile", items, profileSummary),
    row("Firm", items, firmSummary),
    row("Regulatory", items, regulatorySummary),
    row("Career", items, careerSummary),
    row("Rankings / articles", items, rankingsArticlesSummary),
    row("Data confidence", items, dataConfidenceSummary),
  ];
}

/**
 * Formats a current firm from the comparison item.
 * @param item - Advisor comparison item.
 * @returns Firm display text.
 */
export function firmName(item: AdvisorComparisonItem): string {
  return item.status === "found" ? firmNameFromUnknown(item.firm) : "";
}

/**
 * Builds one comparison section row.
 * @param label - Section label.
 * @param items - Advisor comparison items.
 * @param render - Per-item renderer.
 * @returns Table section.
 */
function row(
  label: string,
  items: readonly AdvisorComparisonItem[],
  render: (item: AdvisorComparisonItem) => string
): ComparisonSection {
  return { label, values: items.map(render) };
}

/**
 * Formats the advisor identity section.
 * @param item - Advisor comparison item.
 * @returns Profile summary.
 */
function profileSummary(item: AdvisorComparisonItem): string {
  if (item.status === "not_found") return "Advisor record not found";
  return [
    item.displayName,
    valueText(item.identity.careerStatus),
    yearsExperience(item.identity.yearsExperience),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Formats the firm section.
 * @param item - Advisor comparison item.
 * @returns Firm summary.
 */
function firmSummary(item: AdvisorComparisonItem): string {
  if (item.status === "not_found") return "";
  return firmName(item);
}

/**
 * Formats regulatory evidence.
 * @param item - Advisor comparison item.
 * @returns Regulatory summary.
 */
function regulatorySummary(item: AdvisorComparisonItem): string {
  const regulatory = item.regulatory;
  return [
    crdSummary(regulatory),
    `${regulatory.disclosureCount} disclosure${regulatory.disclosureCount === 1 ? "" : "s"}`,
    registrationSummary(regulatory),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Formats the career timeline section.
 * @param item - Advisor comparison item.
 * @returns Career summary.
 */
function careerSummary(item: AdvisorComparisonItem): string {
  if (!item.career.length) return "";
  return item.career
    .slice(0, 3)
    .map(row => {
      const firm = firmNameFromUnknown(row.firm);
      const title = valueText(row.roleTitle);
      return [title, firm].filter(Boolean).join(" at ");
    })
    .filter(Boolean)
    .join("; ");
}

/**
 * Formats rankings and article coverage.
 * @param item - Advisor comparison item.
 * @returns Coverage summary.
 */
function rankingsArticlesSummary(item: AdvisorComparisonItem): string {
  const ranking = item.rankings[0];
  const rankingText = ranking
    ? [
        ranking.entry.rank ? `#${ranking.entry.rank}` : null,
        ranking.ranking?.name || ranking.entry.sourceLabel,
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  return [
    rankingText,
    `${item.articles.length} article${item.articles.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Formats confidence and provenance signals.
 * @param item - Advisor comparison item.
 * @returns Data confidence summary.
 */
function dataConfidenceSummary(item: AdvisorComparisonItem): string {
  const confidence = item.dataConfidence.confidenceSummary;
  const freshness = item.dataConfidence.evidenceFreshness;
  return [
    confidence.hasData
      ? `${confidence.total} source-backed field${confidence.total === 1 ? "" : "s"}`
      : "",
    freshness.hasData && freshness.lastCheckedAt
      ? `Checked ${fmtDate(freshness.lastCheckedAt, { mode: "short" })}`
      : "",
    `${item.attribution.researchSources.length} research source${item.attribution.researchSources.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Extracts a display name from loose firm-like payloads.
 * @param firm - Firm-like unknown payload.
 * @returns Firm name or empty string.
 */
function firmNameFromUnknown(firm: unknown): string {
  if (!firm || typeof firm !== "object") return "";
  const record = firm as Readonly<Record<string, unknown>>;
  return valueText(record.name) || valueText(record.short) || "";
}

/**
 * Formats FINRA CRD details.
 * @param regulatory - Regulatory section payload.
 * @returns CRD summary.
 */
function crdSummary(regulatory: AdvisorComparisonRegulatory): string {
  const snapshot = regulatory.brokerCheckSnapshot;
  if (!snapshot) return "";
  const subjectCrd = (snapshot as unknown as Readonly<Record<string, unknown>>)
    .subjectCrd;
  return subjectCrd ? `CRD ${String(subjectCrd)}` : "BrokerCheck snapshot";
}

/**
 * Formats registration applications.
 * @param regulatory - Regulatory section payload.
 * @returns Registration summary.
 */
function registrationSummary(regulatory: AdvisorComparisonRegulatory): string {
  const count = regulatory.registrationApplications.length;
  return count ? `${count} registration record${count === 1 ? "" : "s"}` : "";
}

/**
 * Formats years of experience.
 * @param years - Experience value.
 * @returns Experience text.
 */
function yearsExperience(years: unknown): string {
  return typeof years === "number" && Number.isFinite(years)
    ? `${years}y experience`
    : "";
}

/**
 * Converts a scalar to display text.
 * @param value - Unknown value.
 * @returns Useful display text.
 */
function valueText(value: unknown): string {
  const text = humanize(value);
  return typeof text === "string" ? text : "";
}

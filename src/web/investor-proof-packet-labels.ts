import type { DataCoverageMetric } from "../harper/resource-data-coverage.js";

/**
 * Formats the data source behind a headline metric for public readers.
 * @param metric - Public coverage metric.
 * @returns Human-facing metric source copy.
 */
export function metricSourceText(metric: DataCoverageMetric): string {
  return `${sourceTableLabel(metric.source)} from ${publicResourceLabel(metric.publicResource)}`;
}

/**
 * Converts public resource paths into product-facing labels.
 * @param resource - Resource path or route from the packet payload.
 * @returns Human-facing resource label.
 */
export function publicResourceLabel(resource: string | null): string {
  switch (resource) {
    case "/AdvisorResearchQueue":
      return "research freshness workbench";
    case "/DataCoverage":
      return "coverage dashboard";
    case "/Feed":
      return "public feed";
    case "/InvestorProofPacket":
      return "investor proof packet";
    case "/PublicAdvisors":
      return "advisor directory";
    case "/PublicBranches":
      return "branch directory";
    case "/PublicFirms":
      return "firm directory";
    case "/PublicTeams":
      return "team directory";
    case "/RankingsExplorer":
      return "rankings explorer";
    case "/RecruitingMarket":
      return "recruiting market map";
    default:
      return routeLabel(resource);
  }
}

/**
 * Converts internal source table names into evidence labels.
 * @param source - Source table name from the packet payload.
 * @returns Human-facing source label.
 */
export function sourceTableLabel(source: string | null): string {
  const table = source?.split(".")[0] ?? null;
  switch (table) {
    case "Advisor":
      return "advisor profiles";
    case "AdvisorResearchCheck":
      return "research freshness checks";
    case "Article":
      return "public articles";
    case "Branch":
      return "branch records";
    case "DataCoverage":
      return "coverage summary";
    case "FieldAssertion":
      return "source-backed facts";
    case "Firm":
      return "firm profiles";
    case "FirmAlias":
      return "firm aliases";
    case "EmploymentHistory":
      return "employment history";
    case "Ranking":
      return "rankings";
    case "RankingEntry":
      return "ranking records";
    case "Team":
      return "team profiles";
    case "TransitionEvent":
      return "recruiting move records";
    case "ArticleTransitionEventMention":
      return "article recruiting references";
    default:
      return routeLabel(source);
  }
}

/**
 * Builds a readable fallback for unknown resource or source identifiers.
 * @param value - Internal path or identifier.
 * @returns Human-facing fallback copy.
 */
function routeLabel(value: string | null): string {
  if (!value) return "public proof source";
  return value
    .replace(/^\/+/u, "")
    .replace(/[-_/]+/gu, " ")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .trim()
    .toLowerCase();
}

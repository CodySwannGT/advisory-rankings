import type { DataCoverageMetric } from "../harper/resource-data-coverage.js";

const SOURCE_TABLE_LABELS: Readonly<Record<string, string>> = {
  Advisor: "advisor profiles",
  AdvisorResearchCheck: "research freshness checks",
  Article: "public articles",
  Branch: "branch records",
  DataCoverage: "coverage summary",
  FieldAssertion: "source-backed facts",
  Firm: "firm profiles",
  FirmAlias: "firm aliases",
  EmploymentHistory: "employment history",
  Ranking: "rankings",
  RankingEntry: "ranking records",
  Team: "team profiles",
  TransitionEvent: "recruiting move records",
  ArticleTransitionEventMention: "article recruiting references",
};

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
  return table
    ? (SOURCE_TABLE_LABELS[table] ?? routeLabel(table))
    : routeLabel(table);
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

import type { ResourceIndex } from "./resource-data.js";
import { loadAll } from "./resource-data.js";
import { rankingsCoverage } from "./resource-rankings-explorer-coverage.js";
import { rankingEntries } from "./resource-rankings-explorer-entries.js";
import { sourceCoverage } from "./resource-recruiting-market-coverage.js";
import {
  recruitingMoves,
  summarizeMoves,
} from "./resource-recruiting-market-helpers.js";
import {
  branchCoverageSection,
  PUBLIC_BRANCHES_RESOURCE,
} from "./resource-data-coverage-branches.js";

/** One coverage metric with its public data source named for clients. */
export interface DataCoverageMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number | string | null;
  readonly source: string;
  readonly publicResource: string | null;
  readonly limitation: string | null;
}

/** Named group of public coverage metrics. */
export interface DataCoverageSection {
  readonly id: string;
  readonly label: string;
  readonly metrics: ReadonlyArray<DataCoverageMetric>;
}

/** Source tables and public resources behind the coverage response. */
export interface DataCoverageProvenance {
  readonly sourceTables: ReadonlyArray<string>;
  readonly publicResources: ReadonlyArray<string>;
}

/** Public `/DataCoverage` response envelope. */
export interface DataCoverageResponse {
  readonly generatedAt: string;
  readonly sections: ReadonlyArray<DataCoverageSection>;
  readonly limitations: ReadonlyArray<string>;
  readonly provenance: DataCoverageProvenance;
}

const ADVISOR_RESEARCH_CHECK_SOURCE = "AdvisorResearchCheck";
const ARTICLE_TRANSITION_MENTION_SOURCE = "ArticleTransitionEventMention";
const DATA_COVERAGE_RANKINGS_EMPTY =
  "No rankings are loaded for this coverage view.";
const FEED_RESOURCE = "/Feed";
const SEARCH_RESOURCE = "/Search";
const RANKINGS_EXPLORER_RESOURCE = "/RankingsExplorer";
const RECRUITING_MARKET_RESOURCE = "/RecruitingMarket";
const ADVISOR_RESEARCH_QUEUE_RESOURCE = "/AdvisorResearchQueue";

/** Read-only public data coverage resource. */
export class DataCoverage extends Resource {
  /**
   * Allows anonymous readers to inspect public coverage rollups.
   * @returns True because the payload excludes private user/workflow rows.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Loads public coverage rollups from the shared resource index.
   * @returns Coverage sections for public entity, rankings, recruiting, and research freshness data.
   */
  async get(): Promise<DataCoverageResponse> {
    return dataCoverageResponse(await loadAll());
  }
}

/**
 * Builds the public coverage response from already-loaded resource rows.
 * @param db Shared Harper resource index.
 * @returns Public `/DataCoverage` response.
 */
export function dataCoverageResponse(db: ResourceIndex): DataCoverageResponse {
  const sections = [
    publicEntitySection(db),
    branchCoverageSection(db),
    rankingsSection(db),
    recruitingSection(db),
    researchFreshnessSection(db),
    sourceContextSection(db),
  ];
  return {
    generatedAt: new Date().toISOString(),
    sections,
    limitations: sections.flatMap(section =>
      section.metrics.flatMap(metric =>
        metric.limitation ? [metric.limitation] : []
      )
    ),
    provenance: {
      sourceTables: [
        "Advisor",
        "Firm",
        "Team",
        "Article",
        "Branch",
        "Ranking",
        "RankingEntry",
        "TransitionEvent",
        ARTICLE_TRANSITION_MENTION_SOURCE,
        "FieldAssertion",
        "FirmAlias",
        ADVISOR_RESEARCH_CHECK_SOURCE,
      ],
      publicResources: [
        "/PublicAdvisors",
        "/PublicFirms",
        "/PublicTeams",
        PUBLIC_BRANCHES_RESOURCE,
        FEED_RESOURCE,
        SEARCH_RESOURCE,
        RANKINGS_EXPLORER_RESOURCE,
        RECRUITING_MARKET_RESOURCE,
        ADVISOR_RESEARCH_QUEUE_RESOURCE,
      ],
    },
  };
}

/**
 * Builds public entity row-count metrics.
 * @param db Shared Harper resource index.
 * @returns Public entity group coverage section.
 */
function publicEntitySection(db: ResourceIndex): DataCoverageSection {
  return {
    id: "public-entity-groups",
    label: "Public entity groups",
    metrics: [
      metric(
        "advisors",
        "Advisors",
        db.advisors.length,
        "Advisor",
        "/PublicAdvisors"
      ),
      metric("firms", "Firms", db.firms.length, "Firm", "/PublicFirms"),
      metric("teams", "Teams", db.teams.length, "Team", "/PublicTeams"),
      metric(
        "articles",
        "Articles",
        db.articles.length,
        "Article",
        FEED_RESOURCE,
        db.articles.length === 0 ? "No public article rows are loaded." : null
      ),
    ],
  };
}

/**
 * Builds rankings metrics from the same coverage model as `/RankingsExplorer`.
 * @param db Shared Harper resource index.
 * @returns Rankings coverage section.
 */
function rankingsSection(db: ResourceIndex): DataCoverageSection {
  const coverage = rankingsCoverage(rankingEntries(db));
  return {
    id: "rankings",
    label: "Rankings coverage",
    metrics: [
      metric(
        "ranking-lists",
        "Ranking lists",
        db.rankings.length,
        "Ranking",
        RANKINGS_EXPLORER_RESOURCE,
        db.rankings.length === 0 ? "No ranking-list rows are loaded." : null
      ),
      metric(
        "ranking-entries",
        "Ranking entries",
        coverage.totalEntries,
        "RankingEntry",
        RANKINGS_EXPLORER_RESOURCE,
        coverage.emptyState === DATA_COVERAGE_RANKINGS_EMPTY
          ? DATA_COVERAGE_RANKINGS_EMPTY
          : (coverage.emptyState ?? null)
      ),
      metric(
        "ranking-gap-buckets",
        "Ranking gap buckets",
        coverage.gapBuckets.length,
        "RankingsExplorer.coverage.gapBuckets",
        RANKINGS_EXPLORER_RESOURCE,
        coverage.gapBuckets.length > 0
          ? "Some ranking entries still need resolution or source fields."
          : null
      ),
    ],
  };
}

/**
 * Builds recruiting metrics from the same move model as `/RecruitingMarket`.
 * @param db Shared Harper resource index.
 * @returns Recruiting coverage section.
 */
function recruitingSection(db: ResourceIndex): DataCoverageSection {
  const moves = recruitingMoves(db);
  const summary = summarizeMoves(moves);
  const coverage = sourceCoverage(moves);
  return {
    id: "recruiting",
    label: "Recruiting coverage",
    metrics: [
      metric(
        "moves",
        "Moves",
        summary.count,
        "TransitionEvent",
        RECRUITING_MARKET_RESOURCE,
        summary.count === 0 ? "No public recruiting moves are loaded." : null
      ),
      metric(
        "source-backed-moves",
        "Source-backed moves",
        coverage.sourceBackedCount,
        ARTICLE_TRANSITION_MENTION_SOURCE,
        RECRUITING_MARKET_RESOURCE,
        coverage.missingSourceCount > 0
          ? "Some recruiting moves do not have source article mentions."
          : null
      ),
      metric(
        "missing-location",
        "Moves missing location",
        coverage.missingLocationCount,
        "Branch",
        RECRUITING_MARKET_RESOURCE,
        coverage.missingLocationCount > 0
          ? "Some recruiting moves cannot resolve a branch location."
          : null
      ),
    ],
  };
}

/**
 * Builds research freshness metrics from public research-check rows.
 * @param db Shared Harper resource index.
 * @returns Research freshness coverage section.
 */
function researchFreshnessSection(db: ResourceIndex): DataCoverageSection {
  const latestCheck = latestIso(
    db.researchChecks.map(row => row.checkedAt).filter(Boolean)
  );
  return {
    id: "research-freshness",
    label: "Research freshness",
    metrics: [
      metric(
        "research-checks",
        "Research checks",
        db.researchChecks.length,
        ADVISOR_RESEARCH_CHECK_SOURCE,
        ADVISOR_RESEARCH_QUEUE_RESOURCE,
        db.researchChecks.length === 0
          ? "No public advisor research checks are loaded."
          : null
      ),
      metric(
        "latest-research-check",
        "Latest research check",
        latestCheck,
        "AdvisorResearchCheck.checkedAt",
        ADVISOR_RESEARCH_QUEUE_RESOURCE,
        latestCheck ? null : "Research freshness is unavailable."
      ),
    ],
  };
}

/**
 * Builds source attribution metrics for the public corpus.
 * @param db Shared Harper resource index.
 * @returns Source context coverage section.
 */
function sourceContextSection(db: ResourceIndex): DataCoverageSection {
  const articleMentionCount =
    db.mAdv.length + db.mFirm.length + db.mTeam.length + db.mTE.length;
  return {
    id: "source-context",
    label: "Source context",
    metrics: [
      metric(
        "field-assertions",
        "Field assertions",
        db.fieldAssertions.length,
        "FieldAssertion",
        null,
        db.fieldAssertions.length === 0
          ? "No field-level source assertions are loaded."
          : "Field assertions are summarized only as aggregate counts."
      ),
      metric(
        "article-mentions",
        "Article mentions",
        articleMentionCount,
        "Article*Mention",
        FEED_RESOURCE,
        articleMentionCount === 0
          ? "No article-to-entity mention rows are loaded."
          : null
      ),
      metric(
        "firm-aliases",
        "Firm aliases",
        db.firmAliases.length,
        "FirmAlias",
        SEARCH_RESOURCE,
        db.firmAliases.length === 0
          ? "Firm alias coverage is unavailable."
          : null
      ),
    ],
  };
}

/**
 * Creates one coverage metric.
 * @param id Stable metric identifier.
 * @param label Human-readable metric label.
 * @param value Numeric, string, or missing metric value.
 * @param source Source table, resource field, or probe.
 * @param publicResource Public resource associated with the metric.
 * @param limitation Missing or stale value explanation.
 * @returns Data coverage metric.
 */
function metric(
  id: string,
  label: string,
  value: number | string | null,
  source: string,
  publicResource: string | null,
  limitation: string | null = null
): DataCoverageMetric {
  return { id, label, value, source, publicResource, limitation };
}

/**
 * Finds the latest valid date and serializes it as ISO.
 * @param values Candidate date-like values.
 * @returns Latest ISO date or null when none parse.
 */
function latestIso(values: ReadonlyArray<unknown>): string | null {
  const latest = values
    .map(value => new Date(String(value)))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return latest?.toISOString() ?? null;
}

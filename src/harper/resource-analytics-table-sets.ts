/**
 * Per-endpoint table sets for the cross-entity analytics/queue
 * resources that read Harper through `loadTables()` in
 * `resource-data.ts`.
 *
 * These endpoints genuinely aggregate across whole tables (rankings
 * facets, coverage rollups, recruiting-market momentum, analyst
 * queues), so their reads cannot be narrowed to a per-subject index the
 * way the profile endpoints were — but none of them consumes all 34
 * tables the legacy `loadAll()` scanned per request. Each constant
 * declares the tables one endpoint (and the shared payload builders it
 * calls) actually reads, which both bounds the per-request scan set and
 * documents the endpoint's data footprint. When a builder gains a new
 * table dependency, add it to the matching set here.
 */
import type { ResourceTableRows } from "./resource-data.js";

/** One endpoint's table-key list into `loadTables()`. */
type TableKeys = readonly (keyof ResourceTableRows)[];

/**
 * Tables `dataCoverageResponse` reads, directly or through the shared
 * ranking-entry and recruiting-move builders.
 */
export const DATA_COVERAGE_TABLES: TableKeys = [
  "advisors",
  "articles",
  "branchCoverages",
  "branches",
  "deals",
  "employments",
  "fieldAssertions",
  "firmAliases",
  "firms",
  "mAdv",
  "mFirm",
  "mTE",
  "mTeam",
  "rankings",
  "rankingEntries",
  "researchChecks",
  "teams",
  "transitions",
];

/**
 * Tables the recruiting endpoints read: `recruitingMoves` itself plus
 * the shared watchlist firm-filter resolution and branch-coverage
 * rollups (`resource-recruiting-watchlist*.ts`).
 */
export const RECRUITING_MOVE_TABLES: TableKeys = [
  "transitions",
  "mTE",
  "articles",
  "branches",
  "employments",
  "firms",
  "firmAliases",
  "deals",
  "teams",
  "advisors",
];

/**
 * Tables `advisorResearchQueueResponse` reads, directly or through the
 * queue-item builder (`resource-advisor-research-items.ts`, which joins
 * an advisor's current firm).
 */
export const ADVISOR_RESEARCH_QUEUE_TABLES: TableKeys = [
  "advisors",
  "researchChecks",
  "employments",
  "firms",
  "firmAliases",
];

/**
 * Tables `/AdvisorComparison` reads: everything `advisorProfilePayload`
 * consumes for up to four advisors (career, compliance, credentials,
 * coverage) plus the ranking/assertion overlays `comparisonItem` adds —
 * i.e. all of `loadAll()` except the article→mention join tables and
 * branch/cluster read models the profile builder never touches.
 */
export const ADVISOR_COMPARISON_TABLES: TableKeys = [
  "advisors",
  "firms",
  "firmAliases",
  "teams",
  "branches",
  "articles",
  "employments",
  "memberships",
  "teamSnaps",
  "advisorSnaps",
  "transitions",
  "deals",
  "disclosures",
  "regulatoryDiscrepancies",
  "correctionRequests",
  "sanctions",
  "obas",
  "regApps",
  "mAdv",
  "fieldAssertions",
  "researchChecks",
  "bcSnaps",
  "licenses",
  "designations",
  "education",
  "rankings",
  "rankingEntries",
];

/**
 * Tables `/InvestorProofPacket` reads: the union of the embedded
 * `/DataCoverage` and `/AdvisorResearchQueue` responses and the
 * recruiting-move builder, plus the feed-card hydration slice used to
 * validate the representative feed link (`feedItem` reads sanctions,
 * disclosures, team snapshots, and the disclosure mention join).
 */
export const INVESTOR_PROOF_PACKET_TABLES: TableKeys = [
  ...new Set<keyof ResourceTableRows>([
    ...DATA_COVERAGE_TABLES,
    ...ADVISOR_RESEARCH_QUEUE_TABLES,
    ...RECRUITING_MOVE_TABLES,
    "teamSnaps",
    "sanctions",
    "disclosures",
    "mDisc",
  ]),
];

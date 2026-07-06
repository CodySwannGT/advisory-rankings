import type {
  ArticleRow,
  FirmRow,
  RankingEntryRow,
  TransitionEventRow,
} from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";
import { loadAll } from "./resource-data.js";
import {
  dataCoverageResponse,
  type DataCoverageMetric,
  type DataCoverageSection,
} from "./resource-data-coverage.js";
import {
  advisorResearchQueueResponse,
  type AdvisorResearchQueueStatusCounts,
} from "./resource-advisor-research-queue.js";
import type { AdvisorResearchQueueItem } from "./resource-advisor-research-items.js";
import type { AdvisorResearchQueuePriorityGroup } from "./resource-advisor-research-priority-groups.js";
import { feedItem } from "./resource-feed.js";
import { canonicalizeForFirmsDirectory } from "./resource-firm-canonicalization.js";
import { compareFirmDirectoryRows } from "./resource-directory-sorting.js";
import { rankingEntries } from "./resource-rankings-explorer-entries.js";
import { recruitingMoves } from "./resource-recruiting-market-helpers.js";

/** One public route or resource that can replay a packet claim. */
export interface InvestorProofLink {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly publicResource: string;
  readonly sourceTable: string;
  readonly sourceIds: ReadonlyArray<string>;
  readonly limitation: string | null;
}

/** Public coverage data summarized for investor packet consumers. */
export interface InvestorProofCoverage {
  readonly sections: ReadonlyArray<DataCoverageSection>;
  readonly keyMetrics: ReadonlyArray<DataCoverageMetric>;
  readonly limitations: ReadonlyArray<string>;
}

/** Public research freshness pressure summarized from `/AdvisorResearchQueue`. */
export interface InvestorProofFreshness {
  readonly totalDue: number;
  readonly returned: number;
  readonly statusCounts: AdvisorResearchQueueStatusCounts;
  readonly priorityGroups: ReadonlyArray<AdvisorResearchQueuePriorityGroup>;
  readonly representativeAdvisors: ReadonlyArray<AdvisorResearchQueueItem>;
  readonly limitation: string | null;
}

/** Public investor proof packet data response. */
export interface InvestorProofPacketResponse {
  readonly generatedAt: string;
  readonly unavailable: ReadonlyArray<string>;
  readonly coverage: InvestorProofCoverage;
  readonly freshness: InvestorProofFreshness;
  readonly proofLinks: ReadonlyArray<InvestorProofLink>;
  readonly provenance: Readonly<
    Record<"publicResources" | "sourceTables", ReadonlyArray<string>>
  >;
}

const DATA_COVERAGE_RESOURCE = "/DataCoverage";
const ADVISOR_RESEARCH_QUEUE_RESOURCE = "/AdvisorResearchQueue";
const FEED_RESOURCE = "/Feed";
const PUBLIC_FIRMS_RESOURCE = "/PublicFirms";
const RANKINGS_EXPLORER_RESOURCE = "/RankingsExplorer";
const RECRUITING_MARKET_RESOURCE = "/RecruitingMarket";
const NO_DUE_RESEARCH_LIMITATION =
  "No due public advisor research rows are available for this packet.";

/** Read-only public investor coverage proof packet data resource. */
export class InvestorProofPacket extends Resource {
  /**
   * Allows anonymous readers to inspect public proof-packet data.
   * @returns True because the response is built only from public resources.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Builds a public-safe investor proof packet from existing resource models.
   * @returns Coverage, freshness, and representative replay links.
   */
  async get(): Promise<InvestorProofPacketResponse> {
    return investorProofPacketResponse(await loadAll());
  }
}

/**
 * Builds the investor proof packet data from already-loaded resource rows.
 * @param db - Shared Harper resource index.
 * @returns Public proof packet data response.
 */
export function investorProofPacketResponse(
  db: ResourceIndex
): InvestorProofPacketResponse {
  const coverage = dataCoverageResponse(db);
  const freshness = advisorResearchQueueResponse(db);
  const proofLinks = representativeProofLinks(db);
  const unavailable = unavailableStates(
    coverage.limitations,
    freshness,
    proofLinks
  );
  return {
    generatedAt: new Date().toISOString(),
    unavailable,
    coverage: {
      sections: coverage.sections,
      keyMetrics: keyMetrics(coverage.sections).map(packetMetric),
      limitations: coverage.limitations,
    },
    freshness: {
      totalDue: freshness.summary.totalDue,
      returned: freshness.summary.returned,
      statusCounts: freshness.summary.statusCounts,
      priorityGroups: freshness.summary.priorityGroups,
      representativeAdvisors: freshness.items.slice(0, 3),
      limitation:
        freshness.summary.returned === 0 ? NO_DUE_RESEARCH_LIMITATION : null,
    },
    proofLinks,
    provenance: {
      publicResources: [
        DATA_COVERAGE_RESOURCE,
        ADVISOR_RESEARCH_QUEUE_RESOURCE,
        FEED_RESOURCE,
        PUBLIC_FIRMS_RESOURCE,
        RANKINGS_EXPLORER_RESOURCE,
        RECRUITING_MARKET_RESOURCE,
      ],
      sourceTables: coverage.provenance.sourceTables,
    },
  };
}

/**
 * Selects stable top-line metrics from `/DataCoverage` sections.
 * @param sections - DataCoverage section payloads.
 * @returns Metrics likely to anchor an investor proof packet.
 */
function keyMetrics(
  sections: ReadonlyArray<DataCoverageSection>
): ReadonlyArray<DataCoverageMetric> {
  const wanted = new Set([
    "advisors",
    "firms",
    "articles",
    "branches",
    "ranking-entries",
    "moves",
    "latest-research-check",
    "field-assertions",
  ]);
  return sections
    .flatMap(section => section.metrics)
    .filter(metric => wanted.has(metric.id));
}

/**
 * Keeps packet headline metrics from turning unavailable proof into zero.
 * @param metric - DataCoverage metric selected for packet display.
 * @returns Packet-safe metric value.
 */
function packetMetric(metric: DataCoverageMetric): DataCoverageMetric {
  if (metric.value === 0 && metric.limitation) {
    return { ...metric, value: null };
  }
  return metric;
}

/**
 * Builds representative replay links from public rows without fixture ids.
 * @param db - Shared Harper resource index.
 * @returns Public proof links with source ids and limitations.
 */
function representativeProofLinks(
  db: ResourceIndex
): ReadonlyArray<InvestorProofLink> {
  return [
    coverageLink(),
    researchLink(db.researchChecks.length),
    feedLink(firstPublicFeedArticle(db)),
    firmLink(firstPublicFirm(db)),
    rankingLink(firstPublicRankingEntry(db)),
    recruitingLink(firstPublicTransition(db)),
  ];
}

/**
 * Builds the stable public coverage dashboard proof link.
 * @returns Public coverage proof link.
 */
function coverageLink(): InvestorProofLink {
  return {
    id: "coverage-dashboard",
    label: "Coverage dashboard",
    url: "/coverage",
    publicResource: DATA_COVERAGE_RESOURCE,
    sourceTable: "DataCoverage",
    sourceIds: [],
    limitation: null,
  };
}

/**
 * Builds the research freshness proof link.
 * @param researchCheckCount - Count of loaded research-check rows.
 * @returns Public research queue link with unavailable-state copy when empty.
 */
function researchLink(researchCheckCount: number): InvestorProofLink {
  return {
    id: "research-freshness",
    label: "Research freshness workbench",
    url: "/research/freshness",
    publicResource: ADVISOR_RESEARCH_QUEUE_RESOURCE,
    sourceTable: "AdvisorResearchCheck",
    sourceIds: [],
    limitation:
      researchCheckCount === 0
        ? "Research freshness proof has no check rows loaded."
        : null,
  };
}

/**
 * Builds a representative article/feed proof link.
 * @param article - First public article row.
 * @returns Public article link or an unavailable placeholder.
 */
function feedLink(article: ArticleRow | null): InvestorProofLink {
  return {
    id: "representative-feed",
    label: article?.headline ?? "Representative feed article",
    url: article ? articleUrl(article) : "/",
    publicResource: FEED_RESOURCE,
    sourceTable: "Article",
    sourceIds: article ? [article.id] : [],
    limitation: article ? null : "No public feed article is available.",
  };
}

/**
 * Builds a representative firm/profile proof link.
 * @param firm - First public firm row.
 * @returns Public firm profile link or an unavailable placeholder.
 */
function firmLink(firm: FirmRow | null): InvestorProofLink {
  return {
    id: "representative-firm",
    label: firm?.name ?? "Representative firm profile",
    url: firm ? `/firm.html?id=${encodeURIComponent(firm.id)}` : "/firms",
    publicResource: PUBLIC_FIRMS_RESOURCE,
    sourceTable: "Firm",
    sourceIds: firm ? [firm.id] : [],
    limitation: firm ? null : "No public firm row is available.",
  };
}

/**
 * Builds a representative ranking proof link.
 * @param entry - First ranking entry row.
 * @returns Public ranking link or an unavailable placeholder.
 */
function rankingLink(entry: RankingEntryRow | null): InvestorProofLink {
  return {
    id: "representative-ranking",
    label: entry?.rawDisplayName ?? "Representative ranking entry",
    url: "/rankings",
    publicResource: RANKINGS_EXPLORER_RESOURCE,
    sourceTable: "RankingEntry",
    sourceIds: entry ? [entry.id] : [],
    limitation: entry ? null : "No public ranking entry is available.",
  };
}

/**
 * Builds a representative recruiting proof link.
 * @param transition - First transition row.
 * @returns Public recruiting link or an unavailable placeholder.
 */
function recruitingLink(
  transition: TransitionEventRow | null
): InvestorProofLink {
  return {
    id: "representative-recruiting",
    label: "Representative recruiting move",
    url: "/recruiting",
    publicResource: RECRUITING_MARKET_RESOURCE,
    sourceTable: "TransitionEvent",
    sourceIds: transition ? [transition.id] : [],
    limitation: transition ? null : "No public recruiting move is available.",
  };
}

/**
 * Finds the first article the public feed builder can shape for routing.
 * @param db - Shared Harper resource index.
 * @returns First article row or null.
 */
function firstPublicFeedArticle(db: ResourceIndex): ArticleRow | null {
  return (
    db.articles.find(article => {
      if (!article.id || !article.headline) return false;
      return feedItem(article, db).article.id === article.id;
    }) ?? null
  );
}

/**
 * Finds the first firm after applying public directory canonicalization.
 * @param db - Shared Harper resource index.
 * @returns First firm row or null.
 */
function firstPublicFirm(db: ResourceIndex): FirmRow | null {
  const { firms } = canonicalizeForFirmsDirectory({
    firms: db.firms,
    firmAliases: db.firmAliases,
  });
  return (
    [...firms]
      .sort(compareFirmDirectoryRows)
      .find(firm => firm.id && firm.name) ?? null
  );
}

/**
 * Finds a representative ranking entry from public explorer entries.
 * @param db - Shared Harper resource index.
 * @returns First ranking entry row or null.
 */
function firstPublicRankingEntry(db: ResourceIndex): RankingEntryRow | null {
  const entry = rankingEntries(db).find(candidate =>
    candidate.provenance.sourceIds.some(isNonEmptyString)
  );
  const id = entry?.provenance.sourceIds.find(isNonEmptyString);
  return id ? (db.rankingEntries.find(row => row.id === id) ?? null) : null;
}

/**
 * Finds a representative transition event from public recruiting moves.
 * @param db - Shared Harper resource index.
 * @returns First transition row or null.
 */
function firstPublicTransition(db: ResourceIndex): TransitionEventRow | null {
  const move = recruitingMoves(db).find(candidate =>
    candidate.provenance.sourceIds.some(isNonEmptyString)
  );
  const id = move?.provenance.sourceIds.find(isNonEmptyString);
  return id ? (db.byTransition.get(id) ?? null) : null;
}

/**
 * Builds the public article URL used by browser routes.
 * @param article - Source article row.
 * @returns Clean article URL when slugged, otherwise legacy id URL.
 */
function articleUrl(article: ArticleRow): string {
  if (article.slug)
    return `/articles/${article.slug}-${encodeURIComponent(article.id)}`;
  return `/article.html?id=${encodeURIComponent(article.id)}`;
}

/**
 * Combines missing-data explanations into packet-level unavailable states.
 * @param coverageLimitations - Limitations from `/DataCoverage`.
 * @param freshness - Research queue response.
 * @param links - Representative proof links.
 * @returns Distinct unavailable-state strings.
 */
function unavailableStates(
  coverageLimitations: ReadonlyArray<string>,
  freshness: ReturnType<typeof advisorResearchQueueResponse>,
  links: ReadonlyArray<InvestorProofLink>
): ReadonlyArray<string> {
  const states = [
    ...coverageLimitations,
    freshness.summary.returned === 0 ? NO_DUE_RESEARCH_LIMITATION : null,
    ...links.map(link => link.limitation),
  ].filter(isNonEmptyString);
  return [...new Set(states)];
}

/**
 * Type predicate for non-empty unavailable-state copy.
 * @param value - Candidate value.
 * @returns True when the value is displayable copy.
 */
function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

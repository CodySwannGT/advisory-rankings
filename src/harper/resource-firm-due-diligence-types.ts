/**
 * Type contracts for `resource-firm-due-diligence.ts`. Extracted to keep that
 * module under the project-wide 300-line cap while preserving the public
 * payload shape consumed by `/FirmProfile` callers.
 */

import type {
  EmploymentHistoryRow,
  HarperDate,
  RankingEntryRow,
  RankingRow,
  TeamRow,
} from "../types/harper-schema.js";

/**
 * Subset of the resource index this module reads. Mirrors the shape built by
 * `buildDb` in `resource-data.ts`, narrowed to the tables and lookup maps the
 * firm due-diligence builder touches.
 */
export interface FirmDueDiligenceDb {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly teams: readonly TeamRow[];
  readonly rankingEntries: readonly RankingEntryRow[];
  readonly byRanking: ReadonlyMap<string, RankingRow>;
}

/**
 * Public BrokerCheck snapshot slice the firm profile passes into due
 * diligence. Producer (`firmBrokerCheckSnapshot` in
 * `resource-profile-endpoints.ts`) is still `@ts-nocheck`'d, so this captures
 * only the fields this module reads.
 */
export interface FirmBrokerCheckSnapshotSlice {
  readonly id?: string;
  readonly fetchedAt?: HarperDate | null;
  readonly subjectCrd?: string | null;
  readonly bcScope?: string | null;
  readonly iaScope?: string | null;
  readonly disclosureCount?: number | null;
  readonly registeredStateCount?: number | null;
}

/**
 * Transition view exposed by `transitionRow` in `resource-feed.ts`. That
 * producer is still `@ts-nocheck`'d, so the chip-shaped fields are typed as
 * `unknown` and narrowed locally where needed.
 */
export interface FirmTransitionRowView {
  readonly id: string;
  readonly subject: unknown;
  readonly fromFirm: unknown;
  readonly toFirm: unknown;
  readonly moveDate?: HarperDate | null;
  readonly aumMoved?: number | string | null;
}

/** Minimal article view consumed by the coverage timeline module. */
export interface FirmArticleStubView {
  readonly id: string;
  readonly publishedDate?: HarperDate | null;
}

/**
 * Profile slice the firm payload hands to `firmDueDiligenceModules`. The
 * outer payload comes from `firmProfilePayload` in
 * `resource-profile-endpoints.ts` (still `@ts-nocheck`'d); this declares only
 * the fields read here.
 */
export interface FirmDueDiligenceProfile {
  readonly currentAdvisorCount: number;
  readonly pastAdvisorCount: number;
  readonly currentTeams: readonly unknown[];
  readonly branches: readonly unknown[];
  readonly articles: readonly FirmArticleStubView[];
  readonly transitionsIn: readonly FirmTransitionRowView[];
  readonly transitionsOut: readonly FirmTransitionRowView[];
  readonly brokerCheckSnapshot: FirmBrokerCheckSnapshotSlice | null;
}

/** Aggregate counts produced by `summarizeTransitions`. */
export interface TransitionsSummary {
  readonly count: number;
  readonly knownAum: number;
  readonly unknownAumCount: number;
}

/** Provenance reference for a module backed by a single source table. */
export interface ProvenanceSingle {
  readonly sourceTable: string;
  readonly sourceIds: readonly string[];
}

/** Provenance reference for a module backed by multiple source tables. */
export interface ProvenanceMultiple {
  readonly sourceTables: readonly string[];
  readonly sourceIds?: readonly string[];
}

/** Per-module freshness annotation surfaced in the public payload. */
export interface FreshnessNote {
  readonly status: "loaded" | "unavailable";
  readonly asOf: HarperDate | string | null;
  readonly note: string;
}

/** Single recent move card surfaced by the recruiting momentum module. */
export interface RecentTransitionMove {
  readonly id: string;
  readonly direction: "inbound" | "outbound";
  readonly subject: unknown;
  readonly fromFirm: unknown;
  readonly toFirm: unknown;
  readonly moveDate: HarperDate | null;
  readonly aumMoved: number | string | null;
}

/** Recruiting momentum module payload. */
export interface RecruitingMomentumModule {
  readonly status: "loaded" | "not_found";
  readonly note: string;
  readonly inbound: TransitionsSummary;
  readonly outbound: TransitionsSummary;
  readonly netMoveCount: number;
  readonly netAumMoved: number;
  readonly recentMoves: readonly RecentTransitionMove[];
  readonly provenance: ProvenanceSingle;
  readonly freshness: FreshnessNote;
}

/** Roster footprint module payload. */
export interface RosterFootprintModule {
  readonly status: "loaded" | "not_found";
  readonly note: string;
  readonly currentAdvisorCount: number;
  readonly pastAdvisorCount: number;
  readonly teamCount: number;
  readonly branchCount: number;
  readonly freshness: FreshnessNote;
  readonly provenance: ProvenanceMultiple;
}

/** Inline ranking reference embedded in a ranking appearance. */
export interface RankingAppearanceRankingRef {
  readonly id: string;
  readonly publisher: string;
  readonly name: string;
  readonly year: number;
  readonly methodologyUrl: string | null;
}

/** Single ranking appearance row included in the rankings module. */
export interface RankingAppearance {
  readonly id: string;
  readonly subjectType: string;
  readonly ranking: RankingAppearanceRankingRef | null;
  readonly rank: number | null;
  readonly scoreTotal: number | null;
  readonly aum: number | null;
  readonly productionT12: number | null;
  readonly regulatoryClean: boolean | null;
}

/** Loaded variant of the ranking presence module. */
interface RankingPresenceLoaded {
  readonly status: "loaded";
  readonly note: string;
  readonly appearances: readonly RankingAppearance[];
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly topRank: number | null;
  readonly provenance: ProvenanceSingle;
  readonly freshness: FreshnessNote;
}

/** Unavailable variant of the ranking presence module. */
interface RankingPresenceUnavailable {
  readonly status: "unavailable";
  readonly note: string;
  readonly appearances: readonly RankingAppearance[];
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly provenance: ProvenanceSingle;
  readonly freshness: FreshnessNote;
}

/** Discriminated union for the ranking presence module payload. */
export type RankingPresenceModule =
  | RankingPresenceLoaded
  | RankingPresenceUnavailable;

/** FINRA BrokerCheck source reference embedded in the regulatory module. */
export interface BrokerCheckSource {
  readonly sourceName: "FINRA BrokerCheck";
  readonly sourceUrl: string;
  readonly termsUrl: string;
  readonly compiledAsOf: HarperDate | null;
}

/** Loaded variant of the regulatory snapshot module. */
interface RegulatorySnapshotLoaded {
  readonly status: "loaded";
  readonly note: string;
  readonly snapshot: FirmBrokerCheckSnapshotSlice;
  readonly source: BrokerCheckSource;
  readonly provenance: ProvenanceSingle;
  readonly freshness: FreshnessNote;
}

/** Unavailable variant of the regulatory snapshot module. */
interface RegulatorySnapshotUnavailable {
  readonly status: "unavailable";
  readonly note: string;
  readonly snapshot: null;
  readonly source: BrokerCheckSource;
  readonly provenance: ProvenanceSingle;
  readonly freshness: FreshnessNote;
}

/** Discriminated union for the regulatory snapshot module payload. */
export type RegulatorySnapshotModule =
  | RegulatorySnapshotLoaded
  | RegulatorySnapshotUnavailable;

/** Coverage timeline module payload. */
export interface CoverageTimelineModule {
  readonly status: "loaded" | "not_found";
  readonly note: string;
  readonly recentArticles: readonly FirmArticleStubView[];
  readonly articleCount: number;
  readonly provenance: ProvenanceMultiple;
  readonly freshness: FreshnessNote;
}

/** Per-module slot map composed into the firm due-diligence payload. */
export interface DueDiligenceModules {
  readonly recruitingMomentum: RecruitingMomentumModule;
  readonly rosterFootprint: RosterFootprintModule;
  readonly rankingPresence: RankingPresenceModule;
  readonly regulatorySnapshot: RegulatorySnapshotModule;
  readonly coverageTimeline: CoverageTimelineModule;
}

/** Single entry in the data-confidence rollup. */
export interface DataConfidenceModuleEntry {
  readonly name: string;
  readonly status: string;
  readonly note: string;
  readonly freshness: FreshnessNote | null;
}

/** Aggregate data-confidence rollup for the firm payload. */
export interface DataConfidenceModule {
  readonly status: "partial" | "unavailable";
  readonly note: string;
  readonly modules: readonly DataConfidenceModuleEntry[];
}

/** Public payload returned by `firmDueDiligenceModules`. */
export interface FirmDueDiligencePayload {
  readonly generatedAt: string;
  readonly firmId: string;
  readonly modules: DueDiligenceModules;
  readonly dataConfidence: DataConfidenceModule;
}

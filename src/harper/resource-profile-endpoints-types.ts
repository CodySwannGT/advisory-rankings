/**
 * Public response types for `src/harper/resource-profile-endpoints.ts`.
 * Extracted to keep the endpoints module under the project-wide 300-line cap
 * while preserving the payload shapes consumed by `Feed`, `ArticleView`,
 * `FirmProfile`, `FirmAdvisors`, `AdvisorProfile`, and `TeamProfile` callers.
 */
import type {
  FeedEmptyState,
  FeedFilters,
  FeedSummary,
  FeedFilterableItem,
} from "./resource-feed-filters.js";
import type {
  FirmDueDiligencePayload,
  FirmDueDiligenceProfile,
} from "./resource-firm-due-diligence.js";
import type { FirmAdvisorRow } from "./resource-firm.js";
import type { ResolvableFirm, ResolvableTeam } from "./resource-routing.js";
import type { TeamMemberGroups } from "./resource-team.js";

/**
 * Loose feed-item shape produced by the still-`@ts-nocheck`'d
 * `feedItem` in `resource-feed.ts`. The full payload carries advisor,
 * firm, and team chip arrays plus the article envelope and event cards;
 * this module only filters and re-emits items, so it sees the producer's
 * shape through the structural slice `FeedFilterableItem` already covers.
 */
export type FeedItem = FeedFilterableItem & Readonly<Record<string, unknown>>;

/** Response shape returned by the public `Feed` resource. */
export interface FeedResponse {
  readonly generatedAt: string;
  readonly count: number;
  readonly filters: FeedFilters;
  readonly summary: FeedSummary;
  readonly emptyState: FeedEmptyState | null;
  readonly items: readonly FeedItem[];
}

/** Article body slice exposed by the article detail resource. */
export interface ArticleBody {
  readonly html: string | null;
  readonly text: string | null;
}

/** Compact provenance row exposed alongside article detail. */
export interface FieldAssertionPayload {
  readonly targetTable: string;
  readonly targetId: string;
  readonly fieldName: string;
  readonly assertedValue: string | undefined;
  readonly quotePhrase: string | undefined;
  readonly confidence: string | undefined;
}

/** Single-article detail response returned by the `ArticleView` resource. */
export interface ArticleDetail extends FeedItem {
  readonly body: ArticleBody;
  readonly provenance: readonly FieldAssertionPayload[];
}

/** Branch slice exposed in the team profile payload. */
export interface TeamProfileBranch {
  readonly id: string;
  readonly name: string | undefined;
  readonly level: string;
  readonly address: string | undefined;
  readonly city: string | undefined;
  readonly state: string | undefined;
  readonly buildingName: string | undefined;
}

/** Response shape returned by the `TeamProfile` resource. */
export interface TeamProfileResponse extends TeamMemberGroups {
  readonly team: ResolvableTeam;
  readonly currentFirm: unknown;
  readonly currentBranch: TeamProfileBranch | null;
  readonly metricSnapshots: readonly unknown[];
  readonly transitions: readonly unknown[];
  readonly articles: readonly unknown[];
}

/** Display short-name overlay merged onto the canonical firm header. */
interface FirmHeaderShort {
  readonly short: string;
}

/** Firm header carried inside the firm profile payload. */
export type FirmProfileHeader = ResolvableFirm & FirmHeaderShort;

/** Body of the firm profile before due-diligence modules are attached. */
export interface FirmProfileBody extends FirmDueDiligenceProfile {
  readonly firm: FirmProfileHeader;
  readonly disclosuresAtThisFirm: readonly unknown[];
}

/** Response shape returned by the `FirmProfile` resource. */
export interface FirmProfileResponse extends FirmProfileBody {
  readonly dueDiligence: FirmDueDiligencePayload;
}

/** Roster row returned by the `FirmAdvisors` resource. */
export type FirmAdvisorPublicRow = Omit<FirmAdvisorRow, "_sortKey" | "_id">;

/** Paged response shape returned by the `FirmAdvisors` resource. */
export interface FirmAdvisorsResponse {
  readonly items: readonly FirmAdvisorPublicRow[];
  readonly nextCursor: string | null;
}

/** Error shape returned for missing or unresolved route ids. */
export interface RouteError {
  readonly error: string;
  readonly id?: string;
  readonly items?: readonly never[];
  readonly nextCursor?: null;
}

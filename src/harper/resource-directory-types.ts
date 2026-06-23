import type {
  AdvisorRow,
  BranchRow,
  EmploymentHistoryRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { AdvisorReadiness } from "./resource-advisor-readiness.js";
import type { BranchGapGroup } from "./resource-branch-gap-groups.js";

/** Entity kinds accepted by the global search endpoint. */
export type SearchKind = "all" | "firm" | "advisor" | "team";

/** Shared cursor-paginated directory envelope. */
export interface DirectoryPage<T> {
  readonly items: ReadonlyArray<T>;
  readonly nextCursor: string | null;
  readonly total: number;
}

/** Normalized advisor directory filters. */
export interface AdvisorDirectoryFilters {
  readonly q: string;
  readonly firm: string;
  readonly careerStatus: string;
  readonly hasCrd: boolean | null;
  readonly contactReadiness: string;
  readonly profileSubstance: string;
  readonly freshness: string;
}

/** Normalized firm directory filters. */
export interface FirmDirectoryFilters {
  readonly q: string;
  readonly channel: string;
  readonly state: string;
  readonly active: boolean | null;
}

/** Normalized team directory filters. */
export interface TeamDirectoryFilters {
  readonly q: string;
  readonly firm: string;
  readonly serviceModel: string;
}

/** Normalized branch directory filters. */
export interface BranchDirectoryFilters {
  readonly q: string;
  readonly firm: string;
  readonly state: string;
  readonly city: string;
  readonly sourceType: string;
  readonly level: string;
  readonly minAdvisorCount: number | null;
}

/** Team row enriched with the current firm name rendered on directory cards. */
export interface TeamDirectoryRow extends TeamRow {
  readonly currentFirmName: string | null;
}

/** Source summary safe to expose on public branch rows. */
export interface BranchSourceSummary {
  readonly sourceTypes: ReadonlyArray<string>;
  readonly sourceRefs: ReadonlyArray<string>;
}

/** Branch row enriched for the public branch explorer resource. */
export interface BranchDirectoryRow extends Pick<
  BranchRow,
  | "id"
  | "firmId"
  | "parentBranchId"
  | "level"
  | "name"
  | "buildingName"
  | "address"
  | "city"
  | "state"
  | "country"
  | "postalCode"
> {
  readonly displayName: string;
  readonly firmName: string | null;
  readonly currentAdvisorCount: number;
  readonly coverageStatus: "loaded" | "partial" | "unavailable";
  readonly gapGroup: BranchGapGroup;
  readonly sourceMetadata: BranchSourceSummary;
}

/** Advisor row with explicit CRD presence for public directory verification. */
export interface AdvisorDirectoryRow extends Omit<AdvisorRow, "finraCrd"> {
  readonly finraCrd: string | null;
  readonly hasCrd: boolean;
  readonly readiness: AdvisorReadiness;
}

/** Canonicalized firm rows returned by the firm alias normalizer. */
export interface CanonicalFirmRows {
  readonly firms: ReadonlyArray<FirmRow>;
}

/** Canonicalized advisor-directory rows returned by the firm alias normalizer. */
export interface CanonicalAdvisorRows {
  readonly firms: ReadonlyArray<FirmRow>;
  readonly employments: ReadonlyArray<EmploymentHistoryRow>;
}

/** Canonicalized team-directory rows returned by the firm alias normalizer. */
export interface CanonicalTeamRows {
  readonly teams: ReadonlyArray<TeamRow>;
  readonly firms: ReadonlyArray<FirmRow>;
}

/** Canonicalized search rows returned by the firm alias normalizer. */
export interface CanonicalSearchRows {
  readonly firms: ReadonlyArray<FirmRow>;
  readonly teams: ReadonlyArray<TeamRow>;
  readonly employments: ReadonlyArray<EmploymentHistoryRow>;
}

/** Primitive-ish values that can participate in text filter matching. */
export type CandidateValue = string | number | boolean | null | undefined;

/** Ranked global search match with an internal sort key. */
export interface SearchMatch {
  readonly kind: Exclude<SearchKind, "all">;
  readonly id: string;
  readonly name: string;
  readonly sub: string | null;
  readonly score: number;
  readonly sortKey: string;
}

/** Search result counts grouped by entity kind. */
export interface SearchCounts {
  readonly firms: number;
  readonly advisors: number;
  readonly teams: number;
  readonly total: number;
}

/** Public global search response shape. */
export interface SearchResponse {
  readonly q: string;
  readonly kind: SearchKind;
  readonly items: ReadonlyArray<Omit<SearchMatch, "sortKey">>;
  readonly counts: SearchCounts;
}

/** Inputs needed to build ranked cross-entity search results. */
export interface RankedSearchInput {
  readonly advisors: ReadonlyArray<AdvisorRow>;
  readonly firms: ReadonlyArray<FirmRow>;
  readonly teams: ReadonlyArray<TeamRow>;
  readonly byFirm: ReadonlyMap<string, FirmRow>;
  readonly currentFirmByAdvisor: ReadonlyMap<string, EmploymentHistoryRow>;
  readonly norm: string;
}

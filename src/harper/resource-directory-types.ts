import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";

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

/** Team row enriched with the current firm name rendered on directory cards. */
export interface TeamDirectoryRow extends TeamRow {
  readonly currentFirmName: string | null;
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

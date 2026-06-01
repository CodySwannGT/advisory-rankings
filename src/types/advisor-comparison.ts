import type { AdvisorProfilePayload } from "./advisor-profile.js";
import type {
  FieldAssertionRow,
  RankingEntryRow,
  RankingRow,
} from "./harper-schema.js";
import type { ResolvableAdvisor } from "../harper/resource-routing.js";

/** Ranking entry enriched with ranking-list metadata. */
export interface AdvisorComparisonRanking {
  readonly entry: RankingEntryRow;
  readonly ranking: RankingRow | null;
}

/** Source assertion proving one public advisor field. */
export interface AdvisorComparisonAssertion {
  readonly articleId: string;
  readonly fieldName: string;
  readonly assertedValue: FieldAssertionRow["assertedValue"];
  readonly quotePhrase: FieldAssertionRow["quotePhrase"];
  readonly confidence: FieldAssertionRow["confidence"];
}

/** Source check summarized for comparison attribution. */
export interface AdvisorComparisonResearchSource {
  readonly sourceType: string;
  readonly status: string;
  readonly checkedAt: unknown;
  readonly sourcesChecked: readonly string[];
}

/** Public source and provenance bundle for one compared advisor. */
export interface AdvisorComparisonAttribution {
  readonly brokerCheck: AdvisorProfilePayload["brokerCheckSnapshot"];
  readonly articles: AdvisorProfilePayload["articles"];
  readonly assertions: readonly AdvisorComparisonAssertion[];
  readonly researchSources: readonly AdvisorComparisonResearchSource[];
}

/** Regulatory evidence exposed for one compared advisor. */
export interface AdvisorComparisonRegulatory {
  readonly brokerCheckSnapshot: AdvisorProfilePayload["brokerCheckSnapshot"];
  readonly disclosures: AdvisorProfilePayload["disclosures"];
  readonly disclosureCount: number;
  readonly registrationApplications: AdvisorProfilePayload["registrationApplications"];
}

/** Confidence and freshness signals for one compared advisor. */
export interface AdvisorComparisonDataConfidence {
  readonly evidenceFreshness: AdvisorProfilePayload["evidenceFreshness"];
  readonly confidenceSummary: AdvisorProfilePayload["confidenceSummary"];
}

/** Comparison request normalization status. */
export type AdvisorComparisonSelectionStatus =
  | "empty_selection"
  | "under_limit"
  | "ready"
  | "over_limit";

/** Stable summary of request ids after comparison normalization. */
export interface AdvisorComparisonSelection {
  readonly status: AdvisorComparisonSelectionStatus;
  readonly requestedIds: readonly string[];
  readonly normalizedIds: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly cappedIds: readonly string[];
  readonly missingIds: readonly string[];
  readonly min: number;
  readonly max: number;
  readonly truncated: boolean;
}

/** One found advisor column in the comparison response. */
export interface AdvisorComparisonFoundItem {
  readonly status: "found";
  readonly id: string;
  readonly identity: ResolvableAdvisor;
  readonly displayName: string;
  readonly firm: unknown;
  readonly regulatory: AdvisorComparisonRegulatory;
  readonly career: AdvisorProfilePayload["career"];
  readonly rankings: readonly AdvisorComparisonRanking[];
  readonly articles: AdvisorProfilePayload["articles"];
  readonly dataConfidence: AdvisorComparisonDataConfidence;
  readonly attribution: AdvisorComparisonAttribution;
}

/** Placeholder row for an advisor id that cannot be resolved. */
export interface AdvisorComparisonNotFoundItem {
  readonly status: "not_found";
  readonly id: string;
  readonly identity: null;
  readonly displayName: string;
  readonly firm: null;
  readonly regulatory: AdvisorComparisonRegulatory;
  readonly career: readonly [];
  readonly rankings: readonly [];
  readonly articles: readonly [];
  readonly dataConfidence: AdvisorComparisonDataConfidence;
  readonly attribution: AdvisorComparisonAttribution;
}

/** One normalized advisor column in the comparison response. */
export type AdvisorComparisonItem =
  | AdvisorComparisonFoundItem
  | AdvisorComparisonNotFoundItem;

/** Public response shape returned by the AdvisorComparison resource. */
export interface AdvisorComparisonPayload {
  readonly generatedAt: string;
  readonly selection: AdvisorComparisonSelection;
  readonly count: number;
  readonly ids: readonly string[];
  readonly items: readonly AdvisorComparisonItem[];
}

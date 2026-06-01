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

/** One normalized advisor column in the comparison response. */
export interface AdvisorComparisonItem {
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

/** Public response shape returned by the AdvisorComparison resource. */
export interface AdvisorComparisonPayload {
  readonly generatedAt: string;
  readonly count: number;
  readonly ids: readonly string[];
  readonly items: readonly AdvisorComparisonItem[];
}

/**
 * Public payload shapes for the advisor profile resource.
 *
 * Split out from `src/harper/resource-advisor.ts` so the implementation
 * module fits under the project-wide `max-lines` threshold. The web UI
 * and any other downstream consumer can import these types here without
 * pulling in Harper runtime dependencies.
 */
import type { CountMap, DateLike } from "../harper/resource-summary-helpers.js";
import type {
  AdvisorCredentialGroups,
  DesignationStub,
  EducationStub,
  LicenseStub,
} from "../harper/resource-advisor-credentials.js";
import type { ResolvableAdvisor } from "../harper/resource-routing.js";
import type {
  BrokerCheckSnapshotRow,
  EmploymentHistoryRow,
  OutsideBusinessActivityRow,
  RegistrationApplicationRow,
  RegulatoryDiscrepancyRow,
  TeamMembershipRow,
} from "./harper-schema.js";

// Re-export credential stub types so the advisor module remains a
// single entry point for callers that only know about the public
// payload surface.
export type { DesignationStub, EducationStub, LicenseStub };

/** Branch slice shown on advisor career rows. */
export interface AdvisorCareerBranch {
  readonly id: string;
  readonly name: string | undefined;
  readonly level: string;
  readonly city: string | undefined;
  readonly state: string | undefined;
}

/**
 * Note on chip shapes: `firm` and `team` fields below are typed as
 * `unknown` until `src/harper/resource-feed.ts` drops `@ts-nocheck`
 * and exports a concrete return type for `firmChip` / `teamChip`. The
 * runtime shape is documented in those helpers; we deliberately do not
 * bake a stricter chip contract into the public advisor payload here.
 */

/** Career row shape returned by `advisorCareer`. */
export interface AdvisorCareerRow {
  readonly firm: unknown;
  readonly branch: AdvisorCareerBranch | null;
  readonly roleTitle: string | undefined;
  readonly roleCategory: string | undefined;
  readonly startDate: EmploymentHistoryRow["startDate"];
  readonly endDate: EmploymentHistoryRow["endDate"];
  readonly reasonForLeaving: string | undefined;
  readonly aumAtDeparture: number | undefined;
  readonly productionT12AtDeparture: number | undefined;
  readonly signingBonusPromissoryNote: boolean | undefined;
  readonly u5Filed: boolean | undefined;
  readonly u5FilingDate: EmploymentHistoryRow["u5FilingDate"];
}

/** Team membership row shape returned by `advisorTeams`. */
export interface AdvisorTeamRow {
  readonly team: unknown;
  readonly role: string | undefined;
  readonly startDate: TeamMembershipRow["startDate"];
  readonly endDate: TeamMembershipRow["endDate"];
}

/** Registration application row shape returned by `advisorRegistrationApplications`. */
export interface AdvisorRegistrationApplicationRow extends RegistrationApplicationRow {
  readonly firm: unknown;
}

/** BrokerCheck snapshot slice returned by `advisorBrokerCheckSnapshot`. */
export interface BrokerCheckSnapshotSlice {
  readonly fetchedAt: BrokerCheckSnapshotRow["fetchedAt"];
  readonly subjectCrd: string;
  readonly bcScope: string | undefined;
  readonly iaScope: string | undefined;
  readonly disclosureCount: number | undefined;
  readonly employmentCount: number | undefined;
  readonly examCount: number | undefined;
}

/** Reviewed regulatory discrepancy note surfaced on public profiles. */
export interface ReviewedRegulatoryDiscrepancyNote {
  readonly id: RegulatoryDiscrepancyRow["id"];
  readonly fieldName: RegulatoryDiscrepancyRow["fieldName"];
  readonly status: RegulatoryDiscrepancyRow["status"];
  readonly severity: RegulatoryDiscrepancyRow["severity"];
  readonly reviewerNote: string;
  readonly reviewedAt: RegulatoryDiscrepancyRow["reviewedAt"];
  readonly brokerCheckValue: RegulatoryDiscrepancyRow["brokerCheckValue"];
  readonly advisorHubValue: RegulatoryDiscrepancyRow["advisorHubValue"];
  readonly brokerCheckSourceRef: RegulatoryDiscrepancyRow["brokerCheckSourceRef"];
}

/** Research-status keys reported by `advisorEvidenceFreshness`. */
export type ResearchStatusKey =
  | "success"
  | "no_new_data"
  | "ambiguous"
  | "failed";

/** Research source-type keys reported by `advisorEvidenceFreshness`. */
export type ResearchSourceTypeKey =
  | "web_research"
  | "firm_bio"
  | "rankings"
  | "press";

/** Source-check freshness summary returned by `advisorEvidenceFreshness`. */
export interface EvidenceFreshness {
  readonly hasData: boolean;
  readonly lastCheckedAt: DateLike;
  readonly nearestNextCheckAfter: DateLike;
  readonly statusCounts: CountMap<ResearchStatusKey>;
  readonly sourceTypeCoverage: CountMap<ResearchSourceTypeKey>;
}

/** Assertion confidence summary returned by `advisorConfidenceSummary`. */
export interface ConfidenceSummary {
  readonly hasData: boolean;
  readonly asserted: number;
  readonly inferred: number;
  readonly derived: number;
  readonly total: number;
}

/** Public advisor profile payload returned by `advisorProfilePayload`. */
export interface AdvisorProfilePayload extends AdvisorCredentialGroups {
  readonly advisor: ResolvableAdvisor;
  readonly displayName: string;
  readonly career: readonly AdvisorCareerRow[];
  readonly teams: readonly AdvisorTeamRow[];
  readonly disclosures: readonly unknown[];
  readonly outsideBusinessActivities: readonly OutsideBusinessActivityRow[];
  readonly registrationApplications: readonly AdvisorRegistrationApplicationRow[];
  readonly transitions: readonly unknown[];
  readonly articles: readonly unknown[];
  readonly brokerCheckSnapshot: BrokerCheckSnapshotSlice | null;
  readonly reviewedRegulatoryDiscrepancies: readonly ReviewedRegulatoryDiscrepancyNote[];
  readonly evidenceFreshness: EvidenceFreshness;
  readonly confidenceSummary: ConfidenceSummary;
}

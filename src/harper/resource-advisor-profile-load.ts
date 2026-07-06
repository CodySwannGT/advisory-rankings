/**
 * Per-request scoped loader for `/AdvisorProfile/<id>`. Replaces the
 * request-wide `loadAll()` 34-table scan with indexed reads keyed by
 * the subject advisor: every related table is fetched through its
 * `@indexed` foreign key (or by primary key via `rowsByIds`), except
 * the article→mention and `FieldAssertion` tables, which are
 * deliberately scanned — see `resource-profile-scoped-load.ts` and
 * `resource-feed-page-load.ts` for the Fabric secondary-index
 * replication rationale.
 */
import type {
  AdvisorCorrectionRequestRow,
  AdvisorMetricSnapshotRow,
  AdvisorResearchCheckRow,
  AdvisorRow,
  ArticleAdvisorMentionRow,
  ArticleRow,
  BranchRow,
  BrokerCheckSnapshotRow,
  DesignationRow,
  DisclosureRow,
  EducationRow,
  EmploymentHistoryRow,
  FieldAssertionRow,
  FirmAliasRow,
  LicenseRow,
  OutsideBusinessActivityRow,
  RecruitingDealQuoteRow,
  RegistrationApplicationRow,
  RegulatoryDiscrepancyRow,
  SanctionRow,
  TeamMembershipRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";

import {
  buildScopedResourceIndex,
  type ResourceIndex,
  type ResourceTableRows,
} from "./resource-data.js";
import { optionalAll } from "./resource-directory-tables.js";
import { resolveAdvisor } from "./resource-routing.js";
import {
  distinctIds,
  firmsByIdsWithCanonical,
  optionalRowsByAttribute,
  rowsByAttributeAcross,
  rowsByIdsOptional,
  scanRowsWhere,
  subjectCandidates,
} from "./resource-profile-scoped-load.js";

const ADVISOR_ID_ATTR = "advisorId";

/**
 * Loads the subject-scoped resource index for one advisor profile
 * request. The returned index contains the subject advisor candidates
 * plus only the related rows `advisorProfilePayload` consumes, shaped
 * exactly like `loadAll()`'s output so the payload builder and the
 * `resolveAdvisor` routing fallback behave identically.
 * @param identifier - Route id or slug for the advisor.
 * @returns Scoped `ResourceIndex` (empty related tables when the
 *   advisor does not resolve, so the caller 404s consistently).
 */
export async function loadAdvisorProfileIndex(
  identifier: string
): Promise<ResourceIndex> {
  const advisors = await subjectCandidates<AdvisorRow>(
    tables.Advisor,
    identifier
  );
  const advisor = resolveAdvisor(
    buildScopedResourceIndex({ advisors }),
    identifier
  );
  if (!advisor) return buildScopedResourceIndex({ advisors });
  const related = await loadAdvisorRelatedRows(advisor.id);
  return buildScopedResourceIndex({ advisors, ...related });
}

/** Rows fetched directly off the subject advisor id. */
interface AdvisorDirectRows {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly memberships: readonly TeamMembershipRow[];
  readonly regApps: readonly RegistrationApplicationRow[];
  readonly transitions: readonly TransitionEventRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly obas: readonly OutsideBusinessActivityRow[];
  readonly regulatoryDiscrepancies: readonly RegulatoryDiscrepancyRow[];
  readonly correctionRequests: readonly AdvisorCorrectionRequestRow[];
  readonly bcSnaps: readonly BrokerCheckSnapshotRow[];
  readonly licenses: readonly LicenseRow[];
  readonly designations: readonly DesignationRow[];
  readonly education: readonly EducationRow[];
  readonly researchChecks: readonly AdvisorResearchCheckRow[];
  readonly advisorSnaps: readonly AdvisorMetricSnapshotRow[];
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly fieldAssertions: readonly FieldAssertionRow[];
}

/**
 * Fetches every table the advisor profile reads keyed by the advisor
 * id, then hydrates the rows those tables reference.
 * @param advisorId - Resolved subject advisor id.
 * @returns Scoped table rows for `buildScopedResourceIndex`.
 */
async function loadAdvisorRelatedRows(
  advisorId: string
): Promise<Partial<ResourceTableRows>> {
  const direct = await loadAdvisorDirectRows(advisorId);
  const referenced = await loadAdvisorReferencedRows(direct);
  return { ...direct, ...referenced };
}

/**
 * Fetches the tables that carry the advisor id as an indexed foreign
 * key, plus the two scan-only tables (`ArticleAdvisorMention`,
 * `FieldAssertion`) filtered in memory.
 * @param advisorId - Resolved subject advisor id.
 * @returns Direct rows keyed like `ResourceTableRows`.
 */
async function loadAdvisorDirectRows(
  advisorId: string
): Promise<AdvisorDirectRows> {
  const byAdvisorId = <T>(table: unknown): Promise<readonly T[]> =>
    optionalRowsByAttribute<T>(table, ADVISOR_ID_ATTR, advisorId);
  const [career, compliance, credentials, scans] = await Promise.all([
    loadAdvisorCareerRows(advisorId),
    loadAdvisorComplianceRows(advisorId),
    Promise.all([
      byAdvisorId<LicenseRow>(tables.License),
      byAdvisorId<DesignationRow>(tables.Designation),
      byAdvisorId<EducationRow>(tables.Education),
      byAdvisorId<AdvisorResearchCheckRow>(tables.AdvisorResearchCheck),
      byAdvisorId<AdvisorMetricSnapshotRow>(tables.AdvisorMetricSnapshot),
    ]),
    loadAdvisorScanRows(advisorId),
  ]);
  const [licenses, designations, education, researchChecks, advisorSnaps] =
    credentials;
  return {
    ...career,
    ...compliance,
    ...scans,
    licenses,
    designations,
    education,
    researchChecks,
    advisorSnaps,
  };
}

/** Career-timeline rows fetched off the advisor id. */
interface AdvisorCareerRows {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly memberships: readonly TeamMembershipRow[];
  readonly regApps: readonly RegistrationApplicationRow[];
  readonly transitions: readonly TransitionEventRow[];
}

/**
 * Fetches the advisor's career-timeline rows via indexed lookups.
 * @param advisorId - Resolved subject advisor id.
 * @returns Employment, membership, registration, and transition rows.
 */
async function loadAdvisorCareerRows(
  advisorId: string
): Promise<AdvisorCareerRows> {
  const [employments, memberships, regApps, transitions] = await Promise.all([
    optionalRowsByAttribute<EmploymentHistoryRow>(
      tables.EmploymentHistory,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<TeamMembershipRow>(
      tables.TeamMembership,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<RegistrationApplicationRow>(
      tables.RegistrationApplication,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<TransitionEventRow>(
      tables.TransitionEvent,
      "subjectAdvisorId",
      advisorId
    ),
  ]);
  return { employments, memberships, regApps, transitions };
}

/** Compliance rows fetched off the advisor id. */
interface AdvisorComplianceRows {
  readonly disclosures: readonly DisclosureRow[];
  readonly obas: readonly OutsideBusinessActivityRow[];
  readonly regulatoryDiscrepancies: readonly RegulatoryDiscrepancyRow[];
  readonly correctionRequests: readonly AdvisorCorrectionRequestRow[];
  readonly bcSnaps: readonly BrokerCheckSnapshotRow[];
}

/**
 * Fetches the advisor's compliance rows via indexed lookups.
 * @param advisorId - Resolved subject advisor id.
 * @returns Disclosure, OBA, discrepancy, correction, and snapshot rows.
 */
async function loadAdvisorComplianceRows(
  advisorId: string
): Promise<AdvisorComplianceRows> {
  const [
    disclosures,
    obas,
    regulatoryDiscrepancies,
    correctionRequests,
    bcSnaps,
  ] = await Promise.all([
    optionalRowsByAttribute<DisclosureRow>(
      tables.Disclosure,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<OutsideBusinessActivityRow>(
      tables.OutsideBusinessActivity,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<RegulatoryDiscrepancyRow>(
      tables.RegulatoryDiscrepancy,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<AdvisorCorrectionRequestRow>(
      tables.AdvisorCorrectionRequest,
      ADVISOR_ID_ATTR,
      advisorId
    ),
    optionalRowsByAttribute<BrokerCheckSnapshotRow>(
      tables.BrokerCheckSnapshot,
      "subjectAdvisorId",
      advisorId
    ),
  ]);
  return {
    disclosures,
    obas,
    regulatoryDiscrepancies,
    correctionRequests,
    bcSnaps,
  };
}

/** Rows from the two replication-affected scan-only tables. */
interface AdvisorScanRows {
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly fieldAssertions: readonly FieldAssertionRow[];
}

/**
 * Reads the two replication-affected tables with a bounded scan and an
 * in-memory advisor filter (see module header).
 * @param advisorId - Resolved subject advisor id.
 * @returns Mention rows and advisor-targeted field assertions.
 */
async function loadAdvisorScanRows(
  advisorId: string
): Promise<AdvisorScanRows> {
  const [mAdv, fieldAssertions] = await Promise.all([
    scanRowsWhere<ArticleAdvisorMentionRow>(
      tables.ArticleAdvisorMention,
      row => row.advisorId === advisorId
    ),
    scanRowsWhere<FieldAssertionRow>(
      tables.FieldAssertion,
      row => row.targetId === advisorId
    ),
  ]);
  return { mAdv, fieldAssertions };
}

/**
 * Hydrates the entities referenced by the advisor's direct rows —
 * sanctions per disclosure, mentioned articles, teams, deals, branches,
 * team snapshots, and firms (widened to canonical alias-merge targets).
 * @param direct - Rows fetched directly off the advisor id.
 * @returns Referenced rows keyed like `ResourceTableRows`.
 */
async function loadAdvisorReferencedRows(
  direct: AdvisorDirectRows
): Promise<Partial<ResourceTableRows>> {
  const [sanctions, articles, teams, deals, branches] = await Promise.all([
    rowsByAttributeAcross<SanctionRow>(
      tables.Sanction,
      "disclosureId",
      distinctIds(direct.disclosures.map(row => row.id))
    ),
    rowsByIdsOptional<ArticleRow>(
      tables.Article,
      distinctIds(direct.mAdv.map(row => row.articleId))
    ),
    rowsByIdsOptional<TeamRow>(
      tables.Team,
      distinctIds([
        ...direct.memberships.map(row => row.teamId),
        ...direct.transitions.map(row => row.subjectTeamId),
      ])
    ),
    rowsByIdsOptional<RecruitingDealQuoteRow>(
      tables.RecruitingDealQuote,
      distinctIds(direct.transitions.map(row => row.recruitingDealId))
    ),
    rowsByIdsOptional<BranchRow>(
      tables.Branch,
      distinctIds(direct.employments.map(row => row.branchId))
    ),
  ]);
  const context = await loadAdvisorFirmContext(direct, teams);
  return { sanctions, articles, teams, deals, branches, ...context };
}

/**
 * Hydrates the firm rows (widened to canonical alias-merge targets),
 * team metric snapshots, and the firm-alias overlay the advisor
 * profile's chips and canonicalization need.
 * @param direct - Rows fetched directly off the advisor id.
 * @param teams - Hydrated teams the advisor belongs to or moved with.
 * @returns Firm-context rows keyed like `ResourceTableRows`.
 */
async function loadAdvisorFirmContext(
  direct: AdvisorDirectRows,
  teams: readonly TeamRow[]
): Promise<Partial<ResourceTableRows>> {
  const [teamSnaps, firms, firmAliases] = await Promise.all([
    rowsByAttributeAcross<TeamMetricSnapshotRow>(
      tables.TeamMetricSnapshot,
      "teamId",
      teams.map(team => team.id)
    ),
    firmsByIdsWithCanonical([
      ...direct.employments.map(row => row.firmId),
      ...direct.regApps.map(row => row.firmId),
      ...direct.disclosures.map(row => row.firmIdAtTime),
      ...direct.transitions.flatMap(row => [
        row.fromFirmId,
        row.toFirmId,
        row.subjectFirmId,
      ]),
      ...teams.map(team => team.currentFirmId),
    ]),
    optionalAll<FirmAliasRow>(tables.FirmAlias),
  ]);
  return { teamSnaps, firms, firmAliases };
}

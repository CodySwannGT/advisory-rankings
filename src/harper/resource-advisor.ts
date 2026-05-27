import { cmpAsc, cmpDesc, dateMs } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";
import type { ResolvableAdvisor } from "./resource-routing.js";
import {
  articleStub,
  disclosureRow,
  firmChip,
  teamChip,
  transitionRow,
} from "./resource-feed.js";
import {
  advisorCredentials,
  type CredentialSource,
} from "./resource-advisor-credentials.js";
import {
  countMap,
  earliestDate,
  latestDate,
} from "./resource-summary-helpers.js";
import type {
  AdvisorCareerRow,
  AdvisorProfilePayload,
  AdvisorRegistrationApplicationRow,
  AdvisorTeamRow,
  BrokerCheckSnapshotSlice,
  ConfidenceSummary,
  EvidenceFreshness,
  ResearchSourceTypeKey,
  ResearchStatusKey,
} from "../types/advisor-profile.js";
import type {
  AdvisorMetricSnapshotRow,
  AdvisorResearchCheckRow,
  AdvisorRow,
  ArticleAdvisorMentionRow,
  ArticleRow,
  BranchRow,
  BrokerCheckSnapshotRow,
  DisclosureRow,
  EmploymentHistoryRow,
  FieldAssertionRow,
  FirmRow,
  OutsideBusinessActivityRow,
  RecruitingDealQuoteRow,
  RegistrationApplicationRow,
  SanctionRow,
  TeamMembershipRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";

const RESEARCH_STATUSES: readonly ResearchStatusKey[] = [
  "success",
  "no_new_data",
  "ambiguous",
  "failed",
];
const RESEARCH_SOURCE_TYPES: readonly ResearchSourceTypeKey[] = [
  "web_research",
  "firm_bio",
  "rankings",
  "press",
];
const CONFIDENCE_LEVELS = ["asserted", "inferred", "derived"] as const;

/**
 * Subset of the resource index this module reads. Mirrors the shape
 * `buildDb` in `resource-data.ts` produces, narrowed to the tables and
 * lookup maps the advisor profile builder touches. Credential tables
 * (`licenses`, `designations`, `education`) are optional because those
 * Harper tables roll out separately and the loader passes them through
 * only when present.
 */
export interface AdvisorProfileDb extends CredentialSource {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly memberships: readonly TeamMembershipRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly sanctions: readonly SanctionRow[];
  readonly obas: readonly OutsideBusinessActivityRow[];
  readonly regApps: readonly RegistrationApplicationRow[];
  readonly transitions: readonly TransitionEventRow[];
  readonly teamSnaps: readonly TeamMetricSnapshotRow[];
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly fieldAssertions: readonly FieldAssertionRow[];
  readonly researchChecks?: readonly AdvisorResearchCheckRow[];
  readonly advisorSnaps?: readonly AdvisorMetricSnapshotRow[];
  readonly byAdvisor: ReadonlyMap<string, AdvisorRow>;
  readonly byFirm: ReadonlyMap<string, FirmRow>;
  readonly byTeam: ReadonlyMap<string, TeamRow>;
  readonly byBranch: ReadonlyMap<string, BranchRow>;
  readonly byArticle: ReadonlyMap<string, ArticleRow>;
  readonly byDeal: ReadonlyMap<string, RecruitingDealQuoteRow>;
  readonly bcSnapByAdvisor: ReadonlyMap<string, BrokerCheckSnapshotRow>;
}

/**
 * Builds the advisor profile response from the loaded table snapshot.
 * @param db - Loaded resource index bundle.
 * @param advisor - Advisor row resolved from the route id.
 * @returns Advisor profile payload consumed by the web UI.
 */
export function advisorProfilePayload(
  db: AdvisorProfileDb,
  advisor: ResolvableAdvisor
): AdvisorProfilePayload {
  const advisorId = advisor.id;
  return {
    advisor,
    displayName: advisorDisplayName(advisor),
    career: advisorCareer(db, advisorId),
    teams: advisorTeams(db, advisorId),
    disclosures: advisorDisclosures(db, advisorId),
    outsideBusinessActivities: db.obas.filter(o => o.advisorId === advisorId),
    registrationApplications: advisorRegistrationApplications(db, advisorId),
    transitions: db.transitions
      .filter(t => t.subjectAdvisorId === advisorId)
      .map(t => transitionRow(t, db)),
    articles: advisorArticles(db, advisorId),
    ...advisorCredentials(db, advisorId),
    brokerCheckSnapshot: advisorBrokerCheckSnapshot(db, advisorId),
    evidenceFreshness: advisorEvidenceFreshness(db, advisorId),
    confidenceSummary: advisorConfidenceSummary(db, advisorId),
  };
}

/**
 * Builds an advisor's employment timeline.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against employment history.
 * @returns Career rows enriched with firm and branch display data.
 */
function advisorCareer(
  db: AdvisorProfileDb,
  advisorId: string
): readonly AdvisorCareerRow[] {
  return db.employments
    .filter(employment => employment.advisorId === advisorId)
    .slice()
    .sort(cmpAsc("startDate"))
    .map(employment => careerRow(employment, db));
}

/**
 * Builds a single career row enriched with firm and branch chips.
 * @param employment - Employment history row to expose.
 * @param db - Loaded resource index bundle.
 * @returns Career row shape returned by `advisorCareer`.
 */
function careerRow(
  employment: EmploymentHistoryRow,
  db: AdvisorProfileDb
): AdvisorCareerRow {
  const firm = db.byFirm.get(employment.firmId);
  const branch = employment.branchId
    ? db.byBranch.get(employment.branchId)
    : null;
  return {
    firm: firmChip(firm),
    branch: branch
      ? {
          id: branch.id,
          name: branch.name,
          level: branch.level,
          city: branch.city,
          state: branch.state,
        }
      : null,
    roleTitle: employment.roleTitle,
    roleCategory: employment.roleCategory,
    startDate: employment.startDate,
    endDate: employment.endDate,
    reasonForLeaving: employment.reasonForLeaving,
    aumAtDeparture: employment.aumAtDeparture,
    productionT12AtDeparture: employment.productionT12AtDeparture,
    signingBonusPromissoryNote: employment.signingBonusPromissoryNote,
    u5Filed: employment.u5Filed,
    u5FilingDate: employment.u5FilingDate,
  };
}

/**
 * Builds team membership rows for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against team memberships.
 * @returns Team memberships enriched with team chips.
 */
function advisorTeams(
  db: AdvisorProfileDb,
  advisorId: string
): readonly AdvisorTeamRow[] {
  return db.memberships
    .filter(membership => membership.advisorId === advisorId)
    .map(membership => ({
      team: teamChip(db.byTeam.get(membership.teamId), db),
      role: membership.role,
      startDate: membership.startDate,
      endDate: membership.endDate,
    }));
}

/**
 * Builds disclosure rows for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against disclosures.
 * @returns Disclosure rows enriched with sanctions and clusters.
 */
function advisorDisclosures(
  db: AdvisorProfileDb,
  advisorId: string
): readonly unknown[] {
  return db.disclosures
    .filter(disclosure => disclosure.advisorId === advisorId)
    .slice()
    .sort(
      (x, y) =>
        dateMs(x.dateInitiated ?? x.dateResolved) -
        dateMs(y.dateInitiated ?? y.dateResolved)
    )
    .map(disclosure => disclosureRow(disclosure, db));
}

/**
 * Builds registration application rows with firm chips.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against registration applications.
 * @returns Registration applications for the advisor profile.
 */
function advisorRegistrationApplications(
  db: AdvisorProfileDb,
  advisorId: string
): readonly AdvisorRegistrationApplicationRow[] {
  return db.regApps
    .filter(row => row.advisorId === advisorId)
    .map(row => ({
      ...row,
      firm: firmChip(db.byFirm.get(row.firmId)),
    }));
}

/**
 * Builds article coverage rows mentioning an advisor.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against article mentions.
 * @returns Compact article summaries in reverse publication order.
 */
function advisorArticles(
  db: AdvisorProfileDb,
  advisorId: string
): readonly unknown[] {
  const articleIds = new Set(
    db.mAdv
      .filter(mention => mention.advisorId === advisorId)
      .map(mention => mention.articleId)
  );
  return [...articleIds]
    .map(articleId => db.byArticle.get(articleId))
    .filter((article): article is ArticleRow => Boolean(article))
    .slice()
    .sort(cmpDesc("publishedDate"))
    .map(articleStub);
}

/**
 * Builds the public BrokerCheck snapshot summary for an advisor.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID used by BrokerCheck snapshot rows.
 * @returns Snapshot summary or null when no snapshot is loaded.
 */
function advisorBrokerCheckSnapshot(
  db: AdvisorProfileDb,
  advisorId: string
): BrokerCheckSnapshotSlice | null {
  const snapshot = db.bcSnapByAdvisor.get(advisorId) ?? null;
  if (!snapshot) return null;
  return {
    fetchedAt: snapshot.fetchedAt,
    subjectCrd: snapshot.subjectCrd,
    bcScope: snapshot.bcScope,
    iaScope: snapshot.iaScope,
    disclosureCount: snapshot.disclosureCount,
    employmentCount: snapshot.employmentCount,
    examCount: snapshot.examCount,
  };
}

/**
 * Summarizes bounded source-check freshness for one advisor.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against research checks.
 * @returns Deterministic freshness summary, including explicit no-data state.
 */
function advisorEvidenceFreshness(
  db: AdvisorProfileDb,
  advisorId: string
): EvidenceFreshness {
  const checks = (db.researchChecks ?? []).filter(
    check => check.advisorId === advisorId
  );

  return {
    hasData: checks.length > 0,
    lastCheckedAt: latestDate(checks.map(check => check.checkedAt)),
    nearestNextCheckAfter: earliestDate(
      checks.map(check => check.nextCheckAfter)
    ),
    statusCounts: countMap(
      RESEARCH_STATUSES,
      checks.map(check => check.status)
    ),
    sourceTypeCoverage: countMap(
      RESEARCH_SOURCE_TYPES,
      checks.map(check => check.sourceType)
    ),
  };
}

/**
 * Counts advisor-targeted assertion confidence values.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against field assertions.
 * @returns Confidence mix with explicit no-data state.
 */
function advisorConfidenceSummary(
  db: AdvisorProfileDb,
  advisorId: string
): ConfidenceSummary {
  const assertions = db.fieldAssertions.filter(
    field =>
      String(field.targetTable ?? "").toLowerCase() === "advisor" &&
      field.targetId === advisorId
  );
  const counts = countMap(
    CONFIDENCE_LEVELS,
    assertions.map(assertion => assertion.confidence)
  );

  return {
    hasData: assertions.length > 0,
    asserted: counts.asserted,
    inferred: counts.inferred,
    derived: counts.derived,
    total: assertions.length,
  };
}

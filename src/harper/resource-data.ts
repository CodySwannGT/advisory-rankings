import type {
  AdvisorMetricSnapshotRow,
  AdvisorResearchCheckRow,
  AdvisorRow,
  AdvisorCorrectionRequestRow,
  ArticleAdvisorMentionRow,
  ArticleDisclosureMentionRow,
  ArticleFirmMentionRow,
  ArticleRow,
  ArticleTeamMentionRow,
  ArticleTransitionEventMentionRow,
  BranchAssignmentRow,
  BranchCoverageRow,
  BranchRow,
  BrokerCheckSnapshotRow,
  DesignationRow,
  DisclosureClusterRow,
  DisclosureRow,
  EducationRow,
  EmploymentHistoryRow,
  FieldAssertionRow,
  FirmAliasRow,
  FirmRow,
  LicenseRow,
  OutsideBusinessActivityRow,
  RankingEntryRow,
  RankingRow,
  RegulatoryDiscrepancyRow,
  RecruitingDealQuoteRow,
  RegistrationApplicationRow,
  SanctionRow,
  TeamMembershipRow,
  TeamMetricSnapshotRow,
  TeamRow,
  TransitionEventRow,
} from "../types/harper-schema.js";

import { canonicalizeFirmResourceRows } from "./resource-firm-canonicalization.js";
import { all, indexBy } from "./resource-pagination.js";

/**
 * Harper table handles consumed by public resource payload builders.
 */
export const RESOURCE_TABLE_SPECS = [
  ["articles", "Article"],
  ["advisors", "Advisor"],
  ["firms", "Firm"],
  ["teams", "Team"],
  ["branches", "Branch"],
  ["employments", "EmploymentHistory"],
  ["memberships", "TeamMembership"],
  ["teamSnaps", "TeamMetricSnapshot"],
  ["advisorSnaps", "AdvisorMetricSnapshot"],
  ["transitions", "TransitionEvent"],
  ["deals", "RecruitingDealQuote"],
  ["disclosures", "Disclosure"],
  ["regulatoryDiscrepancies", "RegulatoryDiscrepancy", true],
  ["correctionRequests", "AdvisorCorrectionRequest", true],
  ["sanctions", "Sanction"],
  ["obas", "OutsideBusinessActivity"],
  ["clusters", "DisclosureCluster"],
  ["regApps", "RegistrationApplication"],
  ["branchAssignments", "BranchAssignment"],
  ["branchCoverages", "BranchCoverage", true],
  ["rankings", "Ranking", true],
  ["rankingEntries", "RankingEntry", true],
  ["mAdv", "ArticleAdvisorMention"],
  ["mFirm", "ArticleFirmMention"],
  ["mTeam", "ArticleTeamMention"],
  ["mTE", "ArticleTransitionEventMention"],
  ["mDisc", "ArticleDisclosureMention"],
  ["fieldAssertions", "FieldAssertion"],
  ["researchChecks", "AdvisorResearchCheck", true],
  ["bcSnaps", "BrokerCheckSnapshot", true],
  ["licenses", "License", true],
  ["designations", "Designation", true],
  ["education", "Education", true],
  ["firmAliases", "FirmAlias", true],
] as const;

export const RESOURCE_TABLE_NAMES = RESOURCE_TABLE_SPECS.map(
  ([, tableName]) => tableName
);

/**
 * Raw row arrays for every table public resources load, keyed by the same
 * endpoint-friendly aliases used by callers. Optional tables (added after
 * the initial schema) default to empty arrays during deploys that have not
 * yet provisioned them.
 */
export interface ResourceTableRows {
  readonly articles: readonly ArticleRow[];
  readonly advisors: readonly AdvisorRow[];
  readonly firms: readonly FirmRow[];
  readonly teams: readonly TeamRow[];
  readonly branches: readonly BranchRow[];
  readonly employments: readonly EmploymentHistoryRow[];
  readonly memberships: readonly TeamMembershipRow[];
  readonly teamSnaps: readonly TeamMetricSnapshotRow[];
  readonly advisorSnaps: readonly AdvisorMetricSnapshotRow[];
  readonly transitions: readonly TransitionEventRow[];
  readonly deals: readonly RecruitingDealQuoteRow[];
  readonly disclosures: readonly DisclosureRow[];
  readonly regulatoryDiscrepancies: readonly RegulatoryDiscrepancyRow[];
  readonly correctionRequests: readonly AdvisorCorrectionRequestRow[];
  readonly sanctions: readonly SanctionRow[];
  readonly obas: readonly OutsideBusinessActivityRow[];
  readonly clusters: readonly DisclosureClusterRow[];
  readonly regApps: readonly RegistrationApplicationRow[];
  readonly branchAssignments: readonly BranchAssignmentRow[];
  readonly branchCoverages: readonly BranchCoverageRow[];
  readonly rankings: readonly RankingRow[];
  readonly rankingEntries: readonly RankingEntryRow[];
  readonly mAdv: readonly ArticleAdvisorMentionRow[];
  readonly mFirm: readonly ArticleFirmMentionRow[];
  readonly mTeam: readonly ArticleTeamMentionRow[];
  readonly mTE: readonly ArticleTransitionEventMentionRow[];
  readonly mDisc: readonly ArticleDisclosureMentionRow[];
  readonly fieldAssertions: readonly FieldAssertionRow[];
  readonly researchChecks: readonly AdvisorResearchCheckRow[];
  readonly bcSnaps: readonly BrokerCheckSnapshotRow[];
  readonly licenses: readonly LicenseRow[];
  readonly designations: readonly DesignationRow[];
  readonly education: readonly EducationRow[];
  readonly firmAliases: readonly FirmAliasRow[];
}

/**
 * Loaded tables plus join indexes used by every profile/listing endpoint.
 *
 * `ResourceIndex` is the load-bearing contract returned by `loadAll()` —
 * downstream resources (`resource-profile-endpoints`, `resource-routing`,
 * `resource-recruiting-market`, etc.) consume this exact shape. New
 * indexes should be added here rather than synthesized at call sites so
 * the type and runtime stay in sync.
 */
export interface ResourceIndex extends ResourceTableRows {
  readonly byAdvisor: ReadonlyMap<string, AdvisorRow>;
  readonly byFirm: ReadonlyMap<string, FirmRow>;
  readonly byTeam: ReadonlyMap<string, TeamRow>;
  readonly byBranch: ReadonlyMap<string, BranchRow>;
  readonly byArticle: ReadonlyMap<string, ArticleRow>;
  readonly byTransition: ReadonlyMap<string, TransitionEventRow>;
  readonly byRanking: ReadonlyMap<string, RankingRow>;
  readonly byDeal: ReadonlyMap<string, RecruitingDealQuoteRow>;
  readonly byDisclosure: ReadonlyMap<string, DisclosureRow>;
  readonly byCluster: ReadonlyMap<string, DisclosureClusterRow>;
  readonly bcSnapByAdvisor: ReadonlyMap<string, BrokerCheckSnapshotRow>;
  readonly bcSnapByFirm: ReadonlyMap<string, BrokerCheckSnapshotRow>;
  readonly firmAliasByNormalized: ReadonlyMap<string, FirmAliasRow>;
}

/**
 * Structural shape `readRows()` needs from a Harper table — search returns
 * an async iterable of rows. Mirrors the adapter type `all()` accepts in
 * `resource-pagination.ts`, kept local so this module does not depend on
 * harperdb's `Table` class shape.
 */
interface SearchableTable {
  readonly search: (
    query: Readonly<Record<string, unknown>>
  ) => AsyncIterable<Readonly<Record<string, unknown>>>;
}

/** Descriptor for one table the resource bundle loads. */
interface ResourceTableSpec {
  readonly key: keyof ResourceTableRows;
  readonly table: SearchableTable | undefined;
  readonly optional: boolean;
}

/** Untyped row shape returned by Harper table reads before per-spec narrowing. */
type RawRow = Readonly<Record<string, unknown>>;
/** Untyped rows-by-key map before per-spec narrowing into `ResourceTableRows`. */
type RawRowsByKey = Readonly<Record<string, readonly RawRow[]>>;
/** Generic accessor that narrows one resource table to its row type. */
type ResourceRowAccessor = <T>(key: keyof ResourceTableRows) => readonly T[];

/**
 * Loads all tables needed by public resources and builds join indexes.
 * @returns Table arrays and maps keyed by primary or foreign IDs.
 */
export async function loadAll(): Promise<ResourceIndex> {
  const rows = await loadTableRows();
  return buildDb(rows);
}

/**
 * Reads Harper tables concurrently so expensive profile endpoints share one pass.
 * @returns Raw row arrays keyed by their resource-friendly names.
 */
async function loadTableRows(): Promise<ResourceTableRows> {
  const entries = await Promise.all(
    tableSpecs().map(
      async (spec): Promise<readonly [string, readonly RawRow[]]> => [
        spec.key,
        await readRows(spec),
      ]
    )
  );
  const rawByKey: RawRowsByKey = Object.fromEntries(entries);
  return canonicalizeFirmRows(rawByKey);
}

/**
 * Lists the tables public resources join together, with optional new tables gated.
 * @returns Table names, Harper handles, and whether missing handles are tolerated.
 */
function tableSpecs(): readonly ResourceTableSpec[] {
  return RESOURCE_TABLE_SPECS.map(([key, tableName, optional]) => ({
    key,
    table: tableHandle(tableName),
    optional: optional === true,
  }));
}

/**
 * Reads a Harper table handle off the ambient `tables` global without
 * casting through the harperdb `Table` class. Returns undefined for
 * optional tables that have not yet been provisioned in the deploy.
 * @param tableName - Harper table name as declared in `schema.graphql`.
 * @returns Searchable table handle, or undefined when absent.
 */
function tableHandle(tableName: string): SearchableTable | undefined {
  const registry = tables as unknown as Readonly<Record<string, unknown>>;
  const candidate = registry[tableName];
  return candidate ? (candidate as SearchableTable) : undefined;
}

/**
 * Applies curated firm alias merges to resource snapshots at read time.
 *
 * Returned shape is narrowed back to `ResourceTableRows`: the
 * canonicalization helper preserves keys verbatim and
 * `narrowResourceTableRows` re-asserts each table key against the
 * declared row type via the `isTypedRowArray` predicate.
 * @param rows - Raw public resource rows keyed by endpoint-friendly names.
 * @returns Rows with duplicate firm ids rewritten to canonical firm ids.
 */
function canonicalizeFirmRows(rows: RawRowsByKey): ResourceTableRows {
  const canonicalized: RawRowsByKey = canonicalizeFirmResourceRows(rows);
  return narrowResourceTableRows(canonicalized);
}

/**
 * Adapter that trusts Harper to honor its declared schema: every loaded
 * row array structurally matches the corresponding `*Row` interface.
 * Rather than runtime-validating every field, this helper enforces the
 * minimum invariant — that each table key exists in the input and points
 * to an array — and lets TypeScript see the narrowed `ResourceTableRows`
 * contract for downstream consumers.
 *
 * Implementation note: the value is exposed through an unknown handoff
 * so downstream code never carries a residual `Record<string, unknown>`
 * row type. Harper schema mismatches are caught by the per-resource code
 * paths that read specific fields, not here.
 * @param rows - Raw rows-by-key map returned by canonicalization.
 * @returns Typed `ResourceTableRows` with every key populated.
 */
function narrowResourceTableRows(rows: RawRowsByKey): ResourceTableRows {
  const at = <T>(key: keyof ResourceTableRows): readonly T[] => {
    const value = rows[key] ?? [];
    if (isTypedRowArray<T>(value)) return value;
    return [];
  };
  return {
    ...narrowCoreResourceRows(at),
    ...narrowExtensionResourceRows(at),
  };
}

/**
 * Narrows the original public resource tables.
 * @param at - Typed row accessor for one table key.
 * @returns Core resource rows.
 */
function narrowCoreResourceRows(
  at: ResourceRowAccessor
): Pick<
  ResourceTableRows,
  | "articles"
  | "advisors"
  | "firms"
  | "teams"
  | "branches"
  | "employments"
  | "memberships"
  | "teamSnaps"
  | "advisorSnaps"
  | "transitions"
  | "deals"
  | "disclosures"
  | "regulatoryDiscrepancies"
  | "correctionRequests"
> {
  return {
    articles: at<ArticleRow>("articles"),
    advisors: at<AdvisorRow>("advisors"),
    firms: at<FirmRow>("firms"),
    teams: at<TeamRow>("teams"),
    branches: at<BranchRow>("branches"),
    employments: at<EmploymentHistoryRow>("employments"),
    memberships: at<TeamMembershipRow>("memberships"),
    teamSnaps: at<TeamMetricSnapshotRow>("teamSnaps"),
    advisorSnaps: at<AdvisorMetricSnapshotRow>("advisorSnaps"),
    transitions: at<TransitionEventRow>("transitions"),
    deals: at<RecruitingDealQuoteRow>("deals"),
    disclosures: at<DisclosureRow>("disclosures"),
    regulatoryDiscrepancies: at<RegulatoryDiscrepancyRow>(
      "regulatoryDiscrepancies"
    ),
    correctionRequests: at<AdvisorCorrectionRequestRow>("correctionRequests"),
  };
}

/** Row group for optional tables added after the initial resource payload. */
type ExtensionResourceRows = Omit<ResourceTableRows, keyof CoreResourceRows>;
/** Row group for the original public resource payload tables. */
type CoreResourceRows = ReturnType<typeof narrowCoreResourceRows>;

/**
 * Narrows optional resource tables added after the initial public payload.
 * @param at - Typed row accessor for one table key.
 * @returns Extension resource rows.
 */
function narrowExtensionResourceRows(
  at: ResourceRowAccessor
): ExtensionResourceRows {
  return {
    sanctions: at<SanctionRow>("sanctions"),
    obas: at<OutsideBusinessActivityRow>("obas"),
    clusters: at<DisclosureClusterRow>("clusters"),
    regApps: at<RegistrationApplicationRow>("regApps"),
    branchAssignments: at<BranchAssignmentRow>("branchAssignments"),
    branchCoverages: at<BranchCoverageRow>("branchCoverages"),
    rankings: at<RankingRow>("rankings"),
    rankingEntries: at<RankingEntryRow>("rankingEntries"),
    mAdv: at<ArticleAdvisorMentionRow>("mAdv"),
    mFirm: at<ArticleFirmMentionRow>("mFirm"),
    mTeam: at<ArticleTeamMentionRow>("mTeam"),
    mTE: at<ArticleTransitionEventMentionRow>("mTE"),
    mDisc: at<ArticleDisclosureMentionRow>("mDisc"),
    fieldAssertions: at<FieldAssertionRow>("fieldAssertions"),
    researchChecks: at<AdvisorResearchCheckRow>("researchChecks"),
    bcSnaps: at<BrokerCheckSnapshotRow>("bcSnaps"),
    licenses: at<LicenseRow>("licenses"),
    designations: at<DesignationRow>("designations"),
    education: at<EducationRow>("education"),
    firmAliases: at<FirmAliasRow>("firmAliases"),
  };
}

/**
 * Typed predicate adapter for Harper row arrays. The arrays come from the
 * harperdb runtime, which has already enforced the `@table` shape declared
 * in `schema.graphql`; per-field runtime re-validation would only duplicate
 * that work without catching anything the per-resource code paths don't
 * already surface. This guard therefore validates only the structural
 * invariant downstream code depends on — that the value is an array — and
 * trusts the runtime for row contents.
 *
 * Kept as a tiny named helper so the I/O trust boundary is grep-able.
 * @param value - Candidate rows pulled from the canonicalization output.
 * @returns True when the candidate is an array; narrows to `readonly T[]`.
 */
function isTypedRowArray<T>(value: unknown): value is readonly T[] {
  return Array.isArray(value);
}

/**
 * Reads one table while letting newer optional tables be absent during deploys.
 * @param spec - Table descriptor from the shared endpoint load plan.
 * @returns All rows for the table, or an empty array for missing optional tables.
 */
async function readRows(spec: ResourceTableSpec): Promise<readonly RawRow[]> {
  if (!spec.table) return [];
  return all<RawRow>(spec.table);
}

/**
 * Builds an index keyed by the named field, restricted to rows that
 * carry a defined string value at that key. Used for the BrokerCheck
 * snapshot indexes where `subjectAdvisorId`/`subjectFirmId` are optional
 * on the row type but required on the relevant filtered subset.
 * @param rows - Source rows to index.
 * @param key - Field name whose string value becomes the map key.
 * @returns Map keyed by the resolved string value.
 */
function indexByDefinedString<T>(
  rows: readonly T[],
  key: (row: T) => string | undefined
): ReadonlyMap<string, T> {
  const entries = rows.flatMap((row): readonly (readonly [string, T])[] => {
    const k = key(row);
    return k ? [[k, row]] : [];
  });
  return new Map(entries);
}

/**
 * Adds lookup maps that keep endpoint code declarative and avoid repeated scans.
 * @param rows - Table arrays loaded from Harper.
 * @returns Row arrays plus maps for primary IDs, foreign IDs, and aliases.
 */
function buildDb(rows: ResourceTableRows): ResourceIndex {
  const advisorBcSnaps = rows.bcSnaps.filter(
    snap => snap.subjectKind === "individual"
  );
  const firmBcSnaps = rows.bcSnaps.filter(snap => snap.subjectKind === "firm");
  return {
    ...rows,
    byAdvisor: indexBy(rows.advisors, "id"),
    byFirm: indexBy(rows.firms, "id"),
    byTeam: indexBy(rows.teams, "id"),
    byBranch: indexBy(rows.branches, "id"),
    byArticle: indexBy(rows.articles, "id"),
    byTransition: indexBy(rows.transitions, "id"),
    byRanking: indexBy(rows.rankings, "id"),
    byDeal: indexBy(rows.deals, "id"),
    byDisclosure: indexBy(rows.disclosures, "id"),
    byCluster: indexBy(rows.clusters, "id"),
    bcSnapByAdvisor: indexByDefinedString(
      advisorBcSnaps,
      snap => snap.subjectAdvisorId
    ),
    bcSnapByFirm: indexByDefinedString(firmBcSnaps, snap => snap.subjectFirmId),
    firmAliasByNormalized: indexBy(rows.firmAliases, "normalizedAlias"),
  };
}

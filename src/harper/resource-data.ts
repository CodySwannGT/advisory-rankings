// @ts-nocheck
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
  ["sanctions", "Sanction"],
  ["obas", "OutsideBusinessActivity"],
  ["clusters", "DisclosureCluster"],
  ["regApps", "RegistrationApplication"],
  ["branchAssignments", "BranchAssignment"],
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
 * Loads all tables needed by public resources and builds join indexes.
 * @returns Table arrays and maps keyed by primary or foreign IDs.
 */
export async function loadAll() {
  const rows = await loadTableRows();
  return buildDb(rows);
}

/**
 * Reads Harper tables concurrently so expensive profile endpoints share one pass.
 * @returns Raw row arrays keyed by their resource-friendly names.
 */
async function loadTableRows() {
  const entries = await Promise.all(
    tableSpecs().map(async spec => [spec.key, await readRows(spec)])
  );
  return canonicalizeFirmRows(Object.fromEntries(entries));
}

/**
 * Lists the tables public resources join together, with optional new tables gated.
 * @returns Table names, Harper handles, and whether missing handles are tolerated.
 */
function tableSpecs() {
  return RESOURCE_TABLE_SPECS.map(([key, tableName, optional]) => ({
    key,
    table: tables[tableName],
    optional,
  }));
}

/**
 * Applies curated firm alias merges to resource snapshots at read time.
 * @param rows - Raw public resource rows keyed by endpoint-friendly names.
 * @returns Rows with duplicate firm ids rewritten to canonical firm ids.
 */
function canonicalizeFirmRows(rows) {
  return canonicalizeFirmResourceRows(rows);
}

/**
 * Reads one table while letting newer optional tables be absent during deploys.
 * @param spec - Table descriptor from the shared endpoint load plan.
 * @returns All rows for the table, or an empty array for missing optional tables.
 */
async function readRows(spec) {
  return spec.optional && !spec.table ? [] : all(spec.table);
}

/**
 * Adds lookup maps that keep endpoint code declarative and avoid repeated scans.
 * @param rows - Table arrays loaded from Harper.
 * @returns Row arrays plus maps for primary IDs, foreign IDs, and aliases.
 */
function buildDb(rows) {
  return {
    ...rows,
    byAdvisor: indexBy(rows.advisors, "id"),
    byFirm: indexBy(rows.firms, "id"),
    byTeam: indexBy(rows.teams, "id"),
    byBranch: indexBy(rows.branches, "id"),
    byArticle: indexBy(rows.articles, "id"),
    byTransition: indexBy(rows.transitions, "id"),
    byRanking: indexBy(rows.rankings || [], "id"),
    byDeal: indexBy(rows.deals, "id"),
    byDisclosure: indexBy(rows.disclosures, "id"),
    byCluster: indexBy(rows.clusters, "id"),
    bcSnapByAdvisor: indexBy(
      (rows.bcSnaps || []).filter(snap => snap.subjectKind === "individual"),
      "subjectAdvisorId"
    ),
    bcSnapByFirm: indexBy(
      (rows.bcSnaps || []).filter(snap => snap.subjectKind === "firm"),
      "subjectFirmId"
    ),
    firmAliasByNormalized: indexBy(rows.firmAliases || [], "normalizedAlias"),
  };
}

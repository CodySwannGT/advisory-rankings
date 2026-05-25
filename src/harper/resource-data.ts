// @ts-nocheck
import { canonicalizeFirmResourceRows } from "./resource-firm-canonicalization.js";
import { all, indexBy } from "./resource-pagination.js";

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
  return [
    ["articles", tables.Article],
    ["advisors", tables.Advisor],
    ["firms", tables.Firm],
    ["teams", tables.Team],
    ["branches", tables.Branch],
    ["employments", tables.EmploymentHistory],
    ["memberships", tables.TeamMembership],
    ["teamSnaps", tables.TeamMetricSnapshot],
    ["advisorSnaps", tables.AdvisorMetricSnapshot],
    ["transitions", tables.TransitionEvent],
    ["deals", tables.RecruitingDealQuote],
    ["disclosures", tables.Disclosure],
    ["sanctions", tables.Sanction],
    ["obas", tables.OutsideBusinessActivity],
    ["clusters", tables.DisclosureCluster],
    ["regApps", tables.RegistrationApplication],
    ["branchAssignments", tables.BranchAssignment],
    ["rankings", tables.Ranking, true],
    ["rankingEntries", tables.RankingEntry, true],
    ["mAdv", tables.ArticleAdvisorMention],
    ["mFirm", tables.ArticleFirmMention],
    ["mTeam", tables.ArticleTeamMention],
    ["mTE", tables.ArticleTransitionEventMention],
    ["mDisc", tables.ArticleDisclosureMention],
    ["fieldAssertions", tables.FieldAssertion],
    ["bcSnaps", tables.BrokerCheckSnapshot, true],
    ["licenses", tables.License, true],
    ["designations", tables.Designation, true],
    ["education", tables.Education, true],
    ["firmAliases", tables.FirmAlias, true],
  ].map(([key, table, optional]) => ({ key, table, optional }));
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

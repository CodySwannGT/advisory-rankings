import { beforeEach, describe, expect, it, vi } from "vitest";

import { tokensForAdvisor } from "../src/lib/advisor-tokens.js";
import { advisorSearchIndexId } from "../src/lib/advisor-search-index.js";

/**
 * Harper resource tests use a small in-memory table snapshot so profile,
 * directory, and feed behavior can be verified without a running Harper node.
 */
const ADVISORHUB_AW_RANKINGS_URL =
  "https://www.advisorhub.com/advisors-to-watch-rankings/";
const STONE_JOINS_EXAMPLE_URL =
  "https://www.advisorhub.com/stone-joins-example/";
const ADVISORHUB_AW_2025_LABEL = "AdvisorHub Advisors to Watch 2025";
const ADVISORHUB_NEXTGEN_2025_LABEL = "AdvisorHub Next Gen 2025";
const FINRA_BROKERCHECK_LABEL = "FINRA BrokerCheck";
const EXAMPLE_WEALTH_MANAGEMENT = "Example Wealth Management";
const EXAMPLE_WEALTH_LLC = "Example Wealth LLC";
const EXAMPLE_WEALTH_SHORT_NAME = "Example Wealth";
const EXAMPLE_WM_SHORT = "Example WM";
const BETA_ADVISORS = "Beta Advisors";
const BETA_ADVISORS_FIRM_CURSOR = "YmV0YSBhZHZpc29ycwBmaXJtLWI";
const AVERY_STONE_NAME = "Avery Stone";
const AVERY_STONE_SLUG = "avery-stone";
const AVERY_STONE_FIRM_BIO_URL = "https://example.com/avery";
const AVERY_STONE_CORRECTED_NAME = "Avery Stone CFP";
const FIRM_BIO_SUPPORTS_UPDATE_NOTE = "Firm bio supports the update.";
const FIRM_BIO_SUBMITTER_NOTE = "Firm bio uses the CFP suffix.";
const CORRECTION_REVIEWED_ID = "correction-reviewed";
const CORRECTION_PENDING_ID = "correction-pending";
const CORRECTION_UNSOURCED_ID = "correction-unsourced";
const CORRECTION_OLD_ID = "correction-old";
const CORRECTION_TIE_ID = "correction-tie";
const CORRECTION_UNKNOWN_ID = "correction-unknown";
const CORRECTION_UNKNOWN_ADVISOR_ID = "advisor-missing";
const BLAKE_YOUNG_NAME = "Blake Young";
const STONE_GROUP_NAME = "Stone Group";
const STONE_ALPHA_CURSOR = "c3RvbmUgYWxwaGEAdGVhbS1h";
const STONE_GROUP_CURSOR = "c3RvbmUgZ3JvdXAAdGVhbS1h";
const STONE_GROUP_SLUG = "stone-group";
const NON_COMPLIANT_TEAM_NAME = "545 Group - NON-COMPLIANT";
const JORDAN_EXAMPLE_NAME = "Jordan Example";
const MORGAN_STANLEY_ID = "8e106b7e-efcc-5aed-8827-fd0ea645b6df";
const MORGAN_STANLEY_NAME = "Morgan Stanley";
const MORGAN_ADVISOR_ID = "advisor-morgan";
const SHORTLIST_MORGAN_FIRM_ID = "firm-morgan";
const SHORTLIST_UBS_NAME = "UBS";
const SHORTLIST_RBC_NAME = "RBC";
const SHORTLIST_MORGAN_LOADED_BRANCH_ID = "branch-morgan-loaded";
const UNRESOLVED_CAPITAL = "Unresolved Capital";
const MORGAN_GAP_NAME = "Morgan Gap";
const TAYLOR_MARKET_NAME = "Taylor Market";
const CASEY_STONE_NAME = "Casey Stone";
const ADVISORS_TO_WATCH_LABEL = "Advisors to Watch";
const BRANCH_ATLANTA_ID = "branch-atlanta";
const BRANCH_AUSTIN_ID = "branch-austin";
const BRANCH_ORPHAN_ID = "branch-orphan";
const BRANCH_GAP_LOADED_ID = "branch-loaded";
const BRANCH_GAP_PARTIAL_ID = "branch-partial";
const BRANCH_GAP_UNAVAILABLE_ID = "branch-unavailable";
const BRANCH_GAP_ZERO_ADVISOR_ID = "branch-zero-advisor";
const BRANCH_GAP_MISSING_SOURCE_ID = "branch-missing-source";
const BRANCH_ATLANTA_CURSOR =
  "ZXhhbXBsZSB3ZWFsdGggbWFuYWdlbWVudABnYQBhdGxhbnRhAGF0bGFudGEgbWFya2V0AGJyYW5jaC1hdGxhbnRh";
const PUBLIC_ADVISORS_RESOURCE = "/PublicAdvisors";
const PUBLIC_BRANCHES_RESOURCE = "/PublicBranches";
const PUBLIC_FIRMS_RESOURCE = "/PublicFirms";
const PUBLIC_TEAMS_RESOURCE = "/PublicTeams";
const FEED_RESOURCE = "/Feed";
const SEARCH_RESOURCE = "/Search";
const RANKINGS_EXPLORER_RESOURCE = "/RankingsExplorer";
const RECRUITING_MARKET_RESOURCE = "/RecruitingMarket";
const ADVISOR_RESEARCH_QUEUE_RESOURCE = "/AdvisorResearchQueue";
const DATA_COVERAGE_RESOURCE = "/DataCoverage";
const RESEARCH_FRESHNESS_SECTION = "research-freshness";
const REPRESENTATIVE_FEED_LINK = "representative-feed";
const REPRESENTATIVE_FIRM_LINK = "representative-firm";
const REPRESENTATIVE_RANKING_LINK = "representative-ranking";
const REPRESENTATIVE_RECRUITING_LINK = "representative-recruiting";
const RANKING_ENTRIES_METRIC = "ranking-entries";
const LATEST_RESEARCH_CHECK_METRIC = "latest-research-check";
const FIELD_ASSERTIONS_METRIC = "field-assertions";
const RESEARCH_FRESHNESS_UNAVAILABLE = "Research freshness is unavailable.";
const COBALT_CAPITAL_FIRM_CURSOR = "Y29iYWx0IGNhcGl0YWwAZmlybS1j";
const EMPLOYMENT_A_ID = "employment-a";
const EMPLOYMENT_B_ID = "employment-b";
const RANKING_ENTRY_A_ID = "ranking-entry-a";
const RANKING_ENTRY_B_ID = "ranking-entry-b";
const TRANSITION_A_ID = "transition-a";
const TRANSITION_TEAM_ID = "transition-team";
const TRANSITION_OUT_ID = "transition-out";
const DISCLOSURE_A_ID = "disclosure-a";
const REGULATORY_DISCREPANCY_A_ID = "reg-discrepancy-a";
const REGULATORY_DISCREPANCY_REVIEWED_ID = "reg-discrepancy-public-reviewed";
const REVIEWED_FINE_AMOUNT = "2500";
const ADVISORHUB_FINE_AMOUNT = "25000";
const CAIRNES_BROKERCHECK_SOURCE_REF = "crd:12345:docket:2023079356701";
const FINE_AMOUNT_FIELD = "fineAmount";
const BROKERCHECK_REVIEWED_NOTE = "BrokerCheck confirms the lower fine amount.";
const COVERAGE_UNRESOLVED_MISSING_SCORE_ID =
  "coverage-unresolved-missing-score";
const COVERAGE_UNRESOLVED_MISSING_MARKET_ID =
  "coverage-unresolved-missing-market";
const STONE_JOINS_EXAMPLE_SLUG = "stone-joins-example";
const SOURCE_BACKED_REASON = "source-backed";
const UNRESOLVED_ENTITY_REASON = "unresolved-entity";
const UNRESOLVED_FIRM_REASON = "unresolved-firm";
const MISSING_SCALE_REASON = "missing-scale";
const MISSING_SOURCE_REASON = "missing-source";
const MISSING_STATE_REASON = "missing-state";
const MISSING_AUM_REASON = "missing-aum";
const MISSING_T12_REASON = "missing-t12";
const MISSING_DEAL_TERMS_REASON = "missing-deal-terms";
const MISSING_UPFRONT_PCT_T12_REASON = "missing-upfront-pct-t12";
const MISSING_TOTAL_PCT_T12_REASON = "missing-total-pct-t12";
const MISSING_PRODUCER_TIER_REASON = "missing-producer-tier";
const MISSING_BACKEND_METRICS_REASON = "missing-backend-metrics";
const MISSING_CLAWBACK_TERMS_REASON = "missing-clawback-terms";
const MISSING_FIRM_REASON = "missing-firm";
const EXAMPLE_WEALTH_QUERY = "example wealth";
const OFFSET_ONE_CURSOR = "MQ";
const DATA_COVERAGE_RANKINGS_EMPTY =
  "No rankings are loaded for this coverage view.";
const DATA_COVERAGE_FIELD_ASSERTIONS_AGGREGATE =
  "Field assertions are summarized only as aggregate counts.";
const DATA_COVERAGE_NO_PUBLIC_ARTICLES = "No public article rows are loaded.";
const DATA_COVERAGE_NO_PUBLIC_RECRUITING_MOVES =
  "No public recruiting moves are loaded.";
const CLIENT_EMAIL = "client@example.test";
const PRIVATE_USER_ID = "private-user";
const EVENT_BACKED_MODE = "event-backed";
const COMPLIANCE_DISCLOSURES_MODE = "compliance-disclosures";
const LOADED_STATUS = "loaded";
const REGULATORY_DISCREPANCY_TABLE = "RegulatoryDiscrepancy";
const ADVISOR_CORRECTION_REQUEST_TABLE = "AdvisorCorrectionRequest";
const ANALYST_EMAIL = "analyst@example.test";
const DATE_2018_01_01 = "2018-01-01";
const DATE_2020_01_01 = "2020-01-01";
const DATE_2021_01_01 = "2021-01-01";
const DATE_2022_01_01 = "2022-01-01";
const DATE_2023_01_01 = "2023-01-01";
const DATE_2024_01_01 = "2024-01-01";
const DATE_2024_04_01 = "2024-04-01";
const DATE_2025_01_02 = "2025-01-02";
const ADVISOR_READY_ID = "advisor-ready";
const ADVISOR_SUBSTANCE_GAP_ID = "advisor-substance-gap";
const DATE_2026_05_25 = "2026-05-25";
const RESEARCH_B_CHECKED_AT = "2026-05-25T12:00:00Z";

class Resource {
  /**
   * Matches the minimal Harper Resource shim shape expected by modules.
   * @returns Null because tests do not use request context.
   */
  getContext() {
    return null;
  }
}

(globalThis as any).Resource = Resource;

const tableRows = new Map<string, any[]>();

const matchEquals = (candidate: any, value: any): boolean =>
  value === null ? candidate == null : candidate === value;

const matchNe = (candidate: any, value: any): boolean =>
  value === null ? candidate != null : candidate !== value;

const matchStartsWith = (candidate: any, value: any): boolean =>
  typeof candidate === "string" && candidate.startsWith(String(value));

const matchGreaterThan = (candidate: any, value: any): boolean =>
  candidate != null && candidate > value;

const matchGreaterThanEqual = (candidate: any, value: any): boolean =>
  candidate != null && candidate >= value;

const matchesCondition = (row: any, condition: any): boolean => {
  const candidate = row?.[condition.attribute];
  const comparator = condition.comparator ?? "equals";
  if (comparator === "starts_with")
    return matchStartsWith(candidate, condition.value);
  if (comparator === "ne" || comparator === "not_equal")
    return matchNe(candidate, condition.value);
  if (comparator === "greater_than")
    return matchGreaterThan(candidate, condition.value);
  if (comparator === "greater_than_equal")
    return matchGreaterThanEqual(candidate, condition.value);
  return matchEquals(candidate, condition.value);
};

const compareValues = (av: any, bv: any): number => {
  if (av === bv) return 0;
  if (av == null) return -1;
  if (bv == null) return 1;
  return av < bv ? -1 : 1;
};

const applySort = (rows: readonly any[], sort: any): readonly any[] => {
  if (!sort) return rows;
  const direction = sort.descending ? -1 : 1;
  return [...rows].sort(
    (a, b) =>
      direction * compareValues(a?.[sort.attribute], b?.[sort.attribute])
  );
};

const matchesAllConditions = (row: any, conditions: readonly any[]): boolean =>
  conditions.every((condition: any) => matchesCondition(row, condition));

/**
 * Streams the rows backing the named in-memory test table that match the
 * supplied Harper-style query (conditions + optional sort/limit/offset),
 * yielding them like a real `tables.X.search()` async iterable would.
 * @param name - Test-shim table name.
 * @param query - Harper-shaped query object (conditions/sort/limit/offset).
 * @yields Rows matching the Harper-style test query.
 */
async function* iterateMatchingRows(name: string, query: any) {
  const conditions = query?.conditions ?? [];
  const allRows = tableRows.get(name) ?? [];
  const filtered = allRows.filter(row => matchesAllConditions(row, conditions));
  const sorted = applySort(filtered, query?.sort);
  const offset = typeof query?.offset === "number" ? query.offset : 0;
  const limit = typeof query?.limit === "number" ? query.limit : sorted.length;
  for (const row of sorted.slice(offset, offset + limit)) yield row;
}

const table = (name: string) => ({
  get: async (id: string) =>
    (tableRows.get(name) ?? []).find(row => row.id === id) ?? null,
  put: async (row: any) => {
    const rows = tableRows.get(name) ?? [];
    const index = rows.findIndex(candidate => candidate.id === row.id);
    if (index === -1) {
      tableRows.set(name, [...rows, row]);
      return;
    }
    tableRows.set(name, [
      ...rows.slice(0, index),
      row,
      ...rows.slice(index + 1),
    ]);
  },
  insert: async (row: any) => {
    await table(name).put(row);
  },
  // Honor the subset of Harper search semantics the rewritten read
  // paths depend on: equality conditions (default), `starts_with`
  // btree-range, `ne` null-emptiness, `sort`, `limit`, and `offset`.
  search: (query?: any) => iterateMatchingRows(name, query),
});

(globalThis as any).tables = {
  Advisor: table("Advisor"),
  AdvisorMetricSnapshot: table("AdvisorMetricSnapshot"),
  AdvisorSearchIndex: table("AdvisorSearchIndex"),
  Article: table("Article"),
  ArticleAdvisorMention: table("ArticleAdvisorMention"),
  ArticleDisclosureMention: table("ArticleDisclosureMention"),
  ArticleFirmMention: table("ArticleFirmMention"),
  ArticleTeamMention: table("ArticleTeamMention"),
  ArticleTransitionEventMention: table("ArticleTransitionEventMention"),
  Branch: table("Branch"),
  BranchAssignment: table("BranchAssignment"),
  BrokerCheckSnapshot: table("BrokerCheckSnapshot"),
  Designation: table("Designation"),
  Disclosure: table("Disclosure"),
  DisclosureCluster: table("DisclosureCluster"),
  Education: table("Education"),
  EmploymentHistory: table("EmploymentHistory"),
  FieldAssertion: table("FieldAssertion"),
  Firm: table("Firm"),
  FirmAlias: table("FirmAlias"),
  License: table("License"),
  OutsideBusinessActivity: table("OutsideBusinessActivity"),
  Ranking: table("Ranking"),
  RankingEntry: table("RankingEntry"),
  RegulatoryDiscrepancy: table(REGULATORY_DISCREPANCY_TABLE),
  AdvisorCorrectionRequest: table(ADVISOR_CORRECTION_REQUEST_TABLE),
  AdvisorResearchCheck: table("AdvisorResearchCheck"),
  RecruitingDealQuote: table("RecruitingDealQuote"),
  RegistrationApplication: table("RegistrationApplication"),
  Sanction: table("Sanction"),
  Team: table("Team"),
  TeamMembership: table("TeamMembership"),
  TeamMetricSnapshot: table("TeamMetricSnapshot"),
  TransitionEvent: table("TransitionEvent"),
  UserRating: table("UserRating"),
  UserWatchlist: table("UserWatchlist"),
  UserWatchlistEntry: table("UserWatchlistEntry"),
};

const resources = await import("../src/harper/resources.js");
const resourceData = await import("../src/harper/resource-data.js");
const routing = await import("../src/harper/resource-routing.js");
const search = await import("../src/harper/resource-search.js");
const feed = await import("../src/harper/resource-feed.js");
const advisorResource = await import("../src/harper/resource-advisor.js");
const advisorFirmResource =
  await import("../src/harper/resource-directory-advisor-firm.js");
const firmResource = await import("../src/harper/resource-firm.js");
const firmDueDiligenceResource =
  await import("../src/harper/resource-firm-due-diligence.js");

const rebuildAdvisorSearchIndex = (advisorRows: readonly any[]) => {
  const tokenRows = advisorRows.flatMap((advisor: any) =>
    tokensForAdvisor(advisor as any).map(({ token, kind }) => ({
      id: advisorSearchIndexId(advisor.id, kind, token),
      advisorId: advisor.id,
      token,
      kind,
    }))
  );
  tableRows.set("AdvisorSearchIndex", [...tokenRows]);
};

const setRows = (name: string, rows: any[]) => {
  tableRows.set(name, rows);
  // Mirror the production write hook: any change to Advisor rows
  // re-emits the AdvisorSearchIndex token rows so the q-path queries
  // see a consistent inverted index without per-test plumbing.
  if (name === "Advisor") rebuildAdvisorSearchIndex(rows);
};

const routeTarget = (
  id: string,
  params: Record<string, string | string[]> = {}
) => ({
  id,
  get: (name: string) => {
    const value = params[name];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  },
  getAll: (name: string) => {
    const value = params[name];
    if (Array.isArray(value)) return value;
    return value == null ? [] : [value];
  },
  toString: () => id,
});

const metricById = (payload: any, id: string): any =>
  payload.sections
    .flatMap((section: any) => section.metrics)
    .find((metric: any) => metric.id === id);

const proofLinkById = (payload: any, id: string): any =>
  payload.proofLinks.find((link: any) => link.id === id);

const dataCoverageMetrics = (payload: any): any[] =>
  payload.sections.flatMap((section: any) => section.metrics);

const expectDataCoverageMetricContract = (payload: any) => {
  for (const metric of dataCoverageMetrics(payload)) {
    expect(metric.source).toEqual(expect.any(String));
    expect(metric.source.length).toBeGreaterThan(0);
    expect(metric.publicResource || metric.limitation).toBeTruthy();
  }
};

const baseRows = () => {
  setRows("Firm", [
    {
      id: "firm-a",
      name: EXAMPLE_WEALTH_MANAGEMENT,
      slug: "example-wealth",
      hqCity: "Atlanta",
      hqState: "GA",
      channel: "ria",
      logoUrl: "https://example.com/logo.png",
    },
    { id: "firm-b", name: BETA_ADVISORS, slug: "beta-advisors" },
  ]);
  setRows("FirmAlias", [
    {
      id: "alias-a",
      alias: EXAMPLE_WEALTH_LLC,
      normalizedAlias: EXAMPLE_WEALTH_QUERY,
      firmId: "firm-a",
    },
  ]);
  setRows("Advisor", [
    {
      id: "advisor-a",
      firstName: "Avery",
      lastName: "Stone",
      legalName: AVERY_STONE_NAME,
      slug: AVERY_STONE_SLUG,
      careerStatus: "active",
      headshotUrl: "https://example.com/avery.jpg",
    },
    {
      id: "advisor-b",
      firstName: "Blake",
      lastName: "Young",
      legalName: BLAKE_YOUNG_NAME,
      careerStatus: "retired",
    },
  ]);
  setRows("Team", [
    {
      id: "team-a",
      name: STONE_GROUP_NAME,
      slug: STONE_GROUP_SLUG,
      currentFirmId: "firm-a",
      currentBranchId: "branch-a",
      serviceModel: "ensemble",
    },
  ]);
  setRows("Branch", [
    {
      id: "branch-a",
      firmId: "firm-a",
      name: "Atlanta",
      level: "office",
      city: "Atlanta",
      state: "GA",
      address: "1 Main",
    },
  ]);
  setRows("EmploymentHistory", [
    {
      id: EMPLOYMENT_A_ID,
      advisorId: "advisor-a",
      firmId: "firm-a",
      branchId: "branch-a",
      roleTitle: "Partner",
      roleCategory: "advisor",
      startDate: DATE_2020_01_01,
    },
    {
      id: EMPLOYMENT_B_ID,
      advisorId: "advisor-b",
      firmId: "firm-a",
      roleTitle: "Advisor",
      startDate: DATE_2018_01_01,
      endDate: DATE_2021_01_01,
      reasonForLeaving: "retired",
    },
  ]);
  setRows("TeamMembership", [
    {
      id: "membership-a",
      advisorId: "advisor-a",
      teamId: "team-a",
      role: "lead",
      startDate: DATE_2020_01_01,
    },
    {
      id: "membership-b",
      advisorId: "advisor-b",
      teamId: "team-a",
      role: "alum",
      startDate: DATE_2018_01_01,
      endDate: DATE_2021_01_01,
    },
  ]);
  setRows("TeamMetricSnapshot", [
    {
      id: "snap-team-a",
      teamId: "team-a",
      asOf: "2024-12-31",
      aum: 1_200_000_000,
      teamSize: 2,
    },
  ]);
  setRows("Ranking", [
    {
      id: "ranking-a",
      publisher: "AdvisorHub",
      name: ADVISORS_TO_WATCH_LABEL,
      year: 2025,
      subjectType: "advisor",
      methodologyUrl: ADVISORHUB_AW_RANKINGS_URL,
    },
    {
      id: "ranking-b",
      publisher: "AdvisorHub",
      name: "Next Gen",
      year: 2025,
      subjectType: "advisor",
      methodologyUrl: ADVISORHUB_AW_RANKINGS_URL,
    },
  ]);
  setRows("RankingEntry", [
    {
      id: RANKING_ENTRY_A_ID,
      rankingId: "ranking-a",
      subjectAdvisorId: "advisor-a",
      firmId: "firm-a",
      rawDisplayName: AVERY_STONE_NAME,
      firmText: EXAMPLE_WEALTH_LLC,
      city: "Atlanta",
      state: "GA",
      sourceUrl: ADVISORHUB_AW_RANKINGS_URL,
      sourceLabel: ADVISORHUB_AW_2025_LABEL,
      loadedAt: DATE_2026_05_25,
      resolutionStatus: "resolved",
      rank: 12,
      scoreTotal: 92.4,
      scoreScale: 87.2,
      scoreGrowth: 91.5,
      aum: 1_200_000_000,
      regulatoryClean: true,
    },
    {
      id: RANKING_ENTRY_B_ID,
      rankingId: "ranking-b",
      rawDisplayName: JORDAN_EXAMPLE_NAME,
      firmText: UNRESOLVED_CAPITAL,
      city: "Austin",
      state: "TX",
      sourceUrl: "https://www.advisorhub.com/advisors-to-watch-next-gen-2025/",
      sourceLabel: ADVISORHUB_NEXTGEN_2025_LABEL,
      loadedAt: DATE_2026_05_25,
      resolutionStatus: "unresolved",
      rank: 3,
      scoreScale: null,
      scoreGrowth: 76.4,
    },
  ]);
  setRows("AdvisorMetricSnapshot", []);
  setRows("TransitionEvent", [
    {
      id: TRANSITION_A_ID,
      subjectAdvisorId: "advisor-a",
      fromFirmId: "firm-b",
      toFirmId: "firm-a",
      toBranchId: "branch-a",
      moveDate: "2024-02-01",
      aumMoved: 500_000_000,
      productionT12: 1_500_000,
      recruitingDealId: "deal-a",
    },
    {
      id: TRANSITION_TEAM_ID,
      subjectTeamId: "team-a",
      fromFirmId: "firm-b",
      toFirmId: "firm-a",
      toBranchId: "branch-a",
      moveDate: "2024-03-01",
    },
    {
      id: TRANSITION_OUT_ID,
      subjectAdvisorId: "advisor-b",
      fromFirmId: "firm-a",
      toFirmId: "firm-b",
      fromBranchId: "branch-a",
      moveDate: DATE_2024_04_01,
      aumMoved: null,
    },
  ]);
  setRows("RecruitingDealQuote", [
    {
      id: "deal-a",
      upfrontPctT12: 180,
      producerTier: "top",
      sourceArticleId: "article-a",
    },
  ]);
  setRows("Disclosure", [
    {
      id: DISCLOSURE_A_ID,
      advisorId: "advisor-a",
      firmIdAtTime: "firm-a",
      disclosureType: "customer",
      regulator: "FINRA",
      dateInitiated: DATE_2022_01_01,
      allegationText: "Unsuitable recommendation",
    },
  ]);
  setRows(REGULATORY_DISCREPANCY_TABLE, [
    {
      id: REGULATORY_DISCREPANCY_A_ID,
      advisorId: "advisor-a",
      fieldName: FINE_AMOUNT_FIELD,
      advisorHubSourceType: "advisorhub_article",
      advisorHubSourceRef: "article-b",
      advisorHubValue: ADVISORHUB_FINE_AMOUNT,
      brokerCheckSourceType: "brokercheck",
      brokerCheckSourceRef: CAIRNES_BROKERCHECK_SOURCE_REF,
      brokerCheckValue: REVIEWED_FINE_AMOUNT,
      sourceMetadata: JSON.stringify({
        regulator: "FINRA",
        docketNumber: "2023079356701",
        advisorHubDisclosureId: DISCLOSURE_A_ID,
      }),
      severity: "high",
      status: "open",
      reviewerNote: "Review known Cairnes fine mismatch.",
      createdAt: DATE_2026_05_25,
    },
    {
      id: "reg-discrepancy-resolved",
      advisorId: "advisor-b",
      fieldName: "status",
      severity: "medium",
      status: "resolved",
    },
  ]);
  setRows("Sanction", [
    {
      id: "sanction-a",
      disclosureId: DISCLOSURE_A_ID,
      sanctionType: "fine",
      amount: 25000,
    },
  ]);
  setRows("DisclosureCluster", [{ id: "cluster-a" }]);
  setRows("OutsideBusinessActivity", [
    { id: "oba-a", advisorId: "advisor-a", activityName: "Board" },
  ]);
  setRows("RegistrationApplication", [
    { id: "reg-a", advisorId: "advisor-a", firmId: "firm-a" },
  ]);
  setRows("License", [
    {
      id: "license-a",
      advisorId: "advisor-a",
      licenseType: "Series 7",
      state: "GA",
      grantedDate: "2019-01-01",
      status: "active",
    },
  ]);
  setRows("Designation", [
    {
      id: "designation-a",
      advisorId: "advisor-a",
      code: "CFP",
      earnedDate: DATE_2020_01_01,
      status: "active",
    },
  ]);
  setRows("Education", [
    {
      id: "education-a",
      advisorId: "advisor-a",
      institution: "State University",
      degree: "BS",
      graduationYear: 2015,
    },
  ]);
  setRows("BrokerCheckSnapshot", [
    {
      id: "bc-advisor",
      subjectKind: "individual",
      subjectAdvisorId: "advisor-a",
      fetchedAt: "2025-01-01",
      subjectCrd: "12345",
      disclosureCount: 1,
    },
    {
      id: "bc-firm",
      subjectKind: "firm",
      subjectFirmId: "firm-a",
      fetchedAt: DATE_2025_01_02,
      subjectCrd: "67890",
      registeredStateCount: 12,
    },
  ]);
  setRows("Article", [
    {
      id: "article-a",
      headline: "Stone joins Example",
      url: STONE_JOINS_EXAMPLE_URL,
      slug: STONE_JOINS_EXAMPLE_SLUG,
      publishedDate: "2025-02-01",
      bodyText:
        "Avery Stone joined Example Wealth Management with a large team and client base.",
      authors: ["Reporter"],
      category: "moves",
    },
    {
      id: "article-b",
      headline: "Disclosure update",
      slug: "disclosure-update",
      publishedDate: "2025-01-15",
      category: "compliance",
    },
  ]);
  setRows("ArticleAdvisorMention", [
    { id: "mention-advisor", articleId: "article-a", advisorId: "advisor-a" },
  ]);
  setRows("ArticleFirmMention", [
    { id: "mention-firm", articleId: "article-a", firmId: "firm-a" },
  ]);
  setRows("ArticleTeamMention", [
    { id: "mention-team", articleId: "article-a", teamId: "team-a" },
  ]);
  setRows("ArticleTransitionEventMention", [
    {
      id: "mention-transition",
      articleId: "article-a",
      transitionEventId: TRANSITION_A_ID,
    },
  ]);
  setRows("ArticleDisclosureMention", [
    {
      id: "mention-disclosure",
      articleId: "article-b",
      disclosureId: DISCLOSURE_A_ID,
    },
  ]);
  setRows("FieldAssertion", [
    {
      id: "field-a",
      articleId: "article-a",
      targetTable: "Advisor",
      targetId: "advisor-a",
      fieldName: "legalName",
      assertedValue: JSON.stringify(AVERY_STONE_NAME),
      quotePhrase: AVERY_STONE_NAME,
      confidence: "asserted",
    },
    {
      id: "field-b",
      articleId: "article-b",
      targetTable: "Advisor",
      targetId: "advisor-a",
      fieldName: "roleTitle",
      assertedValue: JSON.stringify("Partner"),
      quotePhrase: "Partner",
      confidence: "inferred",
    },
    {
      id: "field-c",
      articleId: "article-b",
      targetTable: "Advisor",
      targetId: "advisor-a",
      fieldName: "careerStatus",
      assertedValue: JSON.stringify("active"),
      quotePhrase: "active",
      confidence: "derived",
    },
  ]);
  setRows("AdvisorResearchCheck", [
    {
      id: "research-a",
      advisorId: "advisor-a",
      sourceType: "web_research",
      checkedAt: "2026-05-24T10:00:00Z",
      status: "success",
      sourcesChecked: [AVERY_STONE_FIRM_BIO_URL],
      nextCheckAfter: "2026-06-15T00:00:00Z",
    },
    {
      id: "research-b",
      advisorId: "advisor-a",
      sourceType: "firm_bio",
      checkedAt: RESEARCH_B_CHECKED_AT,
      status: "ambiguous",
      sourcesChecked: ["https://example.com/team"],
      nextCheckAfter: "2026-06-01T00:00:00Z",
    },
  ]);
  setRows("UserRating", []);
  setRows(ADVISOR_CORRECTION_REQUEST_TABLE, []);
};

beforeEach(() => {
  tableRows.clear();
  baseRows();
});

describe("Harper resource routing helpers", () => {
  it("normalizes ids and resolves aliases, slugs, and display names", async () => {
    const db = await resourceData.loadAll();

    expect(routing.normalizeId({ id: AVERY_STONE_SLUG })).toBe(
      AVERY_STONE_SLUG
    );
    expect(routing.normalizeId("/advisor-a")).toBe("advisor-a");
    expect(routing.slugifyText("Example Wealth & Co.")).toBe(
      "example-wealth-and-co"
    );
    expect(routing.normalizeFirmAlias("Example Wealth, LLC")).toBe(
      EXAMPLE_WEALTH_QUERY
    );
    expect(routing.resolveFirm(db, EXAMPLE_WEALTH_LLC)?.id).toBe("firm-a");
    expect(routing.resolveAdvisor(db, AVERY_STONE_NAME)?.id).toBe("advisor-a");
    expect(routing.resolveTeam(db, STONE_GROUP_SLUG)?.id).toBe("team-a");
    expect(routing.resolveArticle(db, "Stone joins Example")?.id).toBe(
      "article-a"
    );
    expect(routing.advisorDisplayName({ preferredName: "Ave" })).toBe("Ave");
    expect(routing.firmShort(EXAMPLE_WEALTH_MANAGEMENT)).toBe(EXAMPLE_WM_SHORT);
  });
});

describe("Harper feed and profile builders", () => {
  it("builds feed cards with enriched chips and fallback summaries", async () => {
    const db = await resourceData.loadAll();
    const article = db.byArticle.get("article-a");
    const item = feed.feedItem(article, db);

    expect(item.article.dek).toContain("Avery Stone joined");
    expect(item.advisors[0]).toMatchObject({
      id: "advisor-a",
      role: "Partner",
      firm: { id: "firm-a", short: EXAMPLE_WM_SHORT },
    });
    expect(item.firms[0]).toMatchObject({
      id: "firm-a",
      hq: "Atlanta, GA",
    });
    expect(item.teams[0]).toMatchObject({
      id: "team-a",
      aum: 1_200_000_000,
      teamSize: 2,
    });
    expect(item.eventCards[0]).toMatchObject({
      kind: "transition",
      subject: { kind: "advisor", id: "advisor-a", name: AVERY_STONE_NAME },
      fromFirm: { id: "firm-b" },
      deal: { upfrontPctT12: 180 },
    });
  });

  it("builds advisor profiles with career, credentials, and coverage", async () => {
    const db = await resourceData.loadAll();
    const payload = advisorResource.advisorProfilePayload(
      db,
      db.byAdvisor.get("advisor-a")
    );

    expect(payload.displayName).toBe(AVERY_STONE_NAME);
    expect(payload.career[0]).toMatchObject({
      firm: { id: "firm-a" },
      branch: { id: "branch-a", city: "Atlanta" },
    });
    expect(payload.teams[0]).toMatchObject({
      team: { id: "team-a" },
      role: "lead",
    });
    expect(payload.disclosures[0]).toMatchObject({
      id: DISCLOSURE_A_ID,
      sanctions: [{ id: "sanction-a", disclosureId: DISCLOSURE_A_ID }],
    });
    expect(payload.licenses[0]).toMatchObject({ licenseType: "Series 7" });
    expect(payload.designations[0]).toMatchObject({ code: "CFP" });
    expect(payload.education[0]).toMatchObject({
      institution: "State University",
    });
    expect(payload.brokerCheckSnapshot).toMatchObject({ subjectCrd: "12345" });
    expect(payload.articles[0]).toMatchObject({ id: "article-a" });
    expect(
      db.fieldAssertions.filter(field => field.targetId === "advisor-a")
    ).toMatchObject([
      {
        id: "field-a",
        fieldName: "legalName",
        confidence: "asserted",
      },
      {
        id: "field-b",
        fieldName: "roleTitle",
        confidence: "inferred",
      },
      {
        id: "field-c",
        fieldName: "careerStatus",
        confidence: "derived",
      },
    ]);
    expect(payload.evidenceFreshness).toEqual({
      hasData: true,
      lastCheckedAt: "2026-05-25T12:00:00Z",
      nearestNextCheckAfter: "2026-06-01T00:00:00Z",
      statusCounts: {
        success: 1,
        no_new_data: 0,
        ambiguous: 1,
        failed: 0,
      },
      sourceTypeCoverage: {
        web_research: 1,
        firm_bio: 1,
        rankings: 0,
        press: 0,
      },
    });
    expect(payload.confidenceSummary).toEqual({
      hasData: true,
      asserted: 1,
      inferred: 1,
      derived: 1,
      total: 3,
    });
    expect(
      payload.confidenceSummary.asserted +
        payload.confidenceSummary.inferred +
        payload.confidenceSummary.derived
    ).toBe(payload.confidenceSummary.total);

    const noDataPayload = advisorResource.advisorProfilePayload(
      db,
      db.byAdvisor.get("advisor-b")
    );
    expect(noDataPayload.evidenceFreshness).toEqual({
      hasData: false,
      lastCheckedAt: null,
      nearestNextCheckAfter: null,
      statusCounts: {
        success: 0,
        no_new_data: 0,
        ambiguous: 0,
        failed: 0,
      },
      sourceTypeCoverage: {
        web_research: 0,
        firm_bio: 0,
        rankings: 0,
        press: 0,
      },
    });
    expect(noDataPayload.confidenceSummary).toEqual({
      hasData: false,
      asserted: 0,
      inferred: 0,
      derived: 0,
      total: 0,
    });
    expect(
      noDataPayload.confidenceSummary.asserted +
        noDataPayload.confidenceSummary.inferred +
        noDataPayload.confidenceSummary.derived
    ).toBe(noDataPayload.confidenceSummary.total);
  });

  it("covers advisor fallback dates and optional credential groups", async () => {
    const db = await resourceData.loadAll();
    db.disclosures = [
      ...db.disclosures,
      {
        id: "disclosure-resolved",
        advisorId: "advisor-a",
        dateResolved: DATE_2021_01_01,
        disclosureType: "regulatory",
      },
    ];
    db.education = [
      { id: "education-undated", advisorId: "advisor-a" },
      {
        id: "education-dated",
        advisorId: "advisor-a",
        graduationYear: 2010,
      },
    ];

    const withOptionalRows = advisorResource.advisorProfilePayload(
      db,
      db.byAdvisor.get("advisor-a")
    );
    expect(withOptionalRows.disclosures.map((row: any) => row.id)).toEqual([
      "disclosure-resolved",
      DISCLOSURE_A_ID,
    ]);
    expect(withOptionalRows.education.map((row: any) => row.id)).toEqual([
      "education-undated",
      "education-dated",
    ]);

    const withoutCredentialTables = advisorResource.advisorProfilePayload(
      {
        ...db,
        designations: undefined,
        education: undefined,
        licenses: undefined,
      },
      db.byAdvisor.get("advisor-a")
    );
    expect(withoutCredentialTables).toMatchObject({
      designations: [],
      education: [],
      licenses: [],
    });
  });

  it("builds firm roster rows and counts current versus past advisors", async () => {
    const db = await resourceData.loadAll();

    expect(firmResource.advisorCountsForFirm(db, "firm-a")).toEqual({
      currentAdvisorCount: 1,
      pastAdvisorCount: 1,
    });
    expect(firmResource.firmAdvisorRows(db, "firm-a", "current")).toEqual([
      expect.objectContaining({
        advisor: expect.objectContaining({ id: "advisor-a" }),
        roleTitle: "Partner",
      }),
    ]);
    expect(firmResource.firmAdvisorRows(db, "firm-a", "past")).toEqual([
      expect.objectContaining({
        advisor: expect.objectContaining({ id: "advisor-b" }),
        reasonForLeaving: "retired",
      }),
    ]);
  });

  it("builds source-backed firm due-diligence modules", async () => {
    const db = await resourceData.loadAll();
    const profile = await new (resources as any).FirmProfile().get(
      routeTarget(EXAMPLE_WEALTH_LLC)
    );

    expect(profile.dueDiligence).toMatchObject({
      firmId: "firm-a",
      modules: {
        recruitingMomentum: {
          status: LOADED_STATUS,
          inbound: { count: 2, knownAum: 500_000_000, unknownAumCount: 1 },
          outbound: { count: 1, knownAum: 0, unknownAumCount: 1 },
          netMoveCount: 1,
          netAumMoved: 500_000_000,
          provenance: {
            sourceTable: "TransitionEvent",
            sourceIds: [TRANSITION_TEAM_ID, TRANSITION_A_ID, TRANSITION_OUT_ID],
          },
          freshness: {
            status: LOADED_STATUS,
            asOf: DATE_2024_04_01,
          },
        },
        rosterFootprint: {
          status: LOADED_STATUS,
          currentAdvisorCount: 1,
          pastAdvisorCount: 1,
          teamCount: 1,
          branchCount: 1,
        },
        rankingPresence: {
          status: LOADED_STATUS,
          resolvedCount: 1,
          unresolvedCount: 0,
          topRank: 12,
          provenance: {
            sourceTable: "RankingEntry",
            sourceIds: [RANKING_ENTRY_A_ID],
          },
        },
        regulatorySnapshot: {
          status: LOADED_STATUS,
          source: {
            sourceName: FINRA_BROKERCHECK_LABEL,
            sourceUrl: "https://brokercheck.finra.org/firm/summary/67890",
            compiledAsOf: DATE_2025_01_02,
          },
          provenance: {
            sourceTable: "BrokerCheckSnapshot",
            sourceIds: ["bc-firm"],
          },
        },
        coverageTimeline: {
          status: LOADED_STATUS,
          articleCount: 1,
          provenance: {
            sourceTables: ["Article", "ArticleFirmMention"],
            sourceIds: ["article-a"],
          },
        },
      },
      dataConfidence: {
        status: "partial",
        modules: [
          expect.objectContaining({
            name: "recruitingMomentum",
            freshness: expect.objectContaining({ asOf: DATE_2024_04_01 }),
          }),
          expect.objectContaining({
            name: "rosterFootprint",
            freshness: expect.objectContaining({ asOf: DATE_2025_01_02 }),
          }),
          expect.objectContaining({
            name: "rankingPresence",
            freshness: expect.objectContaining({ asOf: "2025" }),
          }),
          expect.objectContaining({
            name: "regulatorySnapshot",
            freshness: expect.objectContaining({ asOf: DATE_2025_01_02 }),
          }),
          expect.objectContaining({
            name: "coverageTimeline",
            freshness: expect.objectContaining({ asOf: "2025-02-01" }),
          }),
        ],
      },
    });
    expect(firmDueDiligenceResource.firmDueDiligenceModules).toBeTypeOf(
      "function"
    );
    expect(db.byRanking.get("ranking-a")).toMatchObject({
      name: ADVISORS_TO_WATCH_LABEL,
    });
  });

  it("builds a normalized AdvisorComparison payload for two advisors", async () => {
    const comparison = await new (resources as any).AdvisorComparison().get(
      routeTarget("", { ids: "advisor-a,advisor-b" })
    );

    expect(new (resources as any).AdvisorComparison().allowRead()).toBe(true);
    expect(comparison).toMatchObject({
      selection: {
        status: "ready",
        requestedIds: ["advisor-a", "advisor-b"],
        normalizedIds: ["advisor-a", "advisor-b"],
        duplicateIds: [],
        cappedIds: ["advisor-a", "advisor-b"],
        missingIds: [],
        min: 2,
        max: 4,
        truncated: false,
      },
      count: 2,
      ids: ["advisor-a", "advisor-b"],
      items: [
        {
          status: "found",
          id: "advisor-a",
          identity: { id: "advisor-a", legalName: AVERY_STONE_NAME },
          displayName: AVERY_STONE_NAME,
          firm: expect.objectContaining({ id: "firm-a" }),
          regulatory: {
            brokerCheckSnapshot: expect.objectContaining({
              subjectCrd: "12345",
              disclosureCount: 1,
            }),
            disclosureCount: 1,
            registrationApplications: [
              expect.objectContaining({ id: "reg-a", firm: expect.anything() }),
            ],
          },
          career: [
            expect.objectContaining({
              firm: expect.objectContaining({ id: "firm-a" }),
              roleTitle: "Partner",
            }),
          ],
          rankings: [
            {
              entry: expect.objectContaining({
                id: RANKING_ENTRY_A_ID,
                rank: 12,
                sourceLabel: ADVISORHUB_AW_2025_LABEL,
              }),
              ranking: expect.objectContaining({
                name: ADVISORS_TO_WATCH_LABEL,
              }),
            },
          ],
          articles: [
            expect.objectContaining({
              id: "article-a",
              url: STONE_JOINS_EXAMPLE_URL,
            }),
          ],
          dataConfidence: {
            evidenceFreshness: expect.objectContaining({
              hasData: true,
              lastCheckedAt: RESEARCH_B_CHECKED_AT,
            }),
            confidenceSummary: {
              hasData: true,
              asserted: 1,
              inferred: 1,
              derived: 1,
              total: 3,
            },
          },
          attribution: {
            brokerCheck: expect.objectContaining({
              subjectCrd: "12345",
              disclosureCount: 1,
            }),
            assertions: [
              expect.objectContaining({ fieldName: "legalName" }),
              expect.objectContaining({ fieldName: "roleTitle" }),
              expect.objectContaining({ fieldName: "careerStatus" }),
            ],
            researchSources: [
              expect.objectContaining({
                sourceType: "web_research",
                sourcesChecked: [AVERY_STONE_FIRM_BIO_URL],
              }),
              expect.objectContaining({ sourceType: "firm_bio" }),
            ],
          },
        },
        {
          status: "found",
          id: "advisor-b",
          identity: { id: "advisor-b", legalName: BLAKE_YOUNG_NAME },
          firm: expect.objectContaining({ id: "firm-a" }),
          regulatory: {
            brokerCheckSnapshot: null,
            disclosureCount: 0,
          },
          rankings: [],
          dataConfidence: {
            evidenceFreshness: expect.objectContaining({ hasData: false }),
            confidenceSummary: {
              hasData: false,
              asserted: 0,
              inferred: 0,
              derived: 0,
              total: 0,
            },
          },
        },
      ],
    });
  });

  it("parses repeated AdvisorComparison ids and sorts ranking entries", async () => {
    setRows("RankingEntry", [
      {
        id: "ranking-entry-missing-rank",
        rankingId: "ranking-a",
        subjectAdvisorId: "advisor-a",
        sourceLabel: "Zulu List",
      },
      {
        id: "ranking-entry-alpha",
        rankingId: "ranking-a",
        subjectAdvisorId: "advisor-a",
        sourceLabel: "Alpha List",
      },
      {
        id: "ranking-entry-ranked",
        rankingId: "ranking-b",
        subjectAdvisorId: "advisor-a",
        sourceLabel: "Middle List",
        rank: 2,
      },
      {
        id: "ranking-entry-beta",
        rankingId: "ranking-a",
        subjectAdvisorId: "advisor-a",
        sourceLabel: "Alpha List",
      },
    ]);

    const comparison = await new (resources as any).AdvisorComparison().get(
      routeTarget("", { id: ["advisor-a", "advisor-b"] })
    );

    expect(comparison.ids).toEqual(["advisor-a", "advisor-b"]);
    expect(comparison.selection).toMatchObject({
      status: "ready",
      requestedIds: ["advisor-a", "advisor-b"],
      normalizedIds: ["advisor-a", "advisor-b"],
      duplicateIds: [],
      cappedIds: ["advisor-a", "advisor-b"],
      missingIds: [],
      truncated: false,
    });
    expect(
      comparison.items[0].rankings.map((row: any) => row.entry.id)
    ).toEqual([
      "ranking-entry-ranked",
      "ranking-entry-alpha",
      "ranking-entry-beta",
      "ranking-entry-missing-rank",
    ]);
  });

  it("normalizes empty and alternate AdvisorComparison id inputs", async () => {
    await expect(
      new (resources as any).AdvisorComparison().get(routeTarget(""))
    ).resolves.toMatchObject({
      selection: {
        status: "empty_selection",
        requestedIds: [],
        normalizedIds: [],
        duplicateIds: [],
        cappedIds: [],
        missingIds: [],
        min: 2,
        max: 4,
        truncated: false,
      },
      count: 0,
      ids: [],
      items: [],
    });

    await expect(
      new (resources as any).AdvisorComparison().get(
        routeTarget("", { advisorIds: "advisor-a, advisor-b" })
      )
    ).resolves.toMatchObject({
      selection: {
        status: "ready",
        requestedIds: ["advisor-a", "advisor-b"],
        normalizedIds: ["advisor-a", "advisor-b"],
        cappedIds: ["advisor-a", "advisor-b"],
        missingIds: [],
      },
      count: 2,
      ids: ["advisor-a", "advisor-b"],
    });
  });

  it("does not leak private rating overlays into AdvisorComparison payloads", async () => {
    setRows("UserRating", [
      {
        id: "rating-private",
        userId: "user-a",
        advisorId: "advisor-a",
        ratingInt: 5,
        reviewText: "private client note",
      },
    ]);

    const endpoint = new (resources as any).AdvisorComparison() as any;
    endpoint.user = { username: "user-a" };
    const comparison = await endpoint.get(
      routeTarget("", { ids: "advisor-a,advisor-b" })
    );

    expect(comparison.items[0]).toMatchObject({
      id: "advisor-a",
      attribution: {
        brokerCheck: expect.objectContaining({ subjectCrd: "12345" }),
      },
    });
    expect(JSON.stringify(comparison)).not.toContain("private client note");
    expect(JSON.stringify(comparison)).not.toContain("ratingInt");
  });

  it("serves private advisor ratings only for the current user", async () => {
    const endpoint = new (resources as any).AdvisorRating() as any;

    await expect(endpoint.get(routeTarget("advisor-a"))).resolves.toEqual({
      authenticated: false,
      rating: null,
    });
    await expect(endpoint.get(routeTarget(""))).rejects.toMatchObject({
      status: 400,
    });

    endpoint.getCurrentUser = () => ({ email: CLIENT_EMAIL });
    const original = (globalThis as any).tables.UserRating;
    (globalThis as any).tables.UserRating = {
      search: (query: any) =>
        (async function* () {
          expect(query.conditions).toEqual([
            { attribute: "userId", value: CLIENT_EMAIL },
          ]);
          yield {
            id: "client%40example.test:advisor-other",
            userId: CLIENT_EMAIL,
            advisorId: "advisor-other",
            ratingInt: 2,
          };
          yield {
            id: "client%40example.test:advisor-a",
            userId: CLIENT_EMAIL,
            advisorId: "advisor-a",
            ratingInt: 5,
            responsiveness: 6,
            reviewText: SOURCE_BACKED_REASON,
          };
        })(),
    };

    try {
      await expect(endpoint.get(routeTarget("advisor-a"))).resolves.toEqual({
        authenticated: true,
        rating: {
          advisorId: "advisor-a",
          ratingInt: 5,
          responsiveness: 6,
          transparency: null,
          performance: null,
          planningDepth: null,
          reviewText: SOURCE_BACKED_REASON,
        },
      });
    } finally {
      (globalThis as any).tables.UserRating = original;
    }
  });

  it("sanitizes and writes private advisor ratings", async () => {
    const endpoint = new (resources as any).AdvisorRating() as any;
    await expect(
      endpoint.post(routeTarget("advisor-a"), { ratingInt: 4 })
    ).rejects.toMatchObject({ status: 401 });

    endpoint.getCurrentUser = () => ({ id: "user:a" });
    const writes: any[] = [];
    const original = (globalThis as any).tables.UserRating;
    (globalThis as any).tables.UserRating = {
      get: async () => ({
        id: "user%3Aa:advisor-a",
        userId: "user:a",
        advisorId: "advisor-a",
        ratingInt: 2,
        reviewText: "old",
      }),
      insert: async (row: any) => {
        writes.push(row);
      },
    };

    try {
      const saved = await endpoint.post(routeTarget("advisor-a"), {
        performance: "5",
        planningDepth: "0",
        ratingInt: "6",
        responsiveness: "3",
        reviewText: "  new note  ",
        transparency: "4",
      });

      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        id: "user%3Aa:advisor-a",
        advisorId: "advisor-a",
        userId: "user:a",
        ratingInt: null,
        responsiveness: 3,
        transparency: 4,
        performance: 5,
        planningDepth: null,
        reviewText: "new note",
      });
      expect(saved).toEqual({
        authenticated: true,
        rating: {
          advisorId: "advisor-a",
          ratingInt: null,
          responsiveness: 3,
          transparency: 4,
          performance: 5,
          planningDepth: null,
          reviewText: "new note",
        },
      });
    } finally {
      (globalThis as any).tables.UserRating = original;
    }
  });

  it("surfaces private rating table failures", async () => {
    const endpoint = new (resources as any).AdvisorRating() as any;
    endpoint.getCurrentUser = () => ({ username: "client" });
    const original = (globalThis as any).tables.UserRating;
    (globalThis as any).tables.UserRating = {
      get: async () => {
        throw new Error("read failed");
      },
    };

    try {
      await expect(
        endpoint.get(routeTarget("advisor-a"))
      ).rejects.toMatchObject({
        message: "Failed to load private rating: read failed",
        status: 500,
      });
      (globalThis as any).tables.UserRating = { get: async () => null };
      await expect(
        endpoint.post(routeTarget("advisor-a"), { ratingInt: 4 })
      ).rejects.toMatchObject({
        message: "UserRating writes are unavailable",
        status: 503,
      });
    } finally {
      (globalThis as any).tables.UserRating = original;
    }
  });

  it("stores signed-in advisor correction requests without changing profile facts", async () => {
    const endpoint = new (resources as any).AdvisorCorrectionRequest() as any;
    expect(endpoint.allowRead()).toBe(true);
    expect(endpoint.allowCreate()).toBe(true);
    await expect(
      endpoint.post({
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
      })
    ).rejects.toMatchObject({ status: 401 });

    endpoint.getCurrentUser = () => ({ email: CLIENT_EMAIL });
    const beforeAdvisor = structuredClone(
      tableRows.get("Advisor")?.find(row => row.id === "advisor-a")
    );
    const beforeProfile = await new (resources as any).AdvisorProfile().get(
      routeTarget("advisor-a")
    );

    const response = await endpoint.post({
      advisorId: "advisor-a",
      fieldName: "legalName",
      displayedValue: `  ${AVERY_STONE_NAME}  `,
      proposedValue: `  ${AVERY_STONE_CORRECTED_NAME}  `,
      submitterNote: " Public profile omits CFP mark. ",
      sourceType: "firm_bio",
      sourceRef: AVERY_STONE_FIRM_BIO_URL,
      sourceContext: JSON.stringify({ field: "legalName" }),
    });

    expect(response).toMatchObject({
      authenticated: true,
      request: {
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
        submitterId: CLIENT_EMAIL,
        submitterNote: "Public profile omits CFP mark.",
        sourceType: "firm_bio",
        sourceRef: AVERY_STONE_FIRM_BIO_URL,
        sourceContext: JSON.stringify({ field: "legalName" }),
        status: "pending",
      },
    });
    expect(response.request.id).toMatch(/^correction:client%40example\.test:/);
    expect(tableRows.get(ADVISOR_CORRECTION_REQUEST_TABLE)).toContainEqual(
      response.request
    );
    expect(
      tableRows.get("Advisor")?.find(row => row.id === "advisor-a")
    ).toEqual(beforeAdvisor);
    await expect(
      new (resources as any).AdvisorProfile().get(routeTarget("advisor-a"))
    ).resolves.toMatchObject({
      advisor: {
        legalName: beforeProfile.advisor.legalName,
      },
    });
  });

  it("persists correction request review fields", async () => {
    const endpoint = new (resources as any).AdvisorCorrectionRequest() as any;
    endpoint.getCurrentUser = () => ({ id: "submitter-a" });
    const created = await endpoint.post({
      advisorId: "advisor-a",
      fieldName: "legalName",
      displayedValue: AVERY_STONE_NAME,
      proposedValue: AVERY_STONE_CORRECTED_NAME,
      note: "Needs analyst review.",
    });

    await expect(
      endpoint.post(routeTarget(created.request.id), {
        status: "accepted",
        reviewerNote: FIRM_BIO_SUPPORTS_UPDATE_NOTE,
      })
    ).rejects.toMatchObject({
      message: "Analyst role required",
      status: 403,
    });

    endpoint.getCurrentUser = () => ({ id: "analyst-a", role: "analyst" });
    const reviewed = await endpoint.post(routeTarget(created.request.id), {
      status: "accepted",
      reviewerNote: FIRM_BIO_SUPPORTS_UPDATE_NOTE,
    });

    expect(reviewed).toMatchObject({
      authenticated: true,
      request: {
        ...created.request,
        status: "accepted",
        reviewerId: "analyst-a",
        reviewerNote: FIRM_BIO_SUPPORTS_UPDATE_NOTE,
      },
    });
    expect(reviewed.request.reviewedAt).toEqual(expect.any(String));
    await expect(
      endpoint.get(routeTarget(created.request.id))
    ).resolves.toEqual({
      authenticated: true,
      request: reviewed.request,
    });
    await expect(
      endpoint.post(routeTarget(created.request.id), {
        status: "rejected",
        reviewerNote: "Changed my mind.",
      })
    ).rejects.toMatchObject({
      message: "correction request is already reviewed",
      status: 409,
    });
    expect(
      tableRows
        .get(ADVISOR_CORRECTION_REQUEST_TABLE)
        ?.find(row => row.id === created.request.id)
    ).toEqual(reviewed.request);
  });

  it("limits correction request reads to submitters and analysts", async () => {
    const endpoint = new (resources as any).AdvisorCorrectionRequest() as any;
    endpoint.getCurrentUser = () => ({ email: CLIENT_EMAIL });
    const created = await endpoint.post({
      advisorId: "advisor-a",
      fieldName: "legalName",
      displayedValue: AVERY_STONE_NAME,
      proposedValue: AVERY_STONE_CORRECTED_NAME,
    });

    await expect(
      endpoint.get(routeTarget(created.request.id))
    ).resolves.toEqual({
      authenticated: true,
      request: created.request,
    });

    endpoint.getCurrentUser = () => null;
    await expect(
      endpoint.get(routeTarget(created.request.id))
    ).rejects.toMatchObject({
      message: "Sign in required",
      status: 401,
    });

    endpoint.getCurrentUser = () => ({ email: "other@example.test" });
    await expect(
      endpoint.get(routeTarget(created.request.id))
    ).rejects.toMatchObject({
      message: "Correction request access denied",
      status: 403,
    });

    endpoint.getCurrentUser = () => ({
      email: ANALYST_EMAIL,
      role: { role: "analyst" },
    });
    await expect(
      endpoint.get(routeTarget(created.request.id))
    ).resolves.toEqual({
      authenticated: true,
      request: created.request,
    });
  });

  it("lists pending correction requests for analysts without exposing them to other users", async () => {
    setRows(ADVISOR_CORRECTION_REQUEST_TABLE, [
      {
        id: CORRECTION_OLD_ID,
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
        submitterId: CLIENT_EMAIL,
        submitterNote: FIRM_BIO_SUBMITTER_NOTE,
        sourceType: "firm_bio",
        sourceRef: AVERY_STONE_FIRM_BIO_URL,
        sourceContext: "Profile heading",
        status: "pending",
        createdAt: DATE_2024_04_01,
      },
      {
        id: CORRECTION_TIE_ID,
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
        submitterId: CLIENT_EMAIL,
        status: "pending",
        createdAt: DATE_2024_04_01,
      },
      {
        id: CORRECTION_UNKNOWN_ID,
        advisorId: CORRECTION_UNKNOWN_ADVISOR_ID,
        fieldName: "legalName",
        displayedValue: "Missing advisor",
        proposedValue: "Corrected missing advisor",
        submitterId: CLIENT_EMAIL,
        status: "pending",
      },
      {
        id: "correction-reviewed",
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
        submitterId: CLIENT_EMAIL,
        status: "accepted",
        createdAt: DATE_2026_05_25,
      },
    ]);

    const anonymous = await new (
      resources as any
    ).AdvisorCorrectionRequest().get();
    expect(anonymous).toMatchObject({
      authenticated: false,
      authorized: false,
      summary: { pending: 0, oldestAgeDays: null },
      items: [],
    });

    const clientEndpoint = new (
      resources as any
    ).AdvisorCorrectionRequest() as any;
    clientEndpoint.getCurrentUser = () => ({ email: CLIENT_EMAIL });
    await expect(clientEndpoint.get()).resolves.toMatchObject({
      authenticated: true,
      authorized: false,
      items: [],
    });

    const analystEndpoint = new (
      resources as any
    ).AdvisorCorrectionRequest() as any;
    analystEndpoint.getCurrentUser = () => ({
      email: ANALYST_EMAIL,
      role: "analyst",
    });
    const queue = await analystEndpoint.get();

    expect(queue).toMatchObject({
      authenticated: true,
      authorized: true,
      summary: { pending: 3, oldestAgeDays: expect.any(Number) },
      items: [
        {
          id: CORRECTION_UNKNOWN_ID,
          advisorId: CORRECTION_UNKNOWN_ADVISOR_ID,
          advisorName: CORRECTION_UNKNOWN_ADVISOR_ID,
          firmName: null,
          createdAt: null,
          ageDays: null,
        },
        {
          id: CORRECTION_OLD_ID,
          advisorId: "advisor-a",
          advisorName: AVERY_STONE_NAME,
          advisorUrl: "/advisor.html?id=advisor-a",
          firmName: EXAMPLE_WEALTH_MANAGEMENT,
          fieldName: "legalName",
          displayedValue: AVERY_STONE_NAME,
          proposedValue: AVERY_STONE_CORRECTED_NAME,
          submitterId: CLIENT_EMAIL,
          submitterNote: FIRM_BIO_SUBMITTER_NOTE,
          sourceType: "firm_bio",
          sourceRef: AVERY_STONE_FIRM_BIO_URL,
          sourceContext: "Profile heading",
          status: "pending",
          createdAt: DATE_2024_04_01,
          ageDays: expect.any(Number),
        },
        {
          id: CORRECTION_TIE_ID,
          advisorName: AVERY_STONE_NAME,
          createdAt: DATE_2024_04_01,
        },
      ],
    });
    expect(queue.items.map((item: any) => item.id)).toEqual([
      CORRECTION_UNKNOWN_ID,
      CORRECTION_OLD_ID,
      CORRECTION_TIE_ID,
    ]);

    await analystEndpoint.post(routeTarget(CORRECTION_OLD_ID), {
      status: "rejected",
      reviewerNote: "Firm page does not match current profile standard.",
    });
    await expect(analystEndpoint.get()).resolves.toMatchObject({
      summary: { pending: 2 },
    });
    await expect(
      analystEndpoint.post(routeTarget(CORRECTION_TIE_ID), {
        status: "unsupported",
      })
    ).rejects.toMatchObject({
      message: "unsupported correction request status",
      status: 400,
    });
  });

  it("labels missing firm due-diligence source states explicitly", async () => {
    setRows("RankingEntry", []);
    setRows("BrokerCheckSnapshot", []);
    const profile = await new (resources as any).FirmProfile().get(
      routeTarget(EXAMPLE_WEALTH_LLC)
    );

    expect(profile.dueDiligence.modules.rankingPresence).toMatchObject({
      status: "unavailable",
      note: "No RankingEntry rows are loaded for this firm; this does not imply the firm has no ranked advisors, teams, or firm appearances.",
      provenance: { sourceTable: "RankingEntry", sourceIds: [] },
    });
    expect(profile.dueDiligence.modules.regulatorySnapshot).toMatchObject({
      status: "unavailable",
      note: "No firm BrokerCheck snapshot is loaded for this firm.",
      source: {
        sourceName: FINRA_BROKERCHECK_LABEL,
        compiledAsOf: null,
      },
      provenance: { sourceTable: "BrokerCheckSnapshot", sourceIds: [] },
    });
  });

  it("returns authenticated regulatory discrepancy queue rows with source evidence", async () => {
    const endpoint = new (resources as any).RegulatoryDiscrepancyQueue() as any;
    endpoint.getCurrentUser = () => ({ username: ANALYST_EMAIL });

    const payload = await endpoint.get();

    expect(
      new (resources as any).RegulatoryDiscrepancyQueue().allowRead()
    ).toBe(true);
    expect(payload).toMatchObject({
      authenticated: true,
      summary: { totalOpen: 1, highSeverity: 1, severities: { high: 1 } },
      items: [
        {
          id: REGULATORY_DISCREPANCY_A_ID,
          advisorName: AVERY_STONE_NAME,
          firmName: EXAMPLE_WEALTH_MANAGEMENT,
          fieldName: "fineAmount",
          severity: "high",
          status: "open",
          advisorHub: {
            sourceName: "AdvisorHub",
            sourceRef: "article-b",
            value: "25000",
          },
          brokerCheck: {
            sourceName: FINRA_BROKERCHECK_LABEL,
            sourceRef: "crd:12345:docket:2023079356701",
            value: "2500",
          },
          event: {
            regulator: "FINRA",
            docketNumber: "2023079356701",
            disclosureIds: [DISCLOSURE_A_ID],
            disclosureStatuses: [],
          },
          availableActions: [
            "accepted_brokercheck",
            "accepted_advisorhub",
            "needs_followup",
            "not_a_conflict",
          ],
          provenance: {
            sourceTable: REGULATORY_DISCREPANCY_TABLE,
            sourceIds: [REGULATORY_DISCREPANCY_A_ID],
          },
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("reg-discrepancy-resolved");
  });

  it("does not expose discrepancy details to signed-out queue visitors", async () => {
    const payload = await new (
      resources as any
    ).RegulatoryDiscrepancyQueue().get();

    expect(payload).toMatchObject({
      authenticated: false,
      summary: { totalOpen: 0, highSeverity: 0, severities: {} },
      items: [],
    });
  });

  it("raises an explicit discrepancy queue load error for authenticated analysts", async () => {
    const endpoint = new (resources as any).RegulatoryDiscrepancyQueue() as any;
    endpoint.getCurrentUser = () => ({ username: ANALYST_EMAIL });
    vi.spyOn(resourceData, "loadAll").mockRejectedValueOnce(
      new Error("fixture load failed")
    );

    await expect(endpoint.get()).rejects.toMatchObject({
      name: "RegulatoryDiscrepancyQueueLoadError",
      message: "Failed to load regulatory discrepancy queue data",
    });
  });

  it("sorts open discrepancy queue rows and tolerates sparse event context", async () => {
    setRows("EmploymentHistory", [
      { id: "employment-undated", advisorId: "advisor-a", firmId: "firm-a" },
    ]);
    setRows(REGULATORY_DISCREPANCY_TABLE, [
      {
        id: "reg-disc-b",
        advisorId: "advisor-a",
        fieldName: FINE_AMOUNT_FIELD,
        advisorHubValue: "20000",
        brokerCheckValue: "2500",
        sourceMetadata: "not-json",
        severity: "high",
        status: "open",
        createdAt: DATE_2026_05_25,
      },
      {
        id: "reg-disc-a",
        advisorId: "advisor-a",
        fieldName: "fineAmount",
        advisorHubValue: "25000",
        brokerCheckValue: "2500",
        severity: "high",
        status: "open",
        createdAt: DATE_2026_05_25,
      },
      {
        id: "reg-disc-low",
        advisorId: "advisor-a",
        fieldName: "status",
        advisorHubValue: "pending",
        brokerCheckValue: "closed",
        severity: "low",
        status: "open",
      },
    ]);
    const endpoint = new (resources as any).RegulatoryDiscrepancyQueue() as any;
    endpoint.getCurrentUser = () => ({ username: ANALYST_EMAIL });

    const payload = await endpoint.get();

    expect(payload.summary).toMatchObject({
      totalOpen: 3,
      highSeverity: 2,
      severities: { high: 2, low: 1 },
    });
    expect(payload.items.map((item: any) => item.id)).toEqual([
      "reg-disc-a",
      "reg-disc-b",
      "reg-disc-low",
    ]);
    expect(payload.items[1].event).toMatchObject({
      regulator: null,
      docketNumber: null,
      disclosureIds: [],
    });
  });

  it("returns due advisor research queue rows with public-safe context", async () => {
    setRows(
      "AdvisorResearchCheck",
      (tableRows.get("AdvisorResearchCheck") ?? []).map(row =>
        row.id === "research-a"
          ? { ...row, nextCheckAfter: "2099-01-01T00:00:00Z" }
          : row
      )
    );
    const payload = await new (resources as any).AdvisorResearchQueue().get(
      routeTarget("", { limit: "5", staleDays: "1" })
    );

    expect(new (resources as any).AdvisorResearchQueue().allowRead()).toBe(
      true
    );
    expect(payload).toMatchObject({
      filters: {
        sourceType: "web_research",
        staleDays: 1,
        status: null,
        missingField: null,
        limit: 5,
      },
      summary: {
        returned: 1,
        statusCounts: { never_checked: 1 },
        priorityGroups: [
          {
            id: "missing_contact_data",
            label: "Missing contact data",
            count: 1,
            filters: {
              sourceType: "web_research",
              staleDays: 1,
              status: null,
              missingField: "businessEmail",
              limit: 5,
            },
            representativeAdvisorIds: ["advisor-b"],
          },
          {
            id: "missing_profile_substance",
            label: "Missing profile substance",
            count: 1,
            filters: {
              sourceType: "web_research",
              staleDays: 1,
              status: null,
              missingField: "bioText",
              limit: 5,
            },
            representativeAdvisorIds: ["advisor-b"],
          },
          {
            id: "stale_checked_profiles",
            label: "Stale checked profiles",
            count: 0,
            filters: {
              sourceType: "web_research",
              staleDays: 1,
              status: null,
              missingField: null,
              limit: 5,
            },
            representativeAdvisorIds: [],
          },
          {
            id: "never_checked_profiles",
            label: "Never-checked profiles",
            count: 1,
            filters: {
              sourceType: "web_research",
              staleDays: 1,
              status: "never_checked",
              missingField: null,
              limit: 5,
            },
            representativeAdvisorIds: ["advisor-b"],
          },
        ],
      },
      items: [
        {
          advisorId: "advisor-b",
          advisorName: BLAKE_YOUNG_NAME,
          finraCrd: null,
          profileUrl: "/advisor.html?id=advisor-b",
          firm: {
            id: "firm-a",
            name: EXAMPLE_WEALTH_MANAGEMENT,
            roleTitle: "Advisor",
          },
          sourceType: "web_research",
          status: null,
          lastCheckedAt: null,
          nextCheckAfter: null,
          missingFields: [
            "headshotUrl",
            "bioText",
            "linkedinUrl",
            "businessEmail",
            "businessPhone",
          ],
          provenance: {
            sourceTable: "AdvisorResearchCheck",
            sourceIds: [],
          },
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("UserRating");
    expect(JSON.stringify(payload)).not.toContain("UserWatchlist");
  });

  it("filters due advisor research rows by source and missing field", async () => {
    const payload = await new (resources as any).AdvisorResearchQueue().get(
      routeTarget("", {
        limit: "10",
        sourceType: "firm_bio",
        staleDays: "1",
        status: "ambiguous",
        missingField: "businessEmail",
      })
    );

    expect(payload.filters).toMatchObject({
      sourceType: "firm_bio",
      staleDays: 1,
      status: "ambiguous",
      missingField: "businessEmail",
      limit: 10,
    });
    expect(payload.summary).toMatchObject({
      returned: 1,
      statusCounts: { ambiguous: 1 },
      missingFieldCounts: { businessEmail: 1, businessPhone: 1 },
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      advisorId: "advisor-a",
      sourceType: "firm_bio",
      status: "ambiguous",
      lastCheckedAt: RESEARCH_B_CHECKED_AT,
      provenance: { sourceIds: ["research-b"] },
    });
    expect(payload.summary.priorityGroups).toContainEqual({
      id: "stale_checked_profiles",
      label: "Stale checked profiles",
      count: 1,
      filters: {
        sourceType: "firm_bio",
        staleDays: 1,
        status: "ambiguous",
        missingField: null,
        limit: 10,
      },
      representativeAdvisorIds: ["advisor-a"],
    });
  });

  it("preserves the requested source on never-checked research rows", async () => {
    const payload = await new (resources as any).AdvisorResearchQueue().get(
      routeTarget("", {
        sourceType: "firm_bio",
        staleDays: "1",
        status: "never_checked",
        missingField: "businessEmail",
      })
    );

    expect(payload.filters.status).toBe("never_checked");
    expect(payload.summary.statusCounts).toEqual({ never_checked: 1 });
    expect(payload.items[0]).toMatchObject({
      advisorId: "advisor-b",
      sourceType: "firm_bio",
      status: null,
      provenance: { sourceIds: [] },
    });
  });

  it("returns public DataCoverage sections with source context and limitations", async () => {
    const payload = await new (resources as any).DataCoverage().get();

    expect(new (resources as any).DataCoverage().allowRead()).toBe(true);
    expect(payload.sections.map((section: any) => section.id)).toEqual([
      "public-entity-groups",
      "branch-coverage",
      "rankings",
      "recruiting",
      RESEARCH_FRESHNESS_SECTION,
      "source-context",
    ]);
    expect(payload.provenance.publicResources).toEqual([
      PUBLIC_ADVISORS_RESOURCE,
      PUBLIC_FIRMS_RESOURCE,
      PUBLIC_TEAMS_RESOURCE,
      PUBLIC_BRANCHES_RESOURCE,
      FEED_RESOURCE,
      SEARCH_RESOURCE,
      RANKINGS_EXPLORER_RESOURCE,
      RECRUITING_MARKET_RESOURCE,
      ADVISOR_RESEARCH_QUEUE_RESOURCE,
    ]);
    expect(payload.provenance.sourceTables).toEqual(
      expect.arrayContaining(["Branch", "EmploymentHistory", "FirmAlias"])
    );
    expectDataCoverageMetricContract(payload);
    expect(metricById(payload, "advisors")).toMatchObject({
      value: 2,
      source: "Advisor",
      publicResource: PUBLIC_ADVISORS_RESOURCE,
      limitation: null,
    });
    expect(metricById(payload, "branches")).toMatchObject({
      source: "Branch",
      publicResource: PUBLIC_BRANCHES_RESOURCE,
      limitation: null,
    });
    expect(metricById(payload, "branches-with-current-advisors")).toMatchObject(
      {
        source: "EmploymentHistory.branchId",
        publicResource: PUBLIC_BRANCHES_RESOURCE,
        limitation: null,
      }
    );
    expect(metricById(payload, RANKING_ENTRIES_METRIC)).toMatchObject({
      value: 2,
      source: "RankingEntry",
      publicResource: RANKINGS_EXPLORER_RESOURCE,
    });
    expect(metricById(payload, "ranking-gap-buckets")).toMatchObject({
      value: expect.any(Number),
      limitation:
        "Some ranking entries still need resolution or source fields.",
    });
    expect(metricById(payload, "moves")).toMatchObject({
      value: 3,
      source: "TransitionEvent",
      publicResource: RECRUITING_MARKET_RESOURCE,
    });
    expect(metricById(payload, LATEST_RESEARCH_CHECK_METRIC)).toMatchObject({
      value: "2026-05-25T12:00:00.000Z",
      source: "AdvisorResearchCheck.checkedAt",
      publicResource: ADVISOR_RESEARCH_QUEUE_RESOURCE,
      limitation: null,
    });
    expect(metricById(payload, FIELD_ASSERTIONS_METRIC)).toMatchObject({
      value: 3,
      source: "FieldAssertion",
      publicResource: null,
      limitation: DATA_COVERAGE_FIELD_ASSERTIONS_AGGREGATE,
    });
    expect(payload.limitations).toEqual(
      expect.arrayContaining([
        "Some ranking entries still need resolution or source fields.",
      ])
    );
    expect(JSON.stringify(payload)).not.toContain("UserRating");
    expect(JSON.stringify(payload)).not.toContain("UserWatchlist");
    expect(JSON.stringify(payload)).not.toContain(
      ADVISOR_CORRECTION_REQUEST_TABLE
    );
  });

  it("represents missing DataCoverage values as limitations", async () => {
    setRows("Ranking", []);
    setRows("RankingEntry", []);
    setRows("TransitionEvent", []);
    setRows("Branch", []);
    setRows("AdvisorResearchCheck", []);
    setRows("FieldAssertion", []);

    const payload = await new (resources as any).DataCoverage().get();

    expectDataCoverageMetricContract(payload);
    expect(metricById(payload, "ranking-lists")).toMatchObject({
      value: 0,
      limitation: "No ranking-list rows are loaded.",
    });
    expect(metricById(payload, RANKING_ENTRIES_METRIC)).toMatchObject({
      value: 0,
      limitation: DATA_COVERAGE_RANKINGS_EMPTY,
    });
    expect(metricById(payload, "moves")).toMatchObject({
      value: 0,
      limitation: DATA_COVERAGE_NO_PUBLIC_RECRUITING_MOVES,
    });
    expect(metricById(payload, "branches")).toMatchObject({
      value: 0,
      limitation:
        "Branch rows are unavailable; this does not imply firms have no offices.",
    });
    expect(metricById(payload, LATEST_RESEARCH_CHECK_METRIC)).toMatchObject({
      value: null,
      limitation: RESEARCH_FRESHNESS_UNAVAILABLE,
    });
    expect(metricById(payload, FIELD_ASSERTIONS_METRIC)).toMatchObject({
      value: 0,
      limitation: "No field-level source assertions are loaded.",
    });
  });

  it("composes public investor proof packet data from coverage and research resources", async () => {
    const payload = await new (resources as any).InvestorProofPacket().get();

    expect(new (resources as any).InvestorProofPacket().allowRead()).toBe(true);
    expect(payload.coverage.sections.map((section: any) => section.id)).toEqual(
      [
        "public-entity-groups",
        "branch-coverage",
        "rankings",
        "recruiting",
        RESEARCH_FRESHNESS_SECTION,
        "source-context",
      ]
    );
    expect(payload.coverage.keyMetrics.map((metric: any) => metric.id)).toEqual(
      expect.arrayContaining([
        "advisors",
        "firms",
        "articles",
        "branches",
        RANKING_ENTRIES_METRIC,
        "moves",
        LATEST_RESEARCH_CHECK_METRIC,
        FIELD_ASSERTIONS_METRIC,
      ])
    );
    expect(payload.freshness).toMatchObject({
      totalDue: expect.any(Number),
      returned: expect.any(Number),
      limitation: null,
    });
    expect(payload.freshness.representativeAdvisors[0]).toMatchObject({
      advisorId: "advisor-b",
      profileUrl: "/advisor.html?id=advisor-b",
      firm: { id: "firm-a", name: EXAMPLE_WEALTH_MANAGEMENT },
      sourceType: "web_research",
    });
    expect(proofLinkById(payload, "coverage-dashboard")).toMatchObject({
      url: "/coverage",
      publicResource: DATA_COVERAGE_RESOURCE,
      limitation: null,
    });
    expect(proofLinkById(payload, RESEARCH_FRESHNESS_SECTION)).toMatchObject({
      url: "/research/freshness",
      publicResource: ADVISOR_RESEARCH_QUEUE_RESOURCE,
      sourceTable: "AdvisorResearchCheck",
      limitation: null,
    });
    expect(proofLinkById(payload, REPRESENTATIVE_FEED_LINK)).toMatchObject({
      url: `/articles/${STONE_JOINS_EXAMPLE_SLUG}-article-a`,
      publicResource: FEED_RESOURCE,
      sourceIds: ["article-a"],
      limitation: null,
    });
    expect(proofLinkById(payload, REPRESENTATIVE_FIRM_LINK)).toMatchObject({
      url: "/firm.html?id=firm-b",
      publicResource: PUBLIC_FIRMS_RESOURCE,
      sourceIds: ["firm-b"],
      limitation: null,
    });
    expect(proofLinkById(payload, REPRESENTATIVE_RANKING_LINK)).toMatchObject({
      publicResource: RANKINGS_EXPLORER_RESOURCE,
      sourceTable: "RankingEntry",
      sourceIds: [RANKING_ENTRY_A_ID],
      limitation: null,
    });
    expect(
      proofLinkById(payload, REPRESENTATIVE_RECRUITING_LINK)
    ).toMatchObject({
      publicResource: RECRUITING_MARKET_RESOURCE,
      sourceTable: "TransitionEvent",
      sourceIds: [TRANSITION_A_ID],
      limitation: null,
    });
    expect(payload.provenance.publicResources).toEqual([
      DATA_COVERAGE_RESOURCE,
      ADVISOR_RESEARCH_QUEUE_RESOURCE,
      FEED_RESOURCE,
      PUBLIC_FIRMS_RESOURCE,
      RANKINGS_EXPLORER_RESOURCE,
      RECRUITING_MARKET_RESOURCE,
    ]);
    expect(JSON.stringify(payload)).not.toContain("UserRating");
    expect(JSON.stringify(payload)).not.toContain("UserWatchlist");
    expect(JSON.stringify(payload)).not.toContain(
      ADVISOR_CORRECTION_REQUEST_TABLE
    );
  });

  it("keeps investor proof packet boundaries public-safe", async () => {
    setRows("UserRating", [
      {
        id: "rating-private-packet",
        userId: PRIVATE_USER_ID,
        advisorId: "advisor-a",
        ratingInt: 1,
        reviewText: "private analyst rating says customer pipeline is weak",
      },
    ]);
    setRows("UserWatchlist", [
      {
        id: "watchlist-private-packet",
        userId: PRIVATE_USER_ID,
        name: "private source-rights shortlist",
      },
    ]);
    setRows("UserWatchlistEntry", [
      {
        id: "watchlist-entry-private-packet",
        listId: "watchlist-private-packet",
        advisorId: "advisor-a",
        note: "private traction and monetization claim",
      },
    ]);
    setRows(REGULATORY_DISCREPANCY_TABLE, [
      {
        id: "reg-private-packet",
        advisorId: "advisor-a",
        fieldName: "annualRevenue",
        advisorHubValue: "invented revenue",
        brokerCheckValue: "credential mismatch",
        status: "pending",
        reviewerNote: "analyst note for private review only",
      },
    ]);
    setRows(ADVISOR_CORRECTION_REQUEST_TABLE, [
      {
        id: "correction-private-packet",
        advisorId: "advisor-a",
        submitterEmail: CLIENT_EMAIL,
        fieldName: "bioText",
        proposedValue: "private customer pipeline update",
        submitterNote: "do not expose source-rights conclusion",
        status: "pending",
        reviewerNote: "private analyst note",
      },
    ]);

    const payload = await new (resources as any).InvestorProofPacket().get();
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(
      /watchlist|rating|analyst note|credential mismatch|private traction|invented revenue|customer pipeline|source-rights|monetization/i
    );
    expect(payload.coverage.limitations).toEqual(
      expect.arrayContaining([DATA_COVERAGE_FIELD_ASSERTIONS_AGGREGATE])
    );
    expect(payload.unavailable).toEqual(
      expect.arrayContaining([DATA_COVERAGE_FIELD_ASSERTIONS_AGGREGATE])
    );
  });

  it("keeps investor proof packet missing proof explicit instead of zero-filled", async () => {
    setRows("Article", []);
    setRows("Firm", []);
    setRows("Ranking", []);
    setRows("RankingEntry", []);
    setRows("TransitionEvent", []);
    setRows("AdvisorResearchCheck", []);

    const payload = await new (resources as any).InvestorProofPacket().get();

    expect(payload.coverage.limitations).toEqual(
      expect.arrayContaining([
        DATA_COVERAGE_NO_PUBLIC_ARTICLES,
        DATA_COVERAGE_RANKINGS_EMPTY,
        DATA_COVERAGE_NO_PUBLIC_RECRUITING_MOVES,
        RESEARCH_FRESHNESS_UNAVAILABLE,
      ])
    );
    expect(payload.freshness).toMatchObject({
      returned: 2,
      limitation: null,
    });
    expect(payload.freshness.representativeAdvisors).toHaveLength(2);
    expect(payload.coverage.keyMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "articles",
          value: null,
          limitation: DATA_COVERAGE_NO_PUBLIC_ARTICLES,
        }),
        expect.objectContaining({
          id: RANKING_ENTRIES_METRIC,
          value: null,
          limitation: DATA_COVERAGE_RANKINGS_EMPTY,
        }),
        expect.objectContaining({
          id: "moves",
          value: null,
          limitation: DATA_COVERAGE_NO_PUBLIC_RECRUITING_MOVES,
        }),
      ])
    );
    expect(proofLinkById(payload, RESEARCH_FRESHNESS_SECTION)).toMatchObject({
      sourceIds: [],
      limitation: "Research freshness proof has no check rows loaded.",
    });
    expect(proofLinkById(payload, REPRESENTATIVE_FEED_LINK)).toMatchObject({
      sourceIds: [],
      limitation: "No public feed article is available.",
    });
    expect(proofLinkById(payload, REPRESENTATIVE_FIRM_LINK)).toMatchObject({
      sourceIds: [],
      limitation: "No public firm row is available.",
    });
    expect(proofLinkById(payload, REPRESENTATIVE_RANKING_LINK)).toMatchObject({
      sourceIds: [],
      limitation: "No public ranking entry is available.",
    });
    expect(
      proofLinkById(payload, REPRESENTATIVE_RECRUITING_LINK)
    ).toMatchObject({
      sourceIds: [],
      limitation: "No public recruiting move is available.",
    });
    expect(payload.unavailable).toEqual(
      expect.arrayContaining([
        DATA_COVERAGE_NO_PUBLIC_ARTICLES,
        "Research freshness is unavailable.",
        "Research freshness proof has no check rows loaded.",
        "No public feed article is available.",
        "No public firm row is available.",
      ])
    );
  });

  it("selects investor proof representatives from public resource projections", async () => {
    setRows("Article", [
      { id: "article-private", publishedDate: "2026-01-01" },
      ...(tableRows.get("Article") ?? []),
    ]);
    setRows("Firm", [{ id: "firm-private" }, ...(tableRows.get("Firm") ?? [])]);
    setRows("RankingEntry", [
      { rankingId: "ranking-private", rawDisplayName: "Missing source id" },
      ...(tableRows.get("RankingEntry") ?? []),
    ]);
    setRows("TransitionEvent", [
      {
        fromFirmId: "firm-missing",
        toFirmId: "firm-a",
        moveDate: DATE_2024_01_01,
      },
      ...(tableRows.get("TransitionEvent") ?? []),
    ]);

    const payload = await new (resources as any).InvestorProofPacket().get();

    expect(proofLinkById(payload, REPRESENTATIVE_FEED_LINK)).toMatchObject({
      sourceIds: ["article-a"],
      limitation: null,
    });
    expect(proofLinkById(payload, REPRESENTATIVE_FIRM_LINK)).toMatchObject({
      sourceIds: ["firm-b"],
      limitation: null,
    });
    expect(proofLinkById(payload, REPRESENTATIVE_RANKING_LINK)).toMatchObject({
      sourceIds: [RANKING_ENTRY_A_ID],
      limitation: null,
    });
    expect(
      proofLinkById(payload, REPRESENTATIVE_RECRUITING_LINK)
    ).toMatchObject({
      sourceIds: [TRANSITION_A_ID],
      limitation: null,
    });
  });

  it("counts branch-linked advisors only for known branch rows", async () => {
    setRows("EmploymentHistory", [
      {
        id: "employment-known-branch",
        advisorId: "advisor-a",
        firmId: "firm-a",
        branchId: "branch-a",
        roleTitle: "Partner",
        startDate: DATE_2020_01_01,
      },
      {
        id: "employment-orphan-branch",
        advisorId: "advisor-b",
        firmId: "firm-a",
        branchId: "missing-branch",
        roleTitle: "Advisor",
        startDate: DATE_2021_01_01,
      },
    ]);

    const payload = await new (resources as any).DataCoverage().get();

    expect(metricById(payload, "branches-with-current-advisors")).toMatchObject(
      {
        value: 1,
        limitation: null,
      }
    );
  });

  it("builds a source-backed rankings explorer payload", async () => {
    const payload = await new (resources as any).RankingsExplorer().get(
      routeTarget("", { category: "Next Gen", year: "2025" })
    );

    expect(new (resources as any).RankingsExplorer().allowRead()).toBe(true);
    expect(payload).toMatchObject({
      filters: {
        category: "Next Gen",
        limit: 50,
        year: 2025,
        sort: "rank",
      },
      summary: {
        totalEntries: 1,
        resolvedEntries: 0,
        unresolvedEntries: 1,
        representedFirms: 0,
        representedStates: 1,
      },
      coverage: {
        totalEntries: 1,
        buckets: [
          {
            key: "Next Gen:2025",
            category: "Next Gen",
            year: 2025,
            query: "/rankings?category=Next+Gen&year=2025",
            total: 1,
            resolved: 0,
            unresolved: 1,
            missingFirm: 1,
            missingMarket: 0,
            missingScore: 1,
            latestLoadedAt: DATE_2026_05_25,
            sourceLabels: [ADVISORHUB_NEXTGEN_2025_LABEL],
            sampleRows: [
              {
                id: RANKING_ENTRY_B_ID,
                label: JORDAN_EXAMPLE_NAME,
                firmText: UNRESOLVED_CAPITAL,
                sourceLabel: ADVISORHUB_NEXTGEN_2025_LABEL,
              },
            ],
          },
        ],
      },
      facets: {
        categories: [ADVISORS_TO_WATCH_LABEL, "Next Gen"],
        cities: ["Atlanta", "Austin"],
        firms: [EXAMPLE_WEALTH_LLC, UNRESOLVED_CAPITAL],
        years: [2025],
        states: ["GA", "TX"],
      },
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: RANKING_ENTRY_B_ID,
      ranking: {
        name: "Next Gen",
        year: 2025,
      },
      subject: {
        displayName: JORDAN_EXAMPLE_NAME,
        id: null,
        url: null,
      },
      firmText: UNRESOLVED_CAPITAL,
      resolutionStatus: "unresolved",
      scores: {
        scale: {
          value: null,
          status: "unavailable",
          label: "Unavailable",
        },
        growth: {
          value: 76.4,
          status: LOADED_STATUS,
        },
      },
      sourceStatus: [
        SOURCE_BACKED_REASON,
        UNRESOLVED_ENTITY_REASON,
        UNRESOLVED_FIRM_REASON,
        MISSING_SCALE_REASON,
      ],
      provenance: {
        sourceTable: "RankingEntry",
        sourceIds: [RANKING_ENTRY_B_ID],
        rankingId: "ranking-b",
      },
    });
    expect(payload.coverage.gapBuckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: SOURCE_BACKED_REASON,
          count: 1,
          query: "/rankings",
        }),
        expect.objectContaining({
          status: UNRESOLVED_FIRM_REASON,
          count: 1,
          query: "/rankings?resolved=unresolved",
        }),
        expect.objectContaining({
          status: MISSING_SCALE_REASON,
          count: 1,
        }),
      ])
    );
  });

  it("filters and sorts resolved rankings explorer rows", async () => {
    const payload = await new (resources as any).RankingsExplorer().get(
      routeTarget("", { firm: EXAMPLE_WEALTH_LLC, resolved: "resolved" })
    );

    expect(payload.summary).toMatchObject({
      totalEntries: 1,
      resolvedEntries: 1,
      unresolvedEntries: 0,
      representedFirms: 1,
    });
    expect(payload.items[0]).toMatchObject({
      id: RANKING_ENTRY_A_ID,
      subject: {
        kind: "advisor",
        id: "advisor-a",
        displayName: AVERY_STONE_NAME,
        url: "/advisor.html?id=avery-stone",
      },
      firm: {
        id: "firm-a",
        name: EXAMPLE_WEALTH_MANAGEMENT,
        url: "/firm.html?id=example-wealth",
      },
      source: {
        url: ADVISORHUB_AW_RANKINGS_URL,
        loadedAt: DATE_2026_05_25,
      },
    });
  });

  it("aggregates deterministic coverage totals for filtered ranking rows", async () => {
    setRows("RankingEntry", [
      {
        id: "coverage-resolved",
        rankingId: "ranking-a",
        subjectAdvisorId: "advisor-a",
        firmId: "firm-a",
        rawDisplayName: AVERY_STONE_NAME,
        firmText: EXAMPLE_WEALTH_LLC,
        city: "Atlanta",
        state: "GA",
        sourceUrl: ADVISORHUB_AW_RANKINGS_URL,
        sourceLabel: ADVISORHUB_AW_2025_LABEL,
        loadedAt: DATE_2026_05_25,
        resolutionStatus: "resolved",
        rank: 1,
        scoreTotal: 97,
        scoreScale: 95,
        scoreGrowth: 94,
        scoreProfessionalism: 96,
      },
      {
        id: COVERAGE_UNRESOLVED_MISSING_SCORE_ID,
        rankingId: "ranking-a",
        rawDisplayName: MORGAN_GAP_NAME,
        firmText: UNRESOLVED_CAPITAL,
        city: "Austin",
        state: "TX",
        sourceUrl: ADVISORHUB_AW_RANKINGS_URL,
        sourceLabel: ADVISORHUB_AW_2025_LABEL,
        loadedAt: "2026-05-26",
        resolutionStatus: "unresolved",
        rank: 2,
        scoreGrowth: 88,
      },
      {
        id: COVERAGE_UNRESOLVED_MISSING_MARKET_ID,
        rankingId: "ranking-a",
        rawDisplayName: TAYLOR_MARKET_NAME,
        firmText: UNRESOLVED_CAPITAL,
        sourceLabel: ADVISORHUB_AW_2025_LABEL,
        loadedAt: "2026-05-24",
        resolutionStatus: "unresolved",
        rank: 3,
        scoreScale: 90,
      },
      {
        id: "coverage-other-category",
        rankingId: "ranking-b",
        rawDisplayName: JORDAN_EXAMPLE_NAME,
        firmText: BETA_ADVISORS,
        city: "Dallas",
        state: "TX",
        sourceLabel: ADVISORHUB_NEXTGEN_2025_LABEL,
        loadedAt: DATE_2026_05_25,
        resolutionStatus: "unresolved",
        rank: 4,
      },
    ]);

    const payload = await new (resources as any).RankingsExplorer().get(
      routeTarget("", { category: ADVISORS_TO_WATCH_LABEL, year: "2025" })
    );

    expect(payload.summary).toMatchObject({
      totalEntries: 3,
      resolvedEntries: 1,
      unresolvedEntries: 2,
      representedFirms: 1,
      representedStates: 2,
    });
    expect(payload.coverage).toMatchObject({
      totalEntries: 3,
      buckets: [
        {
          key: "Advisors to Watch:2025",
          total: 3,
          resolved: 1,
          unresolved: 2,
          missingFirm: 2,
          missingMarket: 1,
          missingScore: 2,
          latestLoadedAt: "2026-05-26",
          sourceLabels: [ADVISORHUB_AW_2025_LABEL],
        },
      ],
    });
    expect(payload.coverage.buckets[0].sampleRows).toEqual([
      expect.objectContaining({
        id: "coverage-resolved",
        label: AVERY_STONE_NAME,
        sourceLabel: ADVISORHUB_AW_2025_LABEL,
      }),
      expect.objectContaining({
        id: COVERAGE_UNRESOLVED_MISSING_SCORE_ID,
        label: MORGAN_GAP_NAME,
        sourceStatus: expect.arrayContaining([
          UNRESOLVED_ENTITY_REASON,
          UNRESOLVED_FIRM_REASON,
          MISSING_SCALE_REASON,
        ]),
      }),
      expect.objectContaining({
        id: COVERAGE_UNRESOLVED_MISSING_MARKET_ID,
        label: TAYLOR_MARKET_NAME,
        sourceStatus: expect.arrayContaining([
          MISSING_SOURCE_REASON,
          MISSING_STATE_REASON,
          "missing-growth",
        ]),
      }),
    ]);
    expect(payload.coverage.gapBuckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: UNRESOLVED_FIRM_REASON,
          count: 2,
          sampleRows: expect.arrayContaining([
            expect.objectContaining({
              id: COVERAGE_UNRESOLVED_MISSING_SCORE_ID,
              sourceLabel: ADVISORHUB_AW_2025_LABEL,
            }),
          ]),
        }),
        expect.objectContaining({
          status: MISSING_SCALE_REASON,
          count: 1,
          sampleRows: [
            expect.objectContaining({
              id: COVERAGE_UNRESOLVED_MISSING_SCORE_ID,
              label: MORGAN_GAP_NAME,
            }),
          ],
        }),
        expect.objectContaining({
          status: MISSING_STATE_REASON,
          count: 1,
          sampleRows: [
            expect.objectContaining({
              id: COVERAGE_UNRESOLVED_MISSING_MARKET_ID,
              label: TAYLOR_MARKET_NAME,
            }),
          ],
        }),
      ])
    );
  });

  it("returns an explicit rankings coverage payload when no rankings are loaded", async () => {
    setRows("RankingEntry", []);

    const payload = await new (resources as any).RankingsExplorer().get(
      routeTarget("")
    );

    expect(payload.summary).toEqual({
      totalEntries: 0,
      resolvedEntries: 0,
      unresolvedEntries: 0,
      representedFirms: 0,
      representedStates: 0,
    });
    expect(payload.coverage).toEqual({
      totalEntries: 0,
      buckets: [],
      gapBuckets: [],
      emptyState: DATA_COVERAGE_RANKINGS_EMPTY,
    });
    expect(payload.items).toEqual([]);
    expect(payload.emptyState).toBe(
      "No matching public rankings are loaded for these filters."
    );
  });

  it("covers rankings explorer fallback subjects, sorting, and empty states", async () => {
    setRows("RankingEntry", [
      {
        id: "ranking-entry-team",
        rankingId: "ranking-a",
        subjectTeamId: "team-a",
        firmId: "firm-a",
        rawDisplayName: STONE_GROUP_NAME,
        firmText: EXAMPLE_WEALTH_MANAGEMENT,
        city: "Atlanta",
        state: "GA",
        sourceLabel: "AdvisorHub ranking fixture",
        resolutionStatus: "resolved",
        rank: 7,
        scoreGrowth: 88,
      },
      {
        id: "ranking-entry-firm",
        rankingId: "missing-ranking",
        subjectFirmId: "firm-b",
        rawDisplayName: BETA_ADVISORS,
        firmText: BETA_ADVISORS,
        rank: 2,
        scoreScale: 96,
        scoreGrowth: 64,
      },
      {
        id: "ranking-entry-unresolved",
        rankingId: "ranking-a",
        rawDisplayName: "",
        firmText: "",
        resolutionStatus: "ambiguous",
        scoreScale: 81,
      },
    ]);

    const sorted = await new (resources as any).RankingsExplorer().get(
      routeTarget("", {
        limit: "not-a-number",
        resolved: "bogus",
        sort: "-growth",
        year: "not-a-year",
      })
    );

    expect(sorted.items.map((item: any) => item.id)).toEqual([
      "ranking-entry-team",
      "ranking-entry-firm",
      "ranking-entry-unresolved",
    ]);
    expect(sorted.items[0]).toMatchObject({
      subject: {
        kind: "team",
        id: "team-a",
        displayName: STONE_GROUP_NAME,
        url: "/team.html?id=stone-group",
      },
      source: {
        url: ADVISORHUB_AW_RANKINGS_URL,
        label: "AdvisorHub ranking fixture",
      },
    });
    expect(sorted.items[1]).toMatchObject({
      ranking: {
        id: "missing-ranking",
        publisher: "AdvisorHub",
        name: "Unknown ranking",
        year: null,
        subjectType: "firm",
      },
      subject: {
        kind: "firm",
        id: "firm-b",
        displayName: BETA_ADVISORS,
        url: "/firm.html?id=beta-advisors",
      },
      sourceStatus: expect.arrayContaining([
        MISSING_SOURCE_REASON,
        MISSING_STATE_REASON,
      ]),
    });
    expect(sorted.items[2]).toMatchObject({
      subject: {
        kind: "advisor",
        id: null,
        displayName: "Unresolved ranking row",
      },
      resolutionStatus: "ambiguous",
      sourceStatus: expect.arrayContaining([
        UNRESOLVED_ENTITY_REASON,
        UNRESOLVED_FIRM_REASON,
        "missing-growth",
      ]),
    });

    const empty = await new (resources as any).RankingsExplorer().get(
      routeTarget("", { city: "missing", state: "ca" })
    );

    expect(empty).toMatchObject({
      filters: {
        city: "missing",
        state: "CA",
      },
      summary: {
        totalEntries: 0,
      },
      coverage: {
        totalEntries: 0,
        buckets: [],
        gapBuckets: [],
        emptyState: DATA_COVERAGE_RANKINGS_EMPTY,
      },
      emptyState: "No matching public rankings are loaded for these filters.",
    });
  });

  it("covers fallback feed summaries and missing entity chips", async () => {
    const db = await resourceData.loadAll();

    expect(feed.advisorChip(null, db)).toBeNull();
    expect(feed.firmChip(null)).toBeNull();
    expect(feed.teamChip(null, db)).toBeNull();
    expect(feed.deriveDek({ dek: "Manual dek" }, [])).toBe("Manual dek");
    expect(
      feed.deriveDek({}, [
        {
          kind: "transition",
          subject: { kind: "firm", name: EXAMPLE_WEALTH_SHORT_NAME },
          fromFirm: { short: "Old" },
          toFirm: { short: "New" },
          aumMoved: 2_500_000_000,
        },
      ])
    ).toBe("Example Wealth moves from Old to New ($2.50B AUM).");
    expect(
      feed.deriveDek({}, [
        {
          advisor: { name: AVERY_STONE_NAME },
          disclosureType: "customer",
          kind: "disclosure",
          regulator: "FINRA",
        },
      ])
    ).toBe("Avery Stone: FINRA customer.");
    expect(feed.deriveDek({}, [])).toBe("");
    expect(feed.summarizeArticle({ id: "article-without-events" }, db)).toEqual(
      []
    );
    expect(
      feed.deriveDek({}, [
        {
          kind: "transition",
          subject: "Legacy Team",
        },
      ])
    ).toBe("Legacy Team moves from ? to ?.");
    expect(feed.deriveDek({}, [{ kind: "disclosure" }])).toBe(
      "Advisor: regulatory matter."
    );
    expect(feed.transitionRow({ id: "empty-subject" }, db)?.subject).toBeNull();
    expect(
      feed.transitionRow({ id: "firm-subject", subjectFirmId: "firm-a" }, db)
        ?.subject
    ).toMatchObject({ kind: "firm", name: EXAMPLE_WEALTH_MANAGEMENT });
  });
});

describe("Harper resource endpoints", () => {
  it("marks public resources as readable", () => {
    expect(new (resources as any).Feed().allowRead()).toBe(true);
    expect(new (resources as any).ArticleView().allowRead()).toBe(true);
    expect(new (resources as any).FirmProfile().allowRead()).toBe(true);
    expect(new (resources as any).FirmAdvisors().allowRead()).toBe(true);
    expect(new (resources as any).AdvisorProfile().allowRead()).toBe(true);
    expect(new (resources as any).TeamProfile().allowRead()).toBe(true);
    expect(new (resources as any).PublicFirms().allowRead()).toBe(true);
    expect(new (resources as any).PublicAdvisors().allowRead()).toBe(true);
    expect(new (resources as any).PublicTeams().allowRead()).toBe(true);
    expect(new (resources as any).PublicBranches().allowRead()).toBe(true);
    expect(new (resources as any).RecruitingMarket().allowRead()).toBe(true);
    expect(new (resources as any).Search().allowRead()).toBe(true);
    expect(new (resources as any).mcp().allowCreate()).toBe(true);
  });

  it("handles MCP initialize and unsupported methods as JSON-RPC", async () => {
    const endpoint = new (resources as any).mcp();

    await expect(
      endpoint.post({
        jsonrpc: "2.0",
        id: "init-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      })
    ).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "init-1",
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: { name: "advisorbook", title: "AdvisorBook" },
      },
    });

    await expect(
      endpoint.post({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
      })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: -32601,
        message: "Method not found: resources/list",
      },
    });
  });

  it("lists curated read-only MCP tools", async () => {
    const endpoint = new (resources as any).mcp();

    await expect(
      endpoint.post({
        jsonrpc: "2.0",
        id: "tools-1",
        method: "tools/list",
      })
    ).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "tools-1",
      result: {
        tools: [
          { name: "search_advisorbook" },
          { name: "get_feed" },
          { name: "get_advisor_profile" },
          { name: "get_firm_profile" },
          { name: "get_team_profile" },
          { name: "get_article" },
        ],
      },
    });
  });

  it("returns MCP JSON-RPC errors for malformed requests", async () => {
    const endpoint = new (resources as any).mcp();

    await expect(endpoint.post(undefined)).resolves.toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    await expect(endpoint.post({ jsonrpc: "2.0" })).resolves.toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
  });

  it("serves feed, article, firm, advisor, and team profiles", async () => {
    const feedResponse = await new (resources as any).Feed().get();
    const article = await new (resources as any).ArticleView().get(
      routeTarget(STONE_JOINS_EXAMPLE_SLUG)
    );
    const firm = await new (resources as any).FirmProfile().get(
      routeTarget(EXAMPLE_WEALTH_LLC)
    );
    const advisors = await new (resources as any).FirmAdvisors().get(
      routeTarget("firm-a", { status: "past", limit: "1" })
    );
    const advisor = await new (resources as any).AdvisorProfile().get(
      routeTarget(AVERY_STONE_SLUG)
    );
    const team = await new (resources as any).TeamProfile().get(
      routeTarget(STONE_GROUP_SLUG)
    );

    expect(feedResponse).toMatchObject({ count: 2 });
    expect(article).toMatchObject({
      article: { id: "article-a" },
      provenance: [{ targetTable: "Advisor", targetId: "advisor-a" }],
    });
    expect(firm).toMatchObject({
      firm: { id: "firm-a" },
      currentAdvisorCount: 1,
      brokerCheckSnapshot: { subjectCrd: "67890" },
    });
    expect(advisors.items[0]).not.toHaveProperty("_sortKey");
    expect(advisors.items[0]).toMatchObject({
      advisor: { id: "advisor-b" },
    });
    expect(advisor).toMatchObject({
      advisor: { id: "advisor-a" },
      displayName: AVERY_STONE_NAME,
    });
    expect(team).toMatchObject({
      team: { id: "team-a" },
      currentMembers: [{ advisor: { id: "advisor-a" } }],
      pastMembers: [{ advisor: { id: "advisor-b" } }],
    });
  });

  it("surfaces only reviewed regulatory discrepancy notes on advisor profiles", async () => {
    setRows(REGULATORY_DISCREPANCY_TABLE, [
      ...(tableRows.get(REGULATORY_DISCREPANCY_TABLE) ?? []),
      {
        id: REGULATORY_DISCREPANCY_REVIEWED_ID,
        advisorId: "advisor-a",
        fieldName: FINE_AMOUNT_FIELD,
        advisorHubValue: ADVISORHUB_FINE_AMOUNT,
        brokerCheckSourceRef: CAIRNES_BROKERCHECK_SOURCE_REF,
        brokerCheckValue: REVIEWED_FINE_AMOUNT,
        severity: "high",
        status: "accepted_brokercheck",
        reviewerNote: BROKERCHECK_REVIEWED_NOTE,
        reviewedAt: DATE_2026_05_25,
      },
    ]);

    const advisor = await new (resources as any).AdvisorProfile().get(
      routeTarget(AVERY_STONE_SLUG)
    );

    expect(advisor.reviewedRegulatoryDiscrepancies).toEqual([
      expect.objectContaining({
        id: REGULATORY_DISCREPANCY_REVIEWED_ID,
        status: "accepted_brokercheck",
        reviewerNote: BROKERCHECK_REVIEWED_NOTE,
        reviewedAt: DATE_2026_05_25,
        brokerCheckValue: REVIEWED_FINE_AMOUNT,
        advisorHubValue: ADVISORHUB_FINE_AMOUNT,
      }),
    ]);
    expect(
      JSON.stringify(advisor.reviewedRegulatoryDiscrepancies)
    ).not.toContain(REGULATORY_DISCREPANCY_A_ID);
  });

  it("surfaces only reviewed and sourced correction request notes on advisor profiles", async () => {
    setRows(ADVISOR_CORRECTION_REQUEST_TABLE, [
      {
        id: CORRECTION_REVIEWED_ID,
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
        submitterId: CLIENT_EMAIL,
        submitterNote: FIRM_BIO_SUBMITTER_NOTE,
        sourceType: "firm_bio",
        sourceRef: AVERY_STONE_FIRM_BIO_URL,
        sourceContext: JSON.stringify({ field: "legalName" }),
        status: "accepted",
        reviewerId: "analyst-a",
        reviewerNote: FIRM_BIO_SUPPORTS_UPDATE_NOTE,
        reviewedAt: DATE_2026_05_25,
      },
      {
        id: CORRECTION_PENDING_ID,
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: "Pending Name",
        submitterId: CLIENT_EMAIL,
        submitterNote: "Pending private submitter note.",
        sourceType: "firm_bio",
        sourceRef: AVERY_STONE_FIRM_BIO_URL,
        status: "pending",
      },
      {
        id: CORRECTION_UNSOURCED_ID,
        advisorId: "advisor-a",
        fieldName: "legalName",
        displayedValue: AVERY_STONE_NAME,
        proposedValue: "Unsourced Name",
        submitterId: CLIENT_EMAIL,
        status: "accepted",
        reviewerNote: "Reviewed but source-less.",
        reviewedAt: DATE_2026_05_25,
      },
    ]);

    const advisor = await new (resources as any).AdvisorProfile().get(
      routeTarget(AVERY_STONE_SLUG)
    );

    expect(advisor.reviewedCorrectionRequests).toEqual([
      {
        id: CORRECTION_REVIEWED_ID,
        fieldName: "legalName",
        status: "accepted",
        reviewerNote: FIRM_BIO_SUPPORTS_UPDATE_NOTE,
        reviewedAt: DATE_2026_05_25,
        displayedValue: AVERY_STONE_NAME,
        proposedValue: AVERY_STONE_CORRECTED_NAME,
        sourceType: "firm_bio",
        sourceRef: AVERY_STONE_FIRM_BIO_URL,
        sourceContext: JSON.stringify({ field: "legalName" }),
      },
    ]);
    const publicPayload = JSON.stringify(advisor);
    expect(publicPayload).not.toContain(FIRM_BIO_SUBMITTER_NOTE);
    expect(publicPayload).not.toContain(CORRECTION_PENDING_ID);
    expect(publicPayload).not.toContain(CORRECTION_UNSOURCED_ID);
  });

  it("persists regulatory discrepancy reviews without mutating source facts", async () => {
    const reviewerNote = BROKERCHECK_REVIEWED_NOTE;
    const beforeDisclosures = structuredClone(tableRows.get("Disclosure"));
    const beforeSanctions = structuredClone(tableRows.get("Sanction"));
    const beforeDiscrepancy = structuredClone(
      tableRows
        .get(REGULATORY_DISCREPANCY_TABLE)
        ?.find(row => row.id === REGULATORY_DISCREPANCY_A_ID)
    );
    const endpoint = new (resources as any).RegulatoryDiscrepancyReview();
    endpoint.getCurrentUser = () => ({ id: "analyst-a" });

    const response = await endpoint.post(
      routeTarget(REGULATORY_DISCREPANCY_A_ID),
      {
        status: "accepted_brokercheck",
        reviewerNote,
      }
    );

    expect(response).toMatchObject({
      authenticated: true,
      discrepancy: {
        id: REGULATORY_DISCREPANCY_A_ID,
        status: "accepted_brokercheck",
        reviewerId: "analyst-a",
        reviewerNote,
        advisorHubValue: ADVISORHUB_FINE_AMOUNT,
        brokerCheckValue: REVIEWED_FINE_AMOUNT,
      },
    });
    expect(response.discrepancy.reviewedAt).toEqual(expect.any(String));
    expect(response.discrepancy).toMatchObject({
      advisorHubSourceType: beforeDiscrepancy?.advisorHubSourceType,
      advisorHubSourceRef: beforeDiscrepancy?.advisorHubSourceRef,
      advisorHubValue: beforeDiscrepancy?.advisorHubValue,
      brokerCheckSourceType: beforeDiscrepancy?.brokerCheckSourceType,
      brokerCheckSourceRef: beforeDiscrepancy?.brokerCheckSourceRef,
      brokerCheckValue: beforeDiscrepancy?.brokerCheckValue,
      sourceMetadata: beforeDiscrepancy?.sourceMetadata,
    });

    await expect(
      endpoint.get(routeTarget(REGULATORY_DISCREPANCY_A_ID))
    ).resolves.toMatchObject({
      discrepancy: {
        id: REGULATORY_DISCREPANCY_A_ID,
        status: "accepted_brokercheck",
        reviewerId: "analyst-a",
      },
    });
    expect(tableRows.get("Disclosure")).toEqual(beforeDisclosures);
    expect(tableRows.get("Sanction")).toEqual(beforeSanctions);
    expect(
      tableRows
        .get(REGULATORY_DISCREPANCY_TABLE)
        ?.find(row => row.id === REGULATORY_DISCREPANCY_A_ID)
    ).toEqual({
      ...beforeDiscrepancy,
      status: "accepted_brokercheck",
      reviewerId: "analyst-a",
      reviewerNote,
      reviewedAt: expect.any(String),
    });
  });

  it("finds regulatory discrepancy tables nested in the Fabric database registry", async () => {
    const registry = tables as Record<string, unknown>;
    const directTable = registry[REGULATORY_DISCREPANCY_TABLE];
    const previousDatabases = (globalThis as any).databases;
    delete registry[REGULATORY_DISCREPANCY_TABLE];
    (globalThis as any).databases = {
      fabric: {
        component: {
          tables: {
            [REGULATORY_DISCREPANCY_TABLE]: directTable,
          },
        },
      },
    };
    const endpoint = new (resources as any).RegulatoryDiscrepancyReview();
    endpoint.getCurrentUser = () => ({ id: "analyst-a" });

    try {
      const response = await endpoint.post(
        routeTarget(REGULATORY_DISCREPANCY_A_ID),
        {
          status: "accepted_brokercheck",
          reviewerNote: BROKERCHECK_REVIEWED_NOTE,
        }
      );

      expect(response).toMatchObject({
        authenticated: true,
        discrepancy: {
          id: REGULATORY_DISCREPANCY_A_ID,
          status: "accepted_brokercheck",
          reviewerId: "analyst-a",
          reviewerNote: BROKERCHECK_REVIEWED_NOTE,
          advisorHubValue: ADVISORHUB_FINE_AMOUNT,
          brokerCheckValue: REVIEWED_FINE_AMOUNT,
        },
      });
    } finally {
      registry[REGULATORY_DISCREPANCY_TABLE] = directTable;
      (globalThis as any).databases = previousDatabases;
    }
  });

  it("filters feed responses by signal mode and source category", async () => {
    setRows("Article", [
      ...(tableRows.get("Article") ?? []),
      {
        id: "article-c",
        headline: "Market roundup",
        slug: "market-roundup",
        publishedDate: "2025-03-01",
        category: "unknown",
      },
      {
        id: "article-d",
        headline: "Advisor research import",
        slug: "advisor-research-import",
        publishedDate: "2025-04-01",
        category: "web_research",
      },
      {
        id: "article-e",
        headline: "Public research import",
        slug: "public-research-import",
        publishedDate: "2025-04-02",
        category: "public_web_research",
      },
    ]);

    const eventBacked = await new (resources as any).Feed().get(
      routeTarget("", { mode: EVENT_BACKED_MODE })
    );
    const browserEvent = await new (resources as any).Feed().get(
      routeTarget("", { mode: "event" })
    );
    const browserMoves = await new (resources as any).Feed().get(
      routeTarget("", { mode: "moves" })
    );
    const browserRecruiting = await new (resources as any).Feed().get(
      routeTarget("", { mode: "recruiting" })
    );
    const browserCompliance = await new (resources as any).Feed().get(
      routeTarget("", { mode: "compliance" })
    );
    const firstEventBacked = await new (resources as any).Feed().get(
      routeTarget("", { mode: "event", limit: "1" })
    );
    const compliance = await new (resources as any).Feed().get(
      routeTarget("", {
        category: "compliance",
        mode: COMPLIANCE_DISCLOSURES_MODE,
      })
    );
    const empty = await new (resources as any).Feed().get(
      routeTarget("", { category: "firm bio" })
    );
    const advisorResearch = await new (resources as any).Feed().get(
      routeTarget("", { category: "public_web_research" })
    );

    // /Feed paginates natively post-#721. `summary.total` now means
    // "items on this page" (= `returned`); `summary.categoryTotal` is
    // the index-backed count of articles matching the active category
    // filter and serves as the global total for `category="all"`.
    expect(eventBacked).toMatchObject({
      count: 2,
      filters: { mode: EVENT_BACKED_MODE, category: "all" },
      summary: {
        returned: 2,
        total: 2,
        modeTotal: 2,
        categoryTotal: 5,
      },
      emptyState: null,
    });
    expect(
      eventBacked.items.every((item: any) => item.eventCards.length > 0)
    ).toBe(true);
    expect(browserEvent).toMatchObject({
      count: 2,
      filters: { mode: EVENT_BACKED_MODE, category: "all" },
      summary: {
        returned: 2,
        total: 2,
        modeTotal: 2,
        categoryTotal: 5,
      },
    });
    expect(
      browserEvent.items.every((item: any) => item.eventCards.length > 0)
    ).toBe(true);
    expect(browserMoves).toMatchObject({
      count: 1,
      filters: { mode: "recruiting-moves", category: "all" },
      items: [
        expect.objectContaining({
          eventCards: [
            expect.objectContaining({
              kind: "transition",
            }),
          ],
        }),
      ],
    });
    expect(browserRecruiting).toMatchObject({
      count: 1,
      filters: { mode: "recruiting-moves", category: "all" },
    });
    expect(firstEventBacked).toMatchObject({
      count: 1,
      filters: { mode: EVENT_BACKED_MODE, category: "all" },
      items: [
        expect.objectContaining({
          article: expect.objectContaining({ id: "article-a" }),
        }),
      ],
      hasMore: true,
    });
    expect(browserCompliance).toMatchObject({
      count: 1,
      filters: { mode: COMPLIANCE_DISCLOSURES_MODE, category: "all" },
      items: [
        expect.objectContaining({
          eventCards: [
            expect.objectContaining({
              kind: "disclosure",
            }),
          ],
        }),
      ],
    });
    expect(compliance).toMatchObject({
      count: 1,
      filters: { mode: COMPLIANCE_DISCLOSURES_MODE, category: "compliance" },
      summary: {
        returned: 1,
        total: 1,
        modeTotal: 1,
        categoryTotal: 1,
      },
      items: [
        expect.objectContaining({
          article: expect.objectContaining({ id: "article-b" }),
        }),
      ],
    });
    expect(empty).toMatchObject({
      count: 0,
      filters: { mode: "all", category: "firm_bio" },
      summary: { returned: 0, total: 0, modeTotal: 0, categoryTotal: 0 },
      emptyState: {
        reason: "no-filtered-feed-results",
        message: "No feed items match the selected filters.",
      },
      items: [],
    });
    expect(advisorResearch).toMatchObject({
      count: 2,
      filters: { mode: "all", category: "public_web_research" },
      summary: { returned: 2, total: 2, modeTotal: 2, categoryTotal: 2 },
      items: [
        expect.objectContaining({
          article: expect.objectContaining({ id: "article-e" }),
        }),
        expect.objectContaining({
          article: expect.objectContaining({ id: "article-d" }),
        }),
      ],
    });
  });

  it("calls curated MCP tools with public resource links", async () => {
    const endpoint = new (resources as any).mcp();
    const callTool = async (name: string, args: Record<string, unknown>) => {
      const response = await endpoint.post({
        jsonrpc: "2.0",
        id: name,
        method: "tools/call",
        params: { name, arguments: args },
      });
      return response.result.structuredContent;
    };

    const searchResult = await callTool("search_advisorbook", {
      query: "stone",
    });
    const feedResult = await callTool("get_feed", { limit: 1 });
    const advisorResult = await callTool("get_advisor_profile", {
      id: AVERY_STONE_SLUG,
    });
    const advisorResourceResult = await new (
      resources as any
    ).AdvisorProfile().get(routeTarget(AVERY_STONE_SLUG));
    const firmResult = await callTool("get_firm_profile", {
      id: EXAMPLE_WEALTH_LLC,
    });
    const teamResult = await callTool("get_team_profile", {
      id: STONE_GROUP_SLUG,
    });
    const articleResult = await callTool("get_article", {
      id: STONE_JOINS_EXAMPLE_SLUG,
    });

    expect(searchResult.items).toEqual([
      expect.objectContaining({
        kind: "advisor",
        resource: "advisorbook://advisor/advisor-a",
      }),
      expect.objectContaining({
        kind: "team",
        resource: "advisorbook://team/team-a",
      }),
    ]);
    expect(feedResult).toMatchObject({
      count: 2,
      items: [
        expect.objectContaining({
          resource: "advisorbook://article/article-a",
        }),
      ],
    });
    expect(advisorResult).toMatchObject({
      advisor: { id: "advisor-a" },
      evidenceFreshness: {
        hasData: true,
        statusCounts: { success: 1, ambiguous: 1 },
      },
      confidenceSummary: {
        asserted: 1,
        inferred: 1,
        derived: 1,
        total: 3,
      },
      resource: "advisorbook://advisor/advisor-a",
    });
    expect(advisorResult.evidenceFreshness).toEqual(
      advisorResourceResult.evidenceFreshness
    );
    expect(advisorResult.confidenceSummary).toEqual(
      advisorResourceResult.confidenceSummary
    );
    expect(firmResult).toMatchObject({
      firm: { id: "firm-a" },
      resource: "advisorbook://firm/firm-a",
    });
    expect(teamResult).toMatchObject({
      team: { id: "team-a" },
      resource: "advisorbook://team/team-a",
    });
    expect(articleResult).toMatchObject({
      article: { id: "article-a" },
      provenance: [{ targetTable: "Advisor", targetId: "advisor-a" }],
      resource: "advisorbook://article/article-a",
    });
    expect(articleResult.url).toContain("/articles/");
  });

  it("serves source-backed recruiting market aggregates", async () => {
    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", { firm: EXAMPLE_WEALTH_LLC, state: "ga", year: "2024" })
    );

    expect(market).toMatchObject({
      filters: {
        firmId: "firm-a",
        state: "GA",
        year: "2024",
      },
      summary: {
        count: 3,
        knownAum: 500_000_000,
        unknownAumCount: 2,
        missingT12Count: 2,
      },
      sourceCoverage: {
        moveCount: 3,
        sourceBackedCount: 1,
        missingSourceCount: 2,
        missingAumCount: 2,
        missingT12Count: 2,
        statusCounts: expect.arrayContaining([
          { status: SOURCE_BACKED_REASON, count: 1 },
          { status: MISSING_SOURCE_REASON, count: 2 },
          { status: MISSING_AUM_REASON, count: 2 },
          { status: MISSING_T12_REASON, count: 2 },
          { status: MISSING_DEAL_TERMS_REASON, count: 2 },
          { status: MISSING_TOTAL_PCT_T12_REASON, count: 1 },
          { status: MISSING_BACKEND_METRICS_REASON, count: 1 },
          { status: MISSING_CLAWBACK_TERMS_REASON, count: 1 },
        ]),
      },
      provenance: {
        sourceTables: expect.arrayContaining([
          "TransitionEvent",
          "RecruitingDealQuote",
          "Article",
        ]),
        sourceIds: expect.arrayContaining([
          TRANSITION_A_ID,
          TRANSITION_TEAM_ID,
          TRANSITION_OUT_ID,
        ]),
      },
    });
    expect(market.firmMomentum[0]).toMatchObject({
      firm: { id: "firm-a", short: EXAMPLE_WM_SHORT },
      inbound: { count: 2, knownAum: 500_000_000, unknownAumCount: 1 },
      outbound: { count: 1, knownAum: 0, unknownAumCount: 1 },
      netMoveCount: 1,
      netKnownAum: 500_000_000,
    });
    expect(market.marketActivity[0]).toMatchObject({
      market: "Atlanta, GA",
      summary: { count: 3, knownAum: 500_000_000 },
    });
    expect(market.recentMoves).toEqual([
      expect.objectContaining({
        id: TRANSITION_OUT_ID,
        sourceStatus: expect.arrayContaining([
          MISSING_SOURCE_REASON,
          MISSING_AUM_REASON,
          MISSING_T12_REASON,
          MISSING_DEAL_TERMS_REASON,
        ]),
      }),
      expect.objectContaining({
        id: TRANSITION_TEAM_ID,
        article: null,
        sourceStatus: expect.arrayContaining([
          MISSING_SOURCE_REASON,
          MISSING_AUM_REASON,
          MISSING_T12_REASON,
          MISSING_DEAL_TERMS_REASON,
        ]),
      }),
      expect.objectContaining({
        id: TRANSITION_A_ID,
        article: expect.objectContaining({
          url: STONE_JOINS_EXAMPLE_URL,
        }),
        deal: {
          upfrontPctT12: 180,
          totalPctT12: undefined,
          forgivableLoanTermYears: undefined,
          producerTier: "top",
          backendMetrics: undefined,
          clawbackTerms: undefined,
        },
        provenance: expect.objectContaining({
          dealQuoteIds: ["deal-a"],
        }),
        sourceStatus: expect.arrayContaining([
          SOURCE_BACKED_REASON,
          MISSING_TOTAL_PCT_T12_REASON,
          MISSING_BACKEND_METRICS_REASON,
          MISSING_CLAWBACK_TERMS_REASON,
        ]),
      }),
    ]);

    await expect(
      new (resources as any).RecruitingMarket().get(
        routeTarget("", { firm: MISSING_FIRM_REASON })
      )
    ).resolves.toMatchObject({
      summary: { count: 3 },
      emptyState: null,
    });
    await expect(
      new (resources as any).RecruitingMarket().get(
        routeTarget("", { state: "ZZ" })
      )
    ).resolves.toMatchObject({
      summary: { count: 0 },
      emptyState:
        "No matching public recruiting move data is loaded for these filters.",
    });
  });

  it("keeps recruiting source coverage aligned with filtered slices", async () => {
    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", {
        firm: EXAMPLE_WEALTH_LLC,
        limit: "1",
        state: "ga",
        year: "2024",
      })
    );

    expect(market.summary.count).toBe(3);
    expect(market.recentMoves).toHaveLength(1);
    expect(market.sourceCoverage).toMatchObject({
      moveCount: 3,
      sourceBackedCount: 1,
      missingSourceCount: 2,
      missingAumCount: 2,
      missingT12Count: 2,
    });
    expect(market.sourceCoverage.statusCounts).toEqual(
      expect.arrayContaining([
        { status: MISSING_SOURCE_REASON, count: 2 },
        { status: SOURCE_BACKED_REASON, count: 1 },
      ])
    );
    expect(market.firmMomentum[0].sourceMoveIds).toEqual(
      expect.arrayContaining(market.provenance.sourceIds)
    );
    expect(market.marketActivity[0].sourceMoveIds).toEqual(
      expect.arrayContaining(market.provenance.sourceIds)
    );
  });

  it("matches Date-valued recruiting move dates for year filters", async () => {
    setRows(
      "TransitionEvent",
      (tableRows.get("TransitionEvent") ?? []).map(row =>
        row.id === TRANSITION_A_ID
          ? { ...row, moveDate: new Date("2024-02-01T00:00:00.000Z") }
          : row
      )
    );

    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", { firm: EXAMPLE_WEALTH_LLC, state: "ga", year: "2024" })
    );

    expect(market.summary.count).toBe(3);
    expect(market.provenance.sourceIds).toEqual(
      expect.arrayContaining([TRANSITION_A_ID])
    );
  });

  it("serves deterministic recruiting watchlist snapshots", async () => {
    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", {
        firm: [EXAMPLE_WEALTH_LLC, BETA_ADVISORS],
        state: "ga",
        year: "2024",
      })
    );

    expect(market.filters).toMatchObject({
      firmId: null,
      firmQuery: null,
      state: "GA",
      watchlistFirmIds: ["firm-a", "firm-b"],
      watchlistFirmQueries: [EXAMPLE_WEALTH_LLC, BETA_ADVISORS],
      year: "2024",
    });
    expect(market.watchlist).toMatchObject({
      generatedAt: market.generatedAt,
      count: 2,
      summary: {
        inbound: { count: 3, knownAum: 500_000_000 },
        outbound: { count: 3, knownAum: 500_000_000 },
        netMoveCount: 0,
        netKnownAum: 0,
      },
    });
    expect(market.watchlist.items).toEqual([
      expect.objectContaining({
        query: EXAMPLE_WEALTH_LLC,
        firm: expect.objectContaining({
          id: "firm-a",
          short: EXAMPLE_WM_SHORT,
        }),
        inbound: {
          count: 2,
          knownAum: 500_000_000,
          unknownAumCount: 1,
          missingT12Count: 1,
        },
        outbound: {
          count: 1,
          knownAum: 0,
          unknownAumCount: 1,
          missingT12Count: 1,
        },
        netMoveCount: 1,
        netKnownAum: 500_000_000,
        sourceCoverage: {
          moveCount: 3,
          sourceBackedCount: 1,
          missingSourceCount: 2,
          missingLocationCount: 0,
        },
        sourceMoveIds: [TRANSITION_A_ID, TRANSITION_TEAM_ID, TRANSITION_OUT_ID],
        sourceStatus: expect.arrayContaining([
          MISSING_SOURCE_REASON,
          MISSING_AUM_REASON,
        ]),
      }),
      expect.objectContaining({
        query: BETA_ADVISORS,
        firm: expect.objectContaining({ id: "firm-b" }),
        inbound: {
          count: 1,
          knownAum: 0,
          unknownAumCount: 1,
          missingT12Count: 1,
        },
        outbound: {
          count: 2,
          knownAum: 500_000_000,
          unknownAumCount: 1,
          missingT12Count: 1,
        },
        netMoveCount: -1,
        netKnownAum: -500_000_000,
        sourceCoverage: {
          moveCount: 3,
          sourceBackedCount: 1,
          missingSourceCount: 2,
          missingLocationCount: 0,
        },
        sourceMoveIds: [TRANSITION_OUT_ID, TRANSITION_A_ID, TRANSITION_TEAM_ID],
        sourceStatus: expect.arrayContaining([
          MISSING_SOURCE_REASON,
          MISSING_AUM_REASON,
        ]),
      }),
    ]);
  });

  it("adds public branch and coverage context to shortlist-style watchlist firms", async () => {
    setRows("Firm", [
      ...(tableRows.get("Firm") ?? []),
      {
        id: SHORTLIST_MORGAN_FIRM_ID,
        name: MORGAN_STANLEY_NAME,
        channel: "wirehouse",
      },
      { id: "firm-ubs", name: SHORTLIST_UBS_NAME, channel: "wirehouse" },
    ]);
    setRows("Branch", [
      ...(tableRows.get("Branch") ?? []),
      {
        id: SHORTLIST_MORGAN_LOADED_BRANCH_ID,
        firmId: SHORTLIST_MORGAN_FIRM_ID,
        level: "office",
        city: "New York",
        state: "NY",
      },
      {
        id: "branch-morgan-partial",
        firmId: SHORTLIST_MORGAN_FIRM_ID,
        level: "office",
        city: "Boston",
        state: "MA",
      },
    ]);
    setRows("EmploymentHistory", [
      ...(tableRows.get("EmploymentHistory") ?? []),
      {
        id: "employment-morgan-sourced",
        advisorId: "advisor-a",
        firmId: SHORTLIST_MORGAN_FIRM_ID,
        branchId: SHORTLIST_MORGAN_LOADED_BRANCH_ID,
        roleTitle: "Advisor",
        startDate: DATE_2022_01_01,
        sourceType: "firm_roster",
        sourceRef: "morgan-roster",
      },
      {
        id: "employment-morgan-unsourced",
        advisorId: "advisor-b",
        firmId: SHORTLIST_MORGAN_FIRM_ID,
        branchId: SHORTLIST_MORGAN_LOADED_BRANCH_ID,
        roleTitle: "Advisor",
        startDate: "2023-01-01",
      },
    ]);

    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", {
        firm: [MORGAN_STANLEY_NAME, SHORTLIST_UBS_NAME, SHORTLIST_RBC_NAME],
      })
    );

    const [morgan, ubs, rbc] = market.watchlist.items;
    expect(morgan).toMatchObject({
      query: MORGAN_STANLEY_NAME,
      firm: expect.objectContaining({ id: SHORTLIST_MORGAN_FIRM_ID }),
      branchCoverage: {
        status: "partial",
        branchCount: 2,
        currentAdvisorCount: 2,
        branchesWithCurrentAdvisors: 1,
        partialBranchCount: 1,
        sourceTypes: ["firm_roster"],
        sourceRefCount: 1,
        missingSourceCount: 1,
        limitation: expect.stringContaining("branch rows"),
      },
      evidenceLinks: {
        recruiting: "/recruiting?firm=Morgan%20Stanley",
        recruitingResource: "/RecruitingMarket?firm=Morgan%20Stanley",
        firmProfile: `/firm.html?id=${SHORTLIST_MORGAN_FIRM_ID}`,
        firmProfileResource: `/FirmProfile/${SHORTLIST_MORGAN_FIRM_ID}`,
        branchExplorer: `/branches?firm=${SHORTLIST_MORGAN_FIRM_ID}`,
        publicBranchesResource: `/PublicBranches?firm=${SHORTLIST_MORGAN_FIRM_ID}`,
        dataCoverage: "/coverage",
        dataCoverageResource: DATA_COVERAGE_RESOURCE,
      },
    });
    expect(ubs.branchCoverage).toMatchObject({
      status: "partial",
      branchCount: 0,
      currentAdvisorCount: null,
      limitation: expect.stringContaining("No public branch rows"),
    });
    expect(rbc).toMatchObject({
      query: SHORTLIST_RBC_NAME,
      firm: null,
      branchCoverage: {
        status: "unavailable",
        branchCount: null,
        currentAdvisorCount: null,
        branchesWithCurrentAdvisors: null,
        partialBranchCount: null,
        sourceTypes: [],
        sourceRefCount: null,
        missingSourceCount: null,
        limitation: expect.stringContaining("did not resolve"),
      },
      evidenceLinks: {
        firmProfile: null,
        firmProfileResource: null,
        branchExplorer: null,
        publicBranchesResource: null,
        dataCoverage: "/coverage",
        dataCoverageResource: DATA_COVERAGE_RESOURCE,
      },
    });
    expect(JSON.stringify(market.watchlist)).not.toMatch(
      /UserWatchlists|watchlistNote|privateWatchlist|RegulatoryDiscrepancy|reviewer/i
    );
  });

  it("surfaces complementary recruiting deal term gaps", async () => {
    setRows("RecruitingDealQuote", [
      {
        id: "deal-a",
        totalPctT12: 225,
        backendMetrics: "Back-end hurdles disclosed",
        clawbackTerms: "Five-year note",
        sourceArticleId: "article-a",
      },
    ]);

    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", { firm: EXAMPLE_WEALTH_LLC, state: "ga", year: "2024" })
    );
    const move = market.recentMoves.find(
      (row: { id: string }) => row.id === TRANSITION_A_ID
    );

    expect(move).toMatchObject({
      deal: {
        totalPctT12: 225,
        backendMetrics: "Back-end hurdles disclosed",
        clawbackTerms: "Five-year note",
      },
      sourceStatus: expect.arrayContaining([
        MISSING_UPFRONT_PCT_T12_REASON,
        MISSING_PRODUCER_TIER_REASON,
      ]),
    });
    expect(move.sourceStatus).not.toEqual(
      expect.arrayContaining([
        MISSING_TOTAL_PCT_T12_REASON,
        MISSING_BACKEND_METRICS_REASON,
        MISSING_CLAWBACK_TERMS_REASON,
      ])
    );
  });

  it("normalizes recruiting watchlist inputs deterministically", async () => {
    const target = routeTarget("", {
      firm: [
        "Example Wealth LLC, Beta Advisors",
        EXAMPLE_WEALTH_LLC,
        EXAMPLE_WEALTH_LLC,
        "Missing One",
        "Missing Two",
        "Missing Three",
        "Missing Four",
        "Missing Five",
        "Missing Six",
        "Missing Seven",
      ],
      firmId: "firm-b",
      state: "ga",
      year: "2024",
    });
    const first = await new (resources as any).RecruitingMarket().get(target);
    const second = await new (resources as any).RecruitingMarket().get(target);
    const stable = (market: any) => ({
      filters: market.filters,
      recentMoveIds: market.recentMoves.map((move: any) => move.id),
      watchlist: {
        count: market.watchlist.count,
        itemKeys: market.watchlist.items.map((item: any) => ({
          firmId: item.firm?.id ?? null,
          query: item.query,
          sourceStatus: item.sourceStatus,
        })),
        summary: market.watchlist.summary,
      },
    });

    expect(stable(first)).toEqual(stable(second));
    expect(first.watchlist.count).toBe(8);
    expect(first.filters).toMatchObject({
      firmId: null,
      firmQuery: null,
      state: "GA",
      watchlistFirmIds: ["firm-a", "firm-b", "firm-a", "firm-a"],
      watchlistFirmQueries: [
        EXAMPLE_WEALTH_LLC,
        BETA_ADVISORS,
        EXAMPLE_WEALTH_LLC,
        EXAMPLE_WEALTH_LLC,
        "Missing One",
        "Missing Two",
        "Missing Three",
        "Missing Four",
      ],
      year: "2024",
    });
    for (const duplicate of first.watchlist.items.slice(2, 4)) {
      expect(duplicate).toMatchObject({
        query: EXAMPLE_WEALTH_LLC,
        firm: expect.objectContaining({ id: "firm-a" }),
        sourceMoveIds: first.watchlist.items[0].sourceMoveIds,
        sourceStatus: first.watchlist.items[0].sourceStatus,
      });
    }
    expect(first.watchlist.items.slice(4)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firm: null,
          sourceStatus: [UNRESOLVED_FIRM_REASON],
        }),
      ])
    );
  });

  it("covers empty and source-degraded recruiting watchlist rows", async () => {
    setRows("TransitionEvent", [
      ...(tableRows.get("TransitionEvent") ?? []),
      {
        id: "transition-unlocated",
        subjectAdvisorId: "advisor-a",
        fromFirmId: "firm-b",
        toFirmId: "firm-a",
        moveDate: "2024-05-01",
        aumMoved: 125_000_000,
        productionT12: null,
      },
    ]);
    const degraded = await new (resources as any).RecruitingMarket().get(
      routeTarget("", { firm: EXAMPLE_WEALTH_LLC, year: "2024" })
    );

    expect(degraded.watchlist.items[0]).toMatchObject({
      firm: { id: "firm-a" },
      sourceCoverage: {
        moveCount: 4,
        sourceBackedCount: 1,
        missingSourceCount: 3,
        missingLocationCount: 1,
      },
      sourceMoveIds: [
        TRANSITION_A_ID,
        TRANSITION_TEAM_ID,
        "transition-unlocated",
        TRANSITION_OUT_ID,
      ],
      sourceStatus: expect.arrayContaining([
        "missing-location",
        MISSING_SOURCE_REASON,
        MISSING_T12_REASON,
      ]),
    });

    const empty = await new (resources as any).RecruitingMarket().get(
      routeTarget("", {
        firm: [EXAMPLE_WEALTH_LLC, "Missing Firm"],
        state: "TX",
      })
    );

    expect(empty).toMatchObject({
      summary: { count: 0 },
      emptyState:
        "No matching public recruiting move data is loaded for these filters.",
      watchlist: {
        count: 2,
        items: [
          {
            query: EXAMPLE_WEALTH_LLC,
            firm: expect.objectContaining({ id: "firm-a" }),
            inbound: {
              count: 0,
              knownAum: 0,
              unknownAumCount: 0,
              missingT12Count: 0,
            },
            outbound: {
              count: 0,
              knownAum: 0,
              unknownAumCount: 0,
              missingT12Count: 0,
            },
            netMoveCount: 0,
            netKnownAum: 0,
            sourceCoverage: {
              moveCount: 0,
              sourceBackedCount: 0,
              missingSourceCount: 0,
              missingLocationCount: 0,
            },
            sourceMoveIds: [],
            sourceStatus: ["no-matching-moves"],
          },
          {
            query: "Missing Firm",
            firm: null,
            inbound: {
              count: 0,
              knownAum: 0,
              unknownAumCount: 0,
              missingT12Count: 0,
            },
            outbound: {
              count: 0,
              knownAum: 0,
              unknownAumCount: 0,
              missingT12Count: 0,
            },
            netMoveCount: 0,
            netKnownAum: 0,
            sourceCoverage: {
              moveCount: 0,
              sourceBackedCount: 0,
              missingSourceCount: 0,
              missingLocationCount: 0,
            },
            sourceMoveIds: [],
            sourceStatus: [UNRESOLVED_FIRM_REASON],
          },
        ],
      },
    });
  });

  it("reads AdvisorBook MCP resources with public payloads", async () => {
    const endpoint = new (resources as any).mcp();
    const readResource = async (uri: string) => {
      const response = await endpoint.post({
        jsonrpc: "2.0",
        id: uri,
        method: "resources/read",
        params: { uri },
      });
      return response.result.structuredContent;
    };

    const feed = await readResource("advisorbook://feed");
    const advisor = await readResource("advisorbook://advisor/avery-stone");
    const firm = await readResource(
      "advisorbook://firm/Example%20Wealth%20LLC"
    );
    const team = await readResource("advisorbook://team/stone-group");
    const article = await readResource(
      "advisorbook://article/stone-joins-example"
    );

    expect(feed).toMatchObject({ count: 2 });
    expect(advisor).toMatchObject({
      advisor: { id: "advisor-a" },
      displayName: AVERY_STONE_NAME,
    });
    expect(firm).toMatchObject({ firm: { id: "firm-a" } });
    expect(team).toMatchObject({ team: { id: "team-a" } });
    expect(article).toMatchObject({
      article: {
        id: "article-a",
        url: STONE_JOINS_EXAMPLE_URL,
      },
      body: {
        text: "Avery Stone joined Example Wealth Management with a large team and client base.",
      },
      provenance: [
        {
          targetTable: "Advisor",
          targetId: "advisor-a",
          fieldName: "legalName",
        },
      ],
    });

    await expect(
      readResource("advisorbook://article/missing-article")
    ).resolves.toEqual({ error: "not found", id: "missing-article" });
  });

  it("returns route errors for missing or unknown profile ids", async () => {
    await expect(new (resources as any).ArticleView().get("")).resolves.toEqual(
      {
        error: "missing article id",
      }
    );
    await expect(
      new (resources as any).AdvisorProfile().get("unknown")
    ).resolves.toEqual({ error: "not found", id: "unknown" });
    await expect(
      new (resources as any).AdvisorComparison().get(
        routeTarget("", { ids: "advisor-a" })
      )
    ).resolves.toMatchObject({
      selection: {
        status: "under_limit",
        requestedIds: ["advisor-a"],
        normalizedIds: ["advisor-a"],
        cappedIds: ["advisor-a"],
        missingIds: [],
        truncated: false,
      },
      count: 1,
      ids: ["advisor-a"],
      items: [{ status: "found", id: "advisor-a" }],
    });
    const missingComparison = await new (
      resources as any
    ).AdvisorComparison().get(routeTarget("", { ids: "advisor-a,unknown" }));
    expect(missingComparison).toMatchObject({
      selection: {
        status: "ready",
        requestedIds: ["advisor-a", "unknown"],
        normalizedIds: ["advisor-a", "unknown"],
        duplicateIds: [],
        cappedIds: ["advisor-a", "unknown"],
        missingIds: ["unknown"],
        truncated: false,
      },
      count: 2,
      ids: ["advisor-a", "unknown"],
      items: [
        { status: "found", id: "advisor-a" },
        {
          status: "not_found",
          id: "unknown",
          identity: null,
          displayName: "unknown",
          firm: null,
          regulatory: {
            brokerCheckSnapshot: null,
            disclosures: [],
            disclosureCount: 0,
            registrationApplications: [],
          },
          career: [],
          rankings: [],
          articles: [],
          attribution: {
            brokerCheck: null,
            articles: [],
            assertions: [],
            researchSources: [],
          },
        },
      ],
    });
    await expect(
      new (resources as any).AdvisorComparison().get(
        routeTarget("", { ids: "advisor-a,advisor-a,unknown,advisor-b" })
      )
    ).resolves.toMatchObject({
      selection: {
        status: "ready",
        requestedIds: ["advisor-a", "advisor-a", "unknown", "advisor-b"],
        normalizedIds: ["advisor-a", "unknown", "advisor-b"],
        duplicateIds: ["advisor-a"],
        cappedIds: ["advisor-a", "unknown", "advisor-b"],
        missingIds: ["unknown"],
      },
      ids: ["advisor-a", "unknown", "advisor-b"],
    });
    await expect(
      new (resources as any).AdvisorComparison().get(
        routeTarget("", {
          ids: "advisor-a,advisor-b,advisor-c,advisor-d,advisor-e",
        })
      )
    ).resolves.toMatchObject({
      selection: {
        status: "over_limit",
        requestedIds: [
          "advisor-a",
          "advisor-b",
          "advisor-c",
          "advisor-d",
          "advisor-e",
        ],
        normalizedIds: [
          "advisor-a",
          "advisor-b",
          "advisor-c",
          "advisor-d",
          "advisor-e",
        ],
        cappedIds: ["advisor-a", "advisor-b", "advisor-c", "advisor-d"],
        truncated: true,
      },
      count: 4,
      ids: ["advisor-a", "advisor-b", "advisor-c", "advisor-d"],
    });
    await expect(
      new (resources as any).FirmAdvisors().get("")
    ).resolves.toEqual({
      error: "missing firm id",
      items: [],
      nextCursor: null,
    });
    await expect(
      new (resources as any).FirmProfile().get("unknown")
    ).resolves.toEqual({ error: "not found", id: "unknown" });
    await expect(new (resources as any).TeamProfile().get("")).resolves.toEqual(
      {
        error: "missing team id",
      }
    );
    await expect(
      new (resources as any).TeamProfile().get("unknown")
    ).resolves.toEqual({ error: "not found", id: "unknown" });
  });
});

describe("Harper directory and search resources", () => {
  it("serves sorted public directories and ranked search results", async () => {
    const firms = await new (resources as any).PublicFirms().get(
      routeTarget("", { limit: "1" })
    );
    const advisors = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { limit: "1" })
    );
    const teams = await new (resources as any).PublicTeams().get(
      routeTarget("", { limit: "1" })
    );
    const result = await new (resources as any).Search().get(
      routeTarget("", { q: "stone", limit: "5" })
    );
    const firmOnly = await new (resources as any).Search().get(
      routeTarget("", { kind: "firm", limit: "5", q: "example" })
    );

    expect(firms).toMatchObject({
      items: [expect.objectContaining({ name: BETA_ADVISORS })],
      total: 2,
      nextCursor: BETA_ADVISORS_FIRM_CURSOR,
    });
    expect(advisors).toMatchObject({
      items: [expect.objectContaining({ id: "advisor-a" })],
      total: 2,
      nextCursor: OFFSET_ONE_CURSOR,
    });
    expect(teams.total).toBe(1);
    expect(teams.nextCursor).toBeNull();
    expect(teams.items).toHaveLength(1);
    expect(teams.items[0]).toMatchObject({
      id: "team-a",
      currentFirmName: EXAMPLE_WEALTH_MANAGEMENT,
    });
    expect(result.counts).toEqual({
      firms: 0,
      advisors: 1,
      teams: 1,
      total: 2,
    });
    expect(result.items.map((item: any) => item.kind)).toEqual([
      "advisor",
      "team",
    ]);
    expect(firmOnly).toMatchObject({
      kind: "firm",
      counts: { firms: 1, advisors: 0, teams: 0, total: 1 },
      items: [expect.objectContaining({ kind: "firm", id: "firm-a" })],
    });
  });

  it("returns title-cased multi-word firm and team prefixes", async () => {
    const wellsFargoAdvisors = "Wells Fargo Advisors";
    const wellsTeam = "Wells Fargo Advisors - GM Building";
    setRows("Firm", [
      { id: "firm-morgan", name: MORGAN_STANLEY_NAME, hqCity: "New York" },
      { id: "firm-wells", name: wellsFargoAdvisors, hqCity: "St. Louis" },
    ]);
    setRows("FirmAlias", []);
    setRows("Advisor", [
      { id: "advisor-stanley", firstName: "Clyde", lastName: "Stanley" },
    ]);
    setRows("Team", [
      {
        id: "team-wells",
        name: wellsTeam,
        currentFirmId: "firm-wells",
      },
    ]);
    setRows("EmploymentHistory", []);

    const morgan = await new (resources as any).Search().get(
      routeTarget("", { q: "morgan stanley", limit: "5" })
    );
    const wells = await new (resources as any).Search().get(
      routeTarget("", { q: "wells fargo advisors", limit: "5" })
    );

    expect(morgan.items[0]).toMatchObject({
      kind: "firm",
      name: MORGAN_STANLEY_NAME,
    });
    expect(wells.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "firm", name: wellsFargoAdvisors }),
        expect.objectContaining({ kind: "team", name: wellsTeam }),
      ])
    );
  });

  it("handles optional aliases, team firm misses, and capped search results", async () => {
    setRows("FirmAlias", []);
    setRows("Team", [
      { id: "team-z", name: "Zeta Team" },
      { id: "team-a", name: "Alpha Team", currentFirmId: MISSING_FIRM_REASON },
    ]);
    setRows(
      "Advisor",
      Array.from({ length: 25 }, (_, index) => ({
        id: `advisor-${index}`,
        firstName: "Stone",
        lastName: `Advisor ${index}`,
      }))
    );

    const firms = await new (resources as any).PublicFirms().get();
    const teams = await new (resources as any).PublicTeams().get();
    const result = await new (resources as any).Search().get(
      routeTarget("", { limit: "50", q: "stone" })
    );

    expect(firms.items).toHaveLength(2);
    expect(firms.total).toBe(2);
    expect(teams.items).toEqual([
      expect.objectContaining({ currentFirmName: null, id: "team-a" }),
      expect.objectContaining({ currentFirmName: null, id: "team-z" }),
    ]);
    expect(teams.total).toBe(2);
    expect(result.items).toHaveLength(20);
    expect(result.counts.advisors).toBe(25);
  });

  it("filters advisor directories by current firm, status, and CRD presence", async () => {
    setRows("Advisor", [
      {
        id: "advisor-a",
        firstName: "Avery",
        lastName: "Stone",
        legalName: AVERY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Young",
        legalName: BLAKE_YOUNG_NAME,
        careerStatus: "retired",
      },
      {
        id: "advisor-c",
        firstName: "Casey",
        lastName: "Stone",
        legalName: CASEY_STONE_NAME,
        careerStatus: "active",
      },
    ]);
    setRows("EmploymentHistory", [
      {
        id: EMPLOYMENT_A_ID,
        advisorId: "advisor-a",
        firmId: "firm-a",
        startDate: DATE_2024_01_01,
      },
      {
        id: EMPLOYMENT_B_ID,
        advisorId: "advisor-b",
        firmId: "firm-a",
        startDate: DATE_2023_01_01,
        endDate: DATE_2024_01_01,
      },
      {
        id: "employment-c",
        advisorId: "advisor-c",
        firmId: "firm-b",
        startDate: DATE_2024_01_01,
      },
    ]);

    const result = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        careerStatus: "active",
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        hasCrd: "true",
        limit: "1",
        q: "stone",
      })
    );

    expect(result).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          finraCrd: "1234567",
          hasCrd: true,
          id: "advisor-a",
        }),
      ],
      nextCursor: null,
    });
  });

  it("exposes verifiable CRD state on advisor directory rows", async () => {
    setRows("Advisor", [
      {
        id: "advisor-a",
        firstName: "Avery",
        lastName: "Stone",
        legalName: AVERY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Young",
        legalName: BLAKE_YOUNG_NAME,
        careerStatus: "active",
        finraCrd: null,
      },
    ]);

    const withCrd = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { careerStatus: "active", hasCrd: "true" })
    );
    const withoutCrd = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { careerStatus: "active", hasCrd: "false" })
    );

    expect(withCrd).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          finraCrd: "1234567",
          hasCrd: true,
          id: "advisor-a",
        }),
      ],
    });
    expect(withoutCrd).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          finraCrd: null,
          hasCrd: false,
          id: "advisor-b",
        }),
      ],
    });
  });

  it("derives public-safe contact readiness on advisor directory rows", async () => {
    setRows("Advisor", [
      {
        id: ADVISOR_READY_ID,
        firstName: "Ready",
        lastName: "Advisor",
        legalName: "Ready Advisor",
        careerStatus: "active",
        finraCrd: "1234567",
        businessEmail: "ready@example.com",
        businessPhone: "2125550100",
        linkedinUrl: "https://linkedin.example/ready",
        headshotUrl: "https://example.com/ready.jpg",
        bioText: "Source-backed public biography.",
      },
      {
        id: "advisor-contact-gap",
        firstName: "Contact",
        lastName: "Gap",
        legalName: "Contact Gap",
        careerStatus: "active",
        finraCrd: "7654321",
        headshotUrl: "https://example.com/gap.jpg",
        bioText: "Public biography exists.",
      },
      {
        id: ADVISOR_SUBSTANCE_GAP_ID,
        firstName: "Substance",
        lastName: "Gap",
        legalName: "Substance Gap",
        careerStatus: "active",
        businessEmail: "substance@example.com",
        businessPhone: "2125550199",
        linkedinUrl: "https://linkedin.example/substance",
      },
    ]);

    const result = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { careerStatus: "active", limit: "10" })
    );

    const byId = new Map(
      result.items.map((advisor: any) => [advisor.id, advisor])
    );
    expect(byId.get(ADVISOR_READY_ID)).toMatchObject({
      hasCrd: true,
      readiness: {
        contact: "ready",
        profileSubstance: "present",
        crd: "present",
        freshness: "unknown",
        fields: {
          businessEmail: "present",
          businessPhone: "present",
          linkedinUrl: "present",
          headshotUrl: "present",
          bioText: "present",
          crd: "present",
        },
      },
    });
    expect(byId.get("advisor-contact-gap").readiness).toMatchObject({
      contact: "missing_contact_data",
      profileSubstance: "present",
      crd: "present",
      fields: {
        businessEmail: "missing",
        businessPhone: "missing",
        linkedinUrl: "missing",
      },
      limitations: expect.arrayContaining([
        "Business email is unavailable in public source data.",
        "Business phone is unavailable in public source data.",
        "LinkedIn URL is unavailable in public source data.",
      ]),
    });
    expect(byId.get(ADVISOR_SUBSTANCE_GAP_ID).readiness).toMatchObject({
      contact: "ready",
      profileSubstance: "missing_profile_substance",
      crd: "absent",
      fields: {
        businessEmail: "present",
        businessPhone: "present",
        linkedinUrl: "present",
        headshotUrl: "missing",
        bioText: "missing",
        crd: "missing",
      },
      limitations: expect.arrayContaining([
        "Headshot is unavailable in public source data.",
        "Profile substance is unavailable in public source data.",
        "FINRA CRD is unavailable in public source data.",
      ]),
    });
    expect(JSON.stringify(result)).not.toMatch(
      /unsuitable|misconduct|lower quality|recommendation/i
    );

    const contactReady = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        contactReadiness: "ready",
        freshness: "unknown",
        limit: "10",
      })
    );
    expect(contactReady.items.map((advisor: any) => advisor.id)).toEqual([
      ADVISOR_READY_ID,
      ADVISOR_SUBSTANCE_GAP_ID,
    ]);

    const missingProfile = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        profileSubstance: "missing_profile_substance",
        limit: "10",
      })
    );
    expect(missingProfile.items.map((advisor: any) => advisor.id)).toEqual([
      ADVISOR_SUBSTANCE_GAP_ID,
    ]);
  });

  it("keeps readiness rows isolated from private advisor data", async () => {
    setRows("Advisor", [
      {
        id: ADVISOR_SUBSTANCE_GAP_ID,
        firstName: "Substance",
        lastName: "Gap",
        legalName: "Substance Gap",
        careerStatus: "active",
        businessEmail: "substance@example.com",
        businessPhone: "2125550199",
        linkedinUrl: "https://linkedin.example/substance",
      },
    ]);
    setRows("UserRating", [
      {
        id: "rating-private-readiness",
        userId: PRIVATE_USER_ID,
        advisorId: ADVISOR_SUBSTANCE_GAP_ID,
        ratingInt: 1,
        reviewText: "private watchlist rating note",
      },
    ]);
    setRows("UserWatchlist", [
      {
        id: "watchlist-private-readiness",
        userId: PRIVATE_USER_ID,
        name: "Analyst private shortlist",
      },
    ]);
    setRows("UserWatchlistEntry", [
      {
        id: "watchlist-entry-private-readiness",
        listId: "watchlist-private-readiness",
        advisorId: ADVISOR_SUBSTANCE_GAP_ID,
        note: "private watchlist entry note",
      },
    ]);
    setRows(REGULATORY_DISCREPANCY_TABLE, [
      {
        id: "reg-private-readiness",
        advisorId: ADVISOR_SUBSTANCE_GAP_ID,
        fieldName: "finraCrd",
        advisorHubValue: "private analyst discrepancy row",
        brokerCheckValue: "reviewer-only correction context",
        status: "pending",
        reviewerNote: "do not expose reviewer note",
      },
    ]);
    setRows(ADVISOR_CORRECTION_REQUEST_TABLE, [
      {
        id: "correction-private-readiness",
        advisorId: ADVISOR_SUBSTANCE_GAP_ID,
        submitterEmail: CLIENT_EMAIL,
        fieldName: "bioText",
        proposedValue: "private correction proposed value",
        submitterNote: "private correction submitter note",
        status: "pending",
        reviewerNote: "private correction reviewer note",
      },
    ]);

    const result = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        contactReadiness: "ready",
        profileSubstance: "missing_profile_substance",
        limit: "10",
      })
    );

    expect(result).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: ADVISOR_SUBSTANCE_GAP_ID,
          readiness: expect.objectContaining({
            contact: "ready",
            profileSubstance: "missing_profile_substance",
            limitations: expect.arrayContaining([
              "Headshot is unavailable in public source data.",
              "Profile substance is unavailable in public source data.",
              "FINRA CRD is unavailable in public source data.",
            ]),
          }),
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|watchlist|rating|analyst|discrepancy|reviewer|correction|suitability|misconduct|lower quality|recommendation/i
    );
  });

  it("filters advisor directories with stable totals and cursor pages", async () => {
    setRows("Advisor", [
      {
        id: "advisor-a",
        firstName: "Avery",
        lastName: "Stone",
        legalName: AVERY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-c",
        firstName: "Casey",
        lastName: "Stone",
        legalName: CASEY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "7654321",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Young",
        legalName: BLAKE_YOUNG_NAME,
        careerStatus: "active",
        finraCrd: "8888888",
      },
    ]);
    setRows("EmploymentHistory", [
      {
        id: EMPLOYMENT_A_ID,
        advisorId: "advisor-a",
        firmId: "firm-a",
        startDate: DATE_2024_01_01,
      },
      {
        id: "employment-c",
        advisorId: "advisor-c",
        firmId: "firm-a",
        startDate: DATE_2024_01_01,
      },
      {
        id: EMPLOYMENT_B_ID,
        advisorId: "advisor-b",
        firmId: "firm-b",
        startDate: DATE_2024_01_01,
      },
    ]);

    const first = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        careerStatus: "active",
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        hasCrd: "true",
        limit: "1",
        q: "stone",
      })
    );
    const second = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        careerStatus: "active",
        cursor: first.nextCursor,
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        hasCrd: "true",
        limit: "1",
        q: "stone",
      })
    );
    const unfiltered = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { limit: "10" })
    );

    expect(first).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "advisor-a" })],
      nextCursor: OFFSET_ONE_CURSOR,
    });
    expect(second).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "advisor-c" })],
      nextCursor: null,
    });
    expect(unfiltered).toMatchObject({
      total: 3,
      nextCursor: null,
    });
    expect(unfiltered.items.map((advisor: any) => advisor.id)).toEqual([
      "advisor-a",
      "advisor-c",
      "advisor-b",
    ]);
  });

  it("filters advisor directories by missing CRD without treating invalid values as false", async () => {
    setRows("Advisor", [
      {
        id: "advisor-a",
        firstName: "Avery",
        lastName: "Stone",
        legalName: AVERY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Young",
        legalName: BLAKE_YOUNG_NAME,
        careerStatus: "active",
      },
      {
        id: "advisor-c",
        firstName: "Casey",
        lastName: "Stone",
        legalName: CASEY_STONE_NAME,
        careerStatus: "active",
        finraCrd: null,
      },
    ]);

    const first = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        careerStatus: "active",
        hasCrd: "false",
        limit: "1",
      })
    );
    const second = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        careerStatus: "active",
        cursor: first.nextCursor,
        hasCrd: "false",
        limit: "1",
      })
    );
    const invalidBoolean = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { careerStatus: "active", hasCrd: "missing", limit: "5" })
    );

    expect(first).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "advisor-c" })],
    });
    expect(first.nextCursor).toBe(OFFSET_ONE_CURSOR);
    expect(second).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "advisor-b" })],
      nextCursor: null,
    });
    expect(invalidBoolean).toMatchObject({ total: 3, nextCursor: null });
    expect(invalidBoolean.items.map((advisor: any) => advisor.id)).toEqual([
      "advisor-a",
      "advisor-c",
      "advisor-b",
    ]);
  });

  it("never queries EmploymentHistory when no firm filter is set", async () => {
    setRows("Advisor", [
      {
        id: "advisor-a",
        firstName: "Avery",
        lastName: "Stone",
        legalName: AVERY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Young",
        legalName: BLAKE_YOUNG_NAME,
        careerStatus: "retired",
      },
    ]);
    const original = (globalThis as any).tables.EmploymentHistory;
    const calls: any[] = [];
    (globalThis as any).tables.EmploymentHistory = {
      search: (query: any) => {
        calls.push(query);
        return (async function* () {})();
      },
    };

    try {
      const result = await new (resources as any).PublicAdvisors().get(
        routeTarget("", { careerStatus: "active", hasCrd: "true", q: "stone" })
      );

      // No firm filter → EmploymentHistory must not be touched at all.
      expect(calls).toHaveLength(0);
      expect(result).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ id: "advisor-a" })],
        nextCursor: null,
      });
    } finally {
      (globalThis as any).tables.EmploymentHistory = original;
    }
  });

  it("resolves the firm filter via indexed firmId queries, not a full scan", async () => {
    setRows("Advisor", [
      {
        id: "advisor-a",
        firstName: "Avery",
        lastName: "Stone",
        legalName: AVERY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Stone",
        legalName: "Blake Stone",
        careerStatus: "active",
        finraCrd: "2222222",
      },
      {
        id: "advisor-c",
        firstName: "Casey",
        lastName: "Stone",
        legalName: CASEY_STONE_NAME,
        careerStatus: "active",
        finraCrd: "3333333",
      },
    ]);
    const employmentRows = [
      { id: "e-a", advisorId: "advisor-a", firmId: "firm-a" },
      // advisor-b left firm-a (endDate) → excluded.
      {
        id: "e-b",
        advisorId: "advisor-b",
        firmId: "firm-a",
        endDate: DATE_2024_01_01,
      },
      // advisor-c is at firm-b (no name match) → excluded.
      { id: "e-c", advisorId: "advisor-c", firmId: "firm-b" },
    ];
    setRows("EmploymentHistory", employmentRows);
    const queriedFirmIds: string[] = [];
    const original = (globalThis as any).tables.EmploymentHistory;
    (globalThis as any).tables.EmploymentHistory = {
      search: (query: any) => {
        const condition = query?.conditions?.[0];
        if (!condition || condition.attribute !== "firmId") {
          throw new Error(
            "PublicAdvisors must query EmploymentHistory by firmId"
          );
        }
        queriedFirmIds.push(condition.value);
        return (async function* () {
          for (const row of employmentRows)
            if (row.firmId === condition.value) yield row;
        })();
      },
    };

    try {
      const result = await new (resources as any).PublicAdvisors().get(
        routeTarget("", { firm: EXAMPLE_WEALTH_SHORT_NAME })
      );

      // Only firm-a (name matches EXAMPLE_WEALTH_SHORT_NAME) was queried by firmId.
      expect(queriedFirmIds).toEqual(["firm-a"]);
      expect(result).toMatchObject({
        total: 1,
        items: [expect.objectContaining({ id: "advisor-a" })],
        nextCursor: null,
      });
    } finally {
      (globalThis as any).tables.EmploymentHistory = original;
    }
  });

  it("returns empty for a firm filter that matches no firm without querying", async () => {
    const original = (globalThis as any).tables.EmploymentHistory;
    const calls: any[] = [];
    (globalThis as any).tables.EmploymentHistory = {
      search: (query: any) => {
        calls.push(query);
        return (async function* () {})();
      },
    };

    try {
      const result = await new (resources as any).PublicAdvisors().get(
        routeTarget("", { firm: "zzznomatch" })
      );

      // No matching firm → no firmId queries are issued.
      expect(calls).toHaveLength(0);
      expect(result).toMatchObject({ total: 0, items: [], nextCursor: null });
    } finally {
      (globalThis as any).tables.EmploymentHistory = original;
    }
  });

  it("adds context when firm-filter employment lookup fails", async () => {
    const original = (globalThis as any).tables.EmploymentHistory;
    (globalThis as any).tables.EmploymentHistory = {
      search: () => {
        throw new Error("index unavailable");
      },
    };

    try {
      await expect(
        new (resources as any).PublicAdvisors().get(
          routeTarget("", { firm: EXAMPLE_WEALTH_SHORT_NAME })
        )
      ).rejects.toThrow("Failed to resolve advisor firm filter");
    } finally {
      (globalThis as any).tables.EmploymentHistory = original;
    }
  });

  it("adds context when firm-filter advisor lookup fails", async () => {
    setRows("EmploymentHistory", [
      {
        id: EMPLOYMENT_A_ID,
        advisorId: "advisor-a",
        firmId: "firm-a",
        startDate: DATE_2024_01_01,
      },
    ]);
    const original = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = {
      search: () => {
        throw new Error("advisor index unavailable");
      },
    };

    try {
      await expect(
        new (resources as any).PublicAdvisors().get(
          routeTarget("", { firm: EXAMPLE_WEALTH_SHORT_NAME })
        )
      ).rejects.toThrow("Failed to load advisors for firm filter");
    } finally {
      (globalThis as any).tables.Advisor = original;
    }
  });

  it("resolves displayed advisor firms through bounded advisor lookups", async () => {
    const empty = await advisorFirmResource.resolveDisplayedAdvisorFirms(
      [],
      [],
      [],
      [],
      new Map()
    );
    expect(empty.size).toBe(0);

    const staleAliasId = "stale-morgan-stanley-wealth";
    setRows("EmploymentHistory", [
      {
        id: "employment-morgan",
        advisorId: MORGAN_ADVISOR_ID,
        firmId: staleAliasId,
        startDate: DATE_2024_01_01,
      },
    ]);

    const displayed = await advisorFirmResource.resolveDisplayedAdvisorFirms(
      [MORGAN_ADVISOR_ID],
      [
        { id: MORGAN_STANLEY_ID, name: MORGAN_STANLEY_NAME },
        { id: staleAliasId, name: "Morgan Stanley Wealth Management" },
      ],
      [],
      [],
      new Map([
        [
          MORGAN_STANLEY_ID,
          { id: MORGAN_STANLEY_ID, name: MORGAN_STANLEY_NAME },
        ],
      ])
    );

    expect(displayed.get(MORGAN_ADVISOR_ID)).toBe(MORGAN_STANLEY_NAME);
  });

  it("filters firm and team directories while preserving cursor pagination", async () => {
    setRows("Firm", [
      {
        id: "firm-a",
        name: EXAMPLE_WEALTH_MANAGEMENT,
        hqState: "GA",
        channel: "ria",
      },
      {
        id: "firm-b",
        name: BETA_ADVISORS,
        hqState: "TX",
        channel: "ria",
        dissolvedYear: 2020,
      },
      {
        id: "firm-c",
        name: "Cobalt Capital",
        hqState: "TX",
        channel: "ria",
      },
    ]);
    setRows("Team", [
      {
        id: "team-a",
        name: STONE_GROUP_NAME,
        currentFirmId: "firm-a",
        serviceModel: "ensemble",
      },
      {
        id: "team-b",
        name: "Stone Partners",
        currentFirmId: "firm-a",
        serviceModel: "ensemble",
      },
      {
        id: "team-c",
        name: "Young Group",
        currentFirmId: "firm-c",
        serviceModel: "solo",
      },
    ]);

    const firms = await new (resources as any).PublicFirms().get(
      routeTarget("", {
        active: "true",
        channel: "ria",
        limit: "1",
        state: "TX",
      })
    );
    const teamsFirst = await new (resources as any).PublicTeams().get(
      routeTarget("", {
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        limit: "1",
        q: "stone",
        serviceModel: "ensemble",
      })
    );
    const teamsSecond = await new (resources as any).PublicTeams().get(
      routeTarget("", {
        cursor: teamsFirst.nextCursor,
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        limit: "1",
        q: "stone",
        serviceModel: "ensemble",
      })
    );

    expect(firms).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: "firm-c" })],
      nextCursor: null,
    });
    expect(teamsFirst.total).toBe(2);
    expect(teamsFirst.items).toHaveLength(1);
    expect(teamsFirst.items[0]).toMatchObject({
      id: "team-a",
      currentFirmName: EXAMPLE_WEALTH_MANAGEMENT,
    });
    expect(teamsFirst.nextCursor).toBe(STONE_GROUP_CURSOR);
    expect(teamsSecond.total).toBe(2);
    expect(teamsSecond.items).toHaveLength(1);
    expect(teamsSecond.items[0]).toMatchObject({ id: "team-b" });
    expect(teamsSecond.nextCursor).toBeNull();
    expect(teamsSecond.items[0].id).not.toBe(teamsFirst.items[0].id);
  });

  it("filters firm directories without breaking unfiltered ordering", async () => {
    setRows("Firm", [
      {
        id: "firm-a",
        name: EXAMPLE_WEALTH_MANAGEMENT,
        hqState: "GA",
        channel: "ria",
      },
      {
        id: "firm-b",
        name: BETA_ADVISORS,
        hqState: "TX",
        channel: "broker-dealer",
        dissolvedYear: 2020,
      },
      {
        id: "firm-c",
        name: "Cobalt Capital",
        hqState: "TX",
        channel: "ria",
      },
    ]);

    const first = await new (resources as any).PublicFirms().get(
      routeTarget("", {
        active: "true",
        channel: "ria",
        limit: "1",
      })
    );
    const second = await new (resources as any).PublicFirms().get(
      routeTarget("", {
        active: "true",
        channel: "ria",
        cursor: first.nextCursor,
        limit: "1",
      })
    );
    const unfiltered = await new (resources as any).PublicFirms().get(
      routeTarget("", { limit: "10" })
    );

    expect(first).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "firm-c" })],
      nextCursor: COBALT_CAPITAL_FIRM_CURSOR,
    });
    expect(second).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "firm-a" })],
      nextCursor: null,
    });
    expect(unfiltered.items.map((firm: any) => firm.id)).toEqual([
      "firm-b",
      "firm-c",
      "firm-a",
    ]);
    expect(unfiltered.total).toBe(3);
  });

  it("filters public branches with source metadata, counts, and cursor pages", async () => {
    setRows("Branch", [
      {
        id: BRANCH_ATLANTA_ID,
        firmId: "firm-a",
        name: "Atlanta Market",
        buildingName: "Peachtree Center",
        level: "branch",
        city: "Atlanta",
        state: "GA",
        address: "1 Peachtree",
        country: "US",
        postalCode: "30303",
        createdAt: DATE_2026_05_25,
      },
      {
        id: BRANCH_AUSTIN_ID,
        firmId: "firm-a",
        name: "Austin Office",
        level: "branch",
        city: "Austin",
        state: "TX",
      },
      {
        id: BRANCH_ORPHAN_ID,
        firmId: MISSING_FIRM_REASON,
        level: "market",
        city: "Miami",
        state: "FL",
      },
    ]);
    setRows("EmploymentHistory", [
      {
        id: "employment-atlanta-a",
        advisorId: "advisor-a",
        firmId: "firm-a",
        branchId: BRANCH_ATLANTA_ID,
        sourceType: "brokercheck",
        sourceRef: "crd:123",
      },
      {
        id: "employment-atlanta-b",
        advisorId: "advisor-b",
        firmId: "firm-a",
        branchId: BRANCH_ATLANTA_ID,
        sourceType: "firm_locator",
        sourceRef: "AnalystWatchlist:internal-branch-review",
      },
      {
        id: "employment-atlanta-duplicate-advisor",
        advisorId: "advisor-a",
        firmId: "firm-a",
        branchId: BRANCH_ATLANTA_ID,
        sourceType: "brokercheck",
        sourceRef: "crd:123",
      },
      {
        id: "employment-atlanta-former",
        advisorId: "advisor-c",
        firmId: "firm-a",
        branchId: BRANCH_ATLANTA_ID,
        endDate: DATE_2024_01_01,
        sourceType: "brokercheck",
      },
      {
        id: "employment-austin-former",
        advisorId: "advisor-d",
        firmId: "firm-a",
        branchId: BRANCH_AUSTIN_ID,
        endDate: DATE_2024_01_01,
        sourceType: "firm_locator",
      },
    ]);

    const first = await new (resources as any).PublicBranches().get(
      routeTarget("", {
        city: "atl",
        firm: EXAMPLE_WEALTH_QUERY,
        limit: "1",
        minAdvisorCount: "2",
        sourceType: "brokercheck",
        state: "GA",
        level: "branch",
        q: "peachtree",
      })
    );
    const byFirmAndMarket = await new (resources as any).PublicBranches().get(
      routeTarget("", {
        firm: EXAMPLE_WEALTH_QUERY,
        market: "peachtree",
        sourceType: "firm_locator",
      })
    );
    const second = await new (resources as any).PublicBranches().get(
      routeTarget("", { limit: "2" })
    );
    const third = await new (resources as any).PublicBranches().get(
      routeTarget("", { cursor: String(second.nextCursor), limit: "2" })
    );
    const invalidMinimumAdvisorCount = await new (
      resources as any
    ).PublicBranches().get(
      routeTarget("", {
        limit: "10",
        minAdvisorCount: "2x",
      })
    );
    const pagedBranchIds = [...second.items, ...third.items].map(
      (row: any) => row.id
    );

    expect(first).toMatchObject({
      total: 1,
      nextCursor: null,
      items: [
        {
          id: BRANCH_ATLANTA_ID,
          displayName: "Atlanta Market",
          firmId: "firm-a",
          firmName: EXAMPLE_WEALTH_MANAGEMENT,
          currentAdvisorCount: 2,
          coverageStatus: "loaded",
          sourceMetadata: {
            sourceTypes: ["brokercheck", "firm_locator"],
            sourceLabels: [
              "FINRA BrokerCheck registration data",
              "Firm public branch locator",
            ],
            sourceRefs: [],
          },
        },
      ],
    });
    expect(first.items[0]).not.toHaveProperty("createdAt");
    expect(first.items[0]).not.toHaveProperty("advisorId");
    expect(JSON.stringify(first.items[0])).not.toContain("employment-atlanta");
    expect(JSON.stringify(first.items[0])).not.toContain("AnalystWatchlist");
    expect(byFirmAndMarket).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: BRANCH_ATLANTA_ID })],
    });
    expect(second).toMatchObject({
      total: 3,
      items: expect.arrayContaining([
        expect.objectContaining({ id: BRANCH_ORPHAN_ID }),
      ]),
    });
    expect(second.nextCursor).toBe(BRANCH_ATLANTA_CURSOR);
    expect(third).toMatchObject({
      total: 3,
      nextCursor: null,
      items: expect.arrayContaining([
        expect.objectContaining({ id: BRANCH_AUSTIN_ID }),
      ]),
    });
    expect(new Set(pagedBranchIds).size).toBe(3);
    expect(invalidMinimumAdvisorCount).toMatchObject({
      total: 3,
      items: expect.arrayContaining([
        expect.objectContaining({ id: BRANCH_ORPHAN_ID }),
      ]),
      nextCursor: null,
    });
  });

  it("loads public branch employment by branch id for source-backed filters", async () => {
    const branchRows = Array.from({ length: 30 }, (_unused, index) => ({
      id: `branch-batch-${String(index).padStart(2, "0")}`,
      firmId: "firm-a",
      name: `Batch Branch ${String(index).padStart(2, "0")}`,
      level: "branch",
      city: "Atlanta",
      state: "GA",
    }));
    const employmentRows = branchRows.map((branch, index) => ({
      id: `employment-batch-${String(index).padStart(2, "0")}`,
      advisorId: `advisor-batch-${String(index).padStart(2, "0")}`,
      firmId: "firm-a",
      branchId: branch.id,
      sourceType: "brokercheck",
    }));
    setRows("Branch", branchRows);
    setRows("EmploymentHistory", employmentRows);
    const original = (globalThis as any).tables.EmploymentHistory;
    let searchCount = 0;
    (globalThis as any).tables.EmploymentHistory = {
      search: (query: any) => {
        searchCount += 1;
        expect(query?.conditions ?? []).toEqual([
          { attribute: "branchId", value: branchRows[searchCount - 1]?.id },
        ]);
        return (async function* () {
          for (const row of employmentRows)
            if (row.branchId === branchRows[searchCount - 1]?.id) yield row;
        })();
      },
    };

    try {
      const result = await new (resources as any).PublicBranches().get(
        routeTarget("", {
          gapGroup: "loaded",
          limit: "50",
          sourceType: "brokercheck",
        })
      );

      expect(result.total).toBe(30);
      expect(result.items).toHaveLength(30);
      expect(searchCount).toBe(30);
    } finally {
      (globalThis as any).tables.EmploymentHistory = original;
    }
  });

  it("groups public branch coverage gaps without flattening unknown states", async () => {
    setRows("Branch", [
      {
        id: BRANCH_GAP_LOADED_ID,
        firmId: "firm-a",
        name: "Loaded Branch",
        level: "branch",
        city: "Austin",
        state: "TX",
      },
      {
        id: BRANCH_GAP_MISSING_SOURCE_ID,
        firmId: "firm-a",
        name: "Missing Source Branch",
        level: "branch",
        city: "Boston",
        state: "MA",
      },
      {
        id: BRANCH_GAP_ZERO_ADVISOR_ID,
        firmId: "firm-a",
        name: "Zero Advisor Branch",
        level: "branch",
        city: "Chicago",
        state: "IL",
      },
      {
        id: BRANCH_GAP_PARTIAL_ID,
        firmId: "firm-a",
        name: "Partial Branch",
        level: "branch",
        city: "Atlanta",
        state: "GA",
      },
      {
        id: BRANCH_GAP_UNAVAILABLE_ID,
        firmId: MISSING_FIRM_REASON,
        level: "branch",
        city: "Charlotte",
        state: "NC",
      },
    ]);
    setRows("EmploymentHistory", [
      {
        id: "employment-loaded",
        advisorId: "advisor-a",
        firmId: "firm-a",
        branchId: BRANCH_GAP_LOADED_ID,
        sourceType: "brokercheck",
      },
      {
        id: "employment-missing-source",
        advisorId: "advisor-b",
        firmId: "firm-a",
        branchId: BRANCH_GAP_MISSING_SOURCE_ID,
      },
      {
        id: "employment-zero-advisor-former",
        advisorId: "advisor-c",
        firmId: "firm-a",
        branchId: BRANCH_GAP_ZERO_ADVISOR_ID,
        endDate: DATE_2024_01_01,
        sourceType: "firm_locator",
        sourceRef: "private-analyst-note:do-not-render",
      },
    ]);

    const result = await new (resources as any).PublicBranches().get(
      routeTarget("", { limit: "10" })
    );
    const zeroAdvisor = await new (resources as any).PublicBranches().get(
      routeTarget("", { gapGroup: "zero-advisor", limit: "10" })
    );
    const missingSource = await new (resources as any).PublicBranches().get(
      routeTarget("", { gapGroup: MISSING_SOURCE_REASON, limit: "10" })
    );

    const gapGroupByBranchId = new Map(
      result.items.map((row: any) => [row.id, row.gapGroup])
    );
    expect(gapGroupByBranchId).toEqual(
      new Map([
        [BRANCH_GAP_PARTIAL_ID, "partial"],
        [BRANCH_GAP_LOADED_ID, "loaded"],
        [BRANCH_GAP_MISSING_SOURCE_ID, "missing-source"],
        [BRANCH_GAP_UNAVAILABLE_ID, "unavailable"],
        [BRANCH_GAP_ZERO_ADVISOR_ID, "zero-advisor"],
      ])
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: BRANCH_GAP_UNAVAILABLE_ID,
          coverageStatus: "unavailable",
          displayName: "Charlotte, NC",
          firmName: null,
        }),
        expect.objectContaining({
          id: BRANCH_GAP_ZERO_ADVISOR_ID,
          currentAdvisorCount: 0,
          sourceMetadata: expect.objectContaining({
            sourceLabels: ["Firm public branch locator"],
          }),
        }),
        expect.objectContaining({
          id: BRANCH_GAP_PARTIAL_ID,
          coverageStatus: "partial",
          currentAdvisorCount: 0,
          sourceMetadata: expect.objectContaining({
            sourceLabels: [],
            sourceTypes: [],
          }),
        }),
      ])
    );
    expect(JSON.stringify(result.items)).not.toContain("private-analyst-note");
    expect(JSON.stringify(result.items)).not.toContain("watchlist");
    expect(zeroAdvisor).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: BRANCH_GAP_ZERO_ADVISOR_ID })],
    });
    expect(missingSource).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: BRANCH_GAP_MISSING_SOURCE_ID })],
    });
  });

  it("reports branch gap group counts through DataCoverage", async () => {
    setRows("Branch", [
      { id: BRANCH_GAP_LOADED_ID, firmId: "firm-a", level: "branch" },
      { id: BRANCH_GAP_PARTIAL_ID, firmId: "firm-a", level: "branch" },
      {
        id: BRANCH_GAP_UNAVAILABLE_ID,
        firmId: MISSING_FIRM_REASON,
        level: "branch",
      },
      { id: BRANCH_GAP_ZERO_ADVISOR_ID, firmId: "firm-a", level: "branch" },
      { id: BRANCH_GAP_MISSING_SOURCE_ID, firmId: "firm-a", level: "branch" },
    ]);
    setRows("EmploymentHistory", [
      {
        id: "employment-loaded",
        advisorId: "advisor-a",
        firmId: "firm-a",
        branchId: BRANCH_GAP_LOADED_ID,
        sourceType: "brokercheck",
      },
      {
        id: "employment-zero-advisor",
        advisorId: "advisor-b",
        firmId: "firm-a",
        branchId: BRANCH_GAP_ZERO_ADVISOR_ID,
        endDate: DATE_2024_01_01,
        sourceType: "firm_locator",
      },
      {
        id: "employment-missing-source",
        advisorId: "advisor-c",
        firmId: "firm-a",
        branchId: BRANCH_GAP_MISSING_SOURCE_ID,
      },
    ]);

    const payload = await new (resources as any).DataCoverage().get();

    expect(metricById(payload, "branch-gap-loaded")).toMatchObject({
      value: 1,
      limitation: null,
    });
    expect(metricById(payload, "branch-gap-partial")).toMatchObject({
      value: 1,
      limitation: expect.stringContaining("source or advisor linkage"),
    });
    expect(metricById(payload, "branch-gap-unavailable")).toMatchObject({
      value: 1,
      limitation: expect.stringContaining("public firm"),
    });
    expect(metricById(payload, "branch-gap-zero-advisor")).toMatchObject({
      value: 1,
      limitation: expect.stringContaining("no current linked advisors"),
    });
    expect(metricById(payload, "branch-gap-missing-source")).toMatchObject({
      value: 1,
      limitation: expect.stringContaining("missing public source labels"),
    });
  });

  it("filters team directories with pagination and profile metadata", async () => {
    setRows("Team", [
      {
        id: "team-a",
        name: "Stone Alpha",
        slug: "stone-alpha",
        currentFirmId: "firm-a",
        serviceModel: "ensemble",
      },
      {
        id: "team-b",
        name: "Stone Beta",
        slug: "stone-beta",
        currentFirmId: "firm-a",
        serviceModel: "ensemble",
      },
      {
        id: "team-c",
        name: "Young Group",
        slug: "young-group",
        currentFirmId: "firm-b",
        serviceModel: "solo",
      },
    ]);

    const first = await new (resources as any).PublicTeams().get(
      routeTarget("", {
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        limit: "1",
        q: "stone",
        serviceModel: "ensemble",
      })
    );
    const second = await new (resources as any).PublicTeams().get(
      routeTarget("", {
        cursor: first.nextCursor,
        firm: EXAMPLE_WEALTH_SHORT_NAME,
        limit: "1",
        q: "stone",
        serviceModel: "ensemble",
      })
    );
    const unfiltered = await new (resources as any).PublicTeams().get(
      routeTarget("", { limit: "10" })
    );

    expect(first).toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          currentFirmName: EXAMPLE_WEALTH_MANAGEMENT,
          id: "team-a",
          slug: "stone-alpha",
        }),
      ],
      nextCursor: STONE_ALPHA_CURSOR,
    });
    expect(second).toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          currentFirmName: EXAMPLE_WEALTH_MANAGEMENT,
          id: "team-b",
          slug: "stone-beta",
        }),
      ],
      nextCursor: null,
    });
    expect(unfiltered.items.map((team: any) => team.id)).toEqual([
      "team-a",
      "team-b",
      "team-c",
    ]);
    expect(unfiltered.total).toBe(3);
  });

  it("strips internal team markers and collapses duplicate directory rows", async () => {
    setRows("Firm", [
      { id: "firm-a", name: EXAMPLE_WEALTH_MANAGEMENT },
      { id: "firm-b", name: BETA_ADVISORS },
    ]);
    setRows("Team", [
      {
        id: "team-clean",
        name: "545 Group",
        currentFirmId: "firm-a",
      },
      {
        id: "team-marked",
        name: NON_COMPLIANT_TEAM_NAME,
        currentFirmId: "firm-a",
      },
      {
        id: "team-other-firm",
        name: NON_COMPLIANT_TEAM_NAME,
        currentFirmId: "firm-b",
      },
    ]);

    const teams = await new (resources as any).PublicTeams().get(
      routeTarget("", { limit: "10", q: "545" })
    );
    const searchResult = await new (resources as any).Search().get(
      routeTarget("", { kind: "team", limit: "10", q: "545" })
    );

    expect(teams.total).toBe(2);
    expect(teams.items).toEqual([
      expect.objectContaining({
        currentFirmName: EXAMPLE_WEALTH_MANAGEMENT,
        name: "545 Group",
      }),
      expect.objectContaining({
        currentFirmName: BETA_ADVISORS,
        name: "545 Group",
      }),
    ]);
    expect(teams.items.map((team: any) => team.name)).not.toContain(
      NON_COMPLIANT_TEAM_NAME
    );
    expect(searchResult.counts).toMatchObject({ teams: 2, total: 2 });
    expect(searchResult.items.map((item: any) => item.name)).toEqual([
      "545 Group",
      "545 Group",
    ]);
    expect(searchResult.items.map((item: any) => item.name)).not.toContain(
      NON_COMPLIANT_TEAM_NAME
    );
  });

  it("keeps same-named teams without firm context distinct", async () => {
    setRows("Team", [
      {
        id: "team-missing-firm-a",
        name: "545 Group",
      },
      {
        id: "team-missing-firm-b",
        name: NON_COMPLIANT_TEAM_NAME,
      },
    ]);

    const teams = await new (resources as any).PublicTeams().get(
      routeTarget("", { limit: "10", q: "545" })
    );

    expect(teams.total).toBe(2);
    expect(teams.items).toEqual([
      expect.objectContaining({ id: "team-missing-firm-a", name: "545 Group" }),
      expect.objectContaining({ id: "team-missing-firm-b", name: "545 Group" }),
    ]);
  });

  it("scores search helper results and short query responses", async () => {
    const employments = [
      { advisorId: "advisor-a", firmId: "firm-a", startDate: DATE_2020_01_01 },
      { advisorId: "advisor-a", firmId: "firm-b", startDate: DATE_2024_01_01 },
      {
        advisorId: "advisor-a",
        firmId: "firm-c",
        startDate: DATE_2018_01_01,
        endDate: "2019-01-01",
      },
    ];

    const current = search.currentEmploymentByAdvisor(employments);
    expect(current.get("advisor-a")).toMatchObject({ firmId: "firm-b" });
    expect(
      search.firmSearchMatches(
        [{ id: "firm-a", name: "Stone Wealth", hqCity: "Atlanta" }],
        "stone"
      )[0]
    ).toMatchObject({ kind: "firm", score: 2.5 });
    expect(
      search.advisorSearchMatches(
        [{ id: "advisor-a", firstName: "Avery", lastName: "Stone" }],
        new Map([["firm-a", { name: EXAMPLE_WEALTH_SHORT_NAME }]]),
        new Map([["advisor-a", { firmId: "firm-a" }]]),
        "sto"
      )[0]
    ).toMatchObject({ kind: "advisor", sub: EXAMPLE_WEALTH_SHORT_NAME });
    expect(
      search.teamSearchMatches(
        [{ id: "team-a", name: STONE_GROUP_NAME, currentFirmId: "firm-a" }],
        new Map([["firm-a", { name: EXAMPLE_WEALTH_SHORT_NAME }]]),
        "stone"
      )[0]
    ).toMatchObject({ kind: "team", sub: EXAMPLE_WEALTH_SHORT_NAME });
    await expect(
      new (resources as any).Search().get(routeTarget("", { q: "s" }))
    ).resolves.toEqual({
      q: "s",
      kind: "all",
      items: [],
      counts: { firms: 0, advisors: 0, teams: 0, total: 0 },
    });
  });

  it("builds current-employment subtitles without repeated full-table scans", () => {
    const employments = [
      { advisorId: "advisor-a", firmId: "firm-a", startDate: DATE_2020_01_01 },
      { advisorId: "advisor-a", firmId: "firm-b", startDate: DATE_2024_01_01 },
      { advisorId: "advisor-b", firmId: "firm-c", startDate: DATE_2023_01_01 },
      {
        advisorId: "advisor-b",
        firmId: "firm-d",
        startDate: DATE_2021_01_01,
        endDate: "2022-01-01",
      },
    ];
    employments.filter = () => {
      throw new Error("current employment lookup should not rescan rows");
    };

    const current = search.currentEmploymentByAdvisor(employments);

    expect(current.get("advisor-a")).toMatchObject({ firmId: "firm-b" });
    expect(current.get("advisor-b")).toMatchObject({ firmId: "firm-c" });
  });

  it("currentEmploymentByAdvisor keeps the first-seen row on a startDate tie", () => {
    const employments = [
      {
        advisorId: "advisor-a",
        firmId: "firm-first",
        startDate: DATE_2024_01_01,
      },
      {
        advisorId: "advisor-a",
        firmId: "firm-second",
        startDate: DATE_2024_01_01,
      },
    ];

    const current = search.currentEmploymentByAdvisor(employments);

    expect(current.get("advisor-a")).toMatchObject({ firmId: "firm-first" });
  });

  it("currentFirmNameByAdvisor resolves names only for known firms", () => {
    const employments = [
      { advisorId: "advisor-a", firmId: "firm-a", startDate: DATE_2024_01_01 },
      {
        advisorId: "advisor-b",
        firmId: MISSING_FIRM_REASON,
        startDate: DATE_2024_01_01,
      },
      {
        advisorId: "advisor-c",
        firmId: "firm-a",
        startDate: DATE_2023_01_01,
        endDate: DATE_2024_01_01,
      },
    ];
    const byFirm = new Map([
      ["firm-a", { id: "firm-a", name: EXAMPLE_WEALTH_SHORT_NAME }],
    ]);

    const names = search.currentFirmNameByAdvisor(
      employments as any,
      byFirm as any
    );

    expect(names.get("advisor-a")).toBe(EXAMPLE_WEALTH_SHORT_NAME);
    expect(names.has("advisor-b")).toBe(false);
    expect(names.has("advisor-c")).toBe(false);
  });

  it("populates advisor subtitles via a scoped employment lookup, not a full scan", async () => {
    baseRows();
    const queriedAdvisorIds: string[] = [];
    const employmentRows = tableRows.get("EmploymentHistory") ?? [];
    const original = (globalThis as any).tables.EmploymentHistory;
    (globalThis as any).tables.EmploymentHistory = {
      search: (query: any) => {
        const condition = query?.conditions?.[0];
        if (!condition || condition.attribute !== "advisorId") {
          throw new Error("Search must query EmploymentHistory by advisorId");
        }
        queriedAdvisorIds.push(condition.value);
        return (async function* () {
          for (const row of employmentRows)
            if (row.advisorId === condition.value) yield row;
        })();
      },
    };

    try {
      const result = await new (resources as any).Search().get(
        routeTarget("", { q: "stone", limit: "5" })
      );

      const advisorItem = result.items.find(
        (item: any) => item.kind === "advisor"
      );
      expect(advisorItem).toMatchObject({
        id: "advisor-a",
        sub: EXAMPLE_WEALTH_MANAGEMENT,
      });
      expect(result.counts).toEqual({
        firms: 0,
        advisors: 1,
        teams: 1,
        total: 2,
      });
      // Only the displayed advisor was queried — no full-table scan, and
      // advisor-b (no name match for "stone") was never fetched.
      expect(queriedAdvisorIds).toEqual(["advisor-a"]);
    } finally {
      (globalThis as any).tables.EmploymentHistory = original;
    }
  });

  it("does not scan the Advisor table for a firm-kind search", async () => {
    baseRows();
    const advisorSearchCalls: unknown[] = [];
    const original = (globalThis as any).tables.Advisor;
    (globalThis as any).tables.Advisor = {
      search: (query: unknown) => {
        advisorSearchCalls.push(query);
        return (async function* () {})();
      },
    };

    try {
      const result = await new (resources as any).Search().get(
        routeTarget("", { kind: "firm", q: "example", limit: "5" })
      );

      // kind=firm must resolve from the (small) Firm table only — never touch
      // the large Advisor table. Scanning it needlessly for kind-scoped
      // searches was the flaky-timeout regression.
      expect(advisorSearchCalls).toHaveLength(0);
      expect(result.kind).toBe("firm");
      expect(result.items.every((item: any) => item.kind === "firm")).toBe(
        true
      );
      expect(result.counts.advisors).toBe(0);
    } finally {
      (globalThis as any).tables.Advisor = original;
    }
  });
});

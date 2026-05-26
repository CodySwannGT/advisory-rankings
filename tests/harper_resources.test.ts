/* eslint-disable max-lines, sonarjs/no-duplicate-string -- In-memory Harper fixture data is intentionally literal-heavy. */
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Harper resource tests use a small in-memory table snapshot so profile,
 * directory, and feed behavior can be verified without a running Harper node.
 */
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

const table = (name: string) => ({
  search: () =>
    (async function* () {
      for (const row of tableRows.get(name) ?? []) yield row;
    })(),
});

(globalThis as any).tables = {
  Advisor: table("Advisor"),
  AdvisorMetricSnapshot: table("AdvisorMetricSnapshot"),
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
  AdvisorResearchCheck: table("AdvisorResearchCheck"),
  RecruitingDealQuote: table("RecruitingDealQuote"),
  RegistrationApplication: table("RegistrationApplication"),
  Sanction: table("Sanction"),
  Team: table("Team"),
  TeamMembership: table("TeamMembership"),
  TeamMetricSnapshot: table("TeamMetricSnapshot"),
  TransitionEvent: table("TransitionEvent"),
};

const resources = await import("../src/harper/resources.js");
const resourceData = await import("../src/harper/resource-data.js");
const routing = await import("../src/harper/resource-routing.js");
const search = await import("../src/harper/resource-search.js");
const feed = await import("../src/harper/resource-feed.js");
const advisorResource = await import("../src/harper/resource-advisor.js");
const firmResource = await import("../src/harper/resource-firm.js");
const firmDueDiligenceResource =
  await import("../src/harper/resource-firm-due-diligence.js");

const setRows = (name: string, rows: any[]) => tableRows.set(name, rows);

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

const baseRows = () => {
  setRows("Firm", [
    {
      id: "firm-a",
      name: "Example Wealth Management",
      slug: "example-wealth",
      hqCity: "Atlanta",
      hqState: "GA",
      channel: "ria",
      logoUrl: "https://example.com/logo.png",
    },
    { id: "firm-b", name: "Beta Advisors", slug: "beta-advisors" },
  ]);
  setRows("FirmAlias", [
    {
      id: "alias-a",
      alias: "Example Wealth LLC",
      normalizedAlias: "example wealth",
      firmId: "firm-a",
    },
  ]);
  setRows("Advisor", [
    {
      id: "advisor-a",
      firstName: "Avery",
      lastName: "Stone",
      legalName: "Avery Stone",
      slug: "avery-stone",
      careerStatus: "active",
      headshotUrl: "https://example.com/avery.jpg",
    },
    {
      id: "advisor-b",
      firstName: "Blake",
      lastName: "Young",
      legalName: "Blake Young",
      careerStatus: "retired",
    },
  ]);
  setRows("Team", [
    {
      id: "team-a",
      name: "Stone Group",
      slug: "stone-group",
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
      id: "employment-a",
      advisorId: "advisor-a",
      firmId: "firm-a",
      branchId: "branch-a",
      roleTitle: "Partner",
      roleCategory: "advisor",
      startDate: "2020-01-01",
    },
    {
      id: "employment-b",
      advisorId: "advisor-b",
      firmId: "firm-a",
      roleTitle: "Advisor",
      startDate: "2018-01-01",
      endDate: "2021-01-01",
      reasonForLeaving: "retired",
    },
  ]);
  setRows("TeamMembership", [
    {
      id: "membership-a",
      advisorId: "advisor-a",
      teamId: "team-a",
      role: "lead",
      startDate: "2020-01-01",
    },
    {
      id: "membership-b",
      advisorId: "advisor-b",
      teamId: "team-a",
      role: "alum",
      startDate: "2018-01-01",
      endDate: "2021-01-01",
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
      name: "Advisors to Watch",
      year: 2025,
      subjectType: "advisor",
      methodologyUrl: "https://www.advisorhub.com/advisors-to-watch-rankings/",
    },
    {
      id: "ranking-b",
      publisher: "AdvisorHub",
      name: "Next Gen",
      year: 2025,
      subjectType: "advisor",
      methodologyUrl: "https://www.advisorhub.com/advisors-to-watch-rankings/",
    },
  ]);
  setRows("RankingEntry", [
    {
      id: "ranking-entry-a",
      rankingId: "ranking-a",
      subjectAdvisorId: "advisor-a",
      firmId: "firm-a",
      rawDisplayName: "Avery Stone",
      firmText: "Example Wealth LLC",
      city: "Atlanta",
      state: "GA",
      sourceUrl: "https://www.advisorhub.com/advisors-to-watch-rankings/",
      sourceLabel: "AdvisorHub Advisors to Watch 2025",
      loadedAt: "2026-05-25",
      resolutionStatus: "resolved",
      rank: 12,
      scoreTotal: 92.4,
      scoreScale: 87.2,
      scoreGrowth: 91.5,
      aum: 1_200_000_000,
      regulatoryClean: true,
    },
    {
      id: "ranking-entry-b",
      rankingId: "ranking-b",
      rawDisplayName: "Jordan Example",
      firmText: "Unresolved Capital",
      city: "Austin",
      state: "TX",
      sourceUrl: "https://www.advisorhub.com/advisors-to-watch-next-gen-2025/",
      sourceLabel: "AdvisorHub Next Gen 2025",
      loadedAt: "2026-05-25",
      resolutionStatus: "unresolved",
      rank: 3,
      scoreScale: null,
      scoreGrowth: 76.4,
    },
  ]);
  setRows("AdvisorMetricSnapshot", []);
  setRows("TransitionEvent", [
    {
      id: "transition-a",
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
      id: "transition-team",
      subjectTeamId: "team-a",
      fromFirmId: "firm-b",
      toFirmId: "firm-a",
      toBranchId: "branch-a",
      moveDate: "2024-03-01",
    },
    {
      id: "transition-out",
      subjectAdvisorId: "advisor-b",
      fromFirmId: "firm-a",
      toFirmId: "firm-b",
      fromBranchId: "branch-a",
      moveDate: "2024-04-01",
      aumMoved: null,
    },
  ]);
  setRows("RecruitingDealQuote", [
    { id: "deal-a", upfrontPctT12: 180, producerTier: "top" },
  ]);
  setRows("Disclosure", [
    {
      id: "disclosure-a",
      advisorId: "advisor-a",
      firmIdAtTime: "firm-a",
      disclosureType: "customer",
      regulator: "FINRA",
      dateInitiated: "2022-01-01",
      allegationText: "Unsuitable recommendation",
    },
  ]);
  setRows("Sanction", [
    { id: "sanction-a", disclosureId: "disclosure-a", sanctionType: "fine" },
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
      earnedDate: "2020-01-01",
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
      fetchedAt: "2025-01-02",
      subjectCrd: "67890",
      registeredStateCount: 12,
    },
  ]);
  setRows("Article", [
    {
      id: "article-a",
      headline: "Stone joins Example",
      url: "https://www.advisorhub.com/stone-joins-example/",
      slug: "stone-joins-example",
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
      transitionEventId: "transition-a",
    },
  ]);
  setRows("ArticleDisclosureMention", [
    {
      id: "mention-disclosure",
      articleId: "article-b",
      disclosureId: "disclosure-a",
    },
  ]);
  setRows("FieldAssertion", [
    {
      id: "field-a",
      articleId: "article-a",
      targetTable: "Advisor",
      targetId: "advisor-a",
      fieldName: "legalName",
      assertedValue: JSON.stringify("Avery Stone"),
      quotePhrase: "Avery Stone",
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
      sourcesChecked: ["https://example.com/avery"],
      nextCheckAfter: "2026-06-15T00:00:00Z",
    },
    {
      id: "research-b",
      advisorId: "advisor-a",
      sourceType: "firm_bio",
      checkedAt: "2026-05-25T12:00:00Z",
      status: "ambiguous",
      sourcesChecked: ["https://example.com/team"],
      nextCheckAfter: "2026-06-01T00:00:00Z",
    },
  ]);
};

beforeEach(() => {
  tableRows.clear();
  baseRows();
});

describe("Harper resource routing helpers", () => {
  it("normalizes ids and resolves aliases, slugs, and display names", async () => {
    const db = await resourceData.loadAll();

    expect(routing.normalizeId({ id: "avery-stone" })).toBe("avery-stone");
    expect(routing.normalizeId("/advisor-a")).toBe("advisor-a");
    expect(routing.slugifyText("Example Wealth & Co.")).toBe(
      "example-wealth-and-co"
    );
    expect(routing.normalizeFirmAlias("Example Wealth, LLC")).toBe(
      "example wealth"
    );
    expect(routing.resolveFirm(db, "Example Wealth LLC")?.id).toBe("firm-a");
    expect(routing.resolveAdvisor(db, "Avery Stone")?.id).toBe("advisor-a");
    expect(routing.resolveTeam(db, "stone-group")?.id).toBe("team-a");
    expect(routing.resolveArticle(db, "Stone joins Example")?.id).toBe(
      "article-a"
    );
    expect(routing.advisorDisplayName({ preferredName: "Ave" })).toBe("Ave");
    expect(routing.firmShort("Example Wealth Management")).toBe("Example WM");
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
      firm: { id: "firm-a", short: "Example WM" },
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
      subject: { kind: "advisor", id: "advisor-a", name: "Avery Stone" },
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

    expect(payload.displayName).toBe("Avery Stone");
    expect(payload.career[0]).toMatchObject({
      firm: { id: "firm-a" },
      branch: { id: "branch-a", city: "Atlanta" },
    });
    expect(payload.teams[0]).toMatchObject({
      team: { id: "team-a" },
      role: "lead",
    });
    expect(payload.disclosures[0]).toMatchObject({
      id: "disclosure-a",
      sanctions: [{ id: "sanction-a", disclosureId: "disclosure-a" }],
    });
    expect(payload.licenses[0]).toMatchObject({ licenseType: "Series 7" });
    expect(payload.designations[0]).toMatchObject({ code: "CFP" });
    expect(payload.education[0]).toMatchObject({
      institution: "State University",
    });
    expect(payload.brokerCheckSnapshot).toMatchObject({ subjectCrd: "12345" });
    expect(payload.articles[0]).toMatchObject({ id: "article-a" });
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
  });

  it("covers advisor fallback dates and optional credential groups", async () => {
    const db = await resourceData.loadAll();
    db.disclosures = [
      ...db.disclosures,
      {
        id: "disclosure-resolved",
        advisorId: "advisor-a",
        dateResolved: "2021-01-01",
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
      "disclosure-a",
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
      routeTarget("Example Wealth LLC")
    );

    expect(profile.dueDiligence).toMatchObject({
      firmId: "firm-a",
      modules: {
        recruitingMomentum: {
          status: "loaded",
          inbound: { count: 2, knownAum: 500_000_000, unknownAumCount: 1 },
          outbound: { count: 1, knownAum: 0, unknownAumCount: 1 },
          netMoveCount: 1,
          netAumMoved: 500_000_000,
          provenance: {
            sourceTable: "TransitionEvent",
            sourceIds: ["transition-team", "transition-a", "transition-out"],
          },
          freshness: {
            status: "loaded",
            asOf: "2024-04-01",
          },
        },
        rosterFootprint: {
          status: "loaded",
          currentAdvisorCount: 1,
          pastAdvisorCount: 1,
          teamCount: 1,
          branchCount: 1,
        },
        rankingPresence: {
          status: "loaded",
          resolvedCount: 1,
          unresolvedCount: 0,
          topRank: 12,
          provenance: {
            sourceTable: "RankingEntry",
            sourceIds: ["ranking-entry-a"],
          },
        },
        regulatorySnapshot: {
          status: "loaded",
          source: {
            sourceName: "FINRA BrokerCheck",
            sourceUrl: "https://brokercheck.finra.org/firm/summary/67890",
            compiledAsOf: "2025-01-02",
          },
          provenance: {
            sourceTable: "BrokerCheckSnapshot",
            sourceIds: ["bc-firm"],
          },
        },
        coverageTimeline: {
          status: "loaded",
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
            freshness: expect.objectContaining({ asOf: "2024-04-01" }),
          }),
          expect.objectContaining({
            name: "rosterFootprint",
            freshness: expect.objectContaining({ asOf: "2025-01-02" }),
          }),
          expect.objectContaining({
            name: "rankingPresence",
            freshness: expect.objectContaining({ asOf: "2025" }),
          }),
          expect.objectContaining({
            name: "regulatorySnapshot",
            freshness: expect.objectContaining({ asOf: "2025-01-02" }),
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
      name: "Advisors to Watch",
    });
  });

  it("labels missing firm due-diligence source states explicitly", async () => {
    setRows("RankingEntry", []);
    setRows("BrokerCheckSnapshot", []);
    const profile = await new (resources as any).FirmProfile().get(
      routeTarget("Example Wealth LLC")
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
        sourceName: "FINRA BrokerCheck",
        compiledAsOf: null,
      },
      provenance: { sourceTable: "BrokerCheckSnapshot", sourceIds: [] },
    });
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
            latestLoadedAt: "2026-05-25",
            sourceLabels: ["AdvisorHub Next Gen 2025"],
            sampleRows: [
              {
                id: "ranking-entry-b",
                label: "Jordan Example",
                firmText: "Unresolved Capital",
                sourceLabel: "AdvisorHub Next Gen 2025",
              },
            ],
          },
        ],
      },
      facets: {
        categories: ["Advisors to Watch", "Next Gen"],
        years: [2025],
        states: ["GA", "TX"],
      },
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: "ranking-entry-b",
      ranking: {
        name: "Next Gen",
        year: 2025,
      },
      subject: {
        displayName: "Jordan Example",
        id: null,
        url: null,
      },
      firmText: "Unresolved Capital",
      resolutionStatus: "unresolved",
      scores: {
        scale: {
          value: null,
          status: "unavailable",
          label: "Unavailable",
        },
        growth: {
          value: 76.4,
          status: "loaded",
        },
      },
      sourceStatus: [
        "source-backed",
        "unresolved-entity",
        "unresolved-firm",
        "missing-scale",
      ],
      provenance: {
        sourceTable: "RankingEntry",
        sourceIds: ["ranking-entry-b"],
        rankingId: "ranking-b",
      },
    });
    expect(payload.coverage.gapBuckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "source-backed",
          count: 1,
          query: "/rankings",
        }),
        expect.objectContaining({
          status: "unresolved-firm",
          count: 1,
          query: "/rankings?resolved=unresolved",
        }),
        expect.objectContaining({
          status: "missing-scale",
          count: 1,
        }),
      ])
    );
  });

  it("filters and sorts resolved rankings explorer rows", async () => {
    const payload = await new (resources as any).RankingsExplorer().get(
      routeTarget("", { firm: "Example Wealth LLC", resolved: "resolved" })
    );

    expect(payload.summary).toMatchObject({
      totalEntries: 1,
      resolvedEntries: 1,
      unresolvedEntries: 0,
      representedFirms: 1,
    });
    expect(payload.items[0]).toMatchObject({
      id: "ranking-entry-a",
      subject: {
        kind: "advisor",
        id: "advisor-a",
        displayName: "Avery Stone",
        url: "/advisor.html?id=avery-stone",
      },
      firm: {
        id: "firm-a",
        name: "Example Wealth Management",
        url: "/firm.html?id=example-wealth",
      },
      source: {
        url: "https://www.advisorhub.com/advisors-to-watch-rankings/",
        loadedAt: "2026-05-25",
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
        rawDisplayName: "Avery Stone",
        firmText: "Example Wealth LLC",
        city: "Atlanta",
        state: "GA",
        sourceUrl: "https://www.advisorhub.com/advisors-to-watch-rankings/",
        sourceLabel: "AdvisorHub Advisors to Watch 2025",
        loadedAt: "2026-05-25",
        resolutionStatus: "resolved",
        rank: 1,
        scoreTotal: 97,
        scoreScale: 95,
        scoreGrowth: 94,
        scoreProfessionalism: 96,
      },
      {
        id: "coverage-unresolved-missing-score",
        rankingId: "ranking-a",
        rawDisplayName: "Morgan Gap",
        firmText: "Unresolved Capital",
        city: "Austin",
        state: "TX",
        sourceUrl: "https://www.advisorhub.com/advisors-to-watch-rankings/",
        sourceLabel: "AdvisorHub Advisors to Watch 2025",
        loadedAt: "2026-05-26",
        resolutionStatus: "unresolved",
        rank: 2,
        scoreGrowth: 88,
      },
      {
        id: "coverage-unresolved-missing-market",
        rankingId: "ranking-a",
        rawDisplayName: "Taylor Market",
        firmText: "Unresolved Capital",
        sourceLabel: "AdvisorHub Advisors to Watch 2025",
        loadedAt: "2026-05-24",
        resolutionStatus: "unresolved",
        rank: 3,
        scoreScale: 90,
      },
      {
        id: "coverage-other-category",
        rankingId: "ranking-b",
        rawDisplayName: "Jordan Example",
        firmText: "Beta Advisors",
        city: "Dallas",
        state: "TX",
        sourceLabel: "AdvisorHub Next Gen 2025",
        loadedAt: "2026-05-25",
        resolutionStatus: "unresolved",
        rank: 4,
      },
    ]);

    const payload = await new (resources as any).RankingsExplorer().get(
      routeTarget("", { category: "Advisors to Watch", year: "2025" })
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
          sourceLabels: ["AdvisorHub Advisors to Watch 2025"],
        },
      ],
    });
    expect(payload.coverage.buckets[0].sampleRows).toEqual([
      expect.objectContaining({
        id: "coverage-resolved",
        label: "Avery Stone",
        sourceLabel: "AdvisorHub Advisors to Watch 2025",
      }),
      expect.objectContaining({
        id: "coverage-unresolved-missing-score",
        label: "Morgan Gap",
        sourceStatus: expect.arrayContaining([
          "unresolved-entity",
          "unresolved-firm",
          "missing-scale",
        ]),
      }),
      expect.objectContaining({
        id: "coverage-unresolved-missing-market",
        label: "Taylor Market",
        sourceStatus: expect.arrayContaining([
          "missing-source",
          "missing-state",
          "missing-growth",
        ]),
      }),
    ]);
    expect(payload.coverage.gapBuckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "unresolved-firm",
          count: 2,
          sampleRows: expect.arrayContaining([
            expect.objectContaining({
              id: "coverage-unresolved-missing-score",
              sourceLabel: "AdvisorHub Advisors to Watch 2025",
            }),
          ]),
        }),
        expect.objectContaining({
          status: "missing-scale",
          count: 1,
          sampleRows: [
            expect.objectContaining({
              id: "coverage-unresolved-missing-score",
              label: "Morgan Gap",
            }),
          ],
        }),
        expect.objectContaining({
          status: "missing-state",
          count: 1,
          sampleRows: [
            expect.objectContaining({
              id: "coverage-unresolved-missing-market",
              label: "Taylor Market",
            }),
          ],
        }),
      ])
    );
  });

  it("returns an explicit rankings coverage payload when no ranking rows are loaded", async () => {
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
      emptyState: "No ranking rows are loaded for this coverage slice.",
    });
    expect(payload.items).toEqual([]);
    expect(payload.emptyState).toBe(
      "No matching public ranking rows are loaded for these filters."
    );
  });

  it("covers rankings explorer fallback subjects, sorting, and empty states", async () => {
    setRows("RankingEntry", [
      {
        id: "ranking-entry-team",
        rankingId: "ranking-a",
        subjectTeamId: "team-a",
        firmId: "firm-a",
        rawDisplayName: "Stone Group",
        firmText: "Example Wealth Management",
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
        rawDisplayName: "Beta Advisors",
        firmText: "Beta Advisors",
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
        displayName: "Stone Group",
        url: "/team.html?id=stone-group",
      },
      source: {
        url: "https://www.advisorhub.com/advisors-to-watch-rankings/",
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
        displayName: "Beta Advisors",
        url: "/firm.html?id=beta-advisors",
      },
      sourceStatus: expect.arrayContaining(["missing-source", "missing-state"]),
    });
    expect(sorted.items[2]).toMatchObject({
      subject: {
        kind: "advisor",
        id: null,
        displayName: "Unresolved ranking row",
      },
      resolutionStatus: "ambiguous",
      sourceStatus: expect.arrayContaining([
        "unresolved-entity",
        "unresolved-firm",
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
        emptyState: "No ranking rows are loaded for this coverage slice.",
      },
      emptyState:
        "No matching public ranking rows are loaded for these filters.",
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
          subject: { kind: "firm", name: "Example Wealth" },
          fromFirm: { short: "Old" },
          toFirm: { short: "New" },
          aumMoved: 2_500_000_000,
        },
      ])
    ).toBe("Example Wealth moves from Old to New ($2.50B AUM).");
    expect(
      feed.deriveDek({}, [
        {
          advisor: { name: "Avery Stone" },
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
    ).toMatchObject({ kind: "firm", name: "Example Wealth Management" });
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
      routeTarget("stone-joins-example")
    );
    const firm = await new (resources as any).FirmProfile().get(
      routeTarget("Example Wealth LLC")
    );
    const advisors = await new (resources as any).FirmAdvisors().get(
      routeTarget("firm-a", { status: "past", limit: "1" })
    );
    const advisor = await new (resources as any).AdvisorProfile().get(
      routeTarget("avery-stone")
    );
    const team = await new (resources as any).TeamProfile().get(
      routeTarget("stone-group")
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
      displayName: "Avery Stone",
    });
    expect(team).toMatchObject({
      team: { id: "team-a" },
      currentMembers: [{ advisor: { id: "advisor-a" } }],
      pastMembers: [{ advisor: { id: "advisor-b" } }],
    });
  });

  it("filters feed responses by signal mode and source category", async () => {
    setRows("Article", [
      ...(tableRows.get("Article") ?? []),
      {
        id: "article-c",
        headline: "Market roundup",
        slug: "market-roundup",
        publishedDate: "2025-01-01",
        category: "unknown",
      },
    ]);

    const eventBacked = await new (resources as any).Feed().get(
      routeTarget("", { mode: "event-backed" })
    );
    const browserEvent = await new (resources as any).Feed().get(
      routeTarget("", { mode: "event" })
    );
    const browserMoves = await new (resources as any).Feed().get(
      routeTarget("", { mode: "moves" })
    );
    const browserCompliance = await new (resources as any).Feed().get(
      routeTarget("", { mode: "compliance" })
    );
    const compliance = await new (resources as any).Feed().get(
      routeTarget("", {
        category: "compliance",
        mode: "compliance-disclosures",
      })
    );
    const empty = await new (resources as any).Feed().get(
      routeTarget("", { category: "firm bio" })
    );

    expect(eventBacked).toMatchObject({
      count: 2,
      filters: { mode: "event-backed", category: "all" },
      summary: {
        returned: 2,
        total: 3,
        modeTotal: 2,
        categoryTotal: 3,
      },
      emptyState: null,
    });
    expect(
      eventBacked.items.every((item: any) => item.eventCards.length > 0)
    ).toBe(true);
    expect(browserEvent).toMatchObject({
      count: 2,
      filters: { mode: "event-backed", category: "all" },
      summary: {
        returned: 2,
        total: 3,
        modeTotal: 2,
        categoryTotal: 3,
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
    expect(browserCompliance).toMatchObject({
      count: 1,
      filters: { mode: "compliance-disclosures", category: "all" },
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
      filters: { mode: "compliance-disclosures", category: "compliance" },
      summary: {
        returned: 1,
        total: 3,
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
      summary: { returned: 0, total: 3, modeTotal: 3, categoryTotal: 0 },
      emptyState: {
        reason: "no-filtered-feed-results",
        message: "No feed items match the selected filters.",
      },
      items: [],
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
      id: "avery-stone",
    });
    const firmResult = await callTool("get_firm_profile", {
      id: "Example Wealth LLC",
    });
    const teamResult = await callTool("get_team_profile", {
      id: "stone-group",
    });
    const articleResult = await callTool("get_article", {
      id: "stone-joins-example",
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
      routeTarget("", { firm: "Example Wealth LLC", state: "ga", year: "2024" })
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
      provenance: {
        sourceTables: expect.arrayContaining(["TransitionEvent", "Article"]),
        sourceIds: expect.arrayContaining([
          "transition-a",
          "transition-team",
          "transition-out",
        ]),
      },
    });
    expect(market.firmMomentum[0]).toMatchObject({
      firm: { id: "firm-a", short: "Example WM" },
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
        id: "transition-out",
        sourceStatus: expect.arrayContaining([
          "missing-source",
          "missing-aum",
          "missing-t12",
        ]),
      }),
      expect.objectContaining({
        id: "transition-team",
        article: null,
        sourceStatus: expect.arrayContaining([
          "missing-source",
          "missing-aum",
          "missing-t12",
        ]),
      }),
      expect.objectContaining({
        id: "transition-a",
        article: expect.objectContaining({
          url: "https://www.advisorhub.com/stone-joins-example/",
        }),
        sourceStatus: ["source-backed"],
      }),
    ]);

    await expect(
      new (resources as any).RecruitingMarket().get(
        routeTarget("", { firm: "missing-firm" })
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

  it("serves deterministic recruiting watchlist snapshots", async () => {
    const market = await new (resources as any).RecruitingMarket().get(
      routeTarget("", {
        firm: ["Example Wealth LLC", "Beta Advisors"],
        state: "ga",
        year: "2024",
      })
    );

    expect(market.filters).toMatchObject({
      firmId: null,
      firmQuery: null,
      state: "GA",
      watchlistFirmIds: ["firm-a", "firm-b"],
      watchlistFirmQueries: ["Example Wealth LLC", "Beta Advisors"],
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
        query: "Example Wealth LLC",
        firm: expect.objectContaining({ id: "firm-a", short: "Example WM" }),
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
        sourceMoveIds: ["transition-a", "transition-team", "transition-out"],
        sourceStatus: expect.arrayContaining(["missing-source", "missing-aum"]),
      }),
      expect.objectContaining({
        query: "Beta Advisors",
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
        sourceMoveIds: ["transition-out", "transition-a", "transition-team"],
        sourceStatus: expect.arrayContaining(["missing-source", "missing-aum"]),
      }),
    ]);
  });

  it("normalizes recruiting watchlist inputs deterministically", async () => {
    const target = routeTarget("", {
      firm: [
        "Example Wealth LLC, Beta Advisors",
        "Example Wealth LLC",
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
      watchlistFirmIds: ["firm-a", "firm-b"],
      watchlistFirmQueries: [
        "Example Wealth LLC",
        "Beta Advisors",
        "Missing One",
        "Missing Two",
        "Missing Three",
        "Missing Four",
        "Missing Five",
        "Missing Six",
      ],
      year: "2024",
    });
    expect(first.watchlist.items.slice(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firm: null,
          sourceStatus: ["unresolved-firm"],
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
      routeTarget("", { firm: "Example Wealth LLC", year: "2024" })
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
        "transition-a",
        "transition-team",
        "transition-unlocated",
        "transition-out",
      ],
      sourceStatus: expect.arrayContaining([
        "missing-location",
        "missing-source",
        "missing-t12",
      ]),
    });

    const empty = await new (resources as any).RecruitingMarket().get(
      routeTarget("", {
        firm: ["Example Wealth LLC", "Missing Firm"],
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
            query: "Example Wealth LLC",
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
            sourceStatus: ["unresolved-firm"],
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
      displayName: "Avery Stone",
    });
    expect(firm).toMatchObject({ firm: { id: "firm-a" } });
    expect(team).toMatchObject({ team: { id: "team-a" } });
    expect(article).toMatchObject({
      article: {
        id: "article-a",
        url: "https://www.advisorhub.com/stone-joins-example/",
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
      items: [expect.objectContaining({ name: "Beta Advisors" })],
      total: 2,
    });
    expect(firms.nextCursor).toBeTruthy();
    expect(advisors).toMatchObject({
      items: [expect.objectContaining({ id: "advisor-a" })],
      total: 2,
    });
    expect(advisors.nextCursor).toBeTruthy();
    expect(teams).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: "team-a",
          currentFirmName: "Example Wealth Management",
        }),
      ],
    });
    expect(teams.nextCursor).toBeNull();
    expect(teams.items[0]).toMatchObject({
      id: "team-a",
      currentFirmName: "Example Wealth Management",
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

  it("handles optional aliases, team firm misses, and capped search results", async () => {
    setRows("FirmAlias", []);
    setRows("Team", [
      { id: "team-z", name: "Zeta Team" },
      { id: "team-a", name: "Alpha Team", currentFirmId: "missing-firm" },
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
        legalName: "Avery Stone",
        careerStatus: "active",
        finraCrd: "1234567",
      },
      {
        id: "advisor-b",
        firstName: "Blake",
        lastName: "Young",
        legalName: "Blake Young",
        careerStatus: "retired",
      },
      {
        id: "advisor-c",
        firstName: "Casey",
        lastName: "Stone",
        legalName: "Casey Stone",
        careerStatus: "active",
      },
    ]);
    setRows("EmploymentHistory", [
      {
        id: "employment-a",
        advisorId: "advisor-a",
        firmId: "firm-a",
        startDate: "2024-01-01",
      },
      {
        id: "employment-b",
        advisorId: "advisor-b",
        firmId: "firm-a",
        startDate: "2023-01-01",
        endDate: "2024-01-01",
      },
      {
        id: "employment-c",
        advisorId: "advisor-c",
        firmId: "firm-b",
        startDate: "2024-01-01",
      },
    ]);

    const result = await new (resources as any).PublicAdvisors().get(
      routeTarget("", {
        careerStatus: "active",
        firm: "Example Wealth",
        hasCrd: "true",
        limit: "1",
        q: "stone",
      })
    );

    expect(result).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: "advisor-a" })],
      nextCursor: null,
    });
  });

  it("filters firm and team directories while preserving cursor pagination", async () => {
    setRows("Firm", [
      {
        id: "firm-a",
        name: "Example Wealth Management",
        hqState: "GA",
        channel: "ria",
      },
      {
        id: "firm-b",
        name: "Beta Advisors",
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
        name: "Stone Group",
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
        firm: "Example Wealth",
        limit: "1",
        q: "stone",
        serviceModel: "ensemble",
      })
    );
    const teamsSecond = await new (resources as any).PublicTeams().get(
      routeTarget("", {
        cursor: teamsFirst.nextCursor,
        firm: "Example Wealth",
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
    expect(teamsFirst).toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({
          id: "team-a",
          currentFirmName: "Example Wealth Management",
        }),
      ],
    });
    expect(teamsFirst.nextCursor).toBeTruthy();
    expect(teamsSecond).toMatchObject({
      total: 2,
      items: [expect.objectContaining({ id: "team-b" })],
      nextCursor: null,
    });
    expect(teamsSecond.items[0].id).not.toBe(teamsFirst.items[0].id);
  });

  it("scores search helper results and short query responses", async () => {
    const employments = [
      { advisorId: "advisor-a", firmId: "firm-a", startDate: "2020-01-01" },
      { advisorId: "advisor-a", firmId: "firm-b", startDate: "2024-01-01" },
      {
        advisorId: "advisor-a",
        firmId: "firm-c",
        startDate: "2018-01-01",
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
        new Map([["firm-a", { name: "Example Wealth" }]]),
        new Map([["advisor-a", { firmId: "firm-a" }]]),
        "sto"
      )[0]
    ).toMatchObject({ kind: "advisor", sub: "Example Wealth" });
    expect(
      search.teamSearchMatches(
        [{ id: "team-a", name: "Stone Group", currentFirmId: "firm-a" }],
        new Map([["firm-a", { name: "Example Wealth" }]]),
        "stone"
      )[0]
    ).toMatchObject({ kind: "team", sub: "Example Wealth" });
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
      { advisorId: "advisor-a", firmId: "firm-a", startDate: "2020-01-01" },
      { advisorId: "advisor-a", firmId: "firm-b", startDate: "2024-01-01" },
      { advisorId: "advisor-b", firmId: "firm-c", startDate: "2023-01-01" },
      {
        advisorId: "advisor-b",
        firmId: "firm-d",
        startDate: "2021-01-01",
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
});
/* eslint-enable max-lines, sonarjs/no-duplicate-string -- Re-enable fixture-only suppressions. */

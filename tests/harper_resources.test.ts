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

const setRows = (name: string, rows: any[]) => tableRows.set(name, rows);

const routeTarget = (id: string, params: Record<string, string> = {}) => ({
  id,
  get: (name: string) => params[name] ?? null,
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
  setRows("AdvisorMetricSnapshot", []);
  setRows("TransitionEvent", [
    {
      id: "transition-a",
      subjectAdvisorId: "advisor-a",
      fromFirmId: "firm-b",
      toFirmId: "firm-a",
      moveDate: "2024-02-01",
      aumMoved: 500_000_000,
      recruitingDealId: "deal-a",
    },
    {
      id: "transition-team",
      subjectTeamId: "team-a",
      fromFirmId: "firm-b",
      toFirmId: "firm-a",
      moveDate: "2024-03-01",
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
      confidence: 0.9,
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
    expect(new (resources as any).Search().allowRead()).toBe(true);
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
    const firms = await new (resources as any).PublicFirms().get();
    const advisors = await new (resources as any).PublicAdvisors().get(
      routeTarget("", { limit: "1" })
    );
    const teams = await new (resources as any).PublicTeams().get();
    const result = await new (resources as any).Search().get(
      routeTarget("", { q: "stone", limit: "5" })
    );

    expect(firms.map((firm: any) => firm.name)).toEqual([
      "Beta Advisors",
      "Example Wealth Management",
    ]);
    expect(advisors).toMatchObject({
      items: [expect.objectContaining({ id: "advisor-a" })],
      total: 2,
    });
    expect(advisors.nextCursor).toBeTruthy();
    expect(teams[0]).toMatchObject({
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

    expect(firms).toHaveLength(2);
    expect(teams).toEqual([
      expect.objectContaining({ currentFirmName: null, id: "team-a" }),
      expect.objectContaining({ currentFirmName: null, id: "team-z" }),
    ]);
    expect(result.items).toHaveLength(20);
    expect(result.counts.advisors).toBe(25);
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

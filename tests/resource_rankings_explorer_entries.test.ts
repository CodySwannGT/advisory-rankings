import { describe, expect, it } from "vitest";
import { rankingEntries } from "../src/harper/resource-rankings-explorer-entries.js";
import type { ResourceIndex } from "../src/harper/resource-data.js";
import {
  feedEmptyState,
  feedSummary,
  matchesFeedCategory,
  matchesFeedMode,
  parseFeedFilters,
  type FeedFilterableItem,
} from "../src/harper/resource-feed-filters.js";
import {
  filteredEntries,
  normalizeState,
  parseFilters,
  publicEntry,
  publicFilters,
  sortEntries,
  topFirms,
} from "../src/harper/resource-rankings-explorer-utils.js";
import type { RankingExplorerEntry } from "../src/harper/resource-rankings-explorer-types.js";
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  RankingEntryRow,
  RankingRow,
  TeamRow,
} from "../src/types/harper-schema.js";

const AVA_PARKER = "Ava Parker";
const AUSTIN = "Austin";
const AUSTIN_TX = "Austin, TX";
const COMPLIANCE_DISCLOSURES = "compliance-disclosures";
const FINITE_RANK_ID = "finite-rank";
const MISSING_RANK_ID = "missing-rank";
const NORTHSTAR_WEALTH = "Northstar Wealth";
const RANK_SORT = "rank";
const RIA_WIRE = "RIA Wire";
const TOP_ADVISORS = "Top Advisors";

function db(
  overrides: Partial<ResourceIndex> & {
    readonly rankingEntries: readonly RankingEntryRow[];
  }
): ResourceIndex {
  return {
    rankingEntries: overrides.rankingEntries,
    rankings: overrides.rankings ?? [],
    advisors: overrides.advisors ?? [],
    firms: overrides.firms ?? [],
    teams: overrides.teams ?? [],
    employments: overrides.employments ?? [],
    byRanking: overrides.byRanking ?? new Map(),
    byAdvisor: overrides.byAdvisor ?? new Map(),
    byFirm: overrides.byFirm ?? new Map(),
    byTeam: overrides.byTeam ?? new Map(),
  } as ResourceIndex;
}

function ranking(overrides: Partial<RankingRow> = {}): RankingRow {
  return {
    id: "ranking-1",
    publisher: "Forbes",
    name: "Best Advisors",
    year: 2026,
    subjectType: "advisor",
    methodologyUrl: "https://example.com/methodology",
    ...overrides,
  } as RankingRow;
}

function rankingEntry(overrides: Partial<RankingEntryRow>): RankingEntryRow {
  return {
    id: "entry-1",
    rankingId: "ranking-1",
    rank: null,
    rawDisplayName: "",
    subjectAdvisorId: null,
    subjectTeamId: null,
    subjectFirmId: null,
    firmId: null,
    firmText: "",
    city: "",
    state: "",
    sourceUrl: "",
    sourceLabel: "",
    loadedAt: null,
    scoreTotal: null,
    scoreScale: null,
    scoreGrowth: null,
    scoreProfessionalism: null,
    aum: null,
    productionT12: null,
    householdCount: null,
    teamSize: null,
    resolutionStatus: "",
    ...overrides,
  } as RankingEntryRow;
}

function advisor(overrides: Partial<AdvisorRow> = {}): AdvisorRow {
  return {
    id: "advisor-1",
    firstName: "Ava",
    lastName: "Parker",
    slug: "ava-parker",
    ...overrides,
  } as AdvisorRow;
}

function firm(overrides: Partial<FirmRow> = {}): FirmRow {
  return {
    id: "firm-1",
    name: NORTHSTAR_WEALTH,
    short: "Northstar",
    slug: "northstar-wealth",
    ...overrides,
  } as FirmRow;
}

function team(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: "team-1",
    name: "Harbor Team",
    slug: "harbor-team",
    currentFirmId: "firm-1",
    ...overrides,
  } as TeamRow;
}

function explorerEntry(
  overrides: Partial<RankingExplorerEntry>
): RankingExplorerEntry {
  return {
    id: "entry",
    ranking: {
      id: "ranking",
      publisher: "AdvisorHub",
      name: TOP_ADVISORS,
      year: 2026,
      subjectType: "advisor",
      methodologyUrl: null,
    },
    rank: null,
    subject: {
      kind: "advisor",
      id: "advisor",
      displayName: AVA_PARKER,
      url: "/advisor.html?id=advisor",
    },
    firm: {
      id: "firm",
      name: NORTHSTAR_WEALTH,
      short: "Northstar",
      url: "/firm.html?id=firm",
    },
    firmText: NORTHSTAR_WEALTH,
    location: { city: AUSTIN, state: "TX", label: AUSTIN_TX },
    scores: {
      total: { value: null, status: "unavailable", label: "Unavailable" },
      scale: { value: null, status: "unavailable", label: "Unavailable" },
      growth: { value: null, status: "unavailable", label: "Unavailable" },
      professionalism: {
        value: null,
        status: "unavailable",
        label: "Unavailable",
      },
    },
    metrics: {
      aum: null,
      productionT12: null,
      householdCount: null,
      teamSize: null,
    },
    source: { url: null, label: "Ranking source", loadedAt: null },
    resolutionStatus: "resolved",
    sourceStatus: [],
    provenance: {
      sourceTable: "RankingEntry",
      sourceIds: ["entry"],
      rankingId: "ranking",
    },
    _sort: {
      category: TOP_ADVISORS,
      firm: NORTHSTAR_WEALTH,
      location: AUSTIN_TX,
      name: AVA_PARKER,
      rank: 1,
      scale: 90,
      growth: 10,
      year: 2026,
    },
    ...overrides,
  };
}

describe("rankingEntries", () => {
  it("uses ranking row fallbacks and source-status gaps for unresolved rows", () => {
    const [entry] = rankingEntries(
      db({
        rankingEntries: [
          rankingEntry({
            id: "entry-unresolved",
            rankingId: "",
            rawDisplayName: "",
            subjectFirmId: "missing-firm",
            resolutionStatus: "pending-review",
            rank: "not-ranked" as unknown as number,
            scoreTotal: "",
            scoreProfessionalism: 98,
          }),
        ],
      })
    );

    expect(entry).toMatchObject({
      ranking: {
        id: null,
        publisher: "AdvisorHub",
        name: "Unknown ranking",
        year: null,
        subjectType: "firm",
        methodologyUrl: null,
      },
      subject: {
        kind: "firm",
        id: null,
        displayName: "Unresolved ranking row",
        url: null,
      },
      firm: null,
      firmText: null,
      location: { city: null, state: null, label: "" },
      resolutionStatus: "pending-review",
      sourceStatus: [
        "missing-source",
        "unresolved-entity",
        "unresolved-firm",
        "missing-state",
        "missing-scale",
        "missing-growth",
      ],
    });
    expect(entry.scores.total).toEqual({
      value: null,
      status: "unavailable",
      label: "Unavailable",
    });
    expect(entry.scores.professionalism).toEqual({
      value: 98,
      status: "loaded",
      label: "98",
    });
    expect(entry._sort).toMatchObject({
      category: "",
      firm: "",
      location: "",
      name: "Unresolved ranking row",
      rank: Number.POSITIVE_INFINITY,
      scale: 0,
      growth: 0,
      year: 0,
    });
  });

  it("resolves advisors, teams, explicit firms, firm text, and employment fallbacks", () => {
    const advisorRow = advisor({ id: "advisor-1", slug: "" });
    const teamRow = team({ id: "team-1", slug: "" });
    const subjectFirm = firm({ id: "firm-subject", short: "", slug: "" });
    const explicitFirm = firm({ id: "firm-explicit", name: "Beacon Partners" });
    const textFirm = firm({ id: "firm-text", name: "Summit Advisors" });
    const employmentFirm = firm({ id: "firm-employment", name: "Legacy Firm" });
    const rows = rankingEntries(
      db({
        rankingEntries: [
          rankingEntry({
            id: "advisor-entry",
            subjectAdvisorId: advisorRow.id,
            city: "Austin",
            state: "tx",
            sourceUrl: "https://example.com/source",
            scoreScale: 87,
            scoreGrowth: 12,
          }),
          rankingEntry({
            id: "team-entry",
            subjectTeamId: teamRow.id,
            firmId: explicitFirm.id,
            firmText: "Ignored display firm",
          }),
          rankingEntry({
            id: "firm-entry",
            subjectFirmId: subjectFirm.id,
          }),
          rankingEntry({
            id: "text-firm-entry",
            firmText: textFirm.name,
          }),
          rankingEntry({
            id: "employment-entry",
            subjectAdvisorId: advisorRow.id,
          }),
        ],
        byRanking: new Map([[ranking().id, ranking()]]),
        byAdvisor: new Map([[advisorRow.id, advisorRow]]),
        byTeam: new Map([[teamRow.id, teamRow]]),
        byFirm: new Map(
          [subjectFirm, explicitFirm, textFirm, employmentFirm].map(row => [
            row.id,
            row,
          ])
        ),
        firms: [subjectFirm, explicitFirm, textFirm, employmentFirm],
        employments: [
          {
            id: "old-employment",
            advisorId: advisorRow.id,
            firmId: explicitFirm.id,
            startDate: "2020-01-01",
          },
          {
            id: "latest-employment",
            advisorId: advisorRow.id,
            firmId: employmentFirm.id,
            startDate: "2024-01-01",
          },
        ] as readonly EmploymentHistoryRow[],
      })
    );

    expect(rows.map(row => row.subject.kind)).toEqual([
      "advisor",
      "team",
      "firm",
      "advisor",
      "advisor",
    ]);
    expect(rows[0]?.subject.url).toBe("/advisor.html?id=advisor-1");
    expect(rows[0]?.firm?.id).toBe(employmentFirm.id);
    expect(rows[0]?.location).toEqual({
      city: AUSTIN,
      state: "TX",
      label: AUSTIN_TX,
    });
    expect(rows[0]?.sourceStatus).toEqual(["source-backed"]);
    expect(rows[1]?.subject.url).toBe("/team.html?id=team-1");
    expect(rows[1]?.firm?.id).toBe(explicitFirm.id);
    expect(rows[2]?.subject.url).toBe("/firm.html?id=firm-subject");
    expect(rows[2]?.firm).toMatchObject({
      id: subjectFirm.id,
      name: subjectFirm.name,
      short: subjectFirm.name,
      url: "/firm.html?id=firm-subject",
    });
    expect(rows[3]?.firm?.id).toBe(textFirm.id);
    expect(rows[4]?._sort.name).toBe(AVA_PARKER);
  });
});

describe("rankings explorer utilities", () => {
  it("defensively parses filters from malformed and empty URL targets", () => {
    expect(parseFilters(null, db({ rankingEntries: [] }))).toMatchObject({
      category: null,
      city: null,
      firmId: null,
      firmQuery: null,
      limit: 50,
      resolved: null,
      sort: RANK_SORT,
      state: null,
      year: null,
    });
    expect(
      parseFilters("bad target" as never, db({ rankingEntries: [] }))
    ).toMatchObject({
      limit: 50,
      sort: RANK_SORT,
    });
    expect(
      parseFilters({ get: "not callable" } as never, db({ rankingEntries: [] }))
    ).toMatchObject({
      limit: 50,
      sort: RANK_SORT,
    });

    const blankTarget = {
      get(name: string): unknown {
        return name === "limit" ? "" : null;
      },
    };

    expect(parseFilters(blankTarget, db({ rankingEntries: [] }))).toMatchObject(
      {
        limit: 50,
        sort: RANK_SORT,
      }
    );
    expect(normalizeState(" ca ")).toBe("CA");
    expect(normalizeState(" ")).toBeNull();
  });

  it("filters, sorts, and publicizes explorer entries across fallback branches", () => {
    const missingRank = explorerEntry({
      id: MISSING_RANK_ID,
      firm: null,
      firmText: "",
      resolutionStatus: "unresolved",
      _sort: {
        category: "Regional Teams",
        firm: "",
        location: "",
        name: "Unresolved Team",
        rank: Number.POSITIVE_INFINITY,
        scale: Number.POSITIVE_INFINITY,
        growth: Number.POSITIVE_INFINITY,
        year: 2024,
      },
    });
    const secondMissingRank = explorerEntry({
      id: "second-missing-rank",
      firm: null,
      firmText: null,
      _sort: {
        category: "Regional Teams",
        firm: "",
        location: "",
        name: "Another Missing Team",
        rank: Number.POSITIVE_INFINITY,
        scale: Number.POSITIVE_INFINITY,
        growth: Number.POSITIVE_INFINITY,
        year: 2025,
      },
    });
    const finiteRank = explorerEntry({
      id: FINITE_RANK_ID,
      _sort: {
        category: TOP_ADVISORS,
        firm: NORTHSTAR_WEALTH,
        location: AUSTIN_TX,
        name: AVA_PARKER,
        rank: 5,
        scale: 91,
        growth: 15,
        year: 2026,
      },
    });

    expect(
      filteredEntries([missingRank, finiteRank], {
        category: TOP_ADVISORS,
        city: "aus",
        firmId: "firm",
        firmQuery: null,
        limit: 50,
        resolved: "resolved",
        sort: RANK_SORT,
        state: "TX",
        year: 2026,
      }).map(row => row.id)
    ).toEqual([FINITE_RANK_ID]);
    expect(
      sortEntries([missingRank, secondMissingRank], RANK_SORT).map(
        row => row.id
      )
    ).toEqual([MISSING_RANK_ID, "second-missing-rank"]);
    expect(
      sortEntries([missingRank, finiteRank], RANK_SORT).map(row => row.id)
    ).toEqual([FINITE_RANK_ID, MISSING_RANK_ID]);
    expect(
      sortEntries([finiteRank, missingRank], RANK_SORT).map(row => row.id)
    ).toEqual([FINITE_RANK_ID, MISSING_RANK_ID]);
    expect(
      sortEntries([finiteRank, missingRank], "-year").map(row => row.id)
    ).toEqual([FINITE_RANK_ID, MISSING_RANK_ID]);
    expect(topFirms([missingRank, secondMissingRank, finiteRank])).toEqual([
      expect.objectContaining({ firmText: "Unknown firm", count: 2 }),
      expect.objectContaining({ firmText: NORTHSTAR_WEALTH, count: 1 }),
    ]);
    expect(publicEntry(finiteRank)).not.toHaveProperty("_sort");
    expect(
      publicFilters({
        ...parseFilters(null, db({ rankingEntries: [] })),
        limit: 10,
      })
    ).toMatchObject({
      limit: 10,
      sort: RANK_SORT,
    });
  });
});

describe("feed filter utilities", () => {
  it("normalizes feed query filters and matches every feed signal mode", () => {
    const target = {
      get(name: string): unknown {
        return name === "mode" ? "compliance" : RIA_WIRE;
      },
    };
    const complianceItem: FeedFilterableItem = {
      eventCards: [{ kind: "disclosure" }],
      article: { category: RIA_WIRE },
    };
    const recruitingItem: FeedFilterableItem = {
      eventCards: [{ kind: "transition" }],
      article: { category: "recruiting-moves" },
    };
    const plainItem: FeedFilterableItem = {};

    expect(parseFeedFilters(target)).toEqual({
      mode: COMPLIANCE_DISCLOSURES,
      category: "ria_wire",
    });
    expect(parseFeedFilters({ get: "missing" } as never)).toEqual({
      mode: "all",
      category: "all",
    });
    expect(matchesFeedMode(complianceItem, COMPLIANCE_DISCLOSURES)).toBe(true);
    expect(matchesFeedMode(recruitingItem, COMPLIANCE_DISCLOSURES)).toBe(false);
    expect(matchesFeedMode(plainItem, "event-backed")).toBe(false);
    expect(matchesFeedMode(plainItem, "recruiting-moves")).toBe(false);
    expect(matchesFeedMode(plainItem, "unknown-mode")).toBe(true);
    expect(matchesFeedCategory(plainItem, "all")).toBe(true);
    expect(matchesFeedCategory(plainItem, "ria_wire")).toBe(false);
    expect(matchesFeedCategory(complianceItem, "ria_wire")).toBe(true);
  });

  it("summarizes filtered feed counts and empty states", () => {
    const filters = {
      mode: "event-backed",
      category: "ria_wire",
    };
    const items: readonly FeedFilterableItem[] = [
      {
        eventCards: [{ kind: "disclosure" }],
        article: { category: RIA_WIRE },
      },
      {
        eventCards: [],
        article: { category: "rankings" },
      },
    ];

    expect(feedSummary(items, [items[0]!], [], filters)).toEqual({
      returned: 0,
      total: 2,
      modeTotal: 1,
      categoryTotal: 1,
    });
    expect(
      feedSummary(items, items, items, { ...filters, category: "all" })
    ).toEqual({
      returned: 2,
      total: 2,
      modeTotal: 2,
      categoryTotal: 2,
    });
    expect(feedEmptyState([items[0]!], filters)).toBeNull();
    expect(feedEmptyState([], filters)).toEqual({
      reason: "no-filtered-feed-results",
      message: "No feed items match the selected filters.",
    });
    expect(feedEmptyState([], { mode: "all", category: "all" })).toEqual({
      reason: "no-feed-results",
      message: "No public feed items are loaded.",
    });
  });
});

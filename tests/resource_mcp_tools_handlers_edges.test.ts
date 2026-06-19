import { beforeEach, describe, expect, it, vi } from "vitest";

const responses = vi.hoisted(() => ({
  AdvisorProfile: {},
  ArticleView: {},
  Feed: {},
  FirmProfile: {},
  Search: {},
  TeamProfile: {},
}));

vi.mock("../src/harper/resource-directory-endpoints.js", () => ({
  Search: class {
    get() {
      return responses.Search;
    }
  },
}));

vi.mock("../src/harper/resource-profile-endpoints.js", () => ({
  AdvisorProfile: class {
    get() {
      return responses.AdvisorProfile;
    }
  },
  ArticleView: class {
    get() {
      return responses.ArticleView;
    }
  },
  Feed: class {
    get() {
      return responses.Feed;
    }
  },
  FirmProfile: class {
    get() {
      return responses.FirmProfile;
    }
  },
  TeamProfile: class {
    get() {
      return responses.TeamProfile;
    }
  },
}));

const {
  getAdvisorProfile,
  getArticle,
  getFeed,
  getFirmProfile,
  getTeamProfile,
  searchAdvisorBook,
} = await import("../src/harper/resource-mcp-tools-handlers.js");

describe("AdvisorBook MCP tool handlers", () => {
  beforeEach(() => {
    responses.AdvisorProfile = {};
    responses.ArticleView = {};
    responses.Feed = { generatedAt: "now", count: 0, items: [] };
    responses.FirmProfile = {};
    responses.Search = { q: "advisor", counts: {}, items: [] };
    responses.TeamProfile = {};
  });

  it("normalizes empty profile payloads into MCP-safe fallbacks", async () => {
    await expect(getAdvisorProfile({ id: "advisor-1" })).resolves.toEqual(
      expect.objectContaining({
        advisor: undefined,
        currentFirm: null,
        career: [],
        teams: [],
        disclosures: [],
        evidenceFreshness: null,
        confidenceSummary: null,
        articles: [],
        resource: null,
        url: null,
      })
    );

    await expect(getFirmProfile({ id: "firm-1" })).resolves.toEqual(
      expect.objectContaining({
        firm: undefined,
        currentTeams: [],
        transitionsIn: [],
        transitionsOut: [],
        articles: [],
        brokerCheckSnapshot: null,
        resource: null,
        url: null,
      })
    );

    await expect(getTeamProfile({ id: "team-1" })).resolves.toEqual(
      expect.objectContaining({
        team: undefined,
        currentMembers: [],
        pastMembers: [],
        metrics: null,
        transitions: [],
        articles: [],
        resource: null,
        url: null,
      })
    );
  });

  it("passes resource errors through unchanged", async () => {
    responses.AdvisorProfile = { error: "missing advisor", id: "advisor-1" };
    responses.FirmProfile = { error: "missing firm", id: "firm-1" };
    responses.TeamProfile = { error: "missing team", id: "team-1" };
    responses.ArticleView = { error: "missing article", id: "article-1" };

    await expect(getAdvisorProfile({ id: "advisor-1" })).resolves.toEqual(
      responses.AdvisorProfile
    );
    await expect(getFirmProfile({ id: "firm-1" })).resolves.toEqual(
      responses.FirmProfile
    );
    await expect(getTeamProfile({ id: "team-1" })).resolves.toEqual(
      responses.TeamProfile
    );
    await expect(getArticle({ id: "article-1" })).resolves.toEqual(
      responses.ArticleView
    );
  });

  it("defaults malformed collection fields to empty arrays", async () => {
    responses.Feed = {
      generatedAt: "2026-06-19T08:00:00.000Z",
      count: 1,
      items: [
        {
          article: { id: "article-1", headline: "Article" },
          advisors: "bad",
          firms: null,
          teams: undefined,
          eventCards: { bad: true },
        },
      ],
    };
    responses.ArticleView = {
      article: { headline: "Article without id" },
      provenance: "bad",
      eventCards: null,
      advisors: undefined,
      firms: { bad: true },
      teams: [],
    };

    await expect(getFeed({ limit: 50 })).resolves.toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            advisors: [],
            firms: [],
            teams: [],
            eventCards: [],
          }),
        ],
      })
    );
    await expect(getArticle({ id: "article-1" })).resolves.toEqual(
      expect.objectContaining({
        body: null,
        provenance: [],
        eventCards: [],
        advisors: [],
        firms: [],
        teams: [],
        resource: null,
        url: null,
      })
    );
  });

  it("links article payloads when ids are present", async () => {
    responses.ArticleView = {
      article: { id: "article-2", headline: "Linked article" },
      body: "Article body",
      provenance: [{ source: "test" }],
      eventCards: [{ title: "Move" }],
      advisors: [{ id: "advisor-1" }],
      firms: [{ id: "firm-1" }],
      teams: [{ id: "team-1" }],
    };

    await expect(getArticle({ id: "article-2" })).resolves.toEqual(
      expect.objectContaining({
        body: "Article body",
        provenance: [{ source: "test" }],
        eventCards: [{ title: "Move" }],
        advisors: [{ id: "advisor-1" }],
        firms: [{ id: "firm-1" }],
        teams: [{ id: "team-1" }],
        resource: "advisorbook://article/article-2",
        url: "https://advisory-rankings-de.cody-swann-org.harperfabric.com/articles/linked-article-article-2",
      })
    );
  });

  it("formats search results with default limits", async () => {
    responses.Search = {
      q: "  ignored by mock  ",
      counts: { advisors: 1 },
      items: [
        {
          kind: "advisor",
          id: "advisor-1",
          name: "Ada Advisor",
          score: 0.9,
        },
      ],
    };

    await expect(searchAdvisorBook({ query: " advisor " })).resolves.toEqual({
      query: "  ignored by mock  ",
      counts: { advisors: 1 },
      items: [
        expect.objectContaining({
          id: "advisor-1",
          name: "Ada Advisor",
          subtitle: null,
          resource: "advisorbook://advisor/advisor-1",
        }),
      ],
    });
  });

  it("validates required search input and defaults invalid feed limits", async () => {
    responses.Feed = {
      generatedAt: "2026-06-19T08:00:00.000Z",
      count: 12,
      items: Array.from({ length: 12 }, (_, index) => ({
        article: { id: `article-${index}`, headline: `Article ${index}` },
      })),
    };

    await expect(searchAdvisorBook({ query: " " })).rejects.toThrow(
      "Missing required argument: query"
    );
    await expect(getFeed({ limit: "not-a-number" })).resolves.toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            resource: "advisorbook://article/article-9",
          }),
        ]),
      })
    );
  });
});

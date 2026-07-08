import { describe, expect, it } from "vitest";

import {
  advisorDisplayName,
  resolveAdvisor,
  resolveArticle,
  resolveFirm,
  resolveTeam,
} from "../src/harper/resource-routing.js";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const emptyDb = {
  articles: [],
  firms: [],
  advisors: [],
  teams: [],
  byArticle: new Map(),
  byFirm: new Map(),
  byAdvisor: new Map(),
  byTeam: new Map(),
};

describe("resource routing edge resolvers", () => {
  it("uses every advisor display fallback in order", () => {
    expect(advisorDisplayName(null)).toBe("");
    expect(advisorDisplayName({ displayName: "Display" } as never)).toBe(
      "Display"
    );
    expect(advisorDisplayName({ preferredName: "Preferred" } as never)).toBe(
      "Preferred"
    );
    expect(
      advisorDisplayName({ firstName: "First", lastName: "Last" } as never)
    ).toBe("First Last");
    expect(advisorDisplayName({ legalName: "Legal Name" } as never)).toBe(
      "Legal Name"
    );
    expect(advisorDisplayName({ id: "advisor-id" } as never)).toBe(
      "advisor-id"
    );
  });

  it("resolves ids, slugs, aliases, and missing identifiers", () => {
    const firm = { id: "firm-1", name: "Alpha Wealth", slug: "alpha" };
    const article = {
      id: "article-1",
      headline: "Advisor Team Moves",
      slug: "team-moves",
    };
    const advisor = {
      id: "advisor-1",
      firstName: "Jane",
      lastName: "Advisor",
      slug: "jane-advisor",
    };
    const team = { id: "team-1", name: "Alpha Team", slug: "alpha-team" };
    const db = {
      ...emptyDb,
      articles: [article],
      firms: [firm],
      advisors: [advisor],
      teams: [team],
      byArticle: new Map([["article-1", article]]),
      byFirm: new Map([["firm-1", firm]]),
      byAdvisor: new Map([["advisor-1", advisor]]),
      byTeam: new Map([["team-1", team]]),
      firmAliasByNormalized: new Map([
        ["alpha advisors", { id: "alias-1", firmId: "firm-1" }],
      ]),
    } as never;

    expect(resolveArticle(db, "article-1")).toBe(article);
    expect(resolveArticle(db, "Advisor Team Moves")).toBe(article);
    expect(resolveFirm(db, "Alpha Advisors")).toBe(firm);
    expect(resolveFirm(db, "alpha")).toBe(firm);
    expect(resolveAdvisor(db, "Jane Advisor")).toBe(advisor);
    expect(resolveTeam(db, "alpha-team")).toBe(team);
    expect(resolveTeam(db, "")).toBeNull();
  });

  it("serves the team profile shell for clean team detail routes", async () => {
    const { teams } =
      await import("../src/harper/resource-clean-web-routes.js");

    await expect(new teams().get({ id: "stone-group" })).resolves.toEqual(
      expect.objectContaining({
        contentType: "text/html; charset=utf-8",
        data: expect.stringContaining("<title>Team "),
      })
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  MAX_TOKENS_PER_ADVISOR,
  normalizeQueryToken,
  splitQueryTokens,
  tokensForAdvisor,
  type AdvisorRow,
  type AdvisorToken,
} from "../src/lib/advisor-tokens.js";

const advisor = (overrides: Partial<AdvisorRow> = {}): AdvisorRow => ({
  id: "advisor-1",
  legalName: "John Smith",
  firstName: "John",
  lastName: "Smith",
  preferredName: null,
  ...overrides,
});

const byToken = (
  tokens: ReadonlyArray<AdvisorToken>
): ReadonlyMap<string, AdvisorToken["kind"]> =>
  new Map(tokens.map(t => [t.token, t.kind]));

describe("normalizeQueryToken", () => {
  it("NFD-folds accented characters to ASCII", () => {
    expect(normalizeQueryToken("José")).toBe("jose");
    expect(normalizeQueryToken("Renée")).toBe("renee");
  });

  it("lowercases and trims", () => {
    expect(normalizeQueryToken("  SMITH  ")).toBe("smith");
  });

  it("is deterministic across calls", () => {
    expect(normalizeQueryToken("José")).toBe(normalizeQueryToken("José"));
  });
});

describe("splitQueryTokens", () => {
  it("splits on whitespace and name punctuation", () => {
    expect(splitQueryTokens("Smith-Jones")).toEqual(["smith", "jones"]);
    expect(splitQueryTokens("Mary Anne O'Brien")).toEqual([
      "mary",
      "anne",
      "brien",
    ]);
  });

  it("drops tokens shorter than two characters", () => {
    expect(splitQueryTokens("O'Brien")).toEqual(["brien"]);
    expect(splitQueryTokens("a")).toEqual([]);
  });

  it("returns empty for whitespace-only input", () => {
    expect(splitQueryTokens("   ")).toEqual([]);
  });
});

describe("tokensForAdvisor", () => {
  it("emits firstName, lastName, and full-name tokens", () => {
    const tokens = tokensForAdvisor(advisor());
    const map = byToken(tokens);
    expect(map.get("john")).toBe("firstName");
    expect(map.get("smith")).toBe("lastName");
    expect(map.get("john smith")).toBe("name");
  });

  it("normalizes Unicode names via NFD", () => {
    const tokens = tokensForAdvisor(
      advisor({ legalName: "José Smith", firstName: "José" })
    );
    const map = byToken(tokens);
    expect(map.has("josé")).toBe(false);
    expect(map.get("jose")).toBe("firstName");
  });

  it("splits hyphenated names without preserving the compound", () => {
    const tokens = tokensForAdvisor(
      advisor({
        legalName: "Mary Smith-Jones",
        firstName: "Mary",
        lastName: "Smith-Jones",
      })
    );
    const map = byToken(tokens);
    expect(map.get("smith")).toBe("lastName");
    expect(map.get("jones")).toBe("lastName");
    expect(map.has("smith-jones")).toBe(false);
  });

  it("splits apostrophes and drops single-character fragments", () => {
    const tokens = tokensForAdvisor(
      advisor({
        legalName: "John O'Brien",
        firstName: "John",
        lastName: "O'Brien",
      })
    );
    const map = byToken(tokens);
    expect(map.has("o")).toBe(false);
    expect(map.get("brien")).toBe("lastName");
  });

  it("dedupes by token, keeping the higher-precedence kind", () => {
    const tokens = tokensForAdvisor(
      advisor({
        legalName: "Smith Smith",
        firstName: "Smith",
        lastName: "Smith",
      })
    );
    const counts = tokens.filter(t => t.token === "smith");
    expect(counts).toHaveLength(1);
    expect(counts[0]?.kind).toBe("lastName");
  });

  it("name kind beats lastName/firstName when the full normalized name collides with a split token", () => {
    const tokens = tokensForAdvisor(
      advisor({
        legalName: "Smith",
        firstName: "Smith",
        lastName: "Smith",
      })
    );
    expect(tokens.filter(t => t.token === "smith")).toHaveLength(1);
    expect(tokens.find(t => t.token === "smith")?.kind).toBe("name");
  });

  it("emits preferredName tokens with lowest precedence", () => {
    const tokens = tokensForAdvisor(
      advisor({
        legalName: "Jonathan Smith",
        firstName: "Jonathan",
        lastName: "Smith",
        preferredName: "John",
      })
    );
    const map = byToken(tokens);
    expect(map.get("john")).toBe("preferredName");
  });

  it("is deterministic — same input yields the same output array", () => {
    const a = tokensForAdvisor(advisor());
    const b = tokensForAdvisor(advisor());
    expect(a).toEqual(b);
  });

  it("caps emitted tokens at MAX_TOKENS_PER_ADVISOR", () => {
    const huge = Array.from({ length: 200 }, (_, i) => `token${i}`).join(" ");
    const tokens = tokensForAdvisor(
      advisor({ legalName: huge, firstName: huge, lastName: null })
    );
    expect(tokens.length).toBeLessThanOrEqual(MAX_TOKENS_PER_ADVISOR);
  });

  it("handles null/missing name fields without throwing", () => {
    const tokens = tokensForAdvisor({
      id: "advisor-1",
      legalName: "Smith",
      firstName: null,
      lastName: null,
      preferredName: null,
    });
    const map = byToken(tokens);
    expect(map.get("smith")).toBe("name");
  });
});

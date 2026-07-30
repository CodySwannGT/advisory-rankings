import { describe, expect, it } from "vitest";

import { buildMerrillSearchUrl } from "../src/lib/merrill.js";

describe("Merrill search URL edge cases", () => {
  it("serializes omitted search input as a blank Yext query", () => {
    const url = new URL(buildMerrillSearchUrl({ limit: 25, offset: 50 }));

    expect(url.hostname).toBe("liveapi-cached.yext.com");
    expect(url.searchParams.get("input")).toBe("");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("offset")).toBe("50");
  });
});

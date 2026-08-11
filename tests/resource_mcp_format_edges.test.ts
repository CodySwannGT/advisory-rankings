import { describe, expect, it } from "vitest";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const {
  articleLinks,
  compactRows,
  limitArg,
  requiredIdTarget,
  requiredString,
  resourceUri,
  routeTarget,
  webUrl,
} = await import("../src/harper/resource-mcp-format.js");
const { handleMcpRequest } = await import("../src/harper/resource-mcp.js");

const INVALID_RESOURCE_URI = "Invalid AdvisorBook resource URI";
const RESOURCES_READ_METHOD = "resources/read";

describe("MCP formatting edge coverage", () => {
  it("bounds optional limits and required string ids", () => {
    expect(limitArg({ limit: Number.POSITIVE_INFINITY })).toBe(10);
    expect(limitArg({ limit: 0 })).toBe(1);
    expect(limitArg({ limit: 24.9 })).toBe(20);
    expect(requiredString({ id: "  advisor-1  " }, "id")).toBe("advisor-1");
    expect(() => requiredString({ id: "   " }, "id")).toThrow(
      "Missing required argument: id"
    );
  });

  it("builds Harper-like route targets with query fallbacks", () => {
    const target = routeTarget("firm-1", { q: "smith" });

    expect(target.id).toBe("firm-1");
    expect(target.get("q")).toBe("smith");
    expect(target.get("missing")).toBeNull();
    expect(target.toString()).toBe("firm-1");
    expect(requiredIdTarget({ id: " team-1 " }).toString()).toBe("team-1");
  });

  it("keeps MCP resource links compact and safely encoded", () => {
    const rows = Array.from({ length: 25 }, (_unused, index) => ({
      id: `article-${index}`,
      headline: `Headline ${index}`,
    }));

    expect(compactRows(rows)).toHaveLength(20);
    expect(compactRows("not rows" as unknown as readonly string[])).toEqual([]);
    expect(articleLinks(rows)).toHaveLength(20);
    expect(resourceUri("advisor", "smith/jane")).toBe(
      "advisorbook://advisor/smith%2Fjane"
    );
    expect(resourceUri("advisor", "")).toBeNull();
  });

  it("uses public URL label fallbacks and profile slugs", () => {
    expect(
      webUrl("advisor", {
        id: "advisor-1",
        displayName: "Jalapeno & Wealth",
      })
    ).toContain("/advisors/jalapeno-and-wealth-advisor-1");
    expect(webUrl("firm", { id: "firm-1", short: "RJA" })).toContain(
      "/firms/rja-firm-1"
    );
    expect(webUrl("team", { id: "team-1", name: "" })).toContain(
      "/teams/team-1-team-1"
    );
    expect(webUrl("article", null)).toBeNull();
  });

  it("rejects malformed AdvisorBook resource URIs through JSON-RPC", async () => {
    await expect(
      handleMcpRequest({
        id: "bad-scheme",
        jsonrpc: "2.0",
        method: RESOURCES_READ_METHOD,
        params: { uri: "advisor://feed" },
      })
    ).resolves.toMatchObject({
      id: "bad-scheme",
      error: { code: -32603, message: INVALID_RESOURCE_URI },
    });
    await expect(
      handleMcpRequest({
        id: "bad-shape",
        jsonrpc: "2.0",
        method: RESOURCES_READ_METHOD,
        params: { uri: "advisorbook://advisor/id/extra" },
      })
    ).resolves.toMatchObject({
      id: "bad-shape",
      error: { code: -32603, message: INVALID_RESOURCE_URI },
    });
    await expect(
      handleMcpRequest({
        id: "bad-kind",
        jsonrpc: "2.0",
        method: RESOURCES_READ_METHOD,
        params: { uri: "advisorbook://office/123" },
      })
    ).resolves.toMatchObject({
      id: "bad-kind",
      error: {
        code: -32603,
        message: "Unsupported AdvisorBook resource: office",
      },
    });
  });
});

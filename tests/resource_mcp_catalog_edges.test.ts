import { describe, expect, it } from "vitest";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const { McpCatalog } = await import("../src/harper/resource-mcp-catalog.js");

describe("MCP catalog resource edges", () => {
  it("allows public reads and builds the default catalog through JSON-RPC", async () => {
    const catalogResource = new McpCatalog();

    expect(catalogResource.allowRead()).toBe(true);

    const catalog = await catalogResource.get();

    expect(catalog).toMatchObject({
      status: "ready",
      endpoint: {
        url: "/mcp",
        transport: "streamable-http",
        authRequired: false,
      },
      readOnlyBoundary: {
        status: "read-only",
      },
    });
    expect(catalog.generatedAt).toEqual(expect.any(String));
    expect(catalog.initialize).toMatchObject({
      protocolVersion: expect.any(String),
    });
    expect(catalog.tools.length).toBeGreaterThan(0);
    expect(Array.isArray(catalog.resourceTemplates)).toBe(true);
    expect(
      catalog.readOnlyBoundary.filteredCapabilities
    ).toBeGreaterThanOrEqual(0);
    expect(catalog.readOnlyBoundary.forbiddenTerms).toContain("delete");
  });
});

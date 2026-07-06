import { describe, expect, it } from "vitest";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const { MCP_RESOURCE_TEMPLATES } =
  await import("../src/harper/resource-mcp-resources.js");
const { MCP_TOOL_DEFINITIONS } =
  await import("../src/harper/resource-mcp-tools.js");
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
    expect(catalog.tools).toEqual(MCP_TOOL_DEFINITIONS);
    expect(catalog.resourceTemplates).toEqual(MCP_RESOURCE_TEMPLATES);
    expect(catalog.readOnlyBoundary.filteredCapabilities).toBe(0);
    expect(catalog.readOnlyBoundary.forbiddenTerms).toContain("delete");
    expect(catalogEntryText(catalog.tools)).not.toMatch(
      forbiddenTermPattern(catalog.readOnlyBoundary.forbiddenTerms)
    );
    expect(catalogEntryText(catalog.resourceTemplates)).not.toMatch(
      forbiddenTermPattern(catalog.readOnlyBoundary.forbiddenTerms)
    );
  });
});

function catalogEntryText(entries: readonly unknown[]): string {
  return entries
    .map(entry =>
      ["name", "title", "description", "uriTemplate"]
        .map(key => (entry as Readonly<Record<string, unknown>>)[key])
        .filter(value => typeof value === "string")
        .join(" ")
    )
    .join(" ")
    .toLowerCase();
}

function forbiddenTermPattern(terms: readonly string[]): RegExp {
  return new RegExp(`\\b(${terms.join("|")})\\b`, "u");
}

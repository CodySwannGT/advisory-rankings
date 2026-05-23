import { describe, expect, it } from "vitest";

/** Minimal Harper Resource shim for MCP resource construction. */
class Resource {}

(globalThis as any).Resource = Resource;

const mcpResource = await import("../src/harper/resource-mcp.js");

const PROTOCOL_VERSION = "2025-06-18";

const initializeRequest = {
  jsonrpc: "2.0",
  id: "init-1",
  method: "initialize",
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "vitest", version: "1.0.0" },
  },
};

const READ_ONLY_TOOL_NAMES = [
  "search_advisorbook",
  "get_feed",
  "get_advisor_profile",
  "get_firm_profile",
  "get_team_profile",
  "get_article",
];

const FORBIDDEN_TOOL_TERMS = [
  "admin",
  "auth",
  "credential",
  "delete",
  "ingest",
  "insert",
  "mutation",
  "raw",
  "refresh",
  "scrape",
  "sql",
  "table",
  "token",
  "update",
  "upsert",
  "write",
];

describe("MCP transport", () => {
  it("accepts anonymous initialize requests", async () => {
    const endpoint = new (mcpResource as any).mcp();

    expect(endpoint.allowCreate()).toBe(true);
    await expect(endpoint.post(initializeRequest)).resolves.toEqual({
      jsonrpc: "2.0",
      id: "init-1",
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "advisorbook",
          title: "AdvisorBook",
          version: "0.1.0",
        },
      },
    });
  });

  it("returns standard JSON-RPC errors for malformed and unsupported calls", async () => {
    await expect(mcpResource.handleMcpRequest(undefined)).resolves.toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    await expect(
      mcpResource.handleMcpRequest({ jsonrpc: "2.0" })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
    await expect(
      mcpResource.handleMcpRequest({
        jsonrpc: "2.0",
        id: "unsupported-1",
        method: "resources/list",
      })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: "unsupported-1",
      error: { code: -32601, message: "Method not found: resources/list" },
    });
  });

  it("lists only curated read-only AdvisorBook tools", async () => {
    const response = await mcpResource.handleMcpRequest({
      jsonrpc: "2.0",
      id: "tools-1",
      method: "tools/list",
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "tools-1",
      result: {
        tools: READ_ONLY_TOOL_NAMES.map(name => ({ name })),
      },
    });
    expect(toolNames(response)).toEqual(READ_ONLY_TOOL_NAMES);
    for (const tool of response.result.tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(readOnlyCatalogText(tool)).not.toMatch(forbiddenToolTermPattern());
    }
  });

  it("returns a predictable error for unknown tool calls", async () => {
    await expect(
      mcpResource.handleMcpRequest({
        jsonrpc: "2.0",
        id: "invalid-tool-1",
        method: "tools/call",
        params: { name: "delete_everything", arguments: {} },
      })
    ).resolves.toEqual({
      jsonrpc: "2.0",
      id: "invalid-tool-1",
      error: {
        code: -32603,
        message: "Unknown tool: delete_everything",
      },
    });
  });

  it("handles batches and notifications without response leakage", async () => {
    await expect(mcpResource.handleMcpRequest([])).resolves.toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
    await expect(
      mcpResource.handleMcpRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })
    ).resolves.toBeNull();
    await expect(
      mcpResource.handleMcpRequest([
        {
          jsonrpc: "2.0",
          method: "notifications/initialized",
        },
        {
          jsonrpc: "2.0",
          id: "init-2",
          method: "initialize",
          params: { protocolVersion: PROTOCOL_VERSION },
        },
      ])
    ).resolves.toEqual([
      {
        jsonrpc: "2.0",
        id: "init-2",
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "advisorbook",
            title: "AdvisorBook",
            version: "0.1.0",
          },
        },
      },
    ]);
  });
});

/**
 * Extracts listed tool names from a JSON-RPC tools/list response.
 * @param response - JSON-RPC tools/list response.
 * @returns Tool names in advertised order.
 */
function toolNames(response: any) {
  return response.result.tools.map((tool: any) => tool.name);
}

/**
 * Joins public tool catalog text that could reveal unsafe capabilities.
 * @param tool - MCP tool definition.
 * @returns Lowercase searchable text.
 */
function readOnlyCatalogText(tool: any) {
  return [tool.name, tool.title, tool.description].join(" ").toLowerCase();
}

/**
 * Builds a whole-word forbidden term matcher for MCP tool catalog text.
 * @returns Forbidden tool term regular expression.
 */
function forbiddenToolTermPattern() {
  return new RegExp(`\\b(${FORBIDDEN_TOOL_TERMS.join("|")})\\b`, "u");
}

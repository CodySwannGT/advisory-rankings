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
    await expect(
      mcpResource.handleMcpRequest({
        jsonrpc: "2.0",
        id: "tools-1",
        method: "tools/list",
      })
    ).resolves.toMatchObject({
      jsonrpc: "2.0",
      id: "tools-1",
      result: {
        tools: [
          { name: "search_advisorbook" },
          { name: "get_feed" },
          { name: "get_advisor_profile" },
          { name: "get_firm_profile" },
          { name: "get_team_profile" },
          { name: "get_article" },
        ],
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

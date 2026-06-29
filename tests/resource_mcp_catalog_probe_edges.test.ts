import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpMocks = vi.hoisted(() => ({
  handleMcpRequest: vi.fn(),
}));

vi.mock("../src/harper/resource-mcp.js", () => mcpMocks);

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const { buildMcpCatalog } =
  await import("../src/harper/resource-mcp-catalog.js");

const PROTOCOL_VERSION = "2025-06-18";
const TOOLS_LIST_METHOD = "tools/list";
const validResponse = (result: unknown): unknown => ({ result });

describe("MCP catalog default probe failures", () => {
  beforeEach(() => {
    mcpMocks.handleMcpRequest.mockReset();
  });

  it("fails closed when initialize returns a malformed JSON-RPC response", async () => {
    mcpMocks.handleMcpRequest.mockImplementation(async request => {
      if (request.method === "initialize") return null;
      if (request.method === TOOLS_LIST_METHOD)
        return validResponse({ tools: [{ name: "safe_tool" }] });
      return validResponse({ resourceTemplates: [] });
    });

    await expect(buildMcpCatalog()).resolves.toMatchObject({
      status: "unavailable",
      unavailableReason: "MCP probe returned an invalid response",
      tools: [],
      resourceTemplates: [],
    });
  });

  it("fails closed when the tools result is not an object", async () => {
    mcpMocks.handleMcpRequest.mockImplementation(async request => {
      if (request.method === "initialize")
        return validResponse({ protocolVersion: PROTOCOL_VERSION });
      if (request.method === TOOLS_LIST_METHOD) return validResponse(null);
      return validResponse({ resourceTemplates: [] });
    });

    await expect(buildMcpCatalog()).resolves.toMatchObject({
      status: "unavailable",
      unavailableReason: "MCP tools probe returned invalid result",
    });
  });

  it("fails closed when the tools result list is malformed", async () => {
    mcpMocks.handleMcpRequest.mockImplementation(async request => {
      if (request.method === "initialize")
        return validResponse({ protocolVersion: PROTOCOL_VERSION });
      if (request.method === TOOLS_LIST_METHOD)
        return validResponse({ tools: {} });
      return validResponse({ resourceTemplates: [] });
    });

    await expect(buildMcpCatalog()).resolves.toMatchObject({
      status: "unavailable",
      unavailableReason: "MCP tools probe returned invalid list",
    });
  });
});

import { describe, expect, it } from "vitest";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const { extractJsonRpcBody, handleMcpRequest } =
  await import("../src/harper/resource-mcp.js");

describe("MCP JSON-RPC dispatch edges", () => {
  it("returns a parse error when no request body can be extracted", async () => {
    await expect(handleMcpRequest(undefined)).resolves.toMatchObject({
      error: { code: -32700, message: "Parse error" },
      id: null,
      jsonrpc: "2.0",
    });
  });

  it("recognizes plain and null-prototype fallback bodies", () => {
    const fallbackBody = Object.create(null) as Record<string, unknown>;
    fallbackBody.id = "fallback";

    expect(extractJsonRpcBody(["ignored", fallbackBody])).toBe(fallbackBody);
  });

  it("handles empty and all-notification batches", async () => {
    await expect(handleMcpRequest([])).resolves.toMatchObject({
      error: { code: -32600, message: "Invalid Request" },
      id: null,
      jsonrpc: "2.0",
    });
    await expect(
      handleMcpRequest([
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ])
    ).resolves.toBeNull();
  });

  it("rejects oversized batches instead of amplifying anonymous work", async () => {
    const oversized = Array.from({ length: 21 }, (_unused, index) => ({
      id: index,
      jsonrpc: "2.0",
      method: "tools/list",
    }));

    await expect(handleMcpRequest(oversized)).resolves.toMatchObject({
      error: { code: -32600, message: "Batch too large: max 20 requests" },
      id: null,
      jsonrpc: "2.0",
    });

    const atLimit = Array.from({ length: 20 }, (_unused, index) => ({
      id: index,
      jsonrpc: "2.0",
      method: "tools/list",
    }));
    const responses = await handleMcpRequest(atLimit);
    expect(Array.isArray(responses)).toBe(true);
    expect((responses as readonly unknown[]).length).toBe(20);
  });

  it("preserves valid ids on invalid requests", async () => {
    await expect(
      handleMcpRequest({ id: 7, jsonrpc: "2.0" })
    ).resolves.toMatchObject({
      error: { code: -32600, message: "Invalid Request" },
      id: 7,
      jsonrpc: "2.0",
    });
  });

  it("uses the requested initialize protocol version", async () => {
    await expect(
      handleMcpRequest({
        id: "init",
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
      })
    ).resolves.toMatchObject({
      id: "init",
      jsonrpc: "2.0",
      result: { protocolVersion: "2024-11-05" },
    });
  });

  it("falls back to the server protocol version when initialize params omit one", async () => {
    await expect(
      handleMcpRequest({
        id: "init-default",
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
      })
    ).resolves.toMatchObject({
      id: "init-default",
      result: { protocolVersion: "2025-06-18" },
    });
  });

  it("rejects invalid tool and resource params", async () => {
    await expect(
      handleMcpRequest({
        id: "tool",
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: { q: "advisor" } },
      })
    ).resolves.toMatchObject({
      error: { code: -32602, message: "Invalid tool call params" },
      id: "tool",
    });
    await expect(
      handleMcpRequest({
        id: "resource",
        jsonrpc: "2.0",
        method: "resources/read",
        params: { uri: 42 },
      })
    ).resolves.toMatchObject({
      error: { code: -32602, message: "Invalid resource read params" },
      id: "resource",
    });
  });
});

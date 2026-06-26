import { describe, expect, it } from "vitest";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const { extractJsonRpcBody, handleMcpRequest } =
  await import("../src/harper/resource-mcp.js");
const JSON_RPC = "2.0";
const INVALID_REQUEST = "Invalid Request";

describe("MCP JSON-RPC transport edges", () => {
  it("returns parse and invalid-request errors with stable ids", async () => {
    await expect(handleMcpRequest(undefined)).resolves.toMatchObject({
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    await expect(
      handleMcpRequest({ jsonrpc: JSON_RPC, id: "bad-shape" })
    ).resolves.toMatchObject({
      id: "bad-shape",
      error: { code: -32600, message: INVALID_REQUEST },
    });
    await expect(handleMcpRequest({ id: true })).resolves.toMatchObject({
      id: null,
      error: { code: -32600, message: INVALID_REQUEST },
    });
  });

  it("handles empty and all-notification batches", async () => {
    await expect(handleMcpRequest([])).resolves.toMatchObject({
      id: null,
      error: { code: -32600, message: INVALID_REQUEST },
    });
    await expect(
      handleMcpRequest([
        { jsonrpc: JSON_RPC, method: "notifications/initialized" },
      ])
    ).resolves.toBeNull();
  });

  it("validates resource read and tool call params before dispatch", async () => {
    await expect(
      handleMcpRequest({
        jsonrpc: JSON_RPC,
        id: 1,
        method: "resources/read",
        params: {},
      })
    ).resolves.toMatchObject({
      id: 1,
      error: { code: -32602, message: "Invalid resource read params" },
    });
    await expect(
      handleMcpRequest({
        jsonrpc: JSON_RPC,
        id: 2,
        method: "tools/call",
        params: { name: 7 },
      })
    ).resolves.toMatchObject({
      id: 2,
      error: { code: -32602, message: "Invalid tool call params" },
    });
  });

  it("uses requested protocol versions and null ids in valid responses", async () => {
    await expect(
      handleMcpRequest({
        jsonrpc: JSON_RPC,
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
        id: null,
      })
    ).resolves.toMatchObject({
      id: null,
      result: { protocolVersion: "2024-11-05" },
    });
  });

  it("extracts parsed body candidates from variadic Harper arguments", () => {
    const body = Object.create(null) as Record<string, unknown>;
    body.id = 1;

    expect(extractJsonRpcBody(["ignored", body])).toBe(body);
    expect(extractJsonRpcBody([new Date(), "ignored"])).toBeUndefined();
  });
});

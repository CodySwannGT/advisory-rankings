import { handleMcpRequest } from "./resource-mcp.js";

const ENDPOINT_URL = "/mcp";
const UNAVAILABLE_STATE = "unavailable";
const READY_STATE = "ready";
const READ_ONLY_STATUS = "read-only";
const JSON_RPC = "2.0";
const FORBIDDEN_CAPABILITY_TERMS = [
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
] as const;

/** Public catalog payload for AdvisorBook's MCP gallery. */
export interface McpCatalogResponse {
  readonly status: typeof READY_STATE | typeof UNAVAILABLE_STATE;
  readonly generatedAt: string;
  readonly endpoint: McpCatalogEndpoint;
  readonly readOnlyBoundary: McpCatalogBoundary;
  readonly initialize: unknown | null;
  readonly tools: ReadonlyArray<unknown>;
  readonly resourceTemplates: ReadonlyArray<unknown>;
  readonly unavailableReason?: string;
}

/** Public MCP endpoint metadata used by gallery clients. */
export interface McpCatalogEndpoint {
  readonly url: typeof ENDPOINT_URL;
  readonly transport: "streamable-http";
  readonly authRequired: false;
}

/** Public read-only boundary summary for the catalog. */
export interface McpCatalogBoundary {
  readonly status: typeof READ_ONLY_STATUS | typeof UNAVAILABLE_STATE;
  readonly filteredCapabilities: number;
  readonly forbiddenTerms: ReadonlyArray<string>;
}

/** Probe used to inspect the MCP JSON-RPC endpoint surface. */
export interface McpCatalogProbe {
  readonly initialize: () => Promise<unknown>;
  readonly listTools: () => Promise<unknown>;
  readonly listResourceTemplates: () => Promise<unknown>;
}

/** Public same-origin catalog endpoint for the MCP gallery UI. */
export class McpCatalog extends Resource {
  /**
   * Allows anonymous reads of the public MCP catalog.
   * @returns True because the catalog exposes only public MCP metadata.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Returns the current public MCP catalog or an explicit unavailable state.
   * @returns Public MCP catalog payload.
   */
  async get(): Promise<McpCatalogResponse> {
    return buildMcpCatalog();
  }
}

/**
 * Builds the public catalog from initialize, tools/list, and templates/list.
 * @param probe - MCP probe implementation, overridable for focused tests.
 * @returns Public catalog response.
 */
export async function buildMcpCatalog(
  probe: McpCatalogProbe = defaultMcpCatalogProbe
): Promise<McpCatalogResponse> {
  const generatedAt = new Date().toISOString();
  try {
    const [initialize, tools, resourceTemplates] = await Promise.all([
      probe.initialize(),
      probe.listTools(),
      probe.listResourceTemplates(),
    ]);
    const safeTools = filterSafeCatalogEntries(readArray(tools));
    const safeTemplates = filterSafeCatalogEntries(
      readArray(resourceTemplates)
    );
    return {
      status: READY_STATE,
      generatedAt,
      endpoint: endpointInfo(),
      readOnlyBoundary: {
        status: READ_ONLY_STATUS,
        filteredCapabilities:
          readArray(tools).length -
          safeTools.length +
          readArray(resourceTemplates).length -
          safeTemplates.length,
        forbiddenTerms: FORBIDDEN_CAPABILITY_TERMS,
      },
      initialize,
      tools: safeTools,
      resourceTemplates: safeTemplates,
    };
  } catch (error) {
    return unavailableCatalog(generatedAt, error);
  }
}

const defaultMcpCatalogProbe: McpCatalogProbe = {
  initialize: async () =>
    rpcResult(
      await handleMcpRequest({
        jsonrpc: JSON_RPC,
        id: "catalog-initialize",
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      })
    ),
  listTools: async () =>
    readCatalogList(
      rpcResult(
        await handleMcpRequest({
          jsonrpc: JSON_RPC,
          id: "catalog-tools",
          method: "tools/list",
        })
      ),
      "tools"
    ),
  listResourceTemplates: async () =>
    readCatalogList(
      rpcResult(
        await handleMcpRequest({
          jsonrpc: JSON_RPC,
          id: "catalog-templates",
          method: "resources/templates/list",
        })
      ),
      "resourceTemplates"
    ),
};

/**
 * Extracts a JSON-RPC success result or fails closed for catalog consumers.
 * @param response - JSON-RPC response from the MCP dispatcher.
 * @returns Response result payload.
 */
function rpcResult(response: unknown): unknown {
  if (!response || typeof response !== "object" || Array.isArray(response))
    throw new Error("MCP probe returned an invalid response");
  const result = (response as Readonly<Record<string, unknown>>).result;
  if (result === undefined) throw new Error("MCP probe did not return result");
  return result;
}

/**
 * Reads an array property from a JSON-RPC result.
 * @param result - Result object.
 * @param key - Array property to read.
 * @returns Catalog entries.
 */
function readCatalogList(result: unknown, key: string): readonly unknown[] {
  if (!result || typeof result !== "object")
    throw new Error(`MCP ${key} probe returned invalid result`);
  const entries = (result as Readonly<Record<string, unknown>>)[key];
  if (!Array.isArray(entries))
    throw new Error(`MCP ${key} probe returned invalid list`);
  return entries;
}

/**
 * Normalizes probe output to an array.
 * @param value - Probe output.
 * @returns Probe output when it is an array.
 */
function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("MCP catalog list is unavailable");
  return value;
}

/**
 * Removes catalog entries whose public metadata advertises unsafe capability
 * families.
 * @param entries - Tool or resource template entries.
 * @returns Entries safe for a public gallery.
 */
function filterSafeCatalogEntries(
  entries: readonly unknown[]
): readonly unknown[] {
  return entries.filter(
    entry => !forbiddenTermPattern().test(entryText(entry))
  );
}

/**
 * Builds searchable text from a catalog entry's public fields.
 * @param entry - Tool or resource template entry.
 * @returns Lowercase searchable metadata.
 */
function entryText(entry: unknown): string {
  if (!entry || typeof entry !== "object") return String(entry).toLowerCase();
  const values = ["name", "title", "description", "uriTemplate"].map(
    key => (entry as Readonly<Record<string, unknown>>)[key]
  );
  return values
    .filter(value => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

/**
 * Builds the unsafe public capability matcher.
 * @returns Forbidden term regular expression.
 */
function forbiddenTermPattern(): RegExp {
  return new RegExp(`\\b(${FORBIDDEN_CAPABILITY_TERMS.join("|")})\\b`, "u");
}

/**
 * Returns the stable same-origin MCP endpoint metadata.
 * @returns Endpoint metadata.
 */
function endpointInfo(): McpCatalogResponse["endpoint"] {
  return {
    url: ENDPOINT_URL,
    transport: "streamable-http",
    authRequired: false,
  };
}

/**
 * Builds an explicit fail-closed catalog response.
 * @param generatedAt - Catalog generation timestamp.
 * @param error - Probe failure.
 * @returns Unavailable catalog payload.
 */
function unavailableCatalog(
  generatedAt: string,
  error: unknown
): McpCatalogResponse {
  return {
    status: UNAVAILABLE_STATE,
    generatedAt,
    endpoint: endpointInfo(),
    readOnlyBoundary: {
      status: UNAVAILABLE_STATE,
      filteredCapabilities: 0,
      forbiddenTerms: FORBIDDEN_CAPABILITY_TERMS,
    },
    initialize: null,
    tools: [],
    resourceTemplates: [],
    unavailableReason:
      error instanceof Error ? error.message : "MCP catalog probe failed",
  };
}

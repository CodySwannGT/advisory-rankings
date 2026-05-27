import { idSchema, limitSchema, objectSchema } from "./resource-mcp-format.js";
import type { ToolArgs, ToolInputSchema } from "./resource-mcp-format.js";
import {
  getAdvisorProfile,
  getArticle,
  getFeed,
  getFirmProfile,
  getTeamProfile,
  searchAdvisorBook,
} from "./resource-mcp-tools-handlers.js";

export const MCP_TOOL_CAPABILITIES = { tools: { listChanged: false } };

/** Per-tool MCP definition row exposed to clients via `tools/list`. */
interface McpToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
}

export const MCP_TOOL_DEFINITIONS: ReadonlyArray<McpToolDefinition> = [
  {
    name: "search_advisorbook",
    title: "Search AdvisorBook",
    description:
      "Search public AdvisorBook firms, advisors, and teams by name.",
    inputSchema: objectSchema(
      {
        query: {
          type: "string",
          description: "Search query. At least two characters.",
        },
        limit: { ...limitSchema() },
      },
      ["query"]
    ),
  },
  {
    name: "get_feed",
    title: "Get AdvisorBook feed",
    description: "Return recent public AdvisorBook article feed items.",
    inputSchema: objectSchema({ limit: { ...limitSchema() } }),
  },
  {
    name: "get_advisor_profile",
    title: "Get advisor profile",
    description: "Return a curated public advisor profile summary.",
    inputSchema: idSchema("Advisor id or slug."),
  },
  {
    name: "get_firm_profile",
    title: "Get firm profile",
    description: "Return a curated public firm profile summary.",
    inputSchema: idSchema("Firm id, slug, or alias."),
  },
  {
    name: "get_team_profile",
    title: "Get team profile",
    description: "Return a curated public team profile summary.",
    inputSchema: idSchema("Team id or slug."),
  },
  {
    name: "get_article",
    title: "Get article",
    description: "Return a curated public article detail summary.",
    inputSchema: idSchema("Article id or slug."),
  },
];

/**
 * Dispatches public read-only AdvisorBook tools.
 * @param name - Tool name.
 * @param args - Tool arguments.
 * @returns Curated tool payload.
 */
export async function callMcpTool(
  name: string,
  args: ToolArgs
): Promise<unknown> {
  switch (name) {
    case "search_advisorbook":
      return searchAdvisorBook(args);
    case "get_feed":
      return getFeed(args);
    case "get_advisor_profile":
      return getAdvisorProfile(args);
    case "get_firm_profile":
      return getFirmProfile(args);
    case "get_team_profile":
      return getTeamProfile(args);
    case "get_article":
      return getArticle(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** Single text chunk emitted in an MCP tool result. */
interface ToolResultTextChunk {
  readonly type: "text";
  readonly text: string;
}

/** MCP tool result envelope returned to JSON-RPC clients. */
interface ToolResult {
  readonly content: ReadonlyArray<ToolResultTextChunk>;
  readonly structuredContent: unknown;
}

/**
 * Wraps structured payloads in MCP text content.
 * @param result - Tool payload.
 * @returns MCP tool result.
 */
export function toolResult(result: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

/**
 * Converts thrown values to stable JSON-RPC error text.
 * @param error - Unknown thrown value.
 * @returns Error message.
 */
export function toolErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tool call failed";
}

// @ts-nocheck
import { Search } from "./resource-directory-endpoints.js";
import {
  articleLinks,
  compactRows,
  feedResult,
  idSchema,
  limitArg,
  limitSchema,
  objectSchema,
  requiredIdTarget,
  requiredString,
  resourceUri,
  routeTarget,
  searchResult,
  webUrl,
} from "./resource-mcp-format.js";
import {
  AdvisorProfile,
  ArticleView,
  Feed,
  FirmProfile,
  TeamProfile,
} from "./resource-profile-endpoints.js";

export const MCP_TOOL_CAPABILITIES = { tools: { listChanged: false } };

export const MCP_TOOL_DEFINITIONS = [
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
        limit: limitSchema(),
      },
      ["query"]
    ),
  },
  {
    name: "get_feed",
    title: "Get AdvisorBook feed",
    description: "Return recent public AdvisorBook article feed items.",
    inputSchema: objectSchema({ limit: limitSchema() }),
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
export async function callMcpTool(name, args) {
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

/**
 * Wraps structured payloads in MCP text content.
 * @param result - Tool payload.
 * @returns MCP tool result.
 */
export function toolResult(result) {
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
export function toolErrorMessage(error) {
  return error instanceof Error ? error.message : "Tool call failed";
}

/**
 * Searches public AdvisorBook entities.
 * @param args - Search tool arguments.
 * @returns Compact ranked matches.
 */
async function searchAdvisorBook(args) {
  const query = requiredString(args, "query");
  const response = await new Search().get(
    routeTarget("", { q: query, limit: String(limitArg(args)) })
  );
  return {
    query: response.q,
    counts: response.counts,
    items: response.items.map(searchResult),
  };
}

/**
 * Returns recent public feed items.
 * @param args - Feed tool arguments.
 * @returns Compact feed payload.
 */
async function getFeed(args) {
  const response = await new Feed().get();
  return {
    generatedAt: response.generatedAt,
    count: response.count,
    items: response.items.slice(0, limitArg(args)).map(feedResult),
    resource: "advisorbook://feed",
    url: "https://advisory-rankings-de.cody-swann-org.harperfabric.com/",
  };
}

/**
 * Returns a curated advisor profile.
 * @param args - Profile tool arguments.
 * @returns Compact advisor payload.
 */
async function getAdvisorProfile(args) {
  const response = await new AdvisorProfile().get(requiredIdTarget(args));
  if (response.error) return response;
  const advisor = response.advisor;
  return {
    advisor,
    displayName: response.displayName,
    currentFirm: response.currentFirm ?? null,
    career: response.career ?? [],
    teams: compactRows(response.teams ?? response.currentTeams),
    disclosures: compactRows(response.disclosures),
    articles: articleLinks(response.articles),
    resource: resourceUri("advisor", advisor?.id),
    url: webUrl("advisor", advisor),
  };
}

/**
 * Returns a curated firm profile.
 * @param args - Firm tool arguments.
 * @returns Compact firm payload.
 */
async function getFirmProfile(args) {
  const response = await new FirmProfile().get(requiredIdTarget(args));
  if (response.error) return response;
  const firm = response.firm;
  return {
    firm,
    currentAdvisorCount: response.currentAdvisorCount,
    pastAdvisorCount: response.pastAdvisorCount,
    currentTeams: compactRows(response.currentTeams),
    transitionsIn: compactRows(response.transitionsIn),
    transitionsOut: compactRows(response.transitionsOut),
    articles: articleLinks(response.articles),
    brokerCheckSnapshot: response.brokerCheckSnapshot ?? null,
    resource: resourceUri("firm", firm?.id),
    url: webUrl("firm", firm),
  };
}

/**
 * Returns a curated team profile.
 * @param args - Team tool arguments.
 * @returns Compact team payload.
 */
async function getTeamProfile(args) {
  const response = await new TeamProfile().get(requiredIdTarget(args));
  if (response.error) return response;
  const team = response.team;
  return {
    team,
    currentMembers: compactRows(response.currentMembers),
    pastMembers: compactRows(response.pastMembers),
    metrics: response.metrics ?? response.latestSnapshot ?? null,
    transitions: compactRows(response.transitions),
    articles: articleLinks(response.articles),
    resource: resourceUri("team", team?.id),
    url: webUrl("team", team),
  };
}

/**
 * Returns public article details.
 * @param args - Article tool arguments.
 * @returns Compact article payload.
 */
async function getArticle(args) {
  const response = await new ArticleView().get(requiredIdTarget(args));
  if (response.error) return response;
  const article = response.article;
  return {
    article,
    body: response.body ?? null,
    provenance: compactRows(response.provenance),
    eventCards: compactRows(response.eventCards),
    advisors: compactRows(response.advisors),
    firms: compactRows(response.firms),
    teams: compactRows(response.teams),
    resource: resourceUri("article", article?.id),
    url: webUrl("article", article),
  };
}

// @ts-nocheck
import { routeTarget } from "./resource-mcp-format.js";
import {
  AdvisorProfile,
  ArticleView,
  Feed,
  FirmProfile,
  TeamProfile,
} from "./resource-profile-endpoints.js";

const MIME_JSON = "application/json";

export const MCP_RESOURCE_CAPABILITIES = {
  resources: { subscribe: false, listChanged: false },
};

export const MCP_RESOURCE_TEMPLATES = [
  {
    uriTemplate: "advisorbook://feed",
    name: "feed",
    title: "AdvisorBook feed",
    description: "Recent public AdvisorBook article feed.",
    mimeType: MIME_JSON,
  },
  {
    uriTemplate: "advisorbook://advisor/{id}",
    name: "advisor",
    title: "Advisor profile",
    description: "Public AdvisorBook advisor profile by id or slug.",
    mimeType: MIME_JSON,
  },
  {
    uriTemplate: "advisorbook://firm/{id}",
    name: "firm",
    title: "Firm profile",
    description: "Public AdvisorBook firm profile by id, slug, or alias.",
    mimeType: MIME_JSON,
  },
  {
    uriTemplate: "advisorbook://team/{id}",
    name: "team",
    title: "Team profile",
    description: "Public AdvisorBook team profile by id or slug.",
    mimeType: MIME_JSON,
  },
  {
    uriTemplate: "advisorbook://article/{id}",
    name: "article",
    title: "Article",
    description: "Public AdvisorBook article detail by id or slug.",
    mimeType: MIME_JSON,
  },
];

/**
 * Reads one AdvisorBook MCP resource URI.
 * @param uri - AdvisorBook resource URI.
 * @returns MCP resources/read result.
 */
export async function readMcpResource(uri) {
  const payload = await publicResourcePayload(parseAdvisorBookUri(uri));
  return {
    contents: [
      {
        uri,
        mimeType: MIME_JSON,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

/**
 * Dispatches one parsed AdvisorBook resource URI.
 * @param parsed - Parsed resource URI.
 * @returns Public resource payload.
 */
async function publicResourcePayload(parsed) {
  switch (parsed.kind) {
    case "feed":
      return new Feed().get();
    case "advisor":
      return new AdvisorProfile().get(routeTarget(parsed.id));
    case "firm":
      return new FirmProfile().get(routeTarget(parsed.id));
    case "team":
      return new TeamProfile().get(routeTarget(parsed.id));
    case "article":
      return new ArticleView().get(routeTarget(parsed.id));
    default:
      throw new Error(`Unsupported AdvisorBook resource: ${parsed.kind}`);
  }
}

/**
 * Parses and validates an AdvisorBook MCP resource URI.
 * @param uri - Candidate resource URI.
 * @returns Parsed kind and optional id.
 */
function parseAdvisorBookUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith("advisorbook://"))
    throw new Error("Invalid AdvisorBook resource URI");
  const path = uri.slice("advisorbook://".length);
  if (path === "feed") return { kind: "feed", id: null };
  const [kind, encodedId, ...extra] = path.split("/");
  if (extra.length > 0 || !kind || !encodedId)
    throw new Error("Invalid AdvisorBook resource URI");
  const id = decodeURIComponent(encodedId);
  if (!["advisor", "firm", "team", "article"].includes(kind))
    throw new Error(`Unsupported AdvisorBook resource: ${kind}`);
  return { kind, id };
}

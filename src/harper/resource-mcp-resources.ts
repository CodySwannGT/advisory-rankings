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

/** Parsed feed URI form. */
interface ParsedFeedUri {
  readonly kind: "feed";
  readonly id: null;
}

/** Parsed entity URI form covering advisor, firm, team, article. */
interface ParsedEntityUri {
  readonly kind: "advisor" | "firm" | "team" | "article";
  readonly id: string;
}

/** Discriminated union of all parsed AdvisorBook resource URIs. */
type ParsedAdvisorBookUri = ParsedFeedUri | ParsedEntityUri;

/** One MCP resources/read content entry. */
interface McpResourceContent {
  readonly uri: string;
  readonly mimeType: string;
  readonly text: string;
}

/** MCP resources/read response shape returned to callers. */
interface McpResourceReadResult {
  readonly contents: readonly McpResourceContent[];
  readonly structuredContent: unknown;
}

/** Minimal endpoint shape consumed by the dispatcher. */
interface ResourceEndpoint {
  readonly get: (target?: unknown) => Promise<unknown> | unknown;
}

/** Constructor for a ResourceEndpoint. */
type ResourceEndpointCtor = new () => ResourceEndpoint;

/**
 * Single documented typed adapter for `@ts-nocheck`'d endpoint classes in
 * resource-profile-endpoints.ts. The producers are not yet typed, so their
 * imported class values arrive as `unknown` at the call site; this adapter
 * narrows them to the minimal `ResourceEndpointCtor` shape this module needs.
 * @param ctor - Endpoint class imported from a `@ts-nocheck`'d producer.
 * @returns The same value typed as a ResourceEndpointCtor.
 */
function asEndpointCtor(ctor: unknown): ResourceEndpointCtor {
  return ctor as ResourceEndpointCtor;
}

/**
 * Reads one AdvisorBook MCP resource URI.
 * @param uri - AdvisorBook resource URI.
 * @returns MCP resources/read result.
 */
export async function readMcpResource(
  uri: string
): Promise<McpResourceReadResult> {
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
async function publicResourcePayload(
  parsed: ParsedAdvisorBookUri
): Promise<unknown> {
  switch (parsed.kind) {
    case "feed":
      return new (asEndpointCtor(Feed))().get();
    case "advisor":
      return new (asEndpointCtor(AdvisorProfile))().get(routeTarget(parsed.id));
    case "firm":
      return new (asEndpointCtor(FirmProfile))().get(routeTarget(parsed.id));
    case "team":
      return new (asEndpointCtor(TeamProfile))().get(routeTarget(parsed.id));
    case "article":
      return new (asEndpointCtor(ArticleView))().get(routeTarget(parsed.id));
  }
}

const ENTITY_KINDS = ["advisor", "firm", "team", "article"] as const;

/** Allowed entity URI kinds. */
type EntityKind = (typeof ENTITY_KINDS)[number];

/**
 * Typed predicate for the entity-kind portion of an AdvisorBook URI.
 * @param value - Candidate kind string.
 * @returns True when value is a known entity kind.
 */
function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

/**
 * Parses and validates an AdvisorBook MCP resource URI.
 * @param uri - Candidate resource URI.
 * @returns Parsed kind and optional id.
 */
function parseAdvisorBookUri(uri: string): ParsedAdvisorBookUri {
  if (typeof uri !== "string" || !uri.startsWith("advisorbook://"))
    throw new Error("Invalid AdvisorBook resource URI");
  const path = uri.slice("advisorbook://".length);
  if (path === "feed") return { kind: "feed", id: null };
  const [kind, encodedId, ...extra] = path.split("/");
  if (extra.length > 0 || !kind || !encodedId)
    throw new Error("Invalid AdvisorBook resource URI");
  const id = decodeURIComponent(encodedId);
  if (!isEntityKind(kind))
    throw new Error(`Unsupported AdvisorBook resource: ${kind}`);
  return { kind, id };
}

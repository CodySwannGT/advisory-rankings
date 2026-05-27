import type {
  RouteTarget,
  RouteTargetObject,
} from "../types/harper-resource.js";

const PUBLIC_BASE_URL =
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const TOOL_LIMIT_DEFAULT = 10;
const TOOL_LIMIT_MAX = 20;

/** Tool argument bag handed to MCP tool dispatchers. */
export type ToolArgs = Readonly<Record<string, unknown>> | null | undefined;

/** JSON Schema property entry used by tool input schemas. */
export type JsonSchemaProperty = Readonly<Record<string, unknown>>;

/** JSON Schema object used as an MCP tool input schema. */
export interface ToolInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/** JSON Schema for the optional limit input. */
export interface LimitInputSchema {
  readonly type: "integer";
  readonly minimum: number;
  readonly maximum: number;
  readonly description: string;
}

/** One search result row produced by the Search resource. */
export interface SearchResultInput {
  readonly kind: "firm" | "advisor" | "team";
  readonly id: string;
  readonly name: string;
  readonly sub?: string | null;
  readonly score: number;
}

/** Curated MCP search result row. */
export interface McpSearchResult {
  readonly kind: SearchResultInput["kind"];
  readonly id: string;
  readonly name: string;
  readonly subtitle: string | null;
  readonly score: number;
  readonly resource: string | null;
  readonly url: string | null;
}

/** Minimal entity shape used to derive a public web URL. */
export interface UrlEntity {
  readonly id?: string | null;
  readonly headline?: string | null;
  readonly name?: string | null;
  readonly displayName?: string | null;
  readonly legalName?: string | null;
  readonly short?: string | null;
}

/** Article stub used by `articleLinks()` and `feedResult()`. */
export interface ArticleLinkInput extends UrlEntity {
  readonly id: string;
}

/** Curated linked article row returned to MCP clients. */
export interface ArticleLinkRow extends ArticleLinkInput {
  readonly resource: string | null;
  readonly url: string | null;
}

/** Public entity kinds the MCP wrapper supports. */
export type McpEntityKind = "firm" | "advisor" | "team" | "article";

/** Feed item input consumed by `feedResult()`. */
export interface FeedResultInput {
  readonly article?: ArticleLinkInput | null;
  readonly advisors?: readonly unknown[];
  readonly firms?: readonly unknown[];
  readonly teams?: readonly unknown[];
  readonly eventCards?: readonly unknown[];
}

/** Curated MCP feed row. */
export interface McpFeedRow {
  readonly article: ArticleLinkInput | null | undefined;
  readonly advisors: readonly unknown[];
  readonly firms: readonly unknown[];
  readonly teams: readonly unknown[];
  readonly eventCards: readonly unknown[];
  readonly resource: string | null;
  readonly url: string | null;
}

/**
 * Builds the optional limit input schema.
 * @returns Limit JSON schema.
 */
export function limitSchema(): LimitInputSchema {
  return {
    type: "integer",
    minimum: 1,
    maximum: TOOL_LIMIT_MAX,
    description: `Maximum rows to return. Defaults to ${TOOL_LIMIT_DEFAULT}.`,
  };
}

/**
 * Builds the common id-only tool input schema.
 * @param description - Field description.
 * @returns MCP id input schema.
 */
export function idSchema(description: string): ToolInputSchema {
  return objectSchema({ id: { type: "string", description } }, ["id"]);
}

/**
 * Builds a simple object JSON schema.
 * @param properties - JSON schema property map.
 * @param required - Required property names.
 * @returns MCP input schema.
 */
export function objectSchema(
  properties: Readonly<Record<string, JsonSchemaProperty>>,
  required: readonly string[] = []
): ToolInputSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Builds a route target from a required id argument.
 * @param args - Tool arguments.
 * @returns Harper route target shim.
 */
export function requiredIdTarget(args: ToolArgs): RouteTarget {
  return routeTarget(requiredString(args, "id"));
}

/**
 * Reads a required string argument.
 * @param args - Tool arguments.
 * @param key - Required argument key.
 * @returns Trimmed string value.
 */
export function requiredString(args: ToolArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Missing required argument: ${key}`);
  return value.trim();
}

/**
 * Normalizes optional tool limits.
 * @param args - Tool arguments.
 * @returns Bounded row limit.
 */
export function limitArg(args: ToolArgs): number {
  const raw = Number(args?.limit ?? TOOL_LIMIT_DEFAULT);
  if (!Number.isFinite(raw)) return TOOL_LIMIT_DEFAULT;
  return Math.max(1, Math.min(TOOL_LIMIT_MAX, Math.trunc(raw)));
}

/**
 * Creates the tiny target shape public resources already accept in tests.
 * @param id - Route id segment.
 * @param params - Query parameters.
 * @returns Harper-like target object.
 */
export function routeTarget(
  id: string,
  params: Readonly<Record<string, unknown>> = {}
): RouteTargetObject {
  return {
    id,
    get: (name: string) => params[name] ?? null,
    toString: () => id,
  };
}

/**
 * Adds URLs and resource links to search results.
 * @param item - Public Search result.
 * @returns MCP search result row.
 */
export function searchResult(item: SearchResultInput): McpSearchResult {
  const entity: UrlEntity = { id: item.id, name: item.name };
  return {
    kind: item.kind,
    id: item.id,
    name: item.name,
    subtitle: item.sub ?? null,
    score: item.score,
    resource: resourceUri(item.kind, item.id),
    url: webUrl(item.kind, entity),
  };
}

/**
 * Shapes one feed item for MCP clients.
 * @param item - Public Feed item.
 * @returns MCP feed row.
 */
export function feedResult(item: FeedResultInput): McpFeedRow {
  const article = item.article;
  return {
    article,
    advisors: compactRows(item.advisors),
    firms: compactRows(item.firms),
    teams: compactRows(item.teams),
    eventCards: compactRows(item.eventCards),
    resource: resourceUri("article", article?.id),
    url: webUrl("article", article ?? undefined),
  };
}

/**
 * Maps article stubs to linked rows.
 * @param articles - Article rows.
 * @returns Linked article rows.
 */
export function articleLinks(
  articles: readonly ArticleLinkInput[] = []
): readonly ArticleLinkRow[] {
  return compactRows(articles).map(article => ({
    ...article,
    resource: resourceUri("article", article.id),
    url: webUrl("article", article),
  }));
}

/**
 * Keeps repeated profile collections compact for model calls.
 * @param rows - Possibly large collection.
 * @returns Bounded collection.
 */
export function compactRows<T>(
  rows: readonly T[] | null | undefined = []
): readonly T[] {
  return Array.isArray(rows) ? rows.slice(0, TOOL_LIMIT_MAX) : [];
}

/**
 * Builds an AdvisorBook resource URI.
 * @param kind - Public entity kind.
 * @param id - Public entity id.
 * @returns advisorbook URI.
 */
export function resourceUri(
  kind: McpEntityKind,
  id: string | null | undefined
): string | null {
  return id ? `advisorbook://${kind}/${encodeURIComponent(id)}` : null;
}

/**
 * Builds a public web URL for an AdvisorBook entity.
 * @param kind - Public entity kind.
 * @param entity - Entity row.
 * @returns Public HTTPS URL.
 */
export function webUrl(
  kind: McpEntityKind,
  entity: UrlEntity | null | undefined
): string | null {
  if (!entity?.id) return null;
  const routeKind = kind === "article" ? "articles" : `${kind}s`;
  const label =
    entity.headline ||
    entity.name ||
    entity.displayName ||
    entity.legalName ||
    entity.short ||
    entity.id;
  return `${PUBLIC_BASE_URL}/${routeKind}/${slugifyText(label)}-${encodeURIComponent(entity.id)}`;
}

/**
 * Converts display text into the web route slug format.
 * @param text - Display text.
 * @returns Lowercase ASCII slug.
 */
function slugifyText(text: string | null | undefined): string {
  const slug = String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
  return slug || "profile";
}

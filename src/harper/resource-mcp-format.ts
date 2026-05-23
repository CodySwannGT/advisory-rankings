// @ts-nocheck
const PUBLIC_BASE_URL =
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const TOOL_LIMIT_DEFAULT = 10;
const TOOL_LIMIT_MAX = 20;

/**
 * Builds the optional limit input schema.
 * @returns Limit JSON schema.
 */
export function limitSchema() {
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
export function idSchema(description) {
  return objectSchema({ id: { type: "string", description } }, ["id"]);
}

/**
 * Builds a simple object JSON schema.
 * @param properties - JSON schema property map.
 * @param required - Required property names.
 * @returns MCP input schema.
 */
export function objectSchema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Builds a route target from a required id argument.
 * @param args - Tool arguments.
 * @returns Harper route target shim.
 */
export function requiredIdTarget(args) {
  return routeTarget(requiredString(args, "id"));
}

/**
 * Reads a required string argument.
 * @param args - Tool arguments.
 * @param key - Required argument key.
 * @returns Trimmed string value.
 */
export function requiredString(args, key) {
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
export function limitArg(args) {
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
export function routeTarget(id, params = {}) {
  return {
    id,
    get: name => params[name] ?? null,
    toString: () => id,
  };
}

/**
 * Adds URLs and resource links to search results.
 * @param item - Public Search result.
 * @returns MCP search result row.
 */
export function searchResult(item) {
  const entity = { id: item.id, name: item.name };
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
export function feedResult(item) {
  const article = item.article;
  return {
    article,
    advisors: compactRows(item.advisors),
    firms: compactRows(item.firms),
    teams: compactRows(item.teams),
    eventCards: compactRows(item.eventCards),
    resource: resourceUri("article", article?.id),
    url: webUrl("article", article),
  };
}

/**
 * Maps article stubs to linked rows.
 * @param articles - Article rows.
 * @returns Linked article rows.
 */
export function articleLinks(articles = []) {
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
export function compactRows(rows = []) {
  return Array.isArray(rows) ? rows.slice(0, TOOL_LIMIT_MAX) : [];
}

/**
 * Builds an AdvisorBook resource URI.
 * @param kind - Public entity kind.
 * @param id - Public entity id.
 * @returns advisorbook URI.
 */
export function resourceUri(kind, id) {
  return id ? `advisorbook://${kind}/${encodeURIComponent(id)}` : null;
}

/**
 * Builds a public web URL for an AdvisorBook entity.
 * @param kind - Public entity kind.
 * @param entity - Entity row.
 * @returns Public HTTPS URL.
 */
export function webUrl(kind, entity) {
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
function slugifyText(text) {
  const slug = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
  return slug || "profile";
}

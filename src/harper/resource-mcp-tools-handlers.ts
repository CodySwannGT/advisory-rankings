import { Search } from "./resource-directory-endpoints.js";
import {
  articleLinks,
  compactRows,
  feedResult,
  limitArg,
  requiredIdTarget,
  requiredString,
  resourceUri,
  routeTarget,
  searchResult,
  webUrl,
} from "./resource-mcp-format.js";
import type {
  ArticleLinkInput,
  FeedResultInput,
  SearchResultInput,
  ToolArgs,
  UrlEntity,
} from "./resource-mcp-format.js";
import {
  AdvisorProfile,
  ArticleView,
  Feed,
  FirmProfile,
  TeamProfile,
} from "./resource-profile-endpoints.js";
import type { RouteTarget } from "../types/harper-resource.js";

/** Entity row from a public profile producer with an optional id field. */
interface EntityWithId extends UrlEntity {
  readonly id?: string | null;
}

/** Public search response shape consumed from the `Search` resource. */
interface SearchResponseLike {
  readonly q: string;
  readonly counts: unknown;
  readonly items: readonly SearchResultInput[];
}

/** Public feed response shape consumed from the `Feed` resource. */
interface FeedResponseLike {
  readonly generatedAt: string;
  readonly count: number;
  readonly items: readonly FeedResultInput[];
}

/** Public advisor profile response shape consumed from `AdvisorProfile`. */
interface AdvisorProfileResponseLike {
  readonly advisor?: EntityWithId;
  readonly displayName?: unknown;
  readonly currentFirm?: unknown;
  readonly career?: readonly unknown[];
  readonly teams?: readonly unknown[];
  readonly currentTeams?: readonly unknown[];
  readonly disclosures?: readonly unknown[];
  readonly evidenceFreshness?: unknown;
  readonly confidenceSummary?: unknown;
  readonly articles?: readonly ArticleLinkInput[];
}

/** Public firm profile response shape consumed from `FirmProfile`. */
interface FirmProfileResponseLike {
  readonly firm?: EntityWithId;
  readonly currentAdvisorCount?: unknown;
  readonly pastAdvisorCount?: unknown;
  readonly currentTeams?: readonly unknown[];
  readonly transitionsIn?: readonly unknown[];
  readonly transitionsOut?: readonly unknown[];
  readonly articles?: readonly ArticleLinkInput[];
  readonly brokerCheckSnapshot?: unknown;
}

/** Public team profile response shape consumed from `TeamProfile`. */
interface TeamProfileResponseLike {
  readonly team?: EntityWithId;
  readonly currentMembers?: readonly unknown[];
  readonly pastMembers?: readonly unknown[];
  readonly metrics?: unknown;
  readonly latestSnapshot?: unknown;
  readonly transitions?: readonly unknown[];
  readonly articles?: readonly ArticleLinkInput[];
}

/** Public article detail response shape consumed from `ArticleView`. */
interface ArticleResponseLike {
  readonly article?: EntityWithId;
  readonly body?: unknown;
  readonly provenance?: readonly unknown[];
  readonly eventCards?: readonly unknown[];
  readonly advisors?: readonly unknown[];
  readonly firms?: readonly unknown[];
  readonly teams?: readonly unknown[];
}

/**
 * Harper resource constructor shape: at runtime the public endpoint classes
 * are constructible with no arguments (Harper dispatches them itself) and
 * expose an `async get(target?)` method whose payload we narrow per tool.
 */
interface NoArgResourceClass<TPayload> {
  new (): { get(target?: RouteTarget): Promise<TPayload> };
}

/**
 * Typed adapter for invoking Harper resource endpoints from MCP tools.
 *
 * Harper's `Resource` base class declares a 2-argument constructor that the
 * runtime tolerates being called with zero arguments — every endpoint in
 * `resource-profile-endpoints.ts` and `resource-directory-endpoints.ts` is
 * instantiated this way by Harper's own dispatcher. The single `as` cast
 * below is the one documented adapter that translates that runtime
 * convention into a typed callable surface; all downstream consumers see
 * fully typed payload interfaces.
 *
 * @template TPayload - Expected response shape for the tool.
 * @param ResourceClass - Harper resource subclass to instantiate.
 * @param target - Optional route target.
 * @returns Awaited resource payload narrowed to `TPayload`.
 */
async function invokeGet<TPayload>(
  ResourceClass: abstract new (...args: readonly never[]) => unknown,
  target?: RouteTarget
): Promise<TPayload> {
  const Ctor = ResourceClass as unknown as NoArgResourceClass<TPayload>;
  return new Ctor().get(target);
}

/** Public-resource response that signals a routing failure. */
interface ResourceErrorPayload {
  readonly error: string;
  readonly id?: string;
}

/**
 * Type predicate for the `{ error: string }` shape returned by public
 * resources when an id is missing or unresolvable.
 * @param value - Awaited resource payload.
 * @returns True when the payload represents a routing error.
 */
function isResourceError(value: unknown): value is ResourceErrorPayload {
  if (typeof value !== "object" || value === null) return false;
  if (!("error" in value)) return false;
  return typeof value.error === "string";
}

/**
 * Coerces an unknown id-bearing field to the `string | null` shape
 * `resourceUri` and `webUrl` expect.
 * @param id - Possibly-defined id value from a producer payload.
 * @returns Id string or null.
 */
function asIdString(id: unknown): string | null {
  return typeof id === "string" ? id : null;
}

/**
 * Narrows an unknown collection to a typed readonly array, defaulting to
 * empty when the value is not an array.
 * @param value - Possibly-array value from a producer payload.
 * @returns Typed readonly array.
 */
function asReadonlyArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [];
}

/**
 * Searches public AdvisorBook entities.
 * @param args - Search tool arguments.
 * @returns Compact ranked matches.
 */
export async function searchAdvisorBook(args: ToolArgs): Promise<unknown> {
  const query = requiredString(args, "query");
  const response = await invokeGet<SearchResponseLike>(
    Search,
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
export async function getFeed(args: ToolArgs): Promise<unknown> {
  const response = await invokeGet<FeedResponseLike>(Feed);
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
export async function getAdvisorProfile(args: ToolArgs): Promise<unknown> {
  const response = await invokeGet<
    AdvisorProfileResponseLike | ResourceErrorPayload
  >(AdvisorProfile, requiredIdTarget(args));
  if (isResourceError(response)) return response;
  const advisor = response.advisor;
  return {
    advisor,
    displayName: response.displayName,
    currentFirm: response.currentFirm ?? null,
    career: response.career ?? [],
    teams: compactRows(
      asReadonlyArray(response.teams ?? response.currentTeams)
    ),
    disclosures: compactRows(asReadonlyArray(response.disclosures)),
    evidenceFreshness: response.evidenceFreshness ?? null,
    confidenceSummary: response.confidenceSummary ?? null,
    articles: articleLinks(response.articles),
    resource: resourceUri("advisor", asIdString(advisor?.id)),
    url: webUrl("advisor", advisor ?? null),
  };
}

/**
 * Returns a curated firm profile.
 * @param args - Firm tool arguments.
 * @returns Compact firm payload.
 */
export async function getFirmProfile(args: ToolArgs): Promise<unknown> {
  const response = await invokeGet<
    FirmProfileResponseLike | ResourceErrorPayload
  >(FirmProfile, requiredIdTarget(args));
  if (isResourceError(response)) return response;
  const firm = response.firm;
  return {
    firm,
    currentAdvisorCount: response.currentAdvisorCount,
    pastAdvisorCount: response.pastAdvisorCount,
    currentTeams: compactRows(asReadonlyArray(response.currentTeams)),
    transitionsIn: compactRows(asReadonlyArray(response.transitionsIn)),
    transitionsOut: compactRows(asReadonlyArray(response.transitionsOut)),
    articles: articleLinks(response.articles),
    brokerCheckSnapshot: response.brokerCheckSnapshot ?? null,
    resource: resourceUri("firm", asIdString(firm?.id)),
    url: webUrl("firm", firm ?? null),
  };
}

/**
 * Returns a curated team profile.
 * @param args - Team tool arguments.
 * @returns Compact team payload.
 */
export async function getTeamProfile(args: ToolArgs): Promise<unknown> {
  const response = await invokeGet<
    TeamProfileResponseLike | ResourceErrorPayload
  >(TeamProfile, requiredIdTarget(args));
  if (isResourceError(response)) return response;
  const team = response.team;
  return {
    team,
    currentMembers: compactRows(asReadonlyArray(response.currentMembers)),
    pastMembers: compactRows(asReadonlyArray(response.pastMembers)),
    metrics: response.metrics ?? response.latestSnapshot ?? null,
    transitions: compactRows(asReadonlyArray(response.transitions)),
    articles: articleLinks(response.articles),
    resource: resourceUri("team", asIdString(team?.id)),
    url: webUrl("team", team ?? null),
  };
}

/**
 * Returns public article details.
 * @param args - Article tool arguments.
 * @returns Compact article payload.
 */
export async function getArticle(args: ToolArgs): Promise<unknown> {
  const response = await invokeGet<ArticleResponseLike | ResourceErrorPayload>(
    ArticleView,
    requiredIdTarget(args)
  );
  if (isResourceError(response)) return response;
  const article = response.article;
  return {
    article,
    body: response.body ?? null,
    provenance: compactRows(asReadonlyArray(response.provenance)),
    eventCards: compactRows(asReadonlyArray(response.eventCards)),
    advisors: compactRows(asReadonlyArray(response.advisors)),
    firms: compactRows(asReadonlyArray(response.firms)),
    teams: compactRows(asReadonlyArray(response.teams)),
    resource: resourceUri("article", asIdString(article?.id)),
    url: webUrl("article", article ?? null),
  };
}

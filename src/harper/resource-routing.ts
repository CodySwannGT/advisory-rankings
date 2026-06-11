import type {
  AdvisorRow,
  ArticleRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";
import { normalizeRouteTarget } from "./resource-routing-normalization.js";

// Robust date comparator. Harper returns dates as Date instances when
// queried via `tables.X.search({})` (production path), but as ISO-8601
// strings when read through the operations-API SQL endpoint (the path
// scripts/dev_server uses locally). The first cluster deploy fell over
// because Date.localeCompare doesn't exist; coerce to ms-since-epoch
// instead so sort handles both shapes.
// `target` for /FirmProfile/<id> arrives differently per transport:
//   - Local dev_server passes the raw id (string).
//   - Production Harper passes a RequestTarget whose toString() yields
//     the matched path slice — sometimes "<id>", sometimes "/<id>".
// Strip a single leading slash so both shapes resolve.

/** Optional lookup fields synthesized by canonicalization or legacy callers. */
interface ArticleResolverFields {
  readonly slug?: string;
  readonly title?: string;
}

/**
 * Resolvable article: schema row augmented with optional lookup fields
 * synthesized by canonicalization (slug) and legacy callers (title).
 */
export type ResolvableArticle = ArticleRow & ArticleResolverFields;

/** Optional lookup fields synthesized by canonicalization or chip rendering. */
interface FirmResolverFields {
  readonly slug?: string;
  readonly short?: string;
}

/**
 * Resolvable firm: schema row augmented with optional lookup fields
 * synthesized by canonicalization (slug) and chip rendering (short).
 */
export type ResolvableFirm = FirmRow & FirmResolverFields;

/** Optional lookup fields synthesized by canonicalization or display formatters. */
interface AdvisorResolverFields {
  readonly slug?: string;
  readonly displayName?: string;
}

/**
 * Resolvable advisor: schema row augmented with optional lookup fields
 * synthesized by canonicalization (slug) and display formatters (displayName).
 */
export type ResolvableAdvisor = AdvisorRow & AdvisorResolverFields;

/** Optional lookup fields synthesized by canonicalization. */
interface TeamResolverFields {
  readonly slug?: string;
}

/**
 * Resolvable team: schema row augmented with the canonicalized slug.
 */
export type ResolvableTeam = TeamRow & TeamResolverFields;

/** Minimal shape any row needs to participate in slug-based resolution. */
interface SlugBearing {
  readonly slug?: string;
}

/**
 * Internal duck type for the proxy-like object Harper hands resource
 * methods. Used by `normalizeId` to read `.id` without forcing callers
 * to import `RequestTarget` from harperdb.
 */
/**
 * Minimal slice of the resource-index `db` consumed by the routing
 * resolvers. Mirrors the shape produced by `buildDb` in
 * `src/harper/resource-data.ts`. Kept here so this file does not depend
 * on the still-untyped `resource-data` module.
 */
export interface ResourceIndex {
  readonly articles: readonly ResolvableArticle[];
  readonly firms: readonly ResolvableFirm[];
  readonly advisors: readonly ResolvableAdvisor[];
  readonly teams: readonly ResolvableTeam[];
  readonly byArticle: ReadonlyMap<string, ResolvableArticle>;
  readonly byFirm: ReadonlyMap<string, ResolvableFirm>;
  readonly byAdvisor: ReadonlyMap<string, ResolvableAdvisor>;
  readonly byTeam: ReadonlyMap<string, ResolvableTeam>;
  readonly firmAliasByNormalized?: ReadonlyMap<string, FirmAliasRow>;
}

/**
 * Normalizes id for consistent comparisons.
 * @param target - Route target or request target to normalize.
 * @returns The normalized value.
 */
export function normalizeId(target: RouteTarget | null | undefined): string {
  return normalizeRouteTarget(target);
}

/**
 * Converts public names and slugs into comparable route keys.
 * @param text - Source text to parse.
 * @returns Normalized lookup value.
 */
export function slugifyText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
}

/**
 * Resolves by slug from ids, slugs, or aliases.
 * @param rows - Rows to transform or search.
 * @param identifier - Route id, slug, or lookup key.
 * @param namesForRow - Callback that returns names belonging to a row.
 * @returns Normalized lookup value.
 */
function resolveBySlug<TRow extends SlugBearing>(
  rows: readonly TRow[],
  identifier: string | null | undefined,
  namesForRow: (row: TRow) => ReadonlyArray<string | undefined>
): TRow | null {
  if (!identifier) return null;
  const slug = slugifyText(identifier);
  if (!slug) return null;
  return (
    rows.find(row => {
      if (row.slug && slugifyText(row.slug) === slug) return true;
      return namesForRow(row).some(name => slugifyText(name) === slug);
    }) || null
  );
}

/**
 * Resolves article from ids, slugs, or aliases.
 * @param db - Loaded resource index bundle.
 * @param identifier - Route id, slug, or lookup key.
 * @returns Normalized lookup value.
 */
export function resolveArticle(
  db: ResourceIndex,
  identifier: string
): ResolvableArticle | null {
  return (
    db.byArticle.get(identifier) ||
    resolveBySlug(db.articles, identifier, article => [
      article.slug,
      article.headline,
      article.title,
    ])
  );
}

/**
 * Resolves firm from ids, slugs, or aliases.
 * @param db - Loaded resource index bundle.
 * @param identifier - Route id, slug, or lookup key.
 * @returns Normalized lookup value.
 */
export function resolveFirm(
  db: ResourceIndex,
  identifier: string
): ResolvableFirm | null {
  const alias = db.firmAliasByNormalized?.get(normalizeFirmAlias(identifier));
  return (
    db.byFirm.get(identifier) ||
    (alias && db.byFirm.get(alias.firmId)) ||
    resolveBySlug(db.firms, identifier, firm => [
      firm.slug,
      firm.name,
      firm.short,
    ])
  );
}

/**
 * Normalizes firm alias for consistent comparisons.
 * @param value - Raw value to normalize or parse.
 * @returns The normalized value.
 */
export function normalizeFirmAlias(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[.,]/g, " ")
    .replace(/\b(l\.?\s*l\.?\s*c|llc|inc|corp|corporation|l\.?\s*p|lp)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves advisor from ids, slugs, or aliases.
 * @param db - Loaded resource index bundle.
 * @param identifier - Route id, slug, or lookup key.
 * @returns Normalized lookup value.
 */
export function resolveAdvisor(
  db: ResourceIndex,
  identifier: string
): ResolvableAdvisor | null {
  return (
    db.byAdvisor.get(identifier) ||
    resolveBySlug(db.advisors, identifier, advisor => [
      advisor.slug,
      advisorDisplayName(advisor),
      [advisor.firstName, advisor.lastName].filter(Boolean).join(" "),
      advisor.legalName,
      advisor.preferredName,
    ])
  );
}

/**
 * Resolves team from ids, slugs, or aliases.
 * @param db - Loaded resource index bundle.
 * @param identifier - Route id, slug, or lookup key.
 * @returns Normalized lookup value.
 */
export function resolveTeam(
  db: ResourceIndex,
  identifier: string
): ResolvableTeam | null {
  return (
    db.byTeam.get(identifier) ||
    resolveBySlug(db.teams, identifier, team => [team.slug, team.name])
  );
}

/**
 * Formats the advisor name fields into the display name used by public resources.
 * @param advisor - Advisor row or missing lookup result.
 * @returns Preferred display name with sensible legal-name fallbacks.
 */
export function advisorDisplayName(
  advisor: ResolvableAdvisor | null | undefined
): string {
  if (!advisor) return "";
  return (
    advisor.displayName ||
    advisor.preferredName ||
    [advisor.firstName, advisor.lastName].filter(Boolean).join(" ") ||
    advisor.legalName ||
    advisor.id
  );
}

/**
 * Shortens common firm suffixes for compact chips and transition arrows.
 * @param name - Canonical firm name.
 * @returns Compact firm label.
 */
export function firmShort(name: unknown): string {
  return String(name ?? "")
    .replace(/\bWealth Management\b/gi, "WM")
    .replace(/\bFinancial Advisors?\b/gi, "FA")
    .replace(/\bInvestment Management\b/gi, "IM")
    .trim();
}

// Pull cursor + limit off a Harper RequestTarget (or the dev_server's
// URLSearchParams-compatible shim). Returns concrete defaults so call
// sites don't need to repeat them.
//

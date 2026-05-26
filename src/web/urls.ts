/**
 * URL helpers for public AdvisorBook routes.
 *
 * Kept outside `app.ts` so design-system components can build entity links
 * without importing the broader network/auth/browser module.
 */

/** Public entity kinds the AdvisorBook URL space exposes. */
type EntityKind = "firm" | "advisor" | "team";

const ENTITY_PATHS: Readonly<Record<EntityKind, string>> = {
  firm: "firms",
  advisor: "advisors",
  team: "teams",
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Minimal shape an entity needs to expose for the URL helpers. */
export interface EntityLike {
  readonly id?: string;
  readonly name?: string;
  readonly displayName?: string;
  readonly legalName?: string;
  readonly short?: string;
}

/** Minimal shape an article needs to expose for the URL helpers. */
export interface ArticleLike {
  readonly id?: string;
  readonly headline?: string;
  readonly title?: string;
  readonly slug?: string;
}

/** Browser `Location`-like shape that supports the lookup helpers. */
export interface LocationLike {
  readonly search: string;
  readonly pathname: string;
}

/**
 * Convert display names into stable path segments without storing slug state.
 * @param text - Display name or fallback id.
 * @returns Lowercase ASCII path segment.
 */
export function slugifyText(text: string | null | undefined): string {
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

/**
 * Build the canonical public URL for an entity profile.
 * @param kind - Entity kind.
 * @param entity - Entity with an id and display-ish name.
 * @returns Absolute browser path for the entity profile.
 */
export function entityPath(
  kind: EntityKind,
  entity: EntityLike | null | undefined
): string {
  const base = ENTITY_PATHS[kind];
  if (!base || !entity?.id) return "#";
  const name =
    entity.name ||
    entity.displayName ||
    entity.legalName ||
    entity.short ||
    entity.id;
  return `/${base}/${slugifyText(name)}-${encodeURIComponent(entity.id)}`;
}

/**
 * Build the canonical public URL for an article detail page.
 * @param article - Article with an id and headline-ish text.
 * @returns Absolute browser path for the article detail.
 */
export function articlePath(article: ArticleLike | null | undefined): string {
  if (!article?.id) return "#";
  const title = article.headline || article.title || article.slug || article.id;
  return `/articles/${slugifyText(title)}-${encodeURIComponent(article.id)}`;
}

/**
 * Read an id from a legacy query string or from a slug ending in a UUID.
 * @param locationLike - Browser location-like object.
 * @returns Record id, or null when none is present.
 */
function idFromLocation(locationLike: LocationLike = location): string | null {
  const queryId = new URLSearchParams(locationLike.search).get("id");
  if (queryId) return queryId;
  const last = locationLike.pathname.split("/").filter(Boolean).pop() || "";
  const match = UUID_RE.exec(decodeURIComponent(last));
  return match ? match[0] : decodeURIComponent(last) || null;
}

/**
 * Read an entity id from the current clean URL or legacy query string.
 * @param locationLike - Browser location-like object.
 * @returns Entity id, or null when none is present.
 */
export function entityIdFromLocation(
  locationLike: LocationLike = location
): string | null {
  return idFromLocation(locationLike);
}

/**
 * Read an article id from the current clean URL or legacy query string.
 * @param locationLike - Browser location-like object.
 * @returns Article id, or null when none is present.
 */
export function articleIdFromLocation(
  locationLike: LocationLike = location
): string | null {
  return idFromLocation(locationLike);
}

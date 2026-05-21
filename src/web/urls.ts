// @ts-nocheck
// URL helpers for public AdvisorBook routes.
//
// Kept outside app.js so design-system components can build entity
// links without importing the broader network/auth/browser module.

const ENTITY_PATHS = {
  firm: "firms",
  advisor: "advisors",
  team: "teams",
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Convert display names into stable path segments without storing slug state.
 *
 * @param text Display name or fallback id.
 * @returns Lowercase ASCII path segment.
 */
export function slugifyText(text) {
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

/**
 * Build the canonical public URL for an entity profile.
 *
 * @param kind Entity kind.
 * @param entity Entity with an id and display-ish name.
 * @returns Absolute browser path for the entity profile.
 */
export function entityPath(kind, entity) {
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
 * Read an entity id from a legacy query string or from a slug ending in a UUID.
 *
 * @param locationLike Browser location-like object.
 * @returns Entity id, or null when none is present.
 */
export function entityIdFromLocation(locationLike = location) {
  const queryId = new URLSearchParams(locationLike.search).get("id");
  if (queryId) return queryId;
  const last = locationLike.pathname.split("/").filter(Boolean).pop() || "";
  const match = UUID_RE.exec(decodeURIComponent(last));
  return match ? match[0] : null;
}

// @ts-nocheck
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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
/**
 * Normalizes id for consistent comparisons.
 * @param target - Route target or request target to normalize.
 * @returns The normalized value.
 */
export function normalizeId(target) {
  if (target == null) return "";
  // Harper's RequestTarget extends URLSearchParams and exposes the
  // pre-parsed path id at `target.id`. Prefer that when present, fall
  // back to toString() for the dev_server bridge and any older callers.
  if (typeof target === "object" && target.id != null)
    return normalizeSluggedId(String(target.id));
  const s = typeof target === "string" ? target : (target.toString?.() ?? "");
  return normalizeSluggedId(s.startsWith("/") ? s.slice(1) : s);
}

/**
 * Normalizes slugged id for consistent comparisons.
 * @param value - Raw value to normalize or parse.
 * @returns The normalized value.
 */
function normalizeSluggedId(value) {
  const match = UUID_RE.exec(decodeURIComponent(value || ""));
  return match ? match[0] : value;
}

/**
 * Converts public names and slugs into comparable route keys.
 * @param text - Source text to parse.
 * @returns Normalized lookup value.
 */
export function slugifyText(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
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
function resolveBySlug(rows, identifier, namesForRow) {
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
export function resolveArticle(db, identifier) {
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
export function resolveFirm(db, identifier) {
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
export function normalizeFirmAlias(value) {
  return String(value || "")
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
export function resolveAdvisor(db, identifier) {
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
export function resolveTeam(db, identifier) {
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
export function advisorDisplayName(advisor) {
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
export function firmShort(name) {
  return String(name || "")
    .replace(/\bWealth Management\b/gi, "WM")
    .replace(/\bFinancial Advisors?\b/gi, "FA")
    .replace(/\bInvestment Management\b/gi, "IM")
    .trim();
}

// Pull cursor + limit off a Harper RequestTarget (or the dev_server's
// URLSearchParams-compatible shim). Returns concrete defaults so call
// sites don't need to repeat them.
//

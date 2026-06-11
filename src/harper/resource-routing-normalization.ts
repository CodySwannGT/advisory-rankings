import type { RouteTarget } from "../types/harper-resource.js";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Route target fields supplied by Harper's production request object.
 */
interface IdBearingTarget {
  readonly id?: unknown;
  readonly toString?: () => string;
}

/**
 * Normalizes route targets for consistent comparisons.
 * @param target - Route target or request target to normalize.
 * @returns The normalized route id.
 */
export function normalizeRouteTarget(
  target: RouteTarget | null | undefined
): string {
  if (target == null) return "";
  const value =
    typeof target === "object"
      ? targetRouteValue(target as IdBearingTarget)
      : String(target);
  return normalizeSluggedId(stripLeadingSlash(value));
}

/**
 * Reads the raw route id from a Harper request target.
 * @param target - Object target from the request router.
 * @returns Raw route value before slash and UUID normalization.
 */
function targetRouteValue(target: IdBearingTarget): string {
  if (target.id != null) return String(target.id);
  return target.toString?.() ?? "";
}

/**
 * Removes the leading slash emitted by some router transports.
 * @param value - Raw route value.
 * @returns Route value without a leading slash.
 */
function stripLeadingSlash(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

/**
 * Extracts a UUID from slugged public routes when present.
 * @param value - Route value after slash normalization.
 * @returns UUID match or the original route value.
 */
function normalizeSluggedId(value: string): string {
  const match = UUID_RE.exec(decodeURIComponent(value || ""));
  return match ? match[0] : value;
}

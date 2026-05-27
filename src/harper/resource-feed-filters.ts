import type { RouteTarget } from "../types/harper-resource.js";

const EVENT_BACKED_MODE = "event-backed";
const RECRUITING_MOVES_MODE = "recruiting-moves";
const COMPLIANCE_DISCLOSURES_MODE = "compliance-disclosures";

const FEED_MODE_ALIASES = new Map<string, string>([
  ["event", EVENT_BACKED_MODE],
  ["moves", RECRUITING_MOVES_MODE],
  ["compliance", COMPLIANCE_DISCLOSURES_MODE],
]);

const FEED_MODES = new Set<string>([
  "all",
  EVENT_BACKED_MODE,
  RECRUITING_MOVES_MODE,
  COMPLIANCE_DISCLOSURES_MODE,
]);

/**
 * Subset of route-target shape this module inspects for `mode` and
 * `category`. Mirrors the pattern used by `PaginationTargetShape` in
 * `resource-pagination.ts` — we only need `.get(name)`.
 */
interface FeedFilterTargetShape {
  readonly get?: (name: string) => unknown;
}

/** Normalized feed filter selection produced by `parseFeedFilters()`. */
export interface FeedFilters {
  readonly mode: string;
  readonly category: string;
}

/**
 * Minimal event-card shape `matchesFeedMode()` reads through. The full
 * card carries additional summary fields (see `resource-feed.ts`); only
 * the discriminator is needed here.
 */
interface FeedEventCard {
  readonly kind: string;
}

/** Minimal article shape `matchesFeedCategory()` reads through. */
interface FeedItemArticle {
  readonly category?: string;
}

/**
 * Minimal feed-item shape this module's predicates depend on. The full
 * item produced by `feedItem()` in `resource-feed.ts` carries more
 * fields; this module only consumes the article category and the
 * `eventCards` discriminators.
 */
export interface FeedFilterableItem {
  readonly eventCards?: readonly FeedEventCard[];
  readonly article?: FeedItemArticle;
}

/** Summary counts returned alongside a filtered feed response. */
export interface FeedSummary {
  readonly returned: number;
  readonly total: number;
  readonly modeTotal: number;
  readonly categoryTotal: number;
}

/** Empty-state metadata returned when active filters remove every row. */
export interface FeedEmptyState {
  readonly reason: "no-filtered-feed-results" | "no-feed-results";
  readonly message: string;
}

/**
 * Parses public feed query params into bounded, stable filter values.
 * @param target - Request target carrying optional feed filter params.
 * @returns Normalized feed mode and category.
 */
export function parseFeedFilters(
  target: RouteTarget | null | undefined
): FeedFilters {
  const t = target as FeedFilterTargetShape | null | undefined;
  return {
    mode: parseFeedMode(t),
    category: normalizeFeedCategory(
      t && typeof t.get === "function" ? t.get("category") : null
    ),
  };
}

/**
 * Checks whether a feed item belongs to a signal mode.
 * @param item - Hydrated feed item.
 * @param mode - Normalized feed mode.
 * @returns True when the item should remain in the mode-filtered set.
 */
export function matchesFeedMode(
  item: FeedFilterableItem,
  mode: string
): boolean {
  switch (mode) {
    case EVENT_BACKED_MODE:
      return (item.eventCards ?? []).length > 0;
    case RECRUITING_MOVES_MODE:
      return (item.eventCards ?? []).some(card => card.kind === "transition");
    case COMPLIANCE_DISCLOSURES_MODE:
      return (item.eventCards ?? []).some(card => card.kind === "disclosure");
    default:
      return true;
  }
}

/**
 * Checks whether a feed item matches the selected source/article category.
 * @param item - Hydrated feed item.
 * @param category - Normalized category filter.
 * @returns True when the item should remain in the category-filtered set.
 */
export function matchesFeedCategory(
  item: FeedFilterableItem,
  category: string
): boolean {
  return (
    category === "all" ||
    normalizeFeedCategory(item.article?.category) === category
  );
}

/**
 * Builds deterministic feed summary counts for filtered responses.
 * @param items - Complete feed items before filters.
 * @param modeItems - Items after signal-mode filtering.
 * @param filteredItems - Items after all filters.
 * @param filters - Normalized active filters.
 * @returns Summary counts consumed by clients and evidence capture.
 */
export function feedSummary(
  items: readonly FeedFilterableItem[],
  modeItems: readonly FeedFilterableItem[],
  filteredItems: readonly FeedFilterableItem[],
  filters: FeedFilters
): FeedSummary {
  return {
    returned: filteredItems.length,
    total: items.length,
    modeTotal: modeItems.length,
    categoryTotal:
      filters.category === "all"
        ? items.length
        : items.filter(item => matchesFeedCategory(item, filters.category))
            .length,
  };
}

/**
 * Returns stable empty-state metadata when active filters remove every row.
 * @param filteredItems - Items after all filters.
 * @param filters - Normalized active filters.
 * @returns Empty-state metadata or null when results exist.
 */
export function feedEmptyState(
  filteredItems: readonly FeedFilterableItem[],
  filters: FeedFilters
): FeedEmptyState | null {
  if (filteredItems.length > 0) return null;
  const filtered = filters.mode !== "all" || filters.category !== "all";
  return {
    reason: filtered ? "no-filtered-feed-results" : "no-feed-results",
    message: filtered
      ? "No feed items match the selected filters."
      : "No public feed items are loaded.",
  };
}

/**
 * Parses the feed signal mode.
 * @param target - Request target carrying an optional `mode` query param.
 * @returns A supported feed mode, defaulting to `all`.
 */
function parseFeedMode(
  target: FeedFilterTargetShape | null | undefined
): string {
  const raw =
    target && typeof target.get === "function" ? target.get("mode") : null;
  const mode = String(raw ?? "all")
    .trim()
    .toLowerCase();
  const canonicalMode = FEED_MODE_ALIASES.get(mode) ?? mode;
  return FEED_MODES.has(canonicalMode) ? canonicalMode : "all";
}

/**
 * Normalizes feed category names while leaving future categories filterable.
 * @param category - Raw category query value.
 * @returns Normalized category value, or `all`.
 */
function normalizeFeedCategory(category: unknown): string {
  const normalized = String(category ?? "all")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  return normalized || "all";
}

// Feed filter state and controls for the public home feed.

import type { FeedItem } from "../harper/resource-feed-types.js";
import type { DomAttrs } from "./design-system/dom.js";
import { Button, SectionCard, el } from "./design-system/index.js";
import {
  DEFAULT_FEED_MODE,
  FEED_CATEGORY_PARAM,
  FEED_MODE_PARAM,
  FEED_MODES,
  categoryLabel,
  getQueryParamFn,
  modeLabelFor,
  normalizeFeedFilters,
  toFormString,
} from "./feed-filters-types.js";
import type {
  FeedFilterCardState,
  FeedFilterOption,
  FeedFilterState,
  FeedFilters,
  FeedMode,
  FilterEmptyState,
} from "./feed-filters-types.js";

export type {
  FeedFilterCardState,
  FeedFilterState,
  FeedFilters,
  FeedMode,
  FilterEmptyState,
} from "./feed-filters-types.js";
export {
  DEFAULT_FEED_MODE,
  FEED_MODE_PARAM,
  normalizeFeedFilters,
} from "./feed-filters-types.js";

/**
 * Builds the GET-style feed filter controls.
 * @param state - Filter state, category facets, and change callback.
 * @returns Filter card.
 */
export function feedFilterCard(state: FeedFilterCardState): HTMLElement {
  const form = el(
    "form",
    {
      class: "feed-filters",
      method: "get",
      action: "/",
      onSubmit: (event: Event) => {
        event.preventDefault();
        state.onChange(readFormFilters(form));
      },
    } satisfies DomAttrs,
    selectField("Mode", FEED_MODE_PARAM, state.filters.mode, [...FEED_MODES]),
    selectField("Category", FEED_CATEGORY_PARAM, state.filters.category, [
      ["", "All categories"],
      ...state.categories.map(
        (value): FeedFilterOption => [value, categoryLabel(value)]
      ),
    ]),
    Button({
      variant: "neutral",
      onClick: () => state.onChange({ mode: DEFAULT_FEED_MODE, category: "" }),
      children: "Clear",
      attrs: {
        class: "feed-filter-clear",
        disabled: state.filters.active ? undefined : true,
      },
    })
  );
  form.addEventListener("change", () => state.onChange(readFormFilters(form)));

  return SectionCard({
    title: "Feed filters",
    attrs: { class: "feed-filter-card" },
    body: [
      form,
      el(
        "div",
        { class: "feed-filter-summary", "aria-live": "polite" },
        feedSummaryText(state)
      ),
    ],
  });
}

/**
 * Reads and validates feed filters from the current URL.
 * @param categories - Available feed categories.
 * @returns Current filter state.
 */
export function readFeedFilters(
  categories: readonly string[]
): FeedFilterState {
  const filters = normalizeFeedFilters({
    mode: getQueryParamFn(FEED_MODE_PARAM),
    category: getQueryParamFn(FEED_CATEGORY_PARAM),
  });
  const category =
    filters.category && categories.includes(filters.category)
      ? filters.category
      : "";
  syncFeedFilterUrl({ ...filters, category });
  return {
    ...filters,
    category,
    active: filters.mode !== DEFAULT_FEED_MODE || Boolean(category),
  };
}

/**
 * Writes feed filters into the browser URL without reloading the page.
 * @param filters - Next feed filter state.
 */
export function writeFeedFilters(filters: FeedFilters): void {
  const nextFilters = normalizeFeedFilters(filters);
  const params = applyFilterParams(
    new URLSearchParams(location.search),
    nextFilters
  );
  const query = params.size ? `?${params.toString()}` : "";
  const nextUrl = `${location.pathname}${query}${location.hash}`;
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  if (nextUrl === currentUrl) return;
  history.pushState(null, "", nextUrl);
}

/**
 * Applies signal and category filters to feed items.
 * @param items - Full feed payload.
 * @param filters - Active filter state.
 * @returns Filtered feed payload.
 */
export function filterFeedItems(
  items: readonly FeedItem[],
  filters: FeedFilters
): readonly FeedItem[] {
  return items.filter(
    item => modeMatches(item, filters.mode) && categoryMatches(item, filters)
  );
}

/**
 * Extracts sorted article categories for the filter select.
 * @param items - Full feed payload.
 * @returns Unique category values.
 */
export function feedCategories(items: readonly FeedItem[]): readonly string[] {
  const categories = items
    .map(item => item.article?.category)
    .filter(
      (category): category is string =>
        typeof category === "string" && category.length > 0
    );
  return [...new Set(categories)].sort((a, b) =>
    categoryLabel(a).localeCompare(categoryLabel(b))
  );
}

/**
 * Builds empty-state copy for a zero-result filter combination.
 * @param filters - Active filter state.
 * @returns Empty-state title and body.
 */
export function filterEmptyState(filters: FeedFilters): FilterEmptyState {
  const parts = [
    modeLabelFor(filters.mode).toLowerCase(),
    filters.category ? categoryLabel(filters.category) : "",
  ].filter(Boolean);
  const description = parts.length ? parts.join(" / ") : "these filters";
  return {
    title: "No feed posts match these filters",
    body: `No ${description} posts are available in the current feed. Try another mode or category.`,
  };
}

/**
 * Mirrors the canonical filter state into a URL search-param bag.
 * @param params - Source params (mutated in place; returned for chaining).
 * @param filters - Normalized filter state.
 * @returns The (mutated) `params` bag for fluent use.
 */
function applyFilterParams(
  params: URLSearchParams,
  filters: FeedFilters
): URLSearchParams {
  if (filters.mode === DEFAULT_FEED_MODE) {
    params.delete(FEED_MODE_PARAM);
  } else {
    params.set(FEED_MODE_PARAM, filters.mode);
  }
  if (filters.category) {
    params.set(FEED_CATEGORY_PARAM, filters.category);
  } else {
    params.delete(FEED_CATEGORY_PARAM);
  }
  return params;
}

/**
 * Creates a compact label + select control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param current - Current selected value.
 * @param options - Value/label option pairs.
 * @returns Field wrapper.
 */
function selectField(
  label: string,
  name: string,
  current: string,
  options: readonly FeedFilterOption[]
): HTMLElement {
  return el(
    "label",
    { class: "filter-field" },
    el("span", {}, label),
    el(
      "select",
      { name },
      ...options.map(([value, optionLabel]) =>
        el(
          "option",
          { value, selected: String(value) === String(current || "") },
          optionLabel
        )
      )
    )
  );
}

/**
 * Reads filter values from the filter form.
 * @param form - Feed filter form.
 * @returns Normalized feed filter state.
 */
function readFormFilters(form: HTMLElement): FeedFilters {
  if (!(form instanceof HTMLFormElement)) {
    return normalizeFeedFilters({});
  }
  const data = new FormData(form);
  return normalizeFeedFilters({
    mode: toFormString(data.get(FEED_MODE_PARAM)),
    category: toFormString(data.get(FEED_CATEGORY_PARAM)),
  });
}

/**
 * Replaces deprecated or unsupported filter params with canonical URL state.
 * @param filters - Current normalized filters.
 */
function syncFeedFilterUrl(filters: FeedFilters): void {
  const params = applyFilterParams(
    new URLSearchParams(location.search),
    filters
  );
  const query = params.size ? `?${params.toString()}` : "";
  const nextUrl = `${location.pathname}${query}${location.hash}`;
  if (nextUrl !== `${location.pathname}${location.search}${location.hash}`) {
    history.replaceState(null, "", nextUrl);
  }
}

/**
 * Checks whether an item matches the active feed signal mode.
 * @param item - Feed item.
 * @param mode - Active signal mode.
 * @returns Whether the item should be shown.
 */
function modeMatches(item: FeedItem, mode: FeedMode): boolean {
  const events = item.eventCards ?? [];
  if (mode === "event") return events.length > 0;
  if (mode === "moves")
    return events.some(event => event.kind === "transition");
  if (mode === "compliance")
    return events.some(event => event.kind === "disclosure");
  return true;
}

/**
 * Checks whether an item matches the active article category.
 * @param item - Feed item.
 * @param filters - Active filter state.
 * @returns Whether the item should be shown.
 */
function categoryMatches(item: FeedItem, filters: FeedFilters): boolean {
  return (
    !filters.category ||
    String(item.article?.category ?? "") === filters.category
  );
}

/**
 * Builds the result-count copy for the current filters.
 * @param state - Current filter state.
 * @returns Human-readable result summary.
 */
function feedSummaryText(state: FeedFilterCardState): string {
  const modeLabel = modeLabelFor(state.filters.mode).toLowerCase();
  const scope = state.filters.category
    ? `${modeLabel} in ${categoryLabel(state.filters.category)}`
    : modeLabel;
  return `Showing ${state.count ?? "filtered"} of ${state.total} ${scope}.`;
}

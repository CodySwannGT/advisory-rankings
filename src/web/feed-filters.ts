// @ts-nocheck
// Feed filter state and controls for the public home feed.

import { getQueryParam, humanize } from "./app.js";
import { Button, SectionCard, el } from "./design-system/index.js";

const FEED_MODE_PARAM = "mode";
const FEED_CATEGORY_PARAM = "category";
const DEFAULT_FEED_MODE = "all";
const FEED_MODE_ALIASES = new Map([["event-backed", "event"]]);
const FEED_MODES = [
  ["all", "All posts"],
  ["event", "Event-backed"],
  ["moves", "Recruiting moves"],
  ["compliance", "Compliance disclosures"],
];

/**
 * Builds the GET-style feed filter controls.
 * @param state - Filter state, category facets, and change callback.
 * @returns Filter card.
 */
export function feedFilterCard(state) {
  const form = el(
    "form",
    {
      class: "feed-filters",
      method: "get",
      action: "/",
      onSubmit: event => {
        event.preventDefault();
        state.onChange(readFormFilters(form));
      },
    },
    selectField("Mode", FEED_MODE_PARAM, state.filters.mode, [...FEED_MODES]),
    selectField("Category", FEED_CATEGORY_PARAM, state.filters.category, [
      ["", "All categories"],
      ...state.categories.map(value => [value, categoryLabel(value)]),
    ]),
    el("button", { class: "filter-button", type: "submit" }, "Apply"),
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
export function readFeedFilters(categories) {
  const filters = normalizeFeedFilters({
    mode: getQueryParam(FEED_MODE_PARAM),
    category: getQueryParam(FEED_CATEGORY_PARAM),
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
export function writeFeedFilters(filters) {
  const nextFilters = normalizeFeedFilters(filters);
  const params = new URLSearchParams(location.search);
  if (nextFilters.mode === DEFAULT_FEED_MODE) {
    params.delete(FEED_MODE_PARAM);
  } else {
    params.set(FEED_MODE_PARAM, nextFilters.mode);
  }
  if (nextFilters.category) {
    params.set(FEED_CATEGORY_PARAM, nextFilters.category);
  } else {
    params.delete(FEED_CATEGORY_PARAM);
  }
  const query = params.size ? `?${params}` : "";
  history.pushState(null, "", `${location.pathname}${query}${location.hash}`);
}

/**
 * Applies signal and category filters to feed items.
 * @param items - Full feed payload.
 * @param filters - Active filter state.
 * @returns Filtered feed payload.
 */
export function filterFeedItems(items, filters) {
  return items.filter(
    item => modeMatches(item, filters.mode) && categoryMatches(item, filters)
  );
}

/**
 * Extracts sorted article categories for the filter select.
 * @param items - Full feed payload.
 * @returns Unique category values.
 */
export function feedCategories(items) {
  return [...new Set(items.map(item => item.article?.category).filter(Boolean))]
    .map(String)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
}

/**
 * Builds empty-state copy for a zero-result filter combination.
 * @param filters - Active filter state.
 * @returns Empty-state title and body.
 */
export function filterEmptyState(filters) {
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
 * Creates a compact label + select control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param current - Current selected value.
 * @param options - Value/label option pairs.
 * @returns Field wrapper.
 */
function selectField(label, name, current, options) {
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
function readFormFilters(form) {
  const data = new FormData(form);
  return normalizeFeedFilters({
    mode: data.get(FEED_MODE_PARAM),
    category: data.get(FEED_CATEGORY_PARAM),
  });
}

/**
 * Normalizes arbitrary filter values into supported values.
 * @param filters - Raw URL or form filter values.
 * @returns Normalized filters.
 */
function normalizeFeedFilters(filters) {
  const rawMode = String(filters.mode || "").trim();
  const candidateMode = FEED_MODE_ALIASES.get(rawMode) || rawMode;
  const mode = FEED_MODES.some(([value]) => value === candidateMode)
    ? candidateMode
    : DEFAULT_FEED_MODE;
  return {
    mode,
    category: String(filters.category || "").trim(),
  };
}

/**
 * Replaces deprecated or unsupported filter params with canonical URL state.
 * @param filters - Current normalized filters.
 */
function syncFeedFilterUrl(filters) {
  const params = new URLSearchParams(location.search);
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
  const query = params.size ? `?${params}` : "";
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
function modeMatches(item, mode) {
  const events = item.eventCards || [];
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
function categoryMatches(item, filters) {
  return (
    !filters.category ||
    String(item.article?.category || "") === filters.category
  );
}

/**
 * Builds the result-count copy for the current filters.
 * @param state - Current filter state.
 * @returns Human-readable result summary.
 */
function feedSummaryText(state) {
  const modeLabel = modeLabelFor(state.filters.mode).toLowerCase();
  const scope = state.filters.category
    ? `${modeLabel} in ${categoryLabel(state.filters.category)}`
    : modeLabel;
  return `Showing ${state.count ?? "filtered"} of ${state.total} ${scope}.`;
}

/**
 * Returns a display label for the feed mode.
 * @param mode - Feed signal mode.
 * @returns Visible label.
 */
function modeLabelFor(mode) {
  return FEED_MODES.find(([value]) => value === mode)?.[1] || "All posts";
}

/**
 * Humanizes feed category values without hiding placeholder-like source values.
 * @param value - Raw article category.
 * @returns Visible category label.
 */
function categoryLabel(value) {
  return (
    humanize(value) ||
    String(value || "uncategorized")
      .replace(/_+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase())
  );
}

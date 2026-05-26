// @ts-nocheck
// Public Interactive Rankings Explorer page.

import { api, refreshMe, logout, search, getQueryParam } from "./app.js";
import {
  mountThreeColumnPage,
  clear,
  el,
  EmptyCard,
  SectionCard,
  SkeletonCard,
} from "./design-system/index.js";
import {
  fmtNumber,
  rankingsTableCard,
  sourceCard,
  summaryCard,
  topFirmsCard,
} from "./rankings-sections.js";

const FILTER_FIELDS = [
  "category",
  "year",
  "firm",
  "state",
  "city",
  "resolved",
  "sort",
];
const DEFAULT_LIMIT = 50;

mountThreeColumnPage({
  active: "rankings",
  refreshMe,
  logout,
  search,
  pageTitle: "Interactive Rankings Explorer",
  build({ center, right }) {
    center.append(SkeletonCard(), SkeletonCard());
    loadRankings(center, right);
  },
});

/**
 * Loads and renders the rankings explorer page for the current query string.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadRankings(center, right) {
  api(`/RankingsExplorer${resourceQuery()}`)
    .then(data => {
      clear(center);
      clear(right);
      renderRankings(data, center, right);
    })
    .catch(error => {
      clear(center);
      center.appendChild(
        EmptyCard({
          title: "Could not load rankings",
          body: String(error.message || error),
        })
      );
    });
}

/**
 * Builds a normalized resource query from supported URL filters.
 * @returns Query string for /RankingsExplorer.
 */
function resourceQuery() {
  const params = new URLSearchParams();
  for (const field of FILTER_FIELDS) {
    const value = getQueryParam(field);
    if (value) params.set(field, value);
  }
  params.set("limit", String(DEFAULT_LIMIT));
  return `?${params}`;
}

/**
 * Renders the full page from the resource payload.
 * @param data - RankingsExplorer response.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderRankings(data, center, right) {
  center.appendChild(headerCard(data));
  center.appendChild(filterCard(data));
  if (data.emptyState) {
    center.appendChild(
      EmptyCard({
        title: "No matching ranking rows",
        body: data.emptyState,
      })
    );
  } else {
    center.appendChild(rankingsTableCard(data.items));
  }
  right.appendChild(summaryCard(data));
  right.appendChild(topFirmsCard(data.topFirms));
  right.appendChild(sourceCard(data));
}

/**
 * Builds the page header and summary stats.
 * @param data - RankingsExplorer response.
 * @returns Header card.
 */
function headerCard(data) {
  return SectionCard({
    title: "Interactive Rankings Explorer",
    attrs: { class: "rankings-header" },
    body: [
      el(
        "p",
        { class: "rankings-lede" },
        "Source-backed AdvisorHub ranking rows with profile resolution, transparent missing fields, and filterable firm and market context."
      ),
      statGrid([
        ["Rows", fmtNumber(data.summary.totalEntries)],
        ["Resolved", fmtNumber(data.summary.resolvedEntries)],
        ["Unresolved", fmtNumber(data.summary.unresolvedEntries)],
        ["States", fmtNumber(data.summary.representedStates)],
      ]),
    ],
  });
}

/**
 * Renders the GET-driven filters.
 * @param data - RankingsExplorer response.
 * @returns Filter form card.
 */
function filterCard(data) {
  return SectionCard({
    title: "Filters",
    body: el(
      "form",
      { class: "rankings-filters", method: "get", action: "/rankings" },
      selectField("Category", "category", data.filters.category, [
        ["", "All categories"],
        ...data.facets.categories.map(value => [value, value]),
      ]),
      selectField("Year", "year", data.filters.year, [
        ["", "All years"],
        ...data.facets.years.map(value => [String(value), String(value)]),
      ]),
      labelInput("Firm", "firm", data.filters.firmQuery || ""),
      labelInput("State", "state", data.filters.state || "", {
        placeholder: "NY",
        maxlength: 2,
      }),
      labelInput("City", "city", data.filters.city || ""),
      selectField("Resolved", "resolved", data.filters.resolved, [
        ["", "All rows"],
        ["resolved", "Resolved"],
        ["unresolved", "Unresolved"],
      ]),
      selectField("Sort", "sort", data.filters.sort, [
        ["rank", "Rank"],
        ["-rank", "Rank descending"],
        ["-scale", "Scale high"],
        ["-growth", "Growth high"],
        ["firm", "Firm"],
        ["location", "City/state"],
        ["name", "Name"],
      ]),
      el("button", { class: "filter-button", type: "submit" }, "Apply")
    ),
  });
}

/**
 * Creates a compact label + input control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param value - Current query value.
 * @param attrs - Additional input attributes.
 * @returns Field wrapper.
 */
function labelInput(label, name, value, attrs = {}) {
  return el(
    "label",
    { class: "filter-field" },
    el("span", {}, label),
    el("input", { name, value, ...attrs })
  );
}

/**
 * Creates a compact label + select control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param current - Current selected value.
 * @param options - Value/label options.
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
 * Creates a stable summary stat grid.
 * @param pairs - Label/value pairs.
 * @returns Stat grid node.
 */
function statGrid(pairs) {
  return el(
    "div",
    { class: "rankings-stat-grid" },
    ...pairs.map(([label, value]) =>
      el(
        "div",
        { class: "rankings-stat" },
        el("span", { class: "rankings-stat-label" }, label),
        el("strong", {}, value)
      )
    )
  );
}

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
  rankingsDataStateCard,
  rankingsTableCard,
  sourceCard,
  summaryCard,
  topFirmsCard,
} from "./rankings-sections.js";
import { coverageWorkbenchCard } from "./rankings-coverage.js";
import { showDelayedRouteLoadingFeedback } from "./route-loading.js";
import type {
  RankingExplorerEntry,
  RankingExplorerFilters,
  RankingsCoverage,
  RankingsFacets,
  RankingsSummary,
  TopFirmRow,
} from "../harper/resource-rankings-explorer-types.js";

const FILTER_FIELDS: readonly string[] = [
  "category",
  "year",
  "firm",
  "state",
  "city",
  "resolved",
  "sort",
];
const DEFAULT_LIMIT = 50;

/** Public-facing filter shape exposed by the rankings-explorer route. */
interface PublicRankingFilters {
  readonly category: RankingExplorerFilters["category"];
  readonly year: RankingExplorerFilters["year"];
  readonly firmQuery: RankingExplorerFilters["firmQuery"];
  readonly state: RankingExplorerFilters["state"];
  readonly city: RankingExplorerFilters["city"];
  readonly resolved: RankingExplorerFilters["resolved"];
  readonly sort: RankingExplorerFilters["sort"];
}

/** Successful rankings-explorer payload shape rendered by this page. */
interface RankingsExplorerPayload {
  readonly generatedAt: string;
  readonly filters: PublicRankingFilters;
  readonly facets: RankingsFacets;
  readonly summary: RankingsSummary;
  readonly coverage: RankingsCoverage;
  readonly topFirms: readonly TopFirmRow[];
  readonly items: readonly RankingExplorerEntry[];
  readonly provenance: RankingsProvenance;
  readonly emptyState: string | null;
}

/** Provenance metadata bundled with the rankings-explorer payload. */
interface RankingsProvenance {
  readonly sourceTables: readonly string[];
  readonly sourceIds: readonly string[];
}

/** Tuple form used to seed a `<select>` option list. */
type SelectOption = readonly [value: string, label: string];

mountThreeColumnPage({
  active: "rankings",
  refreshMe,
  logout,
  search,
  pageTitle: "Advisor Rankings Browser",
  build({ center, layout, right }) {
    layout.classList.add("rankings-layout");
    center.append(SkeletonCard(), SkeletonCard());
    loadRankings(center, right);
  },
});

/**
 * Loads and renders the rankings explorer page for the current query string.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadRankings(center: HTMLElement, right: HTMLElement): void {
  const stopLoadingFeedback = showDelayedRouteLoadingFeedback({
    container: center,
    title: "Loading rankings",
    body: "Still fetching ranking coverage and ranked profiles. Retry if this takes longer than expected.",
    onRetry: () => loadRankings(center, right),
  });
  api<RankingsExplorerPayload>(`/RankingsExplorer${resourceQuery()}`)
    .then(data => {
      stopLoadingFeedback();
      clear(center);
      clear(right);
      renderRankings(data, center, right);
    })
    .catch((error: unknown) => {
      stopLoadingFeedback();
      clear(center);
      center.appendChild(
        EmptyCard({
          title: "Could not load rankings",
          body: errorMessage(error),
        })
      );
    });
}

/**
 * Extracts a human-readable message from an unknown error value.
 * @param error - Caught error value.
 * @returns Best-effort string representation.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Builds a normalized resource query from supported URL filters.
 * @returns Query string for /RankingsExplorer.
 */
function resourceQuery(): string {
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
function renderRankings(
  data: RankingsExplorerPayload,
  center: HTMLElement,
  right: HTMLElement
): void {
  center.appendChild(headerCard(data));
  center.appendChild(filterCard(data));
  center.appendChild(viewOptionsCard(data));
  center.appendChild(rankingsDataStateCard(data));
  center.appendChild(coverageWorkbenchCard(data.coverage));
  if (data.emptyState) {
    center.appendChild(
      EmptyCard({
        title: "No matching rankings",
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
function headerCard(data: RankingsExplorerPayload): HTMLElement {
  return SectionCard({
    title: "Advisor Rankings Browser",
    attrs: { class: "rankings-header" },
    body: [
      el(
        "p",
        { class: "rankings-lede" },
        "Browse public advisor and team ranking appearances, then filter by ranking list, year, firm, market, and AdvisorBook profile match."
      ),
      statGrid([
        ["Ranked profiles", fmtNumber(data.summary.totalEntries)],
        ["Matched profiles", fmtNumber(data.summary.resolvedEntries)],
        ["Needs match", fmtNumber(data.summary.unresolvedEntries)],
        ["Markets", fmtNumber(data.summary.representedStates)],
      ]),
    ],
  });
}

/**
 * Renders the GET-driven filters.
 * @param data - RankingsExplorer response.
 * @returns Filter form card.
 */
function filterCard(data: RankingsExplorerPayload): HTMLElement {
  return SectionCard({
    title: "Filters",
    body: el(
      "form",
      { class: "rankings-filters", method: "get", action: "/rankings" },
      selectField("Ranking list", "category", data.filters.category, [
        ["", "All ranking lists"],
        ...data.facets.categories.map((value): SelectOption => [value, value]),
      ]),
      selectField(
        "Year",
        "year",
        data.filters.year === null ? null : String(data.filters.year),
        [
          ["", "All years"],
          ...data.facets.years.map(
            (value): SelectOption => [String(value), String(value)]
          ),
        ]
      ),
      labelInput("Firm", "firm", data.filters.firmQuery || ""),
      labelInput("State", "state", data.filters.state || "", {
        placeholder: "NY",
        maxlength: 2,
      }),
      labelInput("City", "city", data.filters.city || ""),
      selectField("Profile match", "resolved", data.filters.resolved, [
        ["", "All profiles"],
        ["resolved", "Matched to AdvisorBook profile"],
        ["unresolved", "Needs AdvisorBook match"],
      ]),
      hiddenField("sort", data.filters.sort),
      el("button", { class: "filter-button", type: "submit" }, "Apply")
    ),
  });
}

/**
 * Renders presentation controls that do not narrow the rankings dataset.
 * @param data - RankingsExplorer response.
 * @returns View-options form card.
 */
function viewOptionsCard(data: RankingsExplorerPayload): HTMLElement {
  return SectionCard({
    title: "View options",
    attrs: { class: "rankings-view-options" },
    body: el(
      "form",
      {
        class: "rankings-view-options-form",
        method: "get",
        action: "/rankings",
      },
      ...filterStateFields(data.filters),
      selectField("Sort by", "sort", data.filters.sort, [
        ["rank", "Rank"],
        ["-rank", "Highest rank number"],
        ["-scale", "Largest practices"],
        ["-growth", "Fastest growing"],
        ["firm", "Firm"],
        ["location", "City/state"],
        ["name", "Name"],
      ]),
      el("button", { class: "filter-button", type: "submit" }, "Apply")
    ),
  });
}

/**
 * Preserves narrowing filters when applying presentation controls.
 * @param filters - Current public rankings filters.
 * @returns Hidden form fields for active filters.
 */
function filterStateFields(
  filters: PublicRankingFilters
): readonly HTMLElement[] {
  return [
    hiddenField("category", filters.category),
    hiddenField("year", filters.year === null ? "" : String(filters.year)),
    hiddenField("firm", filters.firmQuery),
    hiddenField("state", filters.state),
    hiddenField("city", filters.city),
    hiddenField("resolved", filters.resolved),
  ];
}

/**
 * Creates a hidden GET field when a query value should be preserved.
 * @param name - Query parameter name.
 * @param value - Query parameter value.
 * @returns Hidden input.
 */
function hiddenField(name: string, value: string | null): HTMLElement {
  return el("input", {
    type: "hidden",
    name,
    value: value || "",
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
function labelInput(
  label: string,
  name: string,
  value: string,
  attrs: Readonly<Record<string, string | number>> = {}
): HTMLElement {
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
function selectField(
  label: string,
  name: string,
  current: string | null,
  options: readonly SelectOption[]
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
 * Creates a stable summary stat grid.
 * @param pairs - Label/value pairs.
 * @returns Stat grid node.
 */
function statGrid(pairs: readonly (readonly [string, string])[]): HTMLElement {
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

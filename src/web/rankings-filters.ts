// GET-driven filter controls for the public rankings explorer.

import { el, SectionCard } from "./design-system/index.js";
import type {
  RankingExplorerFilters,
  RankingsFacets,
} from "../harper/resource-rankings-explorer-types.js";

const CITY_OPTIONS_LIST_ID = "rankings-city-options";
const FIRM_OPTIONS_LIST_ID = "rankings-firm-options";
const STATE_OPTIONS_LIST_ID = "rankings-state-options";
const FACET_LIST_IDS: Readonly<Record<"city" | "firm" | "state", string>> = {
  city: CITY_OPTIONS_LIST_ID,
  firm: FIRM_OPTIONS_LIST_ID,
  state: STATE_OPTIONS_LIST_ID,
};

/** Tuple form used to seed a `<select>` option list. */
type SelectOption = readonly [value: string, label: string];

/** Public-facing filter shape exposed by the rankings-explorer route. */
export interface PublicRankingFilters {
  readonly category: RankingExplorerFilters["category"];
  readonly year: RankingExplorerFilters["year"];
  readonly firmQuery: RankingExplorerFilters["firmQuery"];
  readonly state: RankingExplorerFilters["state"];
  readonly city: RankingExplorerFilters["city"];
  readonly resolved: RankingExplorerFilters["resolved"];
  readonly sort: RankingExplorerFilters["sort"];
}

/** Payload slice needed to render rankings filter controls. */
export interface RankingsFilterPayload {
  readonly facets: RankingsFacets;
  readonly filters: PublicRankingFilters;
}

/**
 * Renders the GET-driven filters.
 * @param data - RankingsExplorer response slice.
 * @returns Filter form card.
 */
export function filterCard(data: RankingsFilterPayload): HTMLElement {
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
      facetInput("Firm", "firm", data.filters.firmQuery || "", {
        name: "firm",
        options: data.facets.firms,
        placeholder: "Search known firms",
      }),
      facetInput("State", "state", data.filters.state || "", {
        name: "state",
        options: data.facets.states,
        placeholder: "Choose a state",
        maxlength: 2,
      }),
      facetInput("City", "city", data.filters.city || "", {
        name: "city",
        options: data.facets.cities,
        placeholder: "Choose a city",
      }),
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
 * @param data - RankingsExplorer response slice.
 * @returns View-options form card.
 */
export function viewOptionsCard(data: RankingsFilterPayload): HTMLElement {
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
 *
 */
interface FacetInputConfig {
  readonly maxlength?: number;
  readonly name: keyof typeof FACET_LIST_IDS;
  readonly options: readonly string[];
  readonly placeholder: string;
}

/**
 * Creates a compact text control with native suggestions from rankings facets.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param value - Current query value.
 * @param config - Suggestion values and input affordances.
 * @returns Field wrapper and datalist.
 */
function facetInput(
  label: string,
  name: string,
  value: string,
  config: FacetInputConfig
): HTMLElement {
  const listId = FACET_LIST_IDS[config.name];
  return el(
    "label",
    { class: "filter-field" },
    el("span", {}, label),
    el("input", {
      name,
      value,
      list: listId,
      placeholder: config.placeholder,
      ...(config.maxlength ? { maxlength: config.maxlength } : {}),
    }),
    el(
      "datalist",
      { id: listId },
      ...config.options.map(option => el("option", { value: option }))
    )
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

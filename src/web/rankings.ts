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
} from "./rankings-sections.js";
import { coverageWorkbenchCard } from "./rankings-coverage.js";
import {
  filterCard,
  viewOptionsCard,
  type PublicRankingFilters,
} from "./rankings-filters.js";
import { topFirmsCard } from "./rankings-top-firms.js";
import { showDelayedRouteLoadingFeedback } from "./route-loading.js";
import type {
  RankingExplorerEntry,
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

/** Runtime shape for older rankings facet payloads during rolling deploys. */
interface LegacyRankingsFacets {
  readonly cities?: unknown;
}

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
  center.appendChild(filterCard(filterPayload(data)));
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
 * Builds filter controls from current facets, tolerating older resource payloads
 * while the deploy catches up with newly added facet fields.
 * @param data - RankingsExplorer response.
 * @returns Filter payload with complete facet lists.
 */
function filterPayload(data: RankingsExplorerPayload): RankingsExplorerPayload {
  return {
    ...data,
    facets: {
      ...data.facets,
      cities: citiesFacet(data),
    },
  };
}

/**
 * Reads city facets from the resource or derives them from loaded rows.
 * @param data - RankingsExplorer response.
 * @returns Sorted city facet values.
 */
function citiesFacet(data: RankingsExplorerPayload): readonly string[] {
  return cityFacetValues(data.facets) ?? uniqueSortedCities(data.items);
}

/**
 * Reads the optional city facet from payloads that may predate the field.
 * @param facets - Rankings facet payload.
 * @returns City facet values when present.
 */
function cityFacetValues(facets: RankingsFacets): readonly string[] | null {
  const value = (facets as LegacyRankingsFacets).cities;
  if (!Array.isArray(value)) return null;
  return value.filter((city): city is string => typeof city === "string");
}

/**
 * Derives unique city suggestions from currently loaded ranking rows.
 * @param rows - Rendered rankings rows.
 * @returns Sorted city names.
 */
function uniqueSortedCities(
  rows: readonly RankingExplorerEntry[]
): readonly string[] {
  return [...new Set(rows.map(row => row.location?.city).filter(Boolean))]
    .filter((city): city is string => typeof city === "string")
    .sort((left, right) => left.localeCompare(right));
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

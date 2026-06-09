// Section renderers for the public Interactive Rankings Explorer.

import { fmtDate } from "./app.js";
import { humanize } from "./app-formatters.js";
import {
  el,
  EmptyCard,
  EmptyText,
  SectionCard,
  DetailsCard,
  ScrollableTable,
  Tag,
} from "./design-system/index.js";
import type { DomChild } from "./design-system/dom.js";
import type {
  PublicRankingEntry,
  RankingsSummary,
} from "../harper/resource-rankings-explorer-types.js";

const STACKED_CELL_CLASS = "stacked-cell";
const RANKED_PROFILES_LABEL = "Ranked profiles";
const SOURCE_TABLE_LABELS: Record<string, string> = {
  Ranking: "Ranking definitions",
  RankingEntry: "Imported rankings",
  RankingList: "Ranking list definitions",
  RankingSource: "Public ranking sources",
};
const STATUS_LABELS: Record<string, string> = {
  "missing-market": "Market not matched yet",
  "missing-scale": "Missing scale score",
  "missing-source": "Source unavailable",
  resolved: "Matched to AdvisorBook profile",
  "source-backed": "Verified source",
  unavailable: "Missing score",
  "unresolved-entity": "Advisor or team not matched yet",
  "unresolved-firm": "Firm not matched yet",
};

/**
 * Top-level fields of the `/RankingsExplorer` payload consumed by the
 * section renderers in this module. The rankings.ts page is still
 * `@ts-nocheck`'d, so callers pass `unknown` until that file is typed;
 * this interface restates the contract these functions actually depend on.
 */
export interface RankingsExplorerData {
  readonly generatedAt: string;
  readonly filters?: RankingsDataStateFilters;
  readonly summary: RankingsSummary;
  readonly provenance: RankingsProvenance;
}

/** Provenance block embedded in the rankings-explorer payload. */
export interface RankingsProvenance {
  readonly sourceTables: readonly string[];
}

/** Filter fields needed for data-volume explanations. */
interface RankingsDataStateFilters {
  readonly category: string | null;
  readonly year: number | null;
  readonly firmQuery: string | null;
  readonly state: string | null;
  readonly city: string | null;
  readonly resolved: "resolved" | "unresolved" | null;
}

/**
 * Builds the ranking rows table.
 * @param rows - Ranking explorer item rows.
 * @returns Ranking table card.
 */
export function rankingsTableCard(
  rows: readonly PublicRankingEntry[]
): HTMLElement {
  if (!rows.length) {
    return EmptyCard({
      title: RANKED_PROFILES_LABEL,
      body: "No rankings match the current filters.",
    });
  }
  return SectionCard({
    title: RANKED_PROFILES_LABEL,
    body: ScrollableTable(
      table(
        [
          "Rank",
          "Name",
          "Ranking",
          "Firm",
          "Market",
          "Scale",
          "Growth",
          "Source",
        ],
        rows.map(row => [
          numberCell(row.rank),
          subjectCell(row),
          rankingCell(row),
          firmCell(row),
          row.location?.label || statusTag("missing-market"),
          scoreCell(row.scores?.scale),
          scoreCell(row.scores?.growth),
          sourceCell(row),
        ])
      )
    ),
  });
}

/**
 * Builds an explicit explanation for sparse and filtered rankings states.
 * @param data - RankingsExplorer response.
 * @returns Data-state explanation card.
 */
export function rankingsDataStateCard(data: RankingsExplorerData): HTMLElement {
  const activeFilters = activeFilterLabels(data.filters);
  const isFiltered = activeFilters.length > 0;
  const count = data.summary.totalEntries;
  const title = isFiltered
    ? `${fmtNumber(count)} rankings match these filters`
    : `${fmtNumber(count)} rankings loaded`;
  const body = isFiltered
    ? `Filtered by ${activeFilters.join(", ")}. Broaden or reset the view to compare against the full loaded rankings dataset.`
    : "This dev dataset is intentionally small while rankings ingestion is being expanded. Source coverage and profile-match gaps below explain what is loaded and what still needs ingestion or matching.";

  return SectionCard({
    title: "Data volume",
    attrs: { class: "rankings-data-state" },
    body: [
      el("p", { class: "rankings-data-state-copy" }, body),
      el(
        "div",
        { class: "rankings-data-state-actions" },
        el("span", {}, title),
        resetLink(isFiltered)
      ),
    ],
  });
}

/**
 * Builds source transparency card.
 * @param data - RankingsExplorer response.
 * @returns Source card.
 */
export function sourceCard(data: RankingsExplorerData): HTMLElement {
  return SectionCard({
    title: "Source transparency",
    body: [
      EmptyText({
        children:
          "Imported rankings keep public source URLs, import dates, profile-match status, and missing score details visible.",
      }),
      el(
        "div",
        { class: "tag-list" },
        ...data.provenance.sourceTables.map(name =>
          Tag({ children: sourceTableLabel(name) })
        )
      ),
    ],
  });
}

/**
 * Builds the right-rail summary card.
 * @param data - RankingsExplorer response.
 * @returns Summary details card.
 */
export function summaryCard(data: RankingsExplorerData): HTMLElement {
  return DetailsCard({
    title: "Ranking summary",
    pairs: [
      ["Ranked profiles", fmtNumber(data.summary.totalEntries)],
      ["Matched profiles", fmtNumber(data.summary.resolvedEntries)],
      ["Needs match", fmtNumber(data.summary.unresolvedEntries)],
      ["Firms", fmtNumber(data.summary.representedFirms)],
      ["Markets", fmtNumber(data.summary.representedStates)],
      ["Generated", fmtDate(data.generatedAt, { mode: "rel" })],
    ],
  });
}

/**
 * Formats numbers with locale separators.
 * @param value - Numeric value.
 * @returns Formatted number.
 */
export function fmtNumber(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString();
}

/**
 * Lists active user-facing filters, excluding sort order.
 * @param filters - Current public rankings filters.
 * @returns Display labels for active filters.
 */
function activeFilterLabels(
  filters: RankingsDataStateFilters | undefined
): readonly string[] {
  if (!filters) return [];
  return [
    filters.category ? `ranking list ${filters.category}` : "",
    filters.year ? `year ${filters.year}` : "",
    filters.firmQuery ? `firm ${filters.firmQuery}` : "",
    filters.state ? `state ${filters.state}` : "",
    filters.city ? `city ${filters.city}` : "",
    filters.resolved ? profileMatchLabel(filters.resolved) : "",
  ].filter((label): label is string => Boolean(label));
}

/**
 * Converts profile-match filter values to reader-facing text.
 * @param value - Current resolved filter value.
 * @returns Human-readable filter label.
 */
function profileMatchLabel(
  value: RankingsDataStateFilters["resolved"]
): string {
  return value === "resolved"
    ? "matched profiles"
    : value === "unresolved"
      ? "profiles needing matches"
      : "";
}

/**
 * Builds a reset link when any narrowing filter is active.
 * @param isFiltered - Whether the current view has narrowing filters.
 * @returns Reset link or inert placeholder.
 */
function resetLink(isFiltered: boolean): HTMLElement {
  if (!isFiltered) {
    return el("span", { class: "rankings-reset-placeholder" }, "");
  }
  return el("a", { class: "rankings-reset-link", href: "/rankings" }, "Reset");
}

/**
 * Renders a table with normalized cell content.
 * @param headings - Header labels.
 * @param rows - Body rows.
 * @returns Table node.
 */
function table(
  headings: readonly string[],
  rows: readonly (readonly DomChild[])[]
): HTMLElement {
  return el(
    "table",
    { class: "snap-table rankings-table" },
    el("thead", {}, el("tr", {}, ...headings.map(h => el("th", {}, h)))),
    el(
      "tbody",
      {},
      ...rows.map(row =>
        el(
          "tr",
          {},
          ...row.map((cell, index) =>
            el("td", { "data-label": headings[index] }, cell)
          )
        )
      )
    )
  );
}

/**
 * Renders subject link, resolution, and source status tags.
 * @param row - Ranking row.
 * @returns Subject cell.
 */
function subjectCell(row: PublicRankingEntry): HTMLElement {
  const name = row.subject?.displayName || "Unmatched ranking profile";
  const label = row.subject?.url
    ? el("a", { href: row.subject.url }, name)
    : el("strong", {}, name);
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    label,
    el(
      "span",
      { class: "tag-list" },
      statusTag(row.resolutionStatus),
      ...row.sourceStatus.map(status => statusTag(status))
    )
  );
}

/**
 * Renders ranking category/year metadata.
 * @param row - Ranking row.
 * @returns Ranking cell.
 */
function rankingCell(row: PublicRankingEntry): HTMLElement {
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el("strong", {}, row.ranking?.name || "Unknown ranking"),
    el(
      "span",
      {},
      [row.ranking?.publisher, row.ranking?.year].filter(Boolean).join(" · ")
    )
  );
}

/**
 * Renders firm link or source text fallback.
 * @param row - Ranking row.
 * @returns Firm cell.
 */
function firmCell(row: PublicRankingEntry): DomChild {
  if (row.firm?.url) return el("a", { href: row.firm.url }, row.firm.name);
  return row.firmText || statusTag("unresolved-firm");
}

/**
 * Renders source URL and loaded date.
 * @param row - Ranking row.
 * @returns Source cell.
 */
function sourceCell(row: PublicRankingEntry): HTMLElement {
  const source = row.source?.url
    ? el(
        "a",
        { href: row.source.url, target: "_blank", rel: "noreferrer" },
        row.source.label || "Source"
      )
    : statusTag("missing-source");
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    source,
    el(
      "span",
      {},
      row.source?.loadedAt
        ? `Imported ${fmtDate(row.source.loadedAt)}`
        : "Import date unavailable"
    )
  );
}

/**
 * Renders score values with explicit unavailable state.
 * @param score - Score state payload.
 * @returns Score cell.
 */
function scoreCell(
  score: PublicRankingEntry["scores"][keyof PublicRankingEntry["scores"]]
): HTMLElement {
  if (!score || score.status !== "loaded") return statusTag("unavailable");
  return el("span", { class: "num" }, score.label);
}

/**
 * Renders a compact rank value.
 * @param value - Rank number.
 * @returns Rank text.
 */
function numberCell(value: number | null | undefined): DomChild {
  return value == null ? statusTag("unavailable") : String(value);
}

/**
 * Renders source and resolution status labels.
 * @param status - Source status string.
 * @returns Tag node.
 */
function statusTag(status: string | null | undefined): HTMLElement {
  const value = String(status || "unknown");
  const kind =
    status === "resolved" || status === "source-backed"
      ? "ok"
      : status === "unavailable" || status?.startsWith("missing")
        ? "warn"
        : "default";
  return Tag({
    kind,
    children: statusLabel(value),
  });
}

/**
 * Converts source table identifiers into reader-facing provenance labels.
 * @param name - Source table identifier.
 * @returns Display label.
 */
function sourceTableLabel(name: string): string {
  return SOURCE_TABLE_LABELS[name] || humanize(name) || "Ranking source";
}

/**
 * Converts status tokens into reader-facing labels.
 * @param status - Source or resolution status token.
 * @returns Display label.
 */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || "Needs review";
}

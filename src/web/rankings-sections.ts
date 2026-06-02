// Section renderers for the public Interactive Rankings Explorer.

import { fmtDate } from "./app.js";
import {
  el,
  EmptyCard,
  EmptyText,
  SectionCard,
  DetailsCard,
  RollupCard,
  ScrollableTable,
  Tag,
} from "./design-system/index.js";
import type { DomChild } from "./design-system/dom.js";
import type {
  PublicRankingEntry,
  RankingsSummary,
  TopFirmRow,
} from "../harper/resource-rankings-explorer-types.js";

const STACKED_CELL_CLASS = "stacked-cell";
const SOURCE_TABLE_LABELS: Record<string, string> = {
  RankingEntry: "Loaded rows",
  RankingList: "List definitions",
  RankingSource: "Public ranking sources",
};
const STATUS_LABELS: Record<string, string> = {
  "missing-market": "Market not matched yet",
  "missing-scale": "Ranking scale unavailable",
  "missing-source": "Source unavailable",
  resolved: "Matched profile",
  "source-backed": "Source confirmed",
  unavailable: "Unavailable",
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
  readonly summary: RankingsSummary;
  readonly provenance: RankingsProvenance;
}

/** Provenance block embedded in the rankings-explorer payload. */
export interface RankingsProvenance {
  readonly sourceTables: readonly string[];
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
      title: "Ranking rows",
      body: "No ranking rows match the current filters.",
    });
  }
  return SectionCard({
    title: "Ranking rows",
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
 * Builds the top firms rail card.
 * @param rows - Top firm aggregate rows.
 * @returns Rail rollup card.
 */
export function topFirmsCard(rows: readonly TopFirmRow[]): HTMLElement {
  return RollupCard<TopFirmRow>({
    title: "Top firms",
    rows: rows.slice(0, 6),
    renderRow: row => ({
      name: row.firm?.name || row.firmText,
      sub: row.firm?.id ? "Resolved firm" : "Source text",
      tail: String(row.count),
    }),
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
          "Rows preserve public source URLs, loaded dates, unresolved entities, and unavailable score states.",
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
      ["Rows", fmtNumber(data.summary.totalEntries)],
      ["Resolved", fmtNumber(data.summary.resolvedEntries)],
      ["Unresolved", fmtNumber(data.summary.unresolvedEntries)],
      ["Firms", fmtNumber(data.summary.representedFirms)],
      ["States", fmtNumber(data.summary.representedStates)],
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
      ...rows.map(row => el("tr", {}, ...row.map(cell => el("td", {}, cell))))
    )
  );
}

/**
 * Renders subject link, resolution, and source status tags.
 * @param row - Ranking row.
 * @returns Subject cell.
 */
function subjectCell(row: PublicRankingEntry): HTMLElement {
  const name = row.subject?.displayName || "Unresolved ranking row";
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
        ? `Loaded ${row.source.loadedAt}`
        : "Loaded date unavailable"
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
  return SOURCE_TABLE_LABELS[name] || "Ranking source records";
}

/**
 * Converts status tokens into reader-facing labels.
 * @param status - Source or resolution status token.
 * @returns Display label.
 */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || "Needs review";
}

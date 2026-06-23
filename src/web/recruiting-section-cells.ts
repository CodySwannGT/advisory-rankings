// Recruiting Market Map cell-level helpers.
//
// Extracted from `recruiting-sections.ts` to keep the per-section card
// builders below the `max-lines` cap while preserving the original
// table/cell/tag composition behavior.

import { fmtMoney, humanize, entityPath } from "./app.js";
import { el, Tag } from "./design-system/index.js";
import type { DomChild } from "./design-system/dom.js";
import { moveArticleSource } from "./recruiting-source-cell.js";
import type { TransitionSubject } from "../harper/resource-feed-types.js";
import type {
  MoveArticle,
  MoveSummary,
  PublicMove,
} from "../harper/resource-recruiting-market-types.js";
import type {
  WatchlistItem,
  WatchlistMoveSummary,
  WatchlistSourceCoverage,
} from "../harper/resource-recruiting-watchlist.js";

const STACKED_CELL_CLASS = "stacked-cell";
const NO_MATCHING_MOVES = "no-matching-moves";
const STATUS_LABELS: Record<string, string> = {
  missing: "Missing value",
  "missing-backend-metrics": "Back-end metrics unavailable",
  "missing-clawback-terms": "Clawback terms unavailable",
  "missing-deal-terms": "Deal terms unavailable",
  "missing-location": "Location unavailable",
  "missing-producer-tier": "Producer tier unavailable",
  "missing-source": "Source unavailable",
  "missing-total-pct-t12": "Total T-12 unavailable",
  "missing-upfront-pct-t12": "Upfront T-12 unavailable",
  "source-backed": "Source confirmed",
  "unresolved-firm": "Choose a listed firm",
};

/**
 * Minimal firm shape consumed by `firmCell`. Compatible with `FirmChip`,
 * `WatchlistFirmChip`, and `FirmRow` so the same renderer serves momentum
 * rows and watchlist items without an `as` cast at the call site.
 */
export interface FirmCellChip {
  readonly id: string;
  readonly name?: string;
  readonly short?: string;
  readonly hq?: string | null;
}

/** One cell value rendered inside the recruiting tables. */
export type RecruitingCell = DomChild;

/**
 * Renders a table with normalized cell content.
 * @param tableClass - Recruiting table subtype class.
 * @param headings - Header labels.
 * @param rows - Body rows.
 * @returns Table node.
 */
export function table(
  tableClass: string,
  headings: readonly string[],
  rows: readonly (readonly RecruitingCell[])[]
): HTMLElement {
  return el(
    "table",
    { class: `snap-table recruiting-table ${tableClass}` },
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
 * Renders a firm chip or fallback text.
 * @param firm - Firm chip payload.
 * @returns Firm cell content.
 */
export function firmCell(firm: FirmCellChip | null | undefined): DomChild {
  if (!firm?.id) return "Unresolved firm";
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el(
      "a",
      { class: "recruiting-firm-link", href: entityPath("firm", firm) },
      firm.short || firm.name || firm.id
    ),
    firm.hq ? el("span", {}, firm.hq) : null
  );
}

/**
 * Renders one watchlist firm row as a compact panel.
 * @param item - Watchlist item payload.
 * @returns Watchlist item node.
 */
export function watchlistItem(item: WatchlistItem): HTMLElement {
  const hasMoves = item.sourceCoverage.moveCount > 0;
  const statuses = item.sourceStatus.filter(
    status => status !== NO_MATCHING_MOVES
  );
  return el(
    "article",
    { class: "watchlist-item" },
    el(
      "div",
      { class: "watchlist-item-head" },
      item.firm ? firmCell(item.firm) : unresolvedFirmCell(),
      item.query ? el("span", { class: "watchlist-query" }, item.query) : null
    ),
    hasMoves
      ? el(
          "div",
          { class: "watchlist-metrics" },
          metricBlock("Inbound", summaryValue(item.inbound)),
          metricBlock("Outbound", summaryValue(item.outbound)),
          metricBlock("Net", netValue(item.netKnownAum, item.netMoveCount))
        )
      : watchlistNoMatch(Boolean(item.firm)),
    coverageBlock(item.sourceCoverage),
    statuses.length
      ? el(
          "div",
          { class: "tag-list watchlist-status" },
          ...statuses.map(status => statusTag(status))
        )
      : null
  );
}

/**
 * Renders the per-item no-match empty state for a watched firm with no moves.
 * @param resolved - Whether the query resolved to a known firm.
 * @returns No-match copy node.
 */
function watchlistNoMatch(resolved: boolean): HTMLElement {
  return el(
    "p",
    { class: "watchlist-empty watchlist-note" },
    resolved
      ? "No matching moves for this firm under the current filters. Adjust or remove filters above to broaden results."
      : "Choose one of the suggested firm names above, enter the exact firm name, or remove this firm filter."
  );
}

/**
 * Renders guidance for a firm query that did not resolve to one known firm.
 * @returns Unresolved firm guidance.
 */
function unresolvedFirmCell(): HTMLElement {
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el("span", {}, "Choose a firm"),
    el("span", {}, "Use an exact suggested name")
  );
}

/**
 * Renders per-item source coverage indicators near a watch item. Surfaces the
 * source-backed ratio plus explicit missing-source and missing-location
 * counts so analysts can see provenance gaps without leaving the row.
 * @param coverage - Source coverage counts for the watched firm's moves.
 * @returns Coverage indicator node, or null when the row has no moves.
 */
export function coverageBlock(
  coverage: WatchlistSourceCoverage
): HTMLElement | null {
  if (coverage.moveCount === 0) return null;
  const tags: ReadonlyArray<HTMLElement> = [
    Tag({
      kind: coverage.missingSourceCount > 0 ? "warn" : "ok",
      children: `${fmtNumber(coverage.sourceBackedCount)}/${fmtNumber(coverage.moveCount)} source-backed`,
    }),
    coverage.missingSourceCount > 0
      ? Tag({
          kind: "warn",
          children: `${fmtNumber(coverage.missingSourceCount)} missing source`,
        })
      : null,
    coverage.missingLocationCount > 0
      ? Tag({
          kind: "warn",
          children: `${fmtNumber(coverage.missingLocationCount)} missing location`,
        })
      : null,
  ].filter((tag): tag is HTMLElement => tag !== null);
  return el(
    "div",
    { class: "watchlist-coverage" },
    el("span", { class: "watchlist-coverage-label" }, "Source coverage"),
    el("div", { class: "tag-list" }, ...tags)
  );
}

/**
 * Renders a labeled watchlist metric.
 * @param label - Metric label.
 * @param value - Metric body node.
 * @returns Metric block.
 */
export function metricBlock(label: string, value: DomChild): HTMLElement {
  return el(
    "div",
    { class: "watchlist-metric" },
    el("span", { class: "watchlist-metric-label" }, label),
    value
  );
}

/**
 * Renders count and known AUM for a watchlist side.
 * @param summary - Inbound or outbound summary.
 * @returns Summary metric node.
 */
export function summaryValue(
  summary: WatchlistMoveSummary | null | undefined
): HTMLElement {
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el("strong", {}, fmtMoney(summary?.knownAum)),
    el("span", {}, `${fmtNumber(summary?.count)} moves`)
  );
}

/**
 * Renders net movement and known AUM.
 * @param knownAum - Net known AUM.
 * @param moveCount - Net move count.
 * @returns Net metric node.
 */
export function netValue(knownAum: number, moveCount: number): HTMLElement {
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el("strong", {}, fmtMoney(knownAum)),
    el("span", {}, `${fmtNumber(moveCount)} net moves`)
  );
}

/**
 * Renders inbound/outbound summary metrics.
 * @param summary - Move summary.
 * @returns Summary cell node.
 */
export function summaryCell(summary: MoveSummary): HTMLElement {
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el("strong", {}, fmtMoney(summary.knownAum)),
    el("span", {}, `${fmtNumber(summary.count)} moves`)
  );
}

/**
 * Renders move subject and firms.
 * @param row - Recent move row.
 * @returns Move cell node.
 */
export function moveCell(row: PublicMove): HTMLElement {
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    el("strong", {}, subjectLabel(row.subject)),
    el(
      "span",
      {},
      row.fromFirm?.short || row.fromFirm?.name || "?",
      " -> ",
      row.toFirm?.short || row.toFirm?.name || "?"
    ),
    row.deal ? el("span", {}, dealSummary(row.deal)) : null
  );
}

/**
 * Renders the source article link and status badges.
 * @param row - Recent move row.
 * @returns Source cell node.
 */
export function sourceCell(row: PublicMove): HTMLElement {
  const article: MoveArticle | null = row.article;
  const source = moveArticleSource(article, statusTag("missing-source"));
  return el(
    "div",
    { class: STACKED_CELL_CLASS },
    source,
    el(
      "span",
      { class: "tag-list" },
      ...row.sourceStatus.map(status => statusTag(status))
    )
  );
}

/**
 * Renders values with an explicit missing tag.
 * @param value - Raw value.
 * @param format - Formatter for present values.
 * @returns Value or missing badge.
 */
export function valueOrMissing(
  value: number | null | undefined,
  format: (value: number) => DomChild
): DomChild {
  return value == null ? statusTag("missing") : format(value);
}

/**
 * Creates a compact status tag.
 * @param status - Source-status token.
 * @returns Tag node.
 */
export function statusTag(status: string): HTMLElement {
  return Tag({
    kind: status.includes("missing") ? "warn" : "ok",
    children: STATUS_LABELS[status] || humanize(status.replace(/-/g, "_")),
  });
}

/**
 * Returns a readable subject name.
 * @param subject - Move subject payload.
 * @returns Display label.
 */
function subjectLabel(subject: TransitionSubject | string | null): string {
  if (!subject) return "Unresolved move";
  if (typeof subject === "string") return subject;
  return subject.name || subject.id || "Unresolved move";
}

/**
 * Formats loaded recruiting-deal economics for the move cell.
 * @param deal - Deal fields attached to the recruiting move.
 * @returns Compact deal summary.
 */
function dealSummary(deal: PublicMove["deal"]): string {
  if (!deal) return "";
  const parts = [
    pctPart("upfront", deal.upfrontPctT12),
    pctPart("total", deal.totalPctT12),
    deal.producerTier ? `tier: ${humanize(deal.producerTier)}` : null,
    deal.backendMetrics ?? null,
    deal.clawbackTerms ?? null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? `Deal: ${parts.join(" · ")}` : "Deal terms loaded";
}

/**
 * Formats stored decimal or percent-like T-12 deal values.
 * @param label - Display label for the percentage.
 * @param value - Stored percentage value.
 * @returns Formatted value or null when absent.
 */
function pctPart(
  label: string,
  value: number | null | undefined
): string | null {
  if (value == null) return null;
  const percent = value > 10 ? value : value * 100;
  return `${percent.toLocaleString()}% ${label}`;
}

/**
 * Formats a count.
 * @param value - Numeric count.
 * @returns Localized count.
 */
export function fmtNumber(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString();
}

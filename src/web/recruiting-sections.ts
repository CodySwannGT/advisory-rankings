// Section renderers for the Recruiting Market Map page.

import { fmtMoney, fmtDate } from "./app.js";
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
import type {
  FirmMomentumRow,
  MarketActivityRow,
  PublicMove,
  RecruitingMarketResponse,
} from "../harper/resource-recruiting-market-types.js";
import type { WatchlistPayload } from "../harper/resource-recruiting-watchlist.js";
import {
  firmCell,
  fmtNumber,
  metricBlock,
  moveCell,
  netValue,
  statusTag,
  sourceCell,
  summaryCell,
  summaryValue,
  table,
  valueOrMissing,
  watchlistItem,
} from "./recruiting-section-cells.js";

export { fmtNumber } from "./recruiting-section-cells.js";

const MISSING_LOCATION = "missing-location";
const SOURCE_TABLE_LABELS: Record<string, string> = {
  Article: "Source articles",
  ArticleTransitionEventMention: "Article move mentions",
  FirmAlias: "Firm name aliases",
  TransitionEvent: "Recruiting moves",
};
const UNKNOWN_MARKET = "Unknown market";

/**
 * Builds the firm momentum rankings table.
 * @param rows - Firm momentum rows.
 * @returns Momentum card.
 */
export function momentumCard(rows: readonly FirmMomentumRow[]): HTMLElement {
  if (!rows.length) {
    return EmptyCard({
      title: "Firm momentum",
      body: "No firm momentum rows match the current filters.",
    });
  }
  return SectionCard({
    title: "Firm momentum",
    body: ScrollableTable(
      table(
        "firm-momentum-table",
        ["Firm", "Inbound", "Outbound", "Net AUM", "AUM unknown"],
        rows.map(row => [
          firmCell(row.firm),
          summaryCell(row.inbound),
          summaryCell(row.outbound),
          fmtMoney(row.netKnownAum),
          fmtNumber(row.inbound.unknownAumCount + row.outbound.unknownAumCount),
        ])
      )
    ),
  });
}

/**
 * Builds the selected-firm watchlist momentum card.
 * @param watchlist - Recruiting watchlist payload.
 * @returns Watchlist card.
 */
export function watchlistCard(
  watchlist: WatchlistPayload | null
): HTMLElement | null {
  if (!watchlist?.items?.length) return null;
  const anyMoves = watchlist.items.some(
    item => item.sourceCoverage.moveCount > 0
  );
  return SectionCard({
    title: "Recruiting watchlist",
    attrs: { class: "recruiting-watchlist" },
    body: [
      el(
        "div",
        { class: "watchlist-summary" },
        metricBlock("Inbound", summaryValue(watchlist.summary.inbound)),
        metricBlock("Outbound", summaryValue(watchlist.summary.outbound)),
        metricBlock(
          "Net",
          netValue(
            watchlist.summary.netKnownAum,
            watchlist.summary.netMoveCount
          )
        )
      ),
      el(
        "p",
        { class: "watchlist-generated" },
        "Generated ",
        fmtDate(watchlist.generatedAt, { mode: "rel" })
      ),
      anyMoves
        ? null
        : EmptyText({
            children:
              "No watched firms have matching moves under the current filters. Your selected firms and filters remain editable above.",
          }),
      el(
        "div",
        { class: "watchlist-grid" },
        ...watchlist.items.map(watchlistItem)
      ),
    ],
  });
}

/**
 * Builds the market activity table.
 * @param rows - Market activity rows.
 * @returns Market card.
 */
export function marketCard(rows: readonly MarketActivityRow[]): HTMLElement {
  if (!rows.length) {
    return EmptyCard({
      title: "Market activity",
      body: "No markets match the current filters.",
    });
  }
  return SectionCard({
    title: "Market activity",
    body: ScrollableTable(
      table(
        "market-activity-table",
        ["Market", "Moves", "Known AUM", "Unknown AUM", "Missing T12"],
        rows.map(row => [
          marketLabel(row.market),
          fmtNumber(row.summary.count),
          fmtMoney(row.summary.knownAum),
          fmtNumber(row.summary.unknownAumCount),
          fmtNumber(row.summary.missingT12Count),
        ])
      )
    ),
  });
}

/**
 * Builds the recent moves table.
 * @param rows - Recent move rows.
 * @returns Recent moves card.
 */
export function recentMovesCard(rows: readonly PublicMove[]): HTMLElement {
  if (!rows.length) {
    return EmptyCard({
      title: "Recent moves",
      body: "No recent moves match the current filters.",
    });
  }
  return SectionCard({
    title: "Recent moves",
    body: ScrollableTable(
      table(
        "recent-moves-table",
        ["Date", "Move", "AUM", "T12", "Market", "Source"],
        rows.map(row => [
          fmtDate(row.moveDate, { mode: "short" }),
          moveCell(row),
          valueOrMissing(row.aumMoved, value => fmtMoney(value)),
          valueOrMissing(row.productionT12, value => fmtMoney(value)),
          row.location?.label || statusTag(MISSING_LOCATION),
          sourceCell(row),
        ])
      )
    ),
  });
}

/**
 * Builds the right-rail summary card.
 * @param data - RecruitingMarket response.
 * @returns Summary details card.
 */
export function summaryCard(data: RecruitingMarketResponse): HTMLElement {
  return DetailsCard({
    title: "Recruiting summary",
    pairs: [
      ["Moves", fmtNumber(data.summary.count)],
      ["Known AUM", fmtMoney(data.summary.knownAum)],
      ["Markets", fmtNumber(data.marketActivity.length)],
      ["Firms", fmtNumber(data.firmMomentum.length)],
      ["Generated", fmtDate(data.generatedAt, { mode: "rel" })],
    ],
  });
}

/**
 * Builds the top markets rail card.
 * @param rows - Market activity rows.
 * @returns Top markets card.
 */
export function topMarketsCard(
  rows: readonly MarketActivityRow[]
): HTMLElement {
  return RollupCard<MarketActivityRow>({
    title: "Top markets",
    rows: rows.slice(0, 5),
    renderRow: row => ({
      name: marketLabel(row.market),
      sub: `${fmtMoney(row.summary.knownAum)} known AUM`,
      tail: fmtNumber(row.summary.count),
    }),
  });
}

/**
 * Builds source transparency card.
 * @param data - RecruitingMarket response.
 * @returns Source card.
 */
export function sourceCard(data: RecruitingMarketResponse): HTMLElement {
  return SectionCard({
    title: "Source transparency",
    body: [
      EmptyText({
        children:
          "AUM totals exclude unknown values. Rows keep missing fields visible and retain source/provenance references.",
      }),
      sourceDisclosure(data),
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
 * Groups source caveats into one disclosure instead of a rail badge wall.
 * @param data - RecruitingMarket response.
 * @returns Source caveat disclosure.
 */
function sourceDisclosure(data: RecruitingMarketResponse): HTMLElement {
  return el(
    "details",
    { class: "source-disclosure" },
    el("summary", {}, "About this data"),
    el(
      "div",
      { class: "tag-list source-disclosure-tags" },
      Tag({
        kind: data.sourceCoverage.missingSourceCount > 0 ? "warn" : "ok",
        children: `${fmtNumber(data.sourceCoverage.sourceBackedCount)}/${fmtNumber(data.sourceCoverage.moveCount)} source-backed`,
      }),
      ...sourceCoverageGapTags(data),
      ...data.sourceCoverage.statusCounts.map(row =>
        el(
          "span",
          { class: "stacked-cell" },
          statusTag(row.status),
          el("span", {}, `${fmtNumber(row.count)} moves`)
        )
      )
    )
  );
}

/**
 * Builds warning tags for source coverage gaps.
 * @param data - RecruitingMarket response.
 * @returns Gap tags, preserving nulls for omitted gaps.
 */
function sourceCoverageGapTags(
  data: RecruitingMarketResponse
): readonly (HTMLElement | null)[] {
  return [
    sourceCoverageGapTag(data.sourceCoverage.missingSourceCount, "source"),
    sourceCoverageGapTag(data.sourceCoverage.missingLocationCount, "location"),
    sourceCoverageGapTag(data.sourceCoverage.missingAumCount, "AUM"),
    sourceCoverageGapTag(data.sourceCoverage.missingT12Count, "T12"),
  ];
}

/**
 * Builds one source coverage gap tag.
 * @param count - Missing row count.
 * @param label - Reader-facing gap label.
 * @returns Warning tag or null when there is no gap.
 */
function sourceCoverageGapTag(
  count: number,
  label: string
): HTMLElement | null {
  return count > 0
    ? Tag({ kind: "warn", children: `${fmtNumber(count)} missing ${label}` })
    : null;
}

/**
 * Converts source table identifiers into reader-facing provenance labels.
 * @param name - Source table identifier.
 * @returns Display label.
 */
function sourceTableLabel(name: string): string {
  return SOURCE_TABLE_LABELS[name] || "Source records";
}

/**
 * Converts resource market labels into public-facing copy.
 * @param market - Resource market label.
 * @returns Human-readable market label.
 */
function marketLabel(market: string): string {
  return market === UNKNOWN_MARKET ? "Location not disclosed" : market;
}

// @ts-nocheck
// Section renderers for the Recruiting Market Map page.

import { fmtMoney, fmtDate, humanize, entityPath, articlePath } from "./app.js";
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

const STACKED_CELL_CLASS = "stacked-cell";
const MISSING_LOCATION = "missing-location";

/**
 * Builds the firm momentum rankings table.
 * @param rows - Firm momentum rows.
 * @returns Momentum card.
 */
export function momentumCard(rows) {
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
        ["Firm", "Inbound", "Outbound", "Net AUM", "Unknown"],
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
 * Builds the market activity table.
 * @param rows - Market activity rows.
 * @returns Market card.
 */
export function marketCard(rows) {
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
          row.market,
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
export function recentMovesCard(rows) {
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
export function summaryCard(data) {
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
export function topMarketsCard(rows) {
  return RollupCard({
    title: "Top markets",
    rows: rows.slice(0, 5),
    renderRow: row => ({
      name: row.market,
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
export function sourceCard(data) {
  return SectionCard({
    title: "Source transparency",
    body: [
      EmptyText({
        children:
          "AUM totals exclude unknown values. Rows keep missing fields visible and retain source/provenance references.",
      }),
      el(
        "div",
        { class: "tag-list" },
        ...data.provenance.sourceTables.map(name => Tag({ children: name }))
      ),
    ],
  });
}

/**
 * Renders a table with normalized cell content.
 * @param tableClass - Recruiting table subtype class.
 * @param headings - Header labels.
 * @param rows - Body rows.
 * @returns Table node.
 */
function table(tableClass, headings, rows) {
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
function firmCell(firm) {
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
 * Renders inbound/outbound summary metrics.
 * @param summary - Move summary.
 * @returns Summary cell node.
 */
function summaryCell(summary) {
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
function moveCell(row) {
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
    )
  );
}

/**
 * Renders the source article link and status badges.
 * @param row - Recent move row.
 * @returns Source cell node.
 */
function sourceCell(row) {
  const source =
    row.article?.id || row.article?.url
      ? el(
          "a",
          {
            href: row.article.id ? articlePath(row.article) : row.article.url,
            target: row.article.id ? null : "_blank",
            rel: row.article.id ? null : "noreferrer",
          },
          row.article?.headline || "Source"
        )
      : statusTag("missing-source");
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
function valueOrMissing(value, format) {
  return value == null ? statusTag("missing") : format(value);
}

/**
 * Creates a compact status tag.
 * @param status - Source-status token.
 * @returns Tag node.
 */
function statusTag(status) {
  return Tag({
    kind: status.includes("missing") ? "warn" : "ok",
    children: humanize(status.replace(/-/g, "_")),
  });
}

/**
 * Returns a readable subject name.
 * @param subject - Move subject payload.
 * @returns Display label.
 */
function subjectLabel(subject) {
  if (!subject) return "Unresolved move";
  if (typeof subject === "string") return subject;
  return subject.name || subject.id || "Unresolved move";
}

/**
 * Formats a count.
 * @param value - Numeric count.
 * @returns Localized count.
 */
export function fmtNumber(value) {
  return Number(value || 0).toLocaleString();
}

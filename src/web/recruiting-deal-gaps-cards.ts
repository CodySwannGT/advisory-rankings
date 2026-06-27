import type {
  DealGapResponse,
  DealGapRow,
} from "../harper/resource-recruiting-deal-data-gaps.js";

import { fmtDate } from "./app.js";
import { humanize, fmtMoney } from "./app-formatters.js";
import {
  Button,
  EmptyCard,
  SectionCard,
  Tag,
  el,
} from "./design-system/index.js";
import { statusTag } from "./recruiting-section-cells.js";

/** Callable adapter for untyped design-system components. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

const ButtonC = Button as unknown as DesignSystemComponent;
const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;
const SectionCardC = SectionCard as unknown as DesignSystemComponent;
const TagC = Tag as unknown as DesignSystemComponent;

const DIRECTION_OPTIONS = [
  ["net", "Net moves"],
  ["inbound", "Inbound"],
  ["outbound", "Outbound"],
] as const;

const GAP_OPTIONS = [
  ["", "All gaps"],
  ["missing-aum", "Missing AUM"],
  ["missing-t12", "Missing T12 production"],
  ["missing-location", "Missing market location"],
  ["missing-source", "Missing source article"],
  ["missing-deal-terms", "Missing deal terms"],
  ["missing-total-pct-t12", "Missing total deal percent"],
  ["missing-upfront-pct-t12", "Missing upfront deal percent"],
  ["missing-backend-metrics", "Missing back-end metrics"],
  ["missing-clawback-terms", "Missing clawback terms"],
  ["unresolved-entity", "Unresolved advisor or team"],
] as const;

const UNRESOLVED_OPTIONS = [
  ["include", "Include unresolved"],
  ["exclude", "Exclude unresolved"],
  ["only", "Only unresolved"],
] as const;

/**
 * Builds the page header and primary counts.
 * @param data - Deal gap resource response.
 * @returns Header card.
 */
export function dealGapHeaderCard(data: DealGapResponse): HTMLElement {
  return SectionCardC({
    title: "Recruiting Deal Gaps",
    attrs: { class: "deal-gap-header" },
    body: [
      el(
        "p",
        { class: "deal-gap-lede" },
        "Public recruiting move records missing deal fields, source attribution, or resolved subjects."
      ),
      el(
        "div",
        { class: "deal-gap-stat-grid" },
        stat("Rows", String(data.summary.count)),
        stat("Source-backed", String(data.summary.sourceBackedCount)),
        stat("Unresolved", String(data.summary.unresolvedCount))
      ),
    ],
  });
}

/**
 * Builds the GET-backed filter card.
 * @param data - Current resource payload.
 * @returns Filter card.
 */
export function dealGapFilterCard(data: DealGapResponse): HTMLElement {
  return SectionCardC({
    title: "Filters",
    attrs: { class: "deal-gap-filter-card" },
    body: el(
      "form",
      {
        class: "deal-gap-filters",
        method: "get",
        action: "/recruiting/deal-gaps",
      },
      textField("Firm", "firm", data.filters.firmQuery ?? "", "Morgan Stanley"),
      textField("State", "state", data.filters.state ?? "", "NY"),
      textField("Year", "year", data.filters.year ?? "", "2026"),
      selectField(
        "Direction",
        "direction",
        data.filters.direction,
        DIRECTION_OPTIONS
      ),
      selectField("Gap", "gapType", data.filters.gapType ?? "", GAP_OPTIONS),
      selectField(
        "Unresolved",
        "unresolved",
        data.filters.unresolved,
        UNRESOLVED_OPTIONS
      ),
      el("input", {
        type: "hidden",
        name: "limit",
        value: String(data.filters.limit),
      }),
      ButtonC({ variant: "primary", type: "submit", children: "Apply" }),
      ButtonC({
        variant: "neutral",
        children: "Clear",
        onClick: () => {
          location.href = "/recruiting/deal-gaps";
        },
        attrs: { type: "button" },
      })
    ),
  });
}

/**
 * Builds the no-results state.
 * @returns Empty state card.
 */
export function dealGapEmptyCard(): HTMLElement {
  return EmptyCardC({
    title: "No matching recruiting deal gaps",
    body: [
      "No public recruiting deal gaps match these filters. ",
      el("a", { href: "/recruiting" }, "Open Recruiting Market"),
    ],
  });
}

/**
 * Builds the right-rail queue summary.
 * @param data - Current resource payload.
 * @returns Summary card.
 */
export function dealGapSummaryCard(data: DealGapResponse): HTMLElement {
  return SectionCardC({
    title: "Queue snapshot",
    body: el(
      "div",
      { class: "deal-gap-summary" },
      stateLine("Generated", fmtDate(data.generatedAt, { mode: "rel" })),
      stateLine("Returned", String(data.items.length)),
      stateLine("Total", String(data.total)),
      stateLine("Next page", data.nextCursor ? "Available" : "None")
    ),
  });
}

/**
 * Builds one public gap row.
 * @param row - Deal gap row.
 * @returns Row element.
 */
export function dealGapRowCard(row: DealGapRow): HTMLElement {
  return el(
    "article",
    { class: "deal-gap-row" },
    rowMain(row),
    rowMetrics(row),
    rowProvenance(row),
    rowActions(row)
  );
}

/**
 * Builds row title, metadata, and gap tags.
 * @param row - Deal gap row.
 * @returns Main row section.
 */
function rowMain(row: DealGapRow): HTMLElement {
  return el(
    "div",
    { class: "deal-gap-row-main" },
    el("h3", { class: "deal-gap-title" }, rowTitle(row)),
    el("div", { class: "deal-gap-meta" }, rowMeta(row)),
    el(
      "div",
      { class: "deal-gap-tags" },
      ...row.missingFieldLabels.map(label =>
        TagC({ kind: "warn", children: label })
      )
    )
  );
}

/**
 * Builds known-value pills for one row.
 * @param row - Deal gap row.
 * @returns Metrics section.
 */
function rowMetrics(row: DealGapRow): HTMLElement {
  return el(
    "div",
    { class: "deal-gap-counts", "aria-label": "Known deal values" },
    countPill("AUM", fmtMoney(row.aumMoved, { compact: true })),
    countPill("T12", fmtMoney(row.productionT12, { compact: true })),
    countPill(
      "Headcount",
      row.headcountMoved == null ? "Unknown" : String(row.headcountMoved)
    )
  );
}

/**
 * Builds source-status and public provenance copy for one row.
 * @param row - Deal gap row.
 * @returns Provenance section.
 */
function rowProvenance(row: DealGapRow): HTMLElement {
  return el(
    "div",
    { class: "deal-gap-provenance" },
    el(
      "div",
      { class: "deal-gap-source-status", "aria-label": "Source status" },
      ...row.sourceStatus.map(status => statusTag(status))
    ),
    stateLine("Source row", provenanceSummary(row)),
    el("p", { class: "deal-gap-public-action" }, publicAction(row))
  );
}

/**
 * Builds public follow-up links for one row.
 * @param row - Deal gap row.
 * @returns Actions section.
 */
function rowActions(row: DealGapRow): HTMLElement {
  return el(
    "div",
    { class: "deal-gap-actions" },
    row.links.article ? el("a", { href: row.links.article }, "Article") : null,
    row.links.subject ? el("a", { href: row.links.subject }, "Subject") : null,
    row.links.toFirm
      ? el("a", { href: row.links.toFirm }, "Destination firm")
      : null,
    row.links.fromFirm
      ? el("a", { href: row.links.fromFirm }, "Source firm")
      : null,
    el("a", { href: recruitingMarketPath(row) }, "Market slice")
  );
}

/**
 * Formats the row headline.
 * @param row - Deal gap row.
 * @returns Public row title.
 */
function rowTitle(row: DealGapRow): string {
  const subject = row.subject?.name ?? "Unresolved advisor or team";
  const toFirm = row.toFirm?.short || row.toFirm?.name || "unknown firm";
  return `${subject} to ${toFirm}`;
}

/**
 * Formats row date, source firm, and market context.
 * @param row - Deal gap row.
 * @returns Metadata label.
 */
function rowMeta(row: DealGapRow): string {
  const fromFirm =
    row.fromFirm?.short || row.fromFirm?.name || "unknown source firm";
  const market = row.market.label || row.market.state || "market unavailable";
  return `${fmtDate(row.moveDate, { mode: "short" })} - ${fromFirm} - ${market}`;
}

/**
 * Builds a market link scoped to the row's state when available.
 * @param row - Deal gap row.
 * @returns Recruiting Market URL.
 */
function recruitingMarketPath(row: DealGapRow): string {
  const params = new URLSearchParams();
  if (row.market.state) params.set("state", row.market.state);
  return `/recruiting${params.toString() ? `?${params.toString()}` : ""}`;
}

/**
 * Formats the public source row backing this UI item.
 * @param row - Deal gap row.
 * @returns Compact source table/id label.
 */
function provenanceSummary(row: DealGapRow): string {
  const sourceId = row.provenance.sourceIds[0] ?? row.id;
  return `${row.provenance.sourceTable} ${sourceId}`;
}

/**
 * Describes the next public-only research step without implying completeness.
 * @param row - Deal gap row.
 * @returns Public follow-up copy.
 */
function publicAction(row: DealGapRow): string {
  if (row.gapTypes.includes("missing-source")) {
    return "Public follow-up: find a public source and keep unknown deal fields marked incomplete until evidence is found.";
  }
  return "Public follow-up: review linked public sources and keep unknown deal fields marked incomplete until evidence is found.";
}

/**
 * Builds one summary stat block.
 * @param label - Stat label.
 * @param value - Stat value.
 * @returns Stat element.
 */
function stat(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "deal-gap-stat" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

/**
 * Builds one text input field.
 * @param label - Field label.
 * @param name - Query parameter name.
 * @param value - Current value.
 * @param placeholder - Placeholder hint.
 * @returns Label/input wrapper.
 */
function textField(
  label: string,
  name: string,
  value: string,
  placeholder: string
): HTMLElement {
  return el(
    "label",
    { class: "deal-gap-field" },
    el("span", {}, label),
    el("input", { name, value, placeholder })
  );
}

/**
 * Builds one select field, preserving custom current values.
 * @param label - Field label.
 * @param name - Query parameter name.
 * @param current - Current selected value.
 * @param options - Supported options.
 * @returns Label/select wrapper.
 */
function selectField(
  label: string,
  name: string,
  current: string,
  options: ReadonlyArray<readonly [string, string]>
): HTMLElement {
  const visibleOptions =
    current && !options.some(([value]) => value === current)
      ? ([
          [current, humanize(current) ?? current] as const,
          ...options,
        ] as const)
      : options;
  return el(
    "label",
    { class: "deal-gap-field" },
    el("span", {}, label),
    el(
      "select",
      { name },
      ...visibleOptions.map(([value, optionLabel]) =>
        el("option", { value, selected: value === current }, optionLabel)
      )
    )
  );
}

/**
 * Builds one compact value pill.
 * @param label - Pill label.
 * @param value - Pill value.
 * @returns Pill element.
 */
function countPill(label: string, value: string): HTMLElement {
  return el(
    "span",
    { class: "deal-gap-count-pill" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

/**
 * Builds one key/value summary line.
 * @param label - State label.
 * @param value - State value.
 * @returns State line element.
 */
function stateLine(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "deal-gap-state-line" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

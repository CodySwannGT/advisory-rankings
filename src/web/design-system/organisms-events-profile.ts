// AdvisorBook · Design system — ORGANISMS · EVENTS (profile cards)
//
// Profile-page organisms that share the event-formatter contract:
// `ArticleListBlock` (coverage list), `CareerTimeline` (advisor
// employment history), and `SnapshotTable` (team metric snapshots).
// Split out of `organisms-events.ts` to keep each implementation file
// under the project max-lines threshold.

import { el } from "./dom.js";
import { Tag, EmptyText } from "./atoms.js";
import { articlePath, entityPath } from "../urls.js";
import type { TeamMetricSnapshotRow } from "../../types/harper-schema.js";
import {
  EntityListC,
  EntityRowC,
  ScrollableTableC,
  formatInlineLabelFn,
} from "./organisms-events-adapters.js";
import {
  defaultFmtMoney,
  identityHumanize,
  type ArticleListBlockOptions,
  type ArticleSourceFn,
  type ArticleSourceMeta,
  type ArticleStubLike,
  type CareerTimelineOptions,
  type CareerTimelineStep,
  type FmtDate,
  type FmtMoney,
  type Humanize,
  type SnapshotTableOptions,
} from "./organisms-events-types.js";

// ─── ArticleListBlock ─────────────────────────────────────────
// Read-only list of articles (used on every profile page's
// "Coverage" section).
/**
 * Renders profile coverage articles as entity rows.
 * @param root0 - Rendering options for this organism.
 * @param root0.articles - Article rows linked to the profile.
 * @param root0.fmtDate - Date formatter supplied by the page.
 * @param root0.articleSource - Source metadata adapter for outbound links.
 * @returns Rendered DOM node.
 */
export function ArticleListBlock({
  articles,
  fmtDate,
  articleSource,
}: ArticleListBlockOptions = {}): HTMLElement | null {
  if (!articles || !articles.length)
    return EmptyText({ children: "No articles yet." });
  return EntityListC({
    rows: articles.map(a =>
      EntityRowC(articleListRowOptions(a, fmtDate, articleSource))
    ),
  });
}

/**
 * Builds the option bag for one row inside {@link ArticleListBlock}.
 * @param article - Article row linked to the profile.
 * @param fmtDate - Date formatter supplied by the page.
 * @param articleSource - Source metadata adapter for outbound links.
 * @returns Row option bag forwarded to `EntityRow`.
 */
function articleListRowOptions(
  article: ArticleStubLike,
  fmtDate: FmtDate | undefined,
  articleSource: ArticleSourceFn | undefined
): Readonly<Record<string, unknown>> {
  const src: ArticleSourceMeta = articleSource
    ? articleSource(article)
    : { source: "External", initials: "?" };
  const subParts: ReadonlyArray<string | null> = [
    formatInlineLabelFn(article.category ?? null),
    fmtDate
      ? fmtDate(article.publishedDate ?? null)
      : article.publishedDate != null
        ? String(article.publishedDate)
        : null,
  ];
  return {
    avatar: src.initials,
    name: el(
      "a",
      { href: articlePath(article) },
      article.headline || article.id || ""
    ),
    sub: subParts.filter((part): part is string => Boolean(part)).join(" · "),
    tail:
      article.url && src.publicOriginalLink !== false
        ? el(
            "a",
            { href: article.url, target: "_blank", rel: "noreferrer" },
            `${src.source} →`
          )
        : null,
  };
}

// ─── CareerTimeline ───────────────────────────────────────────
// Vertical timeline of EmploymentHistory steps with status markers.
/**
 * Renders employment history as a chronological advisor career timeline.
 * @param root0 - Rendering options for this organism.
 * @param root0.career - Employment rows already enriched for display.
 * @param root0.fmtDate - Date formatter supplied by the page.
 * @returns Rendered DOM node.
 */
export function CareerTimeline({
  career,
  fmtDate,
}: CareerTimelineOptions = {}): HTMLElement {
  return el(
    "div",
    { class: "timeline" },
    ...(career ?? []).map(c => careerTimelineStep(c, fmtDate))
  );
}

/**
 * Builds one row inside the {@link CareerTimeline} list.
 * @param c - Employment row enriched for display.
 * @param fmtDate - Date formatter supplied by the page.
 * @returns Rendered DOM node for one timeline step.
 */
function careerTimelineStep(
  c: CareerTimelineStep,
  fmtDate: FmtDate | undefined
): HTMLElement {
  const cls = !c.endDate
    ? "current"
    : c.reasonForLeaving === "terminated_for_cause"
      ? "terminated"
      : "";
  return el(
    "div",
    { class: `step ${cls}` },
    el("div", { class: "marker" }),
    el(
      "div",
      { class: "body" },
      careerStepTitle(c),
      el("div", { class: "when" }, formatCareerRange(c, fmtDate)),
      c.roleTitle ? el("div", { class: "role" }, c.roleTitle) : null,
      c.reasonForLeaving === "terminated_for_cause"
        ? Tag({ kind: "danger", children: "terminated for cause" })
        : null,
      c.u5Filed
        ? Tag({
            kind: "warn",
            attrs: { style: "margin-left:6px;" },
            children: "U5 filed",
          })
        : null
    )
  );
}

/**
 * Builds the firm + branch title line for a {@link CareerTimeline} step.
 * @param c - Employment row enriched for display.
 * @returns Rendered DOM node for the timeline-step title.
 */
function careerStepTitle(c: CareerTimelineStep): HTMLElement {
  return el(
    "div",
    { class: "title" },
    c.firm
      ? el("a", { href: entityPath("firm", c.firm) }, c.firm.name ?? "?")
      : "?",
    c.branch ? el("span", { class: "role" }, ` · ${c.branch.name ?? ""}`) : null
  );
}

/**
 * Formats employment start and end dates for timeline rows.
 * @param c - Employment row shown in the timeline.
 * @param fmtDate - Date formatter supplied by the page.
 * @returns Formatted timeline range label.
 */
function formatCareerRange(
  c: CareerTimelineStep,
  fmtDate: FmtDate | undefined
): string {
  const start =
    c.startDate && fmtDate ? fmtDate(c.startDate, { mode: "short" }) : null;
  const end =
    c.endDate && fmtDate ? fmtDate(c.endDate, { mode: "short" }) : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} – present`;
  if (end) return `Ended ${end}`;
  return "Present";
}

// ─── SnapshotTable ────────────────────────────────────────────
// Table of TeamMetricSnapshot rows on the team profile.
/**
 * Renders team metric snapshots in a horizontally scrollable table.
 * @param root0 - Rendering options for this organism.
 * @param root0.snaps - Team metric snapshots ordered by the caller.
 * @param root0.fmtMoney - Currency formatter supplied by the page.
 * @param root0.fmtDate - Date formatter supplied by the page.
 * @param root0.humanize - Label formatter for source values.
 * @returns Rendered DOM node.
 */
export function SnapshotTable({
  snaps,
  fmtMoney,
  fmtDate,
  humanize = identityHumanize,
}: SnapshotTableOptions = {}): HTMLElement {
  const fmt = fmtMoney ?? defaultFmtMoney;
  return ScrollableTableC(
    el(
      "table",
      { class: "snap-table" },
      snapshotTableHead(),
      el(
        "tbody",
        {},
        ...(snaps ?? []).map(s => snapshotRow(s, fmt, fmtDate, humanize))
      )
    )
  );
}

/**
 * Renders the fixed header row for {@link SnapshotTable}.
 * @returns Rendered DOM node for the table head.
 */
function snapshotTableHead(): HTMLElement {
  return el(
    "thead",
    {},
    el(
      "tr",
      {},
      el("th", {}, "As of"),
      el("th", { class: "num" }, "AUM"),
      el("th", { class: "num" }, "Annual rev."),
      el("th", { class: "num" }, "Households"),
      el("th", { class: "num" }, "Team size"),
      el("th", {}, "Source")
    )
  );
}

/**
 * Builds one row inside {@link SnapshotTable}.
 * @param s - Team metric snapshot row.
 * @param fmtMoney - Currency formatter (defaulted upstream).
 * @param fmtDate - Optional date formatter supplied by the page.
 * @param humanize - Label formatter for source values.
 * @returns Rendered table row.
 */
function snapshotRow(
  s: TeamMetricSnapshotRow,
  fmtMoney: FmtMoney,
  fmtDate: FmtDate | undefined,
  humanize: Humanize
): HTMLElement {
  return el(
    "tr",
    {},
    el(
      "td",
      {},
      s.asOf && fmtDate ? fmtDate(s.asOf) : s.asOf ? String(s.asOf) : "?"
    ),
    el("td", { class: "num" }, s.aum != null ? fmtMoney(s.aum) : "—"),
    el(
      "td",
      { class: "num" },
      s.annualRevenue != null ? fmtMoney(s.annualRevenue) : "—"
    ),
    el("td", { class: "num" }, s.householdCount ?? "—"),
    el("td", { class: "num" }, s.teamSize ?? "—"),
    el("td", {}, s.sourceType ? humanize(s.sourceType) : "—")
  );
}

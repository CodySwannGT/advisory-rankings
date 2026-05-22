// @ts-nocheck
import { el } from "./dom.js";
import { Tag, EmptyText } from "./atoms.js";
import {
  PostHeader,
  EntityRow,
  SanctionPill,
  DealStrip,
  EventStat,
  FirmArrow,
} from "./molecules.js";
import { articlePath, entityPath } from "../urls.js";
import { ChipRow, EntityList, ScrollableTable } from "./organisms-core.js";
import { formatInlineLabel } from "./organisms-search.js";

// ─── TransitionEventCard ──────────────────────────────────────
// The green-bordered card for a TransitionEvent. Renders firm
// arrow header, key stats, optional deal strip.
//
//   t = transition event card payload, fmts = { fmtMoney, fmtPct, fmtDate }
/**
 * Renders a transition event card with firms, subject tags, metrics, and deal terms.
 * @param t - Team row.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Rendered DOM node.
 */
export function TransitionEventCard(t, fmts = {}) {
  const { fmtPct } = fmts;
  return el(
    "div",
    { class: "event-card transition" },
    transitionTitle(t),
    el("div", { class: "stats" }, ...transitionStats(t, fmts)),
    t.deal ? DealStrip({ deal: t.deal, fmtPct }) : null
  );
}

/**
 * Builds the compact transition title row with optional classification tags.
 * @param transition - Transition card payload.
 * @returns Title row node.
 */
function transitionTitle(transition) {
  return el(
    "div",
    { class: "event-title" },
    FirmArrow({ fromFirm: transition.fromFirm, toFirm: transition.toFirm }),
    transition.subject
      ? Tag({ kind: "default", children: transition.subject.kind || "subject" })
      : null,
    transition.subject ? el("span", {}, transition.subject.name) : null,
    transition.isBreakaway
      ? Tag({ kind: "warn", children: "breakaway" })
      : null,
    transition.isReturn ? Tag({ kind: "default", children: "return" }) : null
  );
}

/**
 * Converts populated transition metrics into event-stat cells.
 * @param transition - Transition card payload.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Renderable stat nodes.
 */
function transitionStats(transition, fmts) {
  const { fmtMoney, fmtDate } = fmts;
  return [
    transition.aumMoved != null && fmtMoney
      ? EventStat({ value: fmtMoney(transition.aumMoved), label: "AUM moved" })
      : null,
    transition.productionT12 != null && fmtMoney
      ? EventStat({
          value: fmtMoney(transition.productionT12),
          label: "T-12 production",
        })
      : null,
    transition.headcountMoved != null
      ? EventStat({ value: transition.headcountMoved, label: "advisors moved" })
      : null,
    transition.moveDate && fmtDate
      ? EventStat({ value: fmtDate(transition.moveDate), label: "move date" })
      : null,
  ].filter(Boolean);
}

// ─── DisclosureEventCard ──────────────────────────────────────
// The red-bordered card for a Disclosure. Regulator + status,
// the allegation quote, and stacked SanctionPills.
/**
 * Renders a disclosure card with regulator, allegation, sanctions, and award data.
 * @param d - Disclosure card payload.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Rendered DOM node.
 */
export function DisclosureEventCard(d, fmts = {}) {
  const { fmtMoney, humanize = x => x } = fmts;
  const reg = [humanize(d.regulator), d.regulatorState]
    .filter(Boolean)
    .join(" / ");
  return el(
    "div",
    { class: "event-card disclosure" },
    el(
      "div",
      { class: "event-title" },
      Tag({
        kind: "danger",
        children: humanize(d.disclosureType) || "Disclosure",
      }),
      reg ? el("span", {}, reg) : null,
      d.status ? Tag({ kind: "default", children: humanize(d.status) }) : null,
      d.advisor
        ? el("a", { href: entityPath("advisor", d.advisor) }, d.advisor.name)
        : null
    ),
    d.allegationText
      ? el("div", { class: "allegation" }, '"', d.allegationText, '"')
      : null,
    d.sanctions && d.sanctions.length
      ? el(
          "div",
          { class: "sanctions-row" },
          ...d.sanctions.map(s =>
            SanctionPill(sanctionBits(s, humanize, fmtMoney))
          )
        )
      : null,
    d.awardAmount && fmtMoney
      ? el("div", { class: "deal-strip" }, `Award: ${fmtMoney(d.awardAmount)}`)
      : null
  );
}

/**
 * Builds the display tokens shown inside one sanction pill.
 * @param sanction - Sanction row attached to a disclosure.
 * @param humanize - Label formatter supplied by the page.
 * @param fmtMoney - Optional currency formatter for sanction amounts.
 * @returns Non-empty pill tokens.
 */
function sanctionBits(sanction, humanize, fmtMoney) {
  return [
    humanize(sanction.sanctionType),
    sanction.amount && fmtMoney ? fmtMoney(sanction.amount) : null,
    sanction.durationMonths ? `${sanction.durationMonths}mo` : null,
    sanction.jurisdiction ? `(${sanction.jurisdiction})` : null,
  ].filter(Boolean);
}

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
export function ArticleListBlock({ articles, fmtDate, articleSource } = {}) {
  if (!articles || !articles.length)
    return EmptyText({ children: "No articles yet." });
  return EntityList({
    rows: articles.map(a => {
      const src = articleSource
        ? articleSource(a)
        : { source: "External", initials: "?" };
      return EntityRow({
        avatar: src.initials,
        name: el("a", { href: articlePath(a) }, a.headline || a.id),
        sub: [
          formatInlineLabel(a.category),
          fmtDate ? fmtDate(a.publishedDate) : a.publishedDate,
        ]
          .filter(Boolean)
          .join(" · "),
        tail: a.url
          ? el(
              "a",
              { href: a.url, target: "_blank", rel: "noreferrer" },
              `${src.source} →`
            )
          : null,
      });
    }),
  });
}

// ─── FeedPostCard ─────────────────────────────────────────────
// A single article rendered as a Facebook-style post: header,
// headline, dek, inline event cards (transitions / disclosures),
// a chip-row of mentioned entities, and a footer with links.
//
//   item = { article, eventCards?, advisors?, firms?, teams? }
//   fmts = { fmtMoney, fmtPct, fmtDate }
/**
 * Renders one feed article with metadata, event cards, chips, and links.
 * @param item - Feed item returned by the public resource.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Rendered DOM node.
 */
export function FeedPostCard(item, fmts = {}) {
  const a = item.article;
  const { fmtDate, articleSource } = fmts;
  const src = articleSource
    ? articleSource(a)
    : { source: "External", initials: "?", ctaLabel: "Read original →" };
  const detailHref = articlePath(a);
  return el(
    "article",
    { class: "card" },
    PostHeader({
      initials: src.initials,
      source: src.source,
      authors: a.authors,
      when: fmtDate
        ? fmtDate(a.publishedDate, { mode: "rel" })
        : a.publishedDate,
      category: a.category,
    }),
    el(
      "h2",
      { class: "post-headline" },
      el("a", { href: detailHref }, a.headline || "(untitled)")
    ),
    a.dek ? el("div", { class: "post-dek" }, a.dek) : null,
    ...(item.eventCards || [])
      .map(c =>
        c.kind === "transition"
          ? TransitionEventCard(c, fmts)
          : c.kind === "disclosure"
            ? DisclosureEventCard(c, fmts)
            : null
      )
      .filter(Boolean),
    ChipRow({
      firms: item.firms || [],
      teams: item.teams || [],
      advisors: item.advisors || [],
    }),
    el(
      "div",
      { class: "post-footer" },
      el("a", { href: detailHref }, "View details"),
      a.url
        ? el(
            "a",
            {
              href: a.url,
              target: "_blank",
              rel: "noreferrer",
              class: "ext-link",
            },
            `${src.source} original →`
          )
        : null
    )
  );
}

// ─── CareerTimeline ───────────────────────────────────────────
// Vertical timeline of EmploymentHistory steps with status
// markers (current = green, terminated = red, otherwise brand).
/**
 * Renders employment history as a chronological advisor career timeline.
 * @param root0 - Rendering options for this organism.
 * @param root0.career - Employment rows already enriched for display.
 * @param root0.fmtDate - Date formatter supplied by the page.
 * @returns Rendered DOM node.
 */
export function CareerTimeline({ career, fmtDate } = {}) {
  return el(
    "div",
    { class: "timeline" },
    ...career.map(c => {
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
          el(
            "div",
            { class: "title" },
            c.firm
              ? el("a", { href: entityPath("firm", c.firm) }, c.firm.name)
              : "?",
            c.branch
              ? el("span", { class: "role" }, ` · ${c.branch.name}`)
              : null
          ),
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
    })
  );
}

/**
 * Formats employment start and end dates for timeline rows.
 * @param c - Employment row shown in the timeline.
 * @param fmtDate - Date formatter supplied by the page.
 * @returns Rendered DOM node.
 */
function formatCareerRange(c, fmtDate) {
  const start = c.startDate ? fmtDate(c.startDate, { mode: "short" }) : null;
  const end = c.endDate ? fmtDate(c.endDate, { mode: "short" }) : null;
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
  humanize = x => x,
} = {}) {
  return ScrollableTable(
    el(
      "table",
      { class: "snap-table" },
      el(
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
      ),
      el(
        "tbody",
        {},
        ...snaps.map(s =>
          el(
            "tr",
            {},
            el("td", {}, s.asOf && fmtDate ? fmtDate(s.asOf) : s.asOf || "?"),
            el("td", { class: "num" }, s.aum != null ? fmtMoney(s.aum) : "—"),
            el(
              "td",
              { class: "num" },
              s.annualRevenue != null ? fmtMoney(s.annualRevenue) : "—"
            ),
            el("td", { class: "num" }, s.householdCount ?? "—"),
            el("td", { class: "num" }, s.teamSize ?? "—"),
            el("td", {}, s.sourceType ? humanize(s.sourceType) : "—")
          )
        )
      )
    )
  );
}

// AdvisorBook · Design system — ORGANISMS · EVENTS (feed cards)
//
// Article-feed-related event cards: the green-bordered transition
// card, the red-bordered disclosure card, and the Facebook-style
// `FeedPostCard` wrapper that composes them. Split out of
// `organisms-events.ts` to keep each implementation file under the
// project max-lines threshold.

import { el } from "./dom.js";
import { Tag } from "./atoms.js";
import { feedCategoryLabel } from "../feed-category-labels.js";
import { articlePath, entityPath } from "../urls.js";
import type { SanctionRow } from "../../types/harper-schema.js";
import type {
  DisclosureEventCard as DisclosureEventCardPayload,
  FeedItem,
  TransitionEventCard as TransitionEventCardPayload,
} from "../../harper/resource-feed-types.js";
import {
  ChipRowC,
  DealStripC,
  EventStatC,
  FirmArrowC,
  PostHeaderC,
  SanctionPillC,
} from "./organisms-events-adapters.js";
import {
  defaultFmtMoney,
  identityHumanize,
  type ArticleSourceMeta,
  type EventFormatters,
  type FmtMoney,
  type Humanize,
} from "./organisms-events-types.js";

// ─── TransitionEventCard ──────────────────────────────────────
// The green-bordered card for a TransitionEvent. Renders firm
// arrow header, key stats, optional deal strip.
/**
 * Renders a transition event card with firms, subject tags, metrics, and deal terms.
 * @param t - Transition event card payload.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Rendered DOM node.
 */
export function TransitionEventCard(
  t: TransitionEventCardPayload,
  fmts: EventFormatters = {}
): HTMLElement {
  const { fmtPct } = fmts;
  return el(
    "div",
    { class: "event-card transition" },
    transitionTitle(t),
    el("div", { class: "stats" }, ...transitionStats(t, fmts)),
    t.deal ? DealStripC({ deal: t.deal, fmtPct }) : null
  );
}

/**
 * Builds the compact transition title row with optional classification tags.
 * @param transition - Transition card payload.
 * @returns Title row node.
 */
function transitionTitle(transition: TransitionEventCardPayload): HTMLElement {
  return el(
    "div",
    { class: "event-title" },
    FirmArrowC({ fromFirm: transition.fromFirm, toFirm: transition.toFirm }),
    transition.subject
      ? Tag({ kind: "default", children: transition.subject.kind || "subject" })
      : null,
    transition.subject ? el("span", {}, transition.subject.name ?? "") : null,
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
function transitionStats(
  transition: TransitionEventCardPayload,
  fmts: EventFormatters
): readonly HTMLElement[] {
  const { fmtMoney, fmtDate } = fmts;
  const cells: ReadonlyArray<HTMLElement | null> = [
    transition.aumMoved != null && fmtMoney
      ? EventStatC({ value: fmtMoney(transition.aumMoved), label: "AUM moved" })
      : null,
    transition.productionT12 != null && fmtMoney
      ? EventStatC({
          value: fmtMoney(transition.productionT12),
          label: "T-12 production",
        })
      : null,
    transition.headcountMoved != null
      ? EventStatC({
          value: transition.headcountMoved,
          label: "advisors moved",
        })
      : null,
    transition.moveDate && fmtDate
      ? EventStatC({ value: fmtDate(transition.moveDate), label: "move date" })
      : null,
  ];
  return cells.filter((cell): cell is HTMLElement => cell != null);
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
export function DisclosureEventCard(
  d: DisclosureEventCardPayload,
  fmts: EventFormatters = {}
): HTMLElement {
  const { fmtMoney, humanize = identityHumanize } = fmts;
  const reg = [humanize(d.regulator), d.regulatorState]
    .filter((part): part is string => Boolean(part))
    .join(" / ");
  return el(
    "div",
    { class: "event-card disclosure" },
    disclosureTitleRow(d, reg, humanize),
    d.allegationText
      ? el("div", { class: "allegation" }, '"', d.allegationText, '"')
      : null,
    d.sanctions && d.sanctions.length
      ? el(
          "div",
          { class: "sanctions-row" },
          ...d.sanctions.map(s =>
            SanctionPillC(sanctionBits(s, humanize, fmtMoney))
          )
        )
      : null,
    d.awardAmount != null && fmtMoney
      ? el("div", { class: "deal-strip" }, `Award: ${fmtMoney(d.awardAmount)}`)
      : null
  );
}

/**
 * Builds the title row for the disclosure card.
 * @param d - Disclosure card payload.
 * @param reg - Pre-joined regulator label.
 * @param humanize - Label formatter supplied by the page.
 * @returns Title row node.
 */
function disclosureTitleRow(
  d: DisclosureEventCardPayload,
  reg: string,
  humanize: Humanize
): HTMLElement {
  return el(
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
  );
}

/**
 * Builds the display tokens shown inside one sanction pill.
 * @param sanction - Sanction row attached to a disclosure.
 * @param humanize - Label formatter supplied by the page.
 * @param fmtMoney - Optional currency formatter for sanction amounts.
 * @returns Non-empty pill tokens.
 */
function sanctionBits(
  sanction: SanctionRow,
  humanize: Humanize,
  fmtMoney: FmtMoney | undefined
): Readonly<Record<string, unknown>> {
  const fmt = fmtMoney ?? defaultFmtMoney;
  const bits: ReadonlyArray<string | null | undefined> = [
    humanize(sanction.sanctionType),
    sanction.amount != null && fmtMoney ? fmt(sanction.amount) : null,
    sanction.durationMonths != null ? `${sanction.durationMonths}mo` : null,
    sanction.jurisdiction ? `(${sanction.jurisdiction})` : null,
  ];
  return { bits: bits.filter((bit): bit is string => bit != null) };
}

// ─── FeedPostCard ─────────────────────────────────────────────
// A single article rendered as a Facebook-style post.
/**
 * Renders one feed article with metadata, event cards, chips, and links.
 * @param item - Feed item returned by the public resource.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Rendered DOM node.
 */
export function FeedPostCard(
  item: FeedItem,
  fmts: EventFormatters = {}
): HTMLElement {
  const a = item.article;
  const { fmtDate, articleSource } = fmts;
  const src: ArticleSourceMeta = articleSource
    ? articleSource(a)
    : { source: "External", initials: "?", ctaLabel: "Read original →" };
  const detailHref = articlePath(a);
  return el(
    "article",
    { class: "card" },
    PostHeaderC({
      initials: src.initials,
      source: src.source,
      authors: a.authors,
      when: fmtDate
        ? fmtDate(a.publishedDate ?? null, { mode: "rel" })
        : (a.publishedDate ?? null),
      category: feedCategoryLabel(a.category ?? ""),
    }),
    el(
      "h2",
      { class: "post-headline" },
      el("a", { href: detailHref }, a.headline || "(untitled)")
    ),
    a.dek ? el("div", { class: "post-dek" }, a.dek) : null,
    ...feedEventCardNodes(item.eventCards, fmts),
    ChipRowC({
      firms: item.firms || [],
      teams: item.teams || [],
      advisors: item.advisors || [],
    }),
    feedPostFooter(detailHref, a.url, src.source)
  );
}

/**
 * Renders the footer row for {@link FeedPostCard}.
 * @param detailHref - Internal article-detail href.
 * @param externalUrl - External article URL when known.
 * @param sourceLabel - Source attribution label.
 * @returns Footer row node.
 */
function feedPostFooter(
  detailHref: string,
  externalUrl: string | undefined | null,
  sourceLabel: string
): HTMLElement {
  return el(
    "div",
    { class: "post-footer" },
    el("a", { href: detailHref }, "View details"),
    externalUrl
      ? el(
          "a",
          {
            href: externalUrl,
            target: "_blank",
            rel: "noreferrer",
            class: "ext-link",
          },
          `${sourceLabel} original →`
        )
      : null
  );
}

/**
 * Renders the event-card payloads attached to a feed item.
 *
 * Uses discriminated-union narrowing on `kind` so each card is built
 * against its concrete payload type rather than the union.
 * @param cards - Event-card payloads attached to the feed item.
 * @param fmts - Formatting callbacks supplied by the page.
 * @returns Rendered event-card nodes (already filtered of null entries).
 */
function feedEventCardNodes(
  cards: FeedItem["eventCards"] | undefined,
  fmts: EventFormatters
): readonly HTMLElement[] {
  if (!cards || !cards.length) return [];
  const nodes: ReadonlyArray<HTMLElement | null> = cards.map(c => {
    if (c.kind === "transition") return TransitionEventCard(c, fmts);
    if (c.kind === "disclosure") return DisclosureEventCard(c, fmts);
    return null;
  });
  return nodes.filter((node): node is HTMLElement => node != null);
}

import { el, type DomChild } from "./dom.js";
import { Avatar, Tag, EmptyText, Heading, Button, Skeleton } from "./atoms.js";
import { APP_VERSION } from "../version.js";
import {
  ASYNC_STATE_DEFAULTS,
  M,
  arrify,
  type AsyncStateCardOptions,
  type BrowseCardOptions,
  type CardOptions,
  type ChipRowOptions,
  type DetailsCardOptions,
  type EmptyCardOptions,
  type EntityListOptions,
  type ProfileHeadOptions,
  type RollupCardOptions,
  type SectionCardOptions,
} from "./organisms-core-types.js";

const { EntityChip, EntityRow, KvList, NavRow } = M;

const CARD_SUBTITLE_CLASS = "card-subtitle";

// ─── Card ─────────────────────────────────────────────────────
// White rounded surface with shadow. The base container for
// every section in the center column and rails. Pass `tag: 'article'`
// when rendering an actual article (article-detail head etc.) so the
// element keeps semantic meaning.
/**
 * Creates the standard card surface used by section-level UI.
 * @param root0 - Card rendering options.
 * @param root0.tag - HTML tag name.
 * @param root0.children - Child nodes or text values.
 * @param root0.attrs - Element attributes.
 * @returns Rendered DOM node.
 */
export function Card({
  tag = "div",
  children,
  attrs = {},
}: CardOptions = {}): HTMLElement {
  const cls = `card ${attrs.class ?? ""}`.trim();
  return el(tag, { ...attrs, class: cls }, ...arrify(children));
}

// ─── SectionCard ──────────────────────────────────────────────
// Card with a padded body and an h2 title. The single most-used
// container in the app.
//
// The title is a sibling of `.card-body`, not a child, so page
// wiring that re-renders by clearing `.card-body` keeps the title
// in place.
/**
 * Creates a titled card with a stable `.card-body` container for re-rendering.
 * @param root0 - Card rendering options.
 * @param root0.title - Primary display title.
 * @param root0.body - Body content rendered inside the card.
 * @param root0.attrs - Element attributes.
 * @returns Rendered DOM node.
 */
export function SectionCard({
  title,
  body,
  attrs = {},
}: SectionCardOptions = {}): HTMLElement {
  return Card({
    attrs,
    children: [
      title
        ? Heading({ level: 2, attrs: { class: "card-title" }, children: title })
        : null,
      el("div", { class: "card-body" }, ...arrify(body)),
    ],
  });
}

// ─── EmptyCard ────────────────────────────────────────────────
// Common error / empty-state card.
/**
 * Creates a titled empty-state card using the shared empty text treatment.
 * @param root0 - Card rendering options.
 * @param root0.title - Primary display title.
 * @param root0.body - Body content rendered inside the card.
 * @returns Rendered DOM node.
 */
export function EmptyCard({ title, body }: EmptyCardOptions): HTMLElement {
  return SectionCard({ title, body: EmptyText({ children: body }) });
}

// ─── AsyncStateCard ───────────────────────────────────────────
// Canonical full-card fallbacks for page and section async states.
/**
 * Renders a canonical full-card fallback for empty, not-found, auth,
 * transient, and partial-resource states.
 * @param root0 - Async-state rendering options.
 * @param root0.kind - Product fallback category.
 * @param root0.title - Optional title override.
 * @param root0.body - Optional body override.
 * @param root0.actionLabel - Optional primary action label.
 * @param root0.onAction - Optional primary action handler.
 * @param root0.attrs - Element attributes for the card.
 * @returns Rendered DOM node.
 */
export function AsyncStateCard({
  kind = "transient",
  title,
  body,
  actionLabel,
  onAction,
  attrs = {},
}: AsyncStateCardOptions = {}): HTMLElement {
  const defaults = ASYNC_STATE_DEFAULTS[kind] ?? ASYNC_STATE_DEFAULTS.transient;
  const cls =
    `ab-async-state ab-async-state--${kind} ${attrs.class ?? ""}`.trim();
  const action =
    actionLabel && onAction
      ? Button({
          variant: "neutral",
          onClick: onAction,
          children: actionLabel,
          attrs: { class: "ab-async-state-action" },
        })
      : null;

  return SectionCard({
    title: title ?? defaults.title,
    attrs: { ...attrs, class: cls },
    body: [
      EmptyText({
        children: body ?? defaults.body,
        attrs: { class: "ab-async-state-body" },
      }),
      action,
    ],
  });
}

// ─── ChipRow ──────────────────────────────────────────────────
// Horizontal flex of EntityChip elements.
//   { firms?, teams?, advisors? }  (each an array of entities)
/**
 * Renders mentioned firms, teams, and advisors as a compact chip row.
 * @param root0 - Card rendering options.
 * @param root0.firms - Firm chip payloads to render first.
 * @param root0.teams - Team chip payloads to render after firms.
 * @param root0.advisors - Advisor rows to evaluate.
 * @returns Rendered DOM node.
 */
export function ChipRow({
  firms = [],
  teams = [],
  advisors = [],
}: ChipRowOptions = {}): HTMLElement | null {
  if (!firms.length && !teams.length && !advisors.length) return null;
  return el(
    "div",
    { class: "chip-row" },
    ...firms.map(EntityChip),
    ...teams.map(EntityChip),
    ...advisors.map(EntityChip)
  );
}

// ─── EntityList ───────────────────────────────────────────────
// `<div class="entity-list">` wrapping a list of EntityRow nodes
// (or any pre-built rows). Returns an EmptyText node when empty.
/**
 * Wraps entity rows and supplies optional empty-state copy.
 * @param root0 - Card rendering options.
 * @param root0.rows - Rows to transform or search.
 * @param root0.empty - Empty-state copy when no rows exist.
 * @returns Rendered DOM node.
 */
export function EntityList({
  rows,
  empty,
}: EntityListOptions = {}): HTMLElement | null {
  if (!rows || !rows.length) {
    return empty != null ? EmptyText({ children: empty }) : null;
  }
  return el("div", { class: "entity-list" }, ...rows);
}

// ─── ProfileHead ──────────────────────────────────────────────
// Cover gradient + circular avatar + title + subtitle + tags.
// The marquee block at the top of every profile page.
//
//   { initialsText, imageUrl?, title, subtitle?, tags?: [{kind?, label}] }
/**
 * Renders the profile masthead with avatar, title, subtitle, and tags.
 * @param root0 - Card rendering options.
 * @param root0.initialsText - Avatar fallback initials.
 * @param root0.imageUrl - Optional avatar image URL.
 * @param root0.title - Primary display title.
 * @param root0.headingLevel - Semantic heading level for the title.
 * @param root0.subtitle - Secondary profile context.
 * @param root0.tags - Badge labels shown below the title.
 * @returns Rendered DOM node.
 */
export function ProfileHead({
  initialsText,
  imageUrl,
  title,
  headingLevel = 1,
  subtitle,
  tags = [],
}: ProfileHeadOptions = {}): HTMLElement {
  return Card({
    children: [
      el("div", { class: "profile-cover" }),
      el(
        "div",
        { class: "profile-head" },
        Avatar({
          initials: initialsText,
          imageUrl,
          alt: title,
          size: "lg",
          tone: "profile",
          attrs: { class: "profile-avatar" },
        }),
        el(
          "div",
          { class: "profile-title" },
          Heading({ level: headingLevel, children: title ?? "" }),
          subtitle ? el("div", { class: "subtitle" }, subtitle) : null,
          tags.length
            ? el(
                "div",
                { class: "profile-meta" },
                ...tags.map(t =>
                  Tag({ kind: t.kind ?? "default", children: t.label })
                )
              )
            : null
        )
      ),
    ],
  });
}

// ─── SiteFooter ───────────────────────────────────────────────
/**
 * Renders the shared footer with source attribution.
 * @returns Rendered DOM node.
 */
export function SiteFooter(): HTMLElement {
  return el(
    "footer",
    { class: "site-footer" },
    "Sourced from AdvisorHub, FINRA BrokerCheck & firm bios · running on Harper · ",
    el(
      "a",
      {
        href: "https://github.com/CodySwannGT/advisory-rankings",
        target: "_blank",
        rel: "noreferrer",
      },
      "source"
    ),
    " · ",
    el("span", { class: "site-version" }, `v${APP_VERSION}`)
  );
}

// ─── ScrollableTable ──────────────────────────────────────────
// Wraps a wide table in a horizontally-scrollable container so it
// doesn't blow out the layout on narrow viewports.
/**
 * Wraps wide tables so narrow viewports can scroll horizontally.
 * @param table - Harper table name.
 * @returns Rendered DOM node.
 */
export function ScrollableTable(table: DomChild): HTMLElement {
  return el("div", { class: "snap-table-scroll" }, table);
}

// ─── SkeletonCard ─────────────────────────────────────────────
// A card stuffed with skeleton bars — shown while the feed loads.
/**
 * Renders a feed-loading skeleton using fixed shimmer rows.
 * @returns Rendered DOM node.
 */
export function SkeletonCard(): HTMLElement {
  return Card({
    children: el(
      "div",
      { class: "card-body" },
      Skeleton({ width: "60%", height: 18 }),
      Skeleton(),
      Skeleton({ width: "80%" }),
      Skeleton({ width: "70%" })
    ),
  });
}

// ─── BrowseCard (left rail "Browse" navigation card) ──────────
/**
 * Renders the left-rail browse navigation card.
 * @param root0 - Card rendering options.
 * @param root0.items - Navigation row configs.
 * @returns Rendered DOM node.
 */
export function BrowseCard({ items }: BrowseCardOptions): HTMLElement {
  return SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: CARD_SUBTITLE_CLASS },
        children: "Browse",
      }),
      EntityList({
        rows: items.map(it => NavRow(it)),
      }),
    ],
  });
}

// ─── RollupCard (small list card for rails) ───────────────────
//   { title, rows, renderRow: (row) => { name, sub?, avatar? } }
/**
 * Renders a compact rail card for related entities.
 * @param root0 - Card rendering options.
 * @param root0.title - Primary display title.
 * @param root0.rows - Rows to transform or search.
 * @param root0.renderRow - Adapter that converts a record into row display config.
 * @returns Rendered DOM node.
 */
export function RollupCard<Row>({
  title,
  rows,
  renderRow,
}: RollupCardOptions<Row>): HTMLElement {
  if (!rows || !rows.length) return el("div");
  return SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: CARD_SUBTITLE_CLASS },
        children: title,
      }),
      EntityList({
        rows: rows.map(r => {
          const cfg = renderRow(r);
          return EntityRow({
            avatar: cfg.avatar ?? el("div", { class: "avatar" }, "→"),
            name: cfg.name,
            sub: cfg.sub,
            tail: cfg.tail,
            href: cfg.href,
          });
        }),
      }),
    ],
  });
}

// ─── DetailsCard (rail card with a title + KvList) ────────────
//   { title, pairs: [['Label', value], …] }
/**
 * Renders key-value profile details in a rail card.
 * @param root0 - Card rendering options.
 * @param root0.title - Primary display title.
 * @param root0.pairs - Label/value pairs for the details list.
 * @returns Rendered DOM node.
 */
export function DetailsCard({ title, pairs }: DetailsCardOptions): HTMLElement {
  return SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: CARD_SUBTITLE_CLASS },
        children: title,
      }),
      KvList(pairs),
    ],
  });
}

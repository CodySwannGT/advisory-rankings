// AdvisorBook · Atomic Design — MOLECULES
//
// A molecule is a small composition of atoms that performs one
// concrete UI job (a labeled input, an avatar + name + sub line,
// a chip representing an entity, etc.). Molecules import only
// from atoms.js + dom.js. They never reach into organisms or
// pages.
//
// New composed-but-still-small components go here. Search this
// file before adding a new one.
// See docs/design-system.md.

import { el } from "./dom.js";
import type { DomAttrs, DomAttrValue, DomChild } from "./dom.js";
import { Avatar, Tag, Icon, TextInput, FormLabel } from "./atoms.js";
import { entityPath } from "../urls.js";
import type { EntityLike } from "../urls.js";

/** Entity kinds the chip / arrow helpers route through {@link entityPath}. */
type EntityChipKind = "firm" | "team" | "advisor";

/** Optional, narrow scalar values used by several molecule options. */
type OptionalScalar = string | number | null | undefined;

/** Leaf child accepted by atom APIs that only take a single `Child`. */
type LeafChild = Node | string | number | boolean | null;

/** Entity payload accepted by {@link EntityChip}. */
export interface EntityChipEntity extends EntityLike {
  readonly kind: EntityChipKind;
  readonly firm?: EntityLike | null;
  readonly hq?: string | null;
}

/** Options accepted by {@link PostHeader}. */
export interface PostHeaderOptions {
  readonly initials?: OptionalScalar;
  readonly source?: string | null;
  readonly authors?: readonly string[] | null;
  readonly when?: OptionalScalar;
  readonly category?: OptionalScalar;
  readonly attrs?: DomAttrs;
}

/** Avatar argument accepted by {@link EntityRow}. */
type EntityRowAvatar = string | Node | null | undefined;

/** Options accepted by {@link EntityRow}. */
export interface EntityRowOptions {
  readonly avatar?: EntityRowAvatar;
  readonly name?: DomChild;
  readonly sub?: DomChild;
  readonly tail?: DomChild;
  readonly href?: string | null;
  readonly extras?: readonly DomChild[];
  readonly attrs?: DomAttrs;
}

/** Value half of one {@link KvList} pair. */
type KvListValue = string | number | boolean | Node | null | undefined;

/** Single label/value pair accepted by {@link KvList}. */
export type KvListPair = readonly [DomChild, KvListValue];

/** Options accepted by {@link DealStrip}. */
export interface DealStripOptions {
  readonly deal?: DealStripPayload | null;
  readonly fmtPct?: ((pct: number) => string) | null;
}

/** Deal payload rendered by {@link DealStrip}. */
export interface DealStripPayload {
  readonly upfrontPctT12?: number | null;
  readonly producerTier?: string | null;
  readonly backendMetrics?: string | null;
}

/** Options accepted by {@link EventStat}. */
export interface EventStatOptions {
  readonly value?: OptionalScalar;
  readonly label?: DomChild;
}

/** Options accepted by {@link NavRow}. */
export interface NavRowOptions {
  readonly label?: DomChild;
  readonly icon?: DomChild;
  readonly href?: string | null;
  readonly active?: boolean;
}

/**
 * Options accepted by {@link LabeledField}. Restricted to the leaf shape
 * because the underlying `FormLabel` atom accepts a single `Child`, not the
 * recursive `DomChild` arrays the rest of this module deals with.
 */
export interface LabeledFieldOptions {
  readonly label?: LeafChild;
  readonly input?: LeafChild;
}

/** Options accepted by {@link FirmArrow}. */
export interface FirmArrowOptions {
  readonly fromFirm?: EntityLike | null;
  readonly toFirm?: EntityLike | null;
}

/** Single value accepted inside the {@link SanctionPill} bit list. */
type SanctionPillBit = string | number | null | undefined;

/** Argument accepted by {@link SanctionPill}: a single bit or array of bits. */
export type SanctionPillBits = SanctionPillBit | readonly SanctionPillBit[];

// ─── EntityChip ───────────────────────────────────────────────
// A pill linking to a firm / team / advisor. Used in the chip-row
// under feed posts and at the top of profile pages.
//
//   entity = { kind: 'firm'|'team'|'advisor', id, name, short?, firm?, hq? }
/**
 * Handles entity chip for this workflow.
 * @param entity - Entity payload used for URL construction.
 * @returns The computed chip, or null when no entity is supplied.
 */
export function EntityChip(
  entity: EntityChipEntity | null | undefined
): HTMLElement | null {
  if (!entity) return null;
  const href = entityPath(entity.kind, entity);
  const label = entity.short || entity.name || entity.id || "";
  const sub = entityChipSub(entity);
  return el(
    "a",
    { href, class: `chip ${entity.kind}` },
    el("span", { class: "chip-kind" }, entity.kind),
    label,
    sub ? el("span", { class: "chip-sub" }, `· ${sub}`) : null
  );
}

/**
 * Resolves the chip sub-line for the {@link EntityChip} payload.
 * @param entity - Entity payload used for URL construction.
 * @returns Sub-line text, or null when there is no useful sub.
 */
function entityChipSub(entity: EntityChipEntity): string | null {
  if ((entity.kind === "advisor" || entity.kind === "team") && entity.firm)
    return entity.firm.short || entity.firm.name || null;
  if (entity.kind === "firm" && entity.hq) return entity.hq;
  return null;
}

// ─── PostHeader ───────────────────────────────────────────────
// Avatar + source line + when/category line. Used by feed cards
// and the article-detail header.
//
//   { initials: 'AH', source: 'AdvisorHub', authors?: [...], when?: '3d ago', category?: 'recruiting' }
//
// Defaults are intentionally neutral — every real caller derives
// `source` + `initials` from `articleSource(article)` (see app.js).
// If you see "?" / "External" in the UI, a caller forgot to wire them.
/**
 * Handles post header for this workflow.
 * @param root0 - Post header rendering options.
 * @param root0.initials - Avatar initials shown when no image is supplied.
 * @param root0.source - Publisher / source name shown next to the avatar.
 * @param root0.authors - Optional list of author names.
 * @param root0.when - Optional time / date label.
 * @param root0.category - Optional category label.
 * @param root0.attrs - Element attributes.
 * @returns Rendered post header node.
 */
export function PostHeader({
  initials = "?",
  source = "External",
  authors,
  when,
  category,
  attrs = {},
}: PostHeaderOptions = {}): HTMLElement {
  const meta = [when, readableMeta(category)].filter(isUsefulMeta).join(" · ");
  return el(
    "div",
    { ...attrs, class: `post-header ${classOf(attrs)}`.trim() },
    Avatar({
      initials,
      size: "md",
      tone: "brand",
      attrs: { class: "post-avatar" },
    }),
    el(
      "div",
      { class: "post-meta" },
      el(
        "span",
        { class: "src" },
        source,
        authors && authors.length
          ? el(
              "span",
              { style: "color:var(--ab-color-text-muted); font-weight: 400;" },
              ` · ${authors.join(", ")}`
            )
          : null
      ),
      meta ? el("span", { class: "when" }, meta) : null
    )
  );
}

/**
 * Checks whether the value is useful meta.
 * @param value - Raw value to normalize or parse.
 * @returns True when the condition is met.
 */
function isUsefulMeta(value: unknown): boolean {
  if (value == null || value === "") return false;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  return !["unknown", "n/a", "na", "none", "null", "undefined"].includes(text);
}

/**
 * Converts machine-readable metadata into visible reader copy.
 * @param value - Raw metadata value.
 * @returns Human-readable metadata text.
 */
function readableMeta(value: OptionalScalar): string {
  const text = String(value ?? "").trim();
  if (text.includes(" ")) return text;
  return text
    .replace(/_+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

// ─── EntityRow ────────────────────────────────────────────────
// Avatar + body (name + sub) + tail. The unit row used inside
// any `.entity-list` (firm rosters, team members, browse list,
// trending firms, recent disclosures, etc.).
//
//   { avatar: <node|string>, name, sub?, tail?, href?, extras? }
//   - avatar: pass a string → wrapped in default avatar; or pass
//             a pre-built node (Avatar / Icon) for full control.
//   - href:   if provided, the row is wrapped in an <a>.
//   - extras: array of nodes appended inside .body after .sub.
/**
 * Handles entity row for this workflow.
 * @param root0 - Entity row rendering options.
 * @param root0.avatar - Avatar string or pre-built node.
 * @param root0.name - Display name or option name.
 * @param root0.sub - Optional sub-line under the name.
 * @param root0.tail - Optional trailing node(s) on the right side.
 * @param root0.href - Optional href that wraps the row in an `<a>`.
 * @param root0.extras - Extra nodes appended after the sub-line.
 * @param root0.attrs - Element attributes.
 * @returns Rendered entity row node.
 */
export function EntityRow({
  avatar,
  name,
  sub,
  tail,
  href,
  extras = [],
  attrs = {},
}: EntityRowOptions = {}): HTMLElement {
  const avatarNode: Node =
    typeof avatar === "string"
      ? el("div", { class: "avatar" }, avatar)
      : avatar || el("div", { class: "avatar" }, "?");
  const row = el(
    "div",
    { ...attrs, class: `row ${classOf(attrs)}`.trim() },
    avatarNode,
    el(
      "div",
      { class: "body" },
      name != null ? el("div", { class: "name" }, name) : null,
      sub ? el("div", { class: "sub" }, sub) : null,
      ...extras
    ),
    tail != null ? el("div", { class: "tail" }, ...arrify(tail)) : null
  );
  if (href) {
    return el("a", { href, style: "text-decoration:none;color:inherit;" }, row);
  }
  return row;
}

// ─── KvList (definition-list of label / value pairs) ──────────
// Used in the right rail "details" cards. Pairs whose value is
// null / '' / false are skipped automatically.
//
//   pairs: [['Channel', 'wirehouse'], ['Founded', 1935], …]
/**
 * Handles kv list for this workflow.
 * @param pairs - Label/value pairs to render as `<dt>`/`<dd>` siblings.
 * @param attrs - Element attributes for the `<dl>` wrapper.
 * @returns Rendered definition-list node.
 */
export function KvList(
  pairs: readonly KvListPair[],
  attrs: DomAttrs = {}
): HTMLElement {
  const cls = `kvs ${classOf(attrs)}`.trim();
  return el(
    "dl",
    { ...attrs, class: cls },
    ...pairs.flatMap<DomChild>(([label, value]) => {
      if (
        value == null ||
        value === "" ||
        value === false ||
        isUsefulMeta(value) === false
      )
        return [];
      return [el("dt", {}, label), el("dd", {}, kvDisplayValue(value))];
    })
  );
}

/**
 * Normalizes a KvList value into a renderable DOM child.
 * @param value - Pair value previously filtered for emptiness.
 * @returns DOM node when the value is already a node, otherwise its string form.
 */
function kvDisplayValue(value: KvListValue): DomChild {
  if (value instanceof Node) return value;
  return String(value);
}

// ─── SanctionPill ─────────────────────────────────────────────
// Small red-tinted pill used inside DisclosureCard.
//   bits: array of strings to join with " · "
/**
 * Handles sanction pill for this workflow.
 * @param bits - One value or an array of values to join with " · ".
 * @returns Rendered sanction pill node.
 */
export function SanctionPill(bits: SanctionPillBits): HTMLElement {
  const list: readonly SanctionPillBit[] = Array.isArray(bits) ? bits : [bits];
  const text = list.filter(Boolean).join(" · ");
  return el("span", { class: "sanction-pill" }, text);
}

// ─── DealStrip ────────────────────────────────────────────────
// Dashed-top strip used at the bottom of TransitionEventCard to
// render a recruiting deal summary.
//
//   deal = { upfrontPctT12?, producerTier?, backendMetrics? }
/**
 * Handles deal strip for this workflow.
 * @param root0 - Deal strip rendering options.
 * @param root0.deal - Recruiting deal payload.
 * @param root0.fmtPct - Percentage formatter supplied by the page.
 * @returns Rendered deal strip node, or null when no deal is supplied.
 */
export function DealStrip({
  deal,
  fmtPct,
}: DealStripOptions = {}): HTMLElement | null {
  if (!deal) return null;
  const upfront = deal.upfrontPctT12;
  const upfrontText =
    upfront != null && fmtPct != null ? fmtPct(upfront) : null;
  return el(
    "div",
    { class: "deal-strip" },
    "Recruiting deal: ",
    upfrontText != null ? el("strong", {}, upfrontText) : null,
    upfrontText != null ? " upfront on T-12 · " : "",
    deal.producerTier ? `tier: ${formatInlineLabel(deal.producerTier)}` : "",
    deal.backendMetrics ? ` · ${deal.backendMetrics}` : ""
  );
}

// ─── EventStat (a single key statistic in an event card) ──────
//   { value: '$1.2B', label: 'AUM moved' }
/**
 * Handles event stat for this workflow.
 * @param root0 - Event-stat rendering options.
 * @param root0.value - Pre-formatted statistic value.
 * @param root0.label - Human-readable check label.
 * @returns Rendered stat cell, or null when no value is supplied.
 */
export function EventStat({
  value,
  label,
}: EventStatOptions): HTMLElement | null {
  if (value == null || value === "") return null;
  return el("div", { class: "stat" }, el("strong", {}, value), label);
}

// ─── NavRow (icon + label pseudo-link in the left-rail Browse) ─
/**
 * Handles nav row for this workflow.
 * @param root0 - Nav-row rendering options.
 * @param root0.label - Human-readable check label.
 * @param root0.icon - Design-system icon or legacy glyph shown inside the row avatar.
 * @param root0.href - Optional href.
 * @param root0.active - Whether the linked destination is the current page.
 * @returns Rendered nav row node.
 */
export function NavRow({
  label,
  icon,
  href,
  active,
}: NavRowOptions): HTMLElement {
  const row = EntityRow({
    avatar: el("div", { class: "avatar" }, navIcon(icon)),
    name: label,
    attrs: { class: active ? "active" : null },
  });
  if (!href) return row;
  return el(
    "a",
    {
      href,
      style: "text-decoration:none;color:inherit;",
      "aria-current": active ? "page" : null,
    },
    row
  );
}

/**
 * Normalizes nav icons so Browse rows use the design-system icon atom.
 * @param icon - Icon node or legacy scalar fallback.
 * @returns Icon child for the nav-row avatar.
 */
function navIcon(icon: DomChild): DomChild {
  if (icon instanceof Node) return icon;
  if (icon == null || typeof icon === "boolean") return "";
  return Icon({ char: String(icon) });
}

// ─── LabeledField (form field with a stacked label) ───────────
// Used by the login form. `input` should be created with TextInput.
/**
 * Handles labeled field for this workflow.
 * @param root0 - Labeled-field rendering options.
 * @param root0.label - Human-readable check label.
 * @param root0.input - Pre-built input control node.
 * @returns Rendered labeled field node.
 */
export function LabeledField({
  label,
  input,
}: LabeledFieldOptions): HTMLElement {
  return FormLabel({ label, control: input });
}

// ─── FirmArrow (from-firm → to-firm header for transitions) ───
/**
 * Handles firm arrow for this workflow.
 * @param root0 - Firm-arrow rendering options.
 * @param root0.fromFirm - Firm the advisor is leaving.
 * @param root0.toFirm - Firm the advisor is joining.
 * @returns Rendered firm arrow node.
 */
export function FirmArrow({ fromFirm, toFirm }: FirmArrowOptions): HTMLElement {
  return el(
    "span",
    { class: "firm-arrow" },
    fromFirm
      ? el(
          "a",
          { href: entityPath("firm", fromFirm) },
          fromFirm.short || fromFirm.name || ""
        )
      : "?",
    el("span", { class: "arrow" }, "→"),
    toFirm
      ? el(
          "a",
          { href: entityPath("firm", toFirm) },
          toFirm.short || toFirm.name || ""
        )
      : "?"
  );
}

// ─── Internal helpers ─────────────────────────────────────────
/**
 * Normalizes optional tail/extras values into an array for `el`.
 * @param x - Possible DOM node, primitive, or array of children.
 * @returns A flat child array ready to spread into `el`.
 */
function arrify(x: DomChild): readonly DomChild[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Reads an attribute bag's `class` value as a string for safe concatenation.
 * @param attrs - Attribute bag forwarded to a DOM helper.
 * @returns Existing class string, or an empty string when none is set.
 */
function classOf(attrs: DomAttrs): string {
  const raw: DomAttrValue = attrs.class;
  return typeof raw === "string" ? raw : "";
}

/**
 * Formats enum-ish values into compact labels for inline UI metadata.
 * @param value - Raw value to normalize or parse.
 * @returns Human-readable label, or null when the input is blank.
 */
function formatInlineLabel(value: OptionalScalar): string | null {
  if (value == null || value === "") return null;
  return String(value)
    .replace(/_+/g, " ")
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Re-export atoms used at the molecule layer for ergonomic imports.
export { Avatar, Tag, Icon, TextInput };

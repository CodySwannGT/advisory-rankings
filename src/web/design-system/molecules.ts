// @ts-nocheck
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
import { Avatar, Tag, Icon, TextInput, FormLabel } from "./atoms.js";
import { entityPath } from "../urls.js";

// ─── EntityChip ───────────────────────────────────────────────
// A pill linking to a firm / team / advisor. Used in the chip-row
// under feed posts and at the top of profile pages.
//
//   entity = { kind: 'firm'|'team'|'advisor', id, name, short?, firm?, hq? }
/**
 * Handles entity chip for this workflow.
 * @param entity - Entity payload used for URL construction.
 * @returns The computed value.
 */
export function EntityChip(entity) {
  if (!entity) return null;
  const href = entityPath(entity.kind, entity);
  const label = entity.short || entity.name || entity.id;
  const sub = entityChipSub(entity);
  return el(
    "a",
    { href, class: `chip ${entity.kind}` },
    el("span", { class: "chip-kind" }, entity.kind),
    label,
    sub ? el("span", { class: "chip-sub" }, `· ${sub}`) : null
  );
}

const entityChipSub = entity => {
  if ((entity.kind === "advisor" || entity.kind === "team") && entity.firm)
    return entity.firm.short || entity.firm.name;
  if (entity.kind === "firm" && entity.hq) return entity.hq;
  return null;
};

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
 * @param root0 - value used by this operation.
 * @param root0.initials - initials used by this operation.
 * @param root0.source - source used by this operation.
 * @param root0.authors - authors used by this operation.
 * @param root0.when - when used by this operation.
 * @param root0.category - category used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function PostHeader({
  initials = "?",
  source = "External",
  authors,
  when,
  category,
  attrs = {},
} = {}) {
  const meta = [when, category].filter(isUsefulMeta).join(" · ");
  return el(
    "div",
    { ...attrs, class: `post-header ${attrs.class || ""}`.trim() },
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
function isUsefulMeta(value) {
  if (value == null || value === "") return false;
  const text = String(value).trim().toLowerCase();
  return (
    text &&
    !["unknown", "n/a", "na", "none", "null", "undefined"].includes(text)
  );
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
 * @param root0 - value used by this operation.
 * @param root0.avatar - avatar used by this operation.
 * @param root0.name - Display name or option name.
 * @param root0.sub - sub used by this operation.
 * @param root0.tail - tail used by this operation.
 * @param root0.href - href used by this operation.
 * @param root0.extras - extras used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function EntityRow({
  avatar,
  name,
  sub,
  tail,
  href,
  extras = [],
  attrs = {},
} = {}) {
  const avatarNode =
    typeof avatar === "string"
      ? el("div", { class: "avatar" }, avatar)
      : avatar || el("div", { class: "avatar" }, "?");
  const row = el(
    "div",
    { ...attrs, class: `row ${attrs.class || ""}`.trim() },
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
 * @param pairs - pairs used by this operation.
 * @param attrs - Element attributes.
 * @returns The computed value.
 */
export function KvList(pairs, attrs = {}) {
  const cls = `kvs ${attrs.class || ""}`.trim();
  return el(
    "dl",
    { ...attrs, class: cls },
    ...pairs.flatMap(([label, value]) => {
      if (
        value == null ||
        value === "" ||
        value === false ||
        isUsefulMeta(value) === false
      )
        return [];
      return [
        el("dt", {}, label),
        el("dd", {}, typeof value === "object" ? value : String(value)),
      ];
    })
  );
}

// ─── SanctionPill ─────────────────────────────────────────────
// Small red-tinted pill used inside DisclosureCard.
//   bits: array of strings to join with " · "
/**
 * Handles sanction pill for this workflow.
 * @param bits - bits used by this operation.
 * @returns The computed value.
 */
export function SanctionPill(bits) {
  const text = (Array.isArray(bits) ? bits : [bits])
    .filter(Boolean)
    .join(" · ");
  return el("span", { class: "sanction-pill" }, text);
}

// ─── DealStrip ────────────────────────────────────────────────
// Dashed-top strip used at the bottom of TransitionEventCard to
// render a recruiting deal summary.
//
//   deal = { upfrontPctT12?, producerTier?, backendMetrics? }
/**
 * Handles deal strip for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.deal - deal used by this operation.
 * @param root0.fmtPct - fmt pct used by this operation.
 * @returns The computed value.
 */
export function DealStrip({ deal, fmtPct } = {}) {
  if (!deal) return null;
  return el(
    "div",
    { class: "deal-strip" },
    "Recruiting deal: ",
    deal.upfrontPctT12 != null
      ? el("strong", {}, fmtPct(deal.upfrontPctT12))
      : null,
    deal.upfrontPctT12 != null ? " upfront on T-12 · " : "",
    deal.producerTier ? `tier: ${formatInlineLabel(deal.producerTier)}` : "",
    deal.backendMetrics ? ` · ${deal.backendMetrics}` : ""
  );
}

// ─── EventStat (a single key statistic in an event card) ──────
//   { value: '$1.2B', label: 'AUM moved' }
/**
 * Handles event stat for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.value - Raw value to normalize or parse.
 * @param root0.label - Human-readable check label.
 * @returns The computed value.
 */
export function EventStat({ value, label }) {
  if (value == null || value === "") return null;
  return el("div", { class: "stat" }, el("strong", {}, value), label);
}

// ─── NavRow (icon + label pseudo-link in the left-rail Browse) ─
/**
 * Handles nav row for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.label - Human-readable check label.
 * @param root0.icon - icon used by this operation.
 * @param root0.href - href used by this operation.
 * @returns The computed value.
 */
export function NavRow({ label, icon, href }) {
  return EntityRow({
    avatar: el("div", { class: "avatar" }, icon),
    name: label,
    href,
  });
}

// ─── LabeledField (form field with a stacked label) ───────────
// Used by the login form. `input` should be created with TextInput.
/**
 * Handles labeled field for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.label - Human-readable check label.
 * @param root0.input - value used by this operation.
 * @returns The computed value.
 */
export function LabeledField({ label, input }) {
  return FormLabel({ label, control: input });
}

// ─── FirmArrow (from-firm → to-firm header for transitions) ───
/**
 * Handles firm arrow for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.fromFirm - from firm used by this operation.
 * @param root0.toFirm - to firm used by this operation.
 * @returns The computed value.
 */
export function FirmArrow({ fromFirm, toFirm }) {
  return el(
    "span",
    { class: "firm-arrow" },
    fromFirm
      ? el(
          "a",
          { href: entityPath("firm", fromFirm) },
          fromFirm.short || fromFirm.name
        )
      : "?",
    el("span", { class: "arrow" }, "→"),
    toFirm
      ? el(
          "a",
          { href: entityPath("firm", toFirm) },
          toFirm.short || toFirm.name
        )
      : "?"
  );
}

// ─── Internal helper ──────────────────────────────────────────
/**
 * Handles arrify for this workflow.
 * @param x - Possible DOM node.
 * @returns The computed value.
 */
function arrify(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Formats enum-ish values into compact labels for inline UI metadata.
 * @param value - Raw value to normalize or parse.
 * @returns Human-readable label, or null when the input is blank.
 */
function formatInlineLabel(value) {
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

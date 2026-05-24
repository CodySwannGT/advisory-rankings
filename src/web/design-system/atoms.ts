// @ts-nocheck
// AdvisorBook · Atomic Design — ATOMS
//
// The smallest UI building blocks. An atom maps to a single HTML
// element (with sensible defaults + variants). Atoms must NOT
// import from molecules.js or organisms.js — keep the dependency
// arrow pointing one way.
//
// New atoms go here. Before adding, search this file first for
// something that already covers the use case.
// See docs/design-system.md.

import { el } from "./dom.js";

// ─── Button ───────────────────────────────────────────────────
// Variants:
//   "primary"  — filled brand button (login, primary submit)
//   "neutral"  — pill button used in the navbar "me-spot" (sign in / out)
//   "ghost"    — transparent (used for nav burger)
/**
 * Handles button for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.variant - variant used by this operation.
 * @param root0.type - type used by this operation.
 * @param root0.onClick - on click used by this operation.
 * @param root0.children - Child nodes or text values.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function Button({
  variant = "neutral",
  type = "button",
  onClick,
  children,
  attrs = {},
} = {}) {
  const cls = `ab-btn ab-btn--${variant}${attrs.class ? ` ${attrs.class}` : ""}`;
  return el(
    "button",
    { ...attrs, type, class: cls, onClick },
    ...arrify(children)
  );
}

// ─── Avatar ───────────────────────────────────────────────────
// Sizes: "sm" (32px row avatar), "md" (40px feed-post avatar), "lg" (104px profile).
// Tones: "brand" (filled blue), "advisor" (warm tint), "neutral" (default).
/**
 * Handles avatar for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.initials - initials used by this operation.
 * @param root0.imageUrl - image url used by this operation.
 * @param root0.alt - alt used by this operation.
 * @param root0.size - size used by this operation.
 * @param root0.tone - tone used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function Avatar({
  initials,
  imageUrl,
  alt,
  size = "sm",
  tone = "neutral",
  attrs = {},
} = {}) {
  const cls = `ab-avatar ab-avatar--${size} ab-avatar--${tone}${imageUrl ? " ab-avatar--image" : ""}${attrs.class ? ` ${attrs.class}` : ""}`;
  const fallback = String(initials ?? "?");
  if (!imageUrl) return el("div", { ...attrs, class: cls }, fallback);
  const img = el("img", {
    src: imageUrl,
    alt: alt || fallback,
    loading: "lazy",
    decoding: "async",
    onError: event => showAvatarFallback(event.currentTarget, fallback),
    onLoad: event => {
      if (event.currentTarget.naturalWidth === 0)
        showAvatarFallback(event.currentTarget, fallback);
    },
  });
  watchAvatarImageLoad(img, fallback);
  return el("div", { ...attrs, class: cls }, img);
}

// ─── Tag ──────────────────────────────────────────────────────
// Tiny inline label. Kinds: "default" | "danger" | "warn" | "ok".
// Emits both `.ab-tag .ab-tag--<kind>` (new) and the legacy
// `.tag .<kind>` so existing CSS (`.profile-head .tag`,
// `.event-card .tag`, etc.) and selectors keep working.
/**
 * Handles tag for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.kind - Entity kind.
 * @param root0.children - Child nodes or text values.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function Tag({ kind = "default", children, attrs = {} } = {}) {
  const legacy = kind === "default" ? "tag" : `tag ${kind}`;
  const cls = `${legacy} ab-tag ab-tag--${kind}${attrs.class ? ` ${attrs.class}` : ""}`;
  return el("span", { ...attrs, class: cls }, ...arrify(children));
}

// ─── Skeleton (loading placeholder) ───────────────────────────
/**
 * Handles skeleton for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.width - width used by this operation.
 * @param root0.height - height used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function Skeleton({ width, height, attrs = {} } = {}) {
  const style = [
    attrs.style || "",
    width ? `width: ${typeof width === "number" ? `${width}px` : width};` : "",
    height
      ? `height: ${typeof height === "number" ? `${height}px` : height};`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return el("div", {
    ...attrs,
    class: `ab-skeleton ${attrs.class || ""}`.trim(),
    style,
  });
}

// ─── EmptyText ────────────────────────────────────────────────
// Italic muted "no data yet" text. Used inside cards and lists.
// Emits both `.ab-empty` (new) and legacy `.empty` so the
// pre-existing `.empty` CSS rule keeps applying everywhere.
/**
 * Handles empty text for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.children - Child nodes or text values.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function EmptyText({ children, attrs = {} } = {}) {
  const cls = `empty ab-empty ${attrs.class || ""}`.trim();
  return el("div", { ...attrs, class: cls }, ...arrify(children));
}

// ─── Inline status ────────────────────────────────────────────
// Compact async feedback for inline regions such as search,
// pagination, and rail refreshes. Use AsyncStateCard for full-card
// fallbacks.
/**
 * Renders compact loading, empty, or error feedback inside an existing region.
 * @param root0 - Inline status rendering options.
 * @param root0.kind - Status role.
 * @param root0.children - Human-readable status copy.
 * @param root0.attrs - Element attributes.
 * @returns Rendered DOM node.
 */
export function InlineStatus({
  kind = "loading",
  children = "Loading...",
  attrs = {},
} = {}) {
  const cls =
    `ab-inline-status ab-inline-status--${kind} ${attrs.class || ""}`.trim();
  const role = kind === "error" ? "alert" : "status";
  const ariaLive = kind === "loading" ? "polite" : undefined;
  return el(
    "div",
    { ...attrs, class: cls, role, "aria-live": attrs["aria-live"] || ariaLive },
    ...arrify(children)
  );
}

// ─── Heading ──────────────────────────────────────────────────
// Use for card titles / subtitles. Levels 1-3 supported.
//   level 1 → page hero headline (.ab-heading-1)
//   level 2 → card title (.ab-heading-2)
//   level 3 → small uppercase eyebrow / card subtitle (.ab-heading-3)
/**
 * Handles heading for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.level - level used by this operation.
 * @param root0.children - Child nodes or text values.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function Heading({ level = 2, children, attrs = {} } = {}) {
  const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const cls = `ab-heading ab-heading-${level}${attrs.class ? ` ${attrs.class}` : ""}`;
  return el(tag, { ...attrs, class: cls }, ...arrify(children));
}

// ─── Text input ───────────────────────────────────────────────
// Single-line input. The `attrs` object is forwarded to the DOM,
// so callers pass `type`, `name`, `required`, `placeholder`, etc.
/**
 * Handles text input for this workflow.
 * @param attrs - Element attributes.
 * @returns The computed value.
 */
export function TextInput(attrs = {}) {
  const cls = `ab-input ${attrs.class || ""}`.trim();
  return el("input", { ...attrs, class: cls });
}

// ─── FormLabel (block-level label wrapping a control) ─────────
/**
 * Handles form label for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.label - Human-readable check label.
 * @param root0.control - control used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function FormLabel({ label, control, attrs = {} } = {}) {
  const cls = `ab-form-label ${attrs.class || ""}`.trim();
  return el("label", { ...attrs, class: cls }, label, control);
}

// ─── Icon glyph ───────────────────────────────────────────────
// Tiny single-character icon used in nav rows / row avatars.
// Accepts either an emoji or a 1–2 letter abbreviation (e.g. "AH").
/**
 * Handles icon for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.char - char used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function Icon({ char, attrs = {} } = {}) {
  const cls = `ab-icon ${attrs.class || ""}`.trim();
  return el("span", { ...attrs, class: cls }, String(char ?? ""));
}

// ─── SourceAttribution ────────────────────────────────────────
// Footer line crediting an external data source. Appears under
// any section whose facts came from outside our own extraction
// (e.g. FINRA BrokerCheck — which has a hard ToU requirement that
// publishers identify the source, link to the ToU, and disclose
// when the data was compiled).
//
// Usage:
//   SourceAttribution({
//     source: 'FINRA BrokerCheck',
//     url: 'https://brokercheck.finra.org',
//     termsUrl: 'https://brokercheck.finra.org/terms',
//     fetchedAt: '2026-05-02T12:30:00Z',
//   })
//
// Renders as:
//   Source: FINRA BrokerCheck (as of May 2, 2026). Terms of use.
/**
 * Handles source attribution for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.source - source used by this operation.
 * @param root0.url - URL to request or normalize.
 * @param root0.termsUrl - terms url used by this operation.
 * @param root0.fetchedAt - fetched at used by this operation.
 * @param root0.attrs - Element attributes.
 * @returns The computed value.
 */
export function SourceAttribution({
  source,
  url,
  termsUrl,
  fetchedAt,
  attrs = {},
} = {}) {
  const cls = `ab-source-attr ${attrs.class || ""}`.trim();
  const sourceNode = url
    ? el(
        "a",
        { href: url, target: "_blank", rel: "noopener noreferrer" },
        source || ""
      )
    : source || "";
  const d = fetchedAt ? new Date(fetchedAt) : null;
  const asOf =
    d && !isNaN(d)
      ? d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;
  const termsNodes = termsUrl
    ? [
        el(
          "a",
          { href: termsUrl, target: "_blank", rel: "noopener noreferrer" },
          "Terms of use"
        ),
        ".",
      ]
    : [];
  const children = [
    "Source: ",
    sourceNode,
    asOf ? ` (as of ${asOf})` : "",
    ". ",
    ...termsNodes,
  ];
  return el("div", { ...attrs, class: cls }, ...children);
}

// ─── Internal helper ──────────────────────────────────────────
/**
 * Handles arrify for this workflow.
 * @param x - Possible DOM node.
 * @returns A flat child-node array for the DOM builder.
 */
function arrify(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Handles show avatar fallback for this workflow.
 * @param img - Image element.
 * @param fallback - Fallback value when no explicit value is supplied.
 */
function showAvatarFallback(img, fallback) {
  const avatar = img.parentElement;
  if (!avatar) return;
  avatar.classList.remove("ab-avatar--image");
  Object.assign(avatar, { textContent: fallback });
}

/**
 * Replaces broken lazy-loaded avatar images with initials.
 * @param img - Image element.
 * @param fallback - Fallback value when no explicit value is supplied.
 */
function watchAvatarImageLoad(img, fallback) {
  setTimeout(() => {
    if (!img.isConnected || !img.parentElement) return;
    if (!img.complete || img.naturalWidth === 0)
      showAvatarFallback(img, fallback);
  }, 4000);
}

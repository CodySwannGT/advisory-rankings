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

import { el } from './dom.js';

// ─── Button ───────────────────────────────────────────────────
// Variants:
//   "primary"  — filled brand button (login, primary submit)
//   "neutral"  — pill button used in the navbar "me-spot" (sign in / out)
//   "ghost"    — transparent (used for nav burger)
export function Button({ variant = 'neutral', type = 'button', onClick, children, attrs = {} } = {}) {
	const cls = `ab-btn ab-btn--${variant}` + (attrs.class ? ` ${attrs.class}` : '');
	return el('button', { ...attrs, type, class: cls, onClick }, ...arrify(children));
}

// ─── Avatar ───────────────────────────────────────────────────
// Sizes: "sm" (32px row avatar), "md" (40px feed-post avatar), "lg" (104px profile).
// Tones: "brand" (filled blue), "advisor" (warm tint), "neutral" (default).
export function Avatar({ initials, size = 'sm', tone = 'neutral', attrs = {} } = {}) {
	const cls = `ab-avatar ab-avatar--${size} ab-avatar--${tone}` + (attrs.class ? ` ${attrs.class}` : '');
	return el('div', { ...attrs, class: cls }, String(initials ?? '?'));
}

// ─── Tag ──────────────────────────────────────────────────────
// Tiny inline label. Kinds: "default" | "danger" | "warn" | "ok".
// Emits both `.ab-tag .ab-tag--<kind>` (new) and the legacy
// `.tag .<kind>` so existing CSS (`.profile-head .tag`,
// `.event-card .tag`, etc.) and selectors keep working.
export function Tag({ kind = 'default', children, attrs = {} } = {}) {
	const legacy = kind === 'default' ? 'tag' : `tag ${kind}`;
	const cls = `${legacy} ab-tag ab-tag--${kind}` + (attrs.class ? ` ${attrs.class}` : '');
	return el('span', { ...attrs, class: cls }, ...arrify(children));
}

// ─── Skeleton (loading placeholder) ───────────────────────────
export function Skeleton({ width, height, attrs = {} } = {}) {
	const style = [
		attrs.style || '',
		width ? `width: ${typeof width === 'number' ? width + 'px' : width};` : '',
		height ? `height: ${typeof height === 'number' ? height + 'px' : height};` : '',
	].filter(Boolean).join(' ');
	return el('div', { ...attrs, class: `ab-skeleton ${attrs.class || ''}`.trim(), style });
}

// ─── EmptyText ────────────────────────────────────────────────
// Italic muted "no data yet" text. Used inside cards and lists.
// Emits both `.ab-empty` (new) and legacy `.empty` so the
// pre-existing `.empty` CSS rule keeps applying everywhere.
export function EmptyText({ children, attrs = {} } = {}) {
	const cls = `empty ab-empty ${attrs.class || ''}`.trim();
	return el('div', { ...attrs, class: cls }, ...arrify(children));
}

// ─── Heading ──────────────────────────────────────────────────
// Use for card titles / subtitles. Levels 1-3 supported.
//   level 1 → page hero headline (.ab-heading-1)
//   level 2 → card title (.ab-heading-2)
//   level 3 → small uppercase eyebrow / card subtitle (.ab-heading-3)
export function Heading({ level = 2, children, attrs = {} } = {}) {
	const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
	const cls = `ab-heading ab-heading-${level}` + (attrs.class ? ` ${attrs.class}` : '');
	return el(tag, { ...attrs, class: cls }, ...arrify(children));
}

// ─── Text input ───────────────────────────────────────────────
// Single-line input. The `attrs` object is forwarded to the DOM,
// so callers pass `type`, `name`, `required`, `placeholder`, etc.
export function TextInput(attrs = {}) {
	const cls = `ab-input ${attrs.class || ''}`.trim();
	return el('input', { ...attrs, class: cls });
}

// ─── FormLabel (block-level label wrapping a control) ─────────
export function FormLabel({ label, control, attrs = {} } = {}) {
	const cls = `ab-form-label ${attrs.class || ''}`.trim();
	return el('label', { ...attrs, class: cls }, label, control);
}

// ─── Icon glyph ───────────────────────────────────────────────
// Tiny single-character icon used in nav rows / row avatars.
// Accepts either an emoji or a 1–2 letter abbreviation (e.g. "AH").
export function Icon({ char, attrs = {} } = {}) {
	const cls = `ab-icon ${attrs.class || ''}`.trim();
	return el('span', { ...attrs, class: cls }, String(char ?? ''));
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
export function SourceAttribution({ source, url, termsUrl, fetchedAt, attrs = {} } = {}) {
	const cls = `ab-source-attr ${attrs.class || ''}`.trim();
	const children = ['Source: '];
	if (url) {
		children.push(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, source || ''));
	} else {
		children.push(source || '');
	}
	if (fetchedAt) {
		const d = new Date(fetchedAt);
		const asOf = isNaN(d) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
		if (asOf) children.push(' (as of ' + asOf + ')');
	}
	children.push('. ');
	if (termsUrl) {
		children.push(el('a', { href: termsUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Terms of use'));
		children.push('.');
	}
	return el('div', { ...attrs, class: cls }, ...children);
}

// ─── Internal helper ──────────────────────────────────────────
function arrify(x) {
	if (x == null) return [];
	return Array.isArray(x) ? x : [x];
}

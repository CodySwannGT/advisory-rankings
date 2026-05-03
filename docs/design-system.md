# AdvisorBook design system

This document is the operational reference for the AdvisorBook UI
component library. It follows Brad Frost's **Atomic Design**
methodology — the UI is composed from five tiers of building
blocks (tokens → atoms → molecules → organisms → templates), and
every page is assembled from those blocks. No page-level file
should be hand-rolling chrome, cards, or rows.

> **Agent rule** — before touching anything visual, search this
> document and the `harper-app/web/design-system/` files for an
> existing component that fits. If none does, add a new one at
> the right tier *before* you build the feature, then consume it
> from the page. This rule is enforced in `CLAUDE.md`.

---

## 1. Why we use Atomic Design

The mental model: every UI is a composition of five increasingly
complex tiers.

| Tier | Maps to | Example |
|---|---|---|
| **Tokens** | CSS custom properties | `--ab-color-brand`, `--ab-space-4` |
| **Atoms** | Single HTML element with variants | `Button`, `Avatar`, `Tag` |
| **Molecules** | Small group of atoms doing one job | `EntityChip`, `EntityRow`, `KvList` |
| **Organisms** | Self-contained UI section | `Navbar`, `ProfileHead`, `FeedPostCard` |
| **Templates** | Page shells that arrange organisms | `mountThreeColumnPage` |

Imports are unidirectional: tokens are referenced everywhere,
atoms import nothing else from the system, molecules import only
atoms, organisms import atoms + molecules, templates import any
of the above. **Pages import from `design-system/index.js` only.**

This is the same model described in
<https://atomicdesign.bradfrost.com/chapter-2/>. We chose it
because the UI is data-dense and most components recur on three
or more pages — a flat "shared utilities" approach was already
producing copy-paste between `firm.js`, `advisor.js`, `team.js`.

---

## 2. File layout

```
harper-app/web/
  app.css                       legacy + page-level styles. Imports
                                tokens.css and components.css at the top
                                so design-system styles always load
                                first.
  app.js                        non-UI utilities (api, formatters,
                                auth state, mountPage shim) plus
                                back-compat re-exports of legacy
                                names. Pages MUST get UI from
                                ./design-system/index.js, not from here.

  design-system/
    tokens.css                  CSS custom properties for color,
                                spacing, radius, shadow, type. The
                                only place raw hex / px values live.
    components.css              styles for the .ab-* class names
                                emitted by atoms.js. New atom CSS
                                belongs here.
    dom.js                      el() / $() / clear() — the lowest
                                hyperscript helpers. Dependency-free.
    atoms.js                    Button, Avatar, Tag, Skeleton,
                                EmptyText, Heading, TextInput,
                                FormLabel, Icon
    molecules.js                EntityChip, PostHeader, EntityRow,
                                KvList, SanctionPill, DealStrip,
                                EventStat, NavRow, LabeledField,
                                FirmArrow
    organisms.js                Card, SectionCard, EmptyCard,
                                ChipRow, EntityList, ProfileHead,
                                Navbar, SiteFooter,
                                TransitionEventCard,
                                DisclosureEventCard,
                                ArticleListBlock, FeedPostCard,
                                CareerTimeline, SnapshotTable,
                                ScrollableTable,
                                SkeletonCard, BrowseCard,
                                RollupCard, DetailsCard
    templates.js                mountThreeColumnPage,
                                mountFullWidthPage,
                                mountCenteredNarrowPage
    index.js                    barrel export — every page imports
                                from here
```

---

## 3. Tokens (`design-system/tokens.css`)

Every visual constant lives here. **Add new design values here
first** — never inline hex codes or pixel literals into a stylesheet
or a `style=` attribute.

Naming convention: `--ab-<category>-<name>`.

| Category | Examples | When to add |
|---|---|---|
| `--ab-color-*` | `--ab-color-brand`, `--ab-color-danger`, `--ab-color-chip-firm-bg` | New surface / role color |
| `--ab-space-*` | `--ab-space-1` (4px) … `--ab-space-8` (32px) | Padding / margin / gap |
| `--ab-radius-*` | `sm` 4px, `md` 8px, `lg` 10px, `pill` 999px | Corner rounding |
| `--ab-shadow-*` | `sm`, `drawer` | Elevation |
| `--ab-font-*` | `--ab-font-stack`, `--ab-font-size-base`, `--ab-font-weight-bold` | Typography |
| `--ab-bp-*` | `mobile` 700px, `tablet` 1100px | Breakpoints (used in media queries) |
| `--ab-z-*` | `nav`, `scrim`, `drawer` | z-index layers |

For backward compatibility a small block of legacy aliases
(`--bg`, `--card`, `--brand`, …) is exported at the bottom of
`tokens.css`. **Do not add new uses of those.** New code must
reference `--ab-*` names directly.

---

## 4. Atoms (`design-system/atoms.js`)

Each atom maps to a single DOM element with variants. Atoms do
not own state and do not fetch.

### Catalog

| Component | Signature (named-arg object) | Notes |
|---|---|---|
| `Button` | `{ variant, type, onClick, children, attrs }` | Variants: `primary`, `neutral`, `ghost`. |
| `Avatar` | `{ initials, size, tone, attrs }` | `size`: `sm` (32) / `md` (40) / `lg` (104). `tone`: `brand`, `advisor`, `neutral`, `profile`. |
| `Tag` | `{ kind, children, attrs }` | `kind`: `default`, `danger`, `warn`, `ok`. |
| `Skeleton` | `{ width, height, attrs }` | Loading shimmer. |
| `EmptyText` | `{ children, attrs }` | Italic muted "no data" text. |
| `Heading` | `{ level, children, attrs }` | Levels 1–3 mapped to `h1`/`h2`/`h3` with consistent type sizes. |
| `TextInput` | `(attrs)` | Pass-through to `<input>`. |
| `FormLabel` | `{ label, control, attrs }` | Block-level label wrapping a control. |
| `Icon` | `{ char, attrs }` | Single emoji or 1–2 letter glyph. |
| `SourceAttribution` | `{ source, url, termsUrl, fetchedAt, attrs }` | Footer line crediting an external data source. Renders `Source: <a>FINRA BrokerCheck</a> (as of <date>). <a>Terms of use</a>.` Required by FINRA BrokerCheck's ToU under any section that surfaces regulator-of-record facts. |

### CSS

Atoms use `.ab-*` class names defined in
`design-system/components.css`. Variants compose:

```html
<button class="ab-btn ab-btn--primary">Sign in</button>
<div class="ab-avatar ab-avatar--md ab-avatar--brand">AH</div>
<span class="ab-tag ab-tag--danger">terminated</span>
```

If you need a new variant: add the modifier class to
`components.css`, plumb a `variant` / `tone` / `kind` value
through the JS, and document it in this table.

---

## 5. Molecules (`design-system/molecules.js`)

Composed from atoms; each does one concrete job.

| Component | Job |
|---|---|
| `EntityChip(entity)` | Pill linking to `firm.html` / `team.html` / `advisor.html`. |
| `PostHeader({ initials, source, authors, when, category })` | Avatar + source line + when/category line for feed cards and article headers. |
| `EntityRow({ avatar, name, sub, tail, href, extras })` | The unit row for any `.entity-list` (rosters, members, browse, trending, …). Wrap in `<a>` if `href` is given. |
| `KvList(pairs)` | Definition-list of `[label, value]` pairs. Skips null / '' / false. |
| `SanctionPill(bits)` | Red-tinted pill used in `DisclosureEventCard`. |
| `DealStrip({ deal, fmtPct })` | Dashed-top recruiting-deal strip on `TransitionEventCard`. |
| `EventStat({ value, label })` | One value-with-caption stat in an event card. |
| `NavRow({ label, icon, href })` | Left-rail Browse list row. |
| `LabeledField({ label, input })` | Form field with stacked label. |
| `FirmArrow({ fromFirm, toFirm })` | "Morgan Stanley → Wells Fargo" header on transitions. |

The class-name conventions for molecules currently match the
original markup (`.chip`, `.row`, `.kvs`, `.firm-arrow`, …) so
the legacy CSS in `app.css` continues to apply. New molecules
should adopt `.ab-*` names if they require new styles.

---

## 6. Organisms (`design-system/organisms.js`)

Self-contained UI sections.

| Component | Used on |
|---|---|
| `Card({ children, attrs })` | Every white surface. |
| `SectionCard({ title, body, attrs })` | The most common container — title + padded body. The `card-title` is a sibling of `.card-body` (not a child) so page code that re-renders by clearing `.card-body` keeps the title. |
| `EmptyCard({ title, body })` | Error / empty-state shorthand. |
| `ChipRow({ firms, teams, advisors })` | Mentioned-entities row under feed posts. |
| `EntityList({ rows, empty })` | Wraps a list of `EntityRow`s in `.entity-list`. |
| `Paginated({ fetchPage, renderRow, empty, onTotal })` | Cursor-paginated list with infinite scroll (IntersectionObserver) plus a "Load more" button fallback. `fetchPage(cursor)` must resolve to `{ items, nextCursor, total? }`. Used by the `advisors.html` directory and the `Current/Past advisors` cards on the firm profile (`/PublicAdvisors`, `/FirmAdvisors/<id>`). |
| `ProfileHead({ initialsText, title, subtitle, tags })` | Cover gradient + avatar + title block — top of every profile page. |
| `Navbar({ active, refreshMe, logout })` | Sticky top nav. Caller injects `refreshMe` / `logout` from `app.js`. |
| `SiteFooter()` | Footer with source link. |
| `TransitionEventCard(t, fmts)` | Green-bordered event card for a `TransitionEvent`. |
| `DisclosureEventCard(d, fmts)` | Red-bordered event card for a `Disclosure`. |
| `ArticleListBlock({ articles, fmtDate })` | "Coverage" list on every profile page. |
| `FeedPostCard(item, fmts)` | A whole article rendered as a Facebook-style post. |
| `CareerTimeline({ career, fmtDate })` | Vertical timeline on advisor profile. |
| `SnapshotTable({ snaps, fmtMoney, humanize })` | Team metric history. Wrapped in `ScrollableTable` so it scrolls horizontally on narrow viewports. |
| `ScrollableTable(table)` | Wraps a wide `<table>` (e.g. provenance, snapshots) in a horizontally-scrollable container so it doesn't blow out a card on mobile. |
| `SkeletonCard()` | Loading placeholder. |
| `BrowseCard({ items })` | Left-rail Browse navigation. |
| `RollupCard({ title, rows, renderRow })` | Small rail card listing items. |
| `DetailsCard({ title, pairs })` | Right-rail details card (KvList inside SectionCard). |

`fmts = { fmtMoney, fmtPct, fmtDate, humanize }` is exported from
`app.js` and threaded through to organisms that need to format
values. This keeps organisms locale- and project-agnostic.

`humanize(s)` turns a raw enum identifier (`firm_internal`,
`closed_no_action`, `vehicleType`, `OutsideBusinessActivity`)
into a sentence-cased, space-separated label. All-uppercase
tokens (FINRA, SEC, LLC, TX) and already-spaced strings pass
through unchanged so we don't mangle acronyms. Use it anywhere
the UI would otherwise render a snake_case / camelCase /
PascalCase value straight from the database.

---

## 7. Templates (`design-system/templates.js`)

Templates own the global chrome (Navbar + footer + grid) and hand
the page back populated rail elements.

| Template | Layout | Build args |
|---|---|---|
| `mountThreeColumnPage` | Three-column grid (left rail / center / right rail). Rails collapse on tablet / mobile. | `{ left, center, right, layout }` |
| `mountFullWidthPage` | Single full-width column. Used by directory pages. | `{ center, layout }` |
| `mountCenteredNarrowPage` | Single narrow centered column. Used by login. | `{ center, layout }`; accepts `maxWidth`. |

All three accept `{ active, refreshMe, logout, build }`. Caller
imports `refreshMe` and `logout` from `app.js` and passes them in
— this keeps templates decoupled from the network layer.

```js
import { api, refreshMe, logout } from './app.js';
import { mountThreeColumnPage, SectionCard } from './design-system/index.js';

mountThreeColumnPage({
	active: 'firms',
	refreshMe, logout,
	build({ center, right }) {
		// populate center / right
	},
});
```

The legacy `mountPage({ active, build(layout) })` from `app.js`
still works for older callers — it forwards to
`mountThreeColumnPage` and exposes `layout` (the grid root) to
the build callback.

---

## 8. How to add a new component

1. **Decide the tier.** Single element with variants → atom.
   Composition of 2–3 atoms → molecule. Self-contained section
   with internal layout → organism. Page shell → template.

2. **Search first.** Open `design-system/{atoms,molecules,organisms}.js`
   and grep for adjacent functionality before creating a new
   component. If there's a near-match, extend the existing one
   with a new variant rather than duplicating it.

3. **Add the JS export** to the file for that tier. Use a named
   `export function`, take a single named-arg object, and accept
   an `attrs = {}` object for forwarding extra DOM attributes
   (class merging, style, aria-*).

4. **Add the styles** (only if needed). Define a new
   `.ab-<name>` class in `design-system/components.css`. Use
   `--ab-*` tokens — never raw hex / px. If you need a new token,
   add it to `tokens.css` first.

5. **Re-export** the component from `design-system/index.js` so
   pages can import it from the barrel.

6. **Update this doc** — add a row to the catalog table for the
   tier you used. (`CLAUDE.md` enforces this in the
   "Concrete triggers" list.)

7. **Use it** from the page. Inline markup that the new
   component now covers should be replaced.

---

## 9. Anti-patterns

These are the things that this library exists to prevent.

- **Inline `el('div', { class: 'card' }, …)` in a page file.**
  Use `Card`, `SectionCard`, or `EmptyCard`. If none fit, the
  fix is a new organism, not a one-off `el` call.
- **Inline `el('div', { class: 'row' }, el('div', { class: 'avatar' }, …))`.**
  Use `EntityRow`. The `.entity-list .row` markup is now an
  implementation detail of `EntityRow`.
- **Raw hex colors / px sizes** in stylesheets or `style=`
  attributes. Reference a `--ab-*` token. If the value isn't in
  the system, add it.
- **A new top-level CSS class without a token tier.** Don't add
  `.firm-card-special-blue` directly; either reuse an existing
  atom variant or add a new variant + token.
- **Direct imports from `molecules.js` or `organisms.js`** in
  page files. Always go through `design-system/index.js`. (The
  internal cross-tier imports are fine *inside* the system.)
- **Hand-rolling navigation chrome** in a page. Use one of the
  three `mount*Page` templates.

---

## 10. Migration status

The pages have been migrated to the system:

| Page | Template | Notable organisms used |
|---|---|---|
| `index.html` | `mountThreeColumnPage` | `FeedPostCard`, `BrowseCard`, `RollupCard`, `EntityRow`, `SectionCard` |
| `advisor.html` | `mountThreeColumnPage` | `ProfileHead`, `CareerTimeline`, `EntityList`, `DisclosureEventCard`, `TransitionEventCard`, `ArticleListBlock`, `DetailsCard` |
| `firm.html` | `mountThreeColumnPage` | `ProfileHead`, `EntityList`, `TransitionEventCard`, `DisclosureEventCard`, `ArticleListBlock`, `DetailsCard` |
| `team.html` | `mountThreeColumnPage` | `ProfileHead`, `EntityList`, `SnapshotTable`, `TransitionEventCard`, `ArticleListBlock`, `DetailsCard` |
| `article.html` | `mountThreeColumnPage` | `PostHeader`, `ChipRow`, `TransitionEventCard`, `DisclosureEventCard`, `DetailsCard` |
| `firms.html`, `advisors.html`, `teams.html` | `mountFullWidthPage` | `SectionCard`, `EntityList`, `EntityRow` |
| `login.html` | `mountCenteredNarrowPage` | `SectionCard`, `Button`, `TextInput`, `LabeledField` |

The legacy `app.js` exports (`navbar`, `siteFooter`, `mountPage`,
`profileHead`, `sectionCard`, `articleListBlock`, `transitionRow`,
`disclosureRow`, `entityChip`) are kept as thin shims to the
design-system equivalents so any unmigrated callers keep working.
New code should not use these names.

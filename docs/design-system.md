# AdvisorBook design system

This document is the operational reference for the AdvisorBook UI
component library. It follows Brad Frost's **Atomic Design**
methodology — the UI is composed from five tiers of building
blocks (tokens → atoms → molecules → organisms → templates), and
every page is assembled from those blocks. No page-level file
should be hand-rolling chrome, cards, or rows.

> **Agent rule** — before touching anything visual, search this
> document and the `src/web/design-system/` files for an
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
of the above. **Pages import from `design-system/index.js` only**
at runtime; the source import is `src/web/design-system/index.ts`.

This is the same model described in
<https://atomicdesign.bradfrost.com/chapter-2/>. We chose it
because the UI is data-dense and most components recur on three
or more pages — a flat "shared utilities" approach was already
producing copy-paste between `firm.ts`, `advisor.ts`, `team.ts`.

---

## 2. File layout

```
src/web/
  app.css                       legacy + page-level styles. Imports
                                tokens.css and components.css at the top
                                so design-system styles always load
                                first.
  app.ts                        non-UI utilities (api, formatters,
                                auth state, mountPage shim) plus
                                back-compat re-exports of legacy
                                names. Pages MUST get UI from
                                ./design-system/index.js, not from here.

  design-system/
    tokens.css                  CSS custom properties for color,
                                spacing, radius, shadow, type. The
                                only place raw hex / px values live.
    components.css              styles for the .ab-* class names
                                emitted by atoms.ts. New atom CSS
                                belongs here.
    dom.ts                      el() / $() / clear() — the lowest
                                hyperscript helpers. Dependency-free.
    atoms.ts                    Button, Avatar, Tag, Skeleton,
                                EmptyText, Heading, TextInput,
                                FormLabel, Icon
    molecules.ts                EntityChip, PostHeader, EntityRow,
                                KvList, SanctionPill, DealStrip,
                                EventStat, NavRow, LabeledField,
                                FirmArrow
    organisms.ts                Card, SectionCard, EmptyCard,
                                ChipRow, EntityList, ProfileHead,
                                Navbar, SiteFooter,
                                TransitionEventCard,
                                DisclosureEventCard,
                                ArticleListBlock, FeedPostCard,
                                CareerTimeline, SnapshotTable,
                                ScrollableTable,
                                SkeletonCard, BrowseCard,
                                RollupCard, DetailsCard
    async-states.ts             canonical loading, empty, error,
                                not-found, permission, and
                                partial-resource fallback contract
                                plus reusable state renderers
    templates.ts                mountThreeColumnPage,
                                mountFullWidthPage,
                                mountCenteredNarrowPage
    index.ts                    barrel export — every page imports
                                from here
```

`bun run build` emits the runtime `.js` modules into `harper-app/web/`.
Those generated files are deploy artifacts and are ignored by git.

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
| `--ab-z-*` | `nav`, `scrim`, `drawer`, `popover` | z-index layers |

For backward compatibility a small block of legacy aliases
(`--bg`, `--card`, `--brand`, …) is exported at the bottom of
`tokens.css`. **Do not add new uses of those.** New code must
reference `--ab-*` names directly.

---

## 4. Atoms (`design-system/atoms.ts`)

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
| `InlineStatus` | `{ kind, children, attrs }` | Compact async feedback inside an existing region. `kind`: `loading`, `empty`, `error`. |
| `Heading` | `{ level, children, attrs }` | Levels 1–3 mapped to `h1`/`h2`/`h3` with consistent type sizes. |
| `TextInput` | `(attrs)` | Pass-through to `<input>`. |
| `FormLabel` | `{ label, control, attrs }` | Block-level label wrapping a control. |
| `Icon` | `{ name, char, attrs }` | Prefer named SVG icons from the design-system set; `char` remains only for legacy text fallbacks. |
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

## 5. Molecules (`design-system/molecules.ts`)

Composed from atoms; each does one concrete job.

| Component | Job |
|---|---|
| `EntityChip(entity)` | Pill linking to `/firms/<slug>-<id>` / `/teams/<slug>-<id>` / `/advisors/<slug>-<id>`. |
| `PostHeader({ initials, source, authors, when, category })` | Avatar + source line + when/category line for feed cards and article headers. |
| `EntityRow({ avatar, name, sub, tail, href, extras })` | The unit row for any `.entity-list` (rosters, members, browse, trending, …). Wrap in `<a>` if `href` is given. |
| `KvList(pairs)` | Definition-list of `[label, value]` pairs. Skips null / '' / false. |
| `SanctionPill(bits)` | Red-tinted pill used in `DisclosureEventCard`. |
| `DealStrip({ deal, fmtPct })` | Dashed-top recruiting-deal strip on `TransitionEventCard`. |
| `EventStat({ value, label })` | One value-with-caption stat in an event card. |
| `NavRow({ label, icon, href })` | Left-rail Browse list row. Pass `Icon({ name })` output rather than raw emoji/ASCII glyphs. |
| `LabeledField({ label, input })` | Form field with stacked label. |
| `FirmArrow({ fromFirm, toFirm })` | "Morgan Stanley → Wells Fargo" header on transitions. |

The class-name conventions for molecules currently match the
original markup (`.chip`, `.row`, `.kvs`, `.firm-arrow`, …) so
the legacy CSS in `app.css` continues to apply. New molecules
should adopt `.ab-*` names if they require new styles.

---

## 6. Organisms (`design-system/organisms.ts`)

Self-contained UI sections.

| Component | Used on |
|---|---|
| `Card({ children, attrs })` | Every white surface. |
| `SectionCard({ title, body, attrs })` | The most common container — title + padded body. The `card-title` is a sibling of `.card-body` (not a child) so page code that re-renders by clearing `.card-body` keeps the title. |
| `EmptyCard({ title, body })` | Error / empty-state shorthand. |
| `AsyncStateCard({ kind, title, body, actionLabel, onAction, attrs })` | Canonical full-card fallback for empty, not-found, permission/auth, transient, and partial-resource states. Use optional `actionLabel` / `onAction` for retry or sign-in actions. |
| `ChipRow({ firms, teams, advisors })` | Mentioned-entities row under feed posts. |
| `EntityList({ rows, empty })` | Wraps a list of `EntityRow`s in `.entity-list`. |
| `Paginated({ fetchPage, renderRow, empty, onTotal })` | Cursor-paginated list with infinite scroll (IntersectionObserver) plus a "Load more" button fallback. `fetchPage(cursor)` must resolve to `{ items, nextCursor, total? }`. Used by the `/advisors`, `/firms`, and `/teams` directories and the `Current/Past advisors` cards on the firm profile (`/PublicAdvisors`, `/PublicFirms`, `/PublicTeams`, `/FirmAdvisors/<id>`). |
| `ProfileHead({ initialsText, title, subtitle, tags })` | Cover gradient + avatar + title block — top of every profile page. |
| `Navbar({ active, refreshMe, logout, search })` | Sticky top nav. Caller injects `refreshMe` / `logout` / `search` from `app.ts`. Shows a safe sign-in fallback when `/Me` fails without blocking public content. At the mobile breakpoint, the drawer collapses behind the hamburger, closes on Escape with `aria-expanded` reset, and the search control wraps to a full-width row so 320px phones keep discovery readable. |
| `GlobalSearch({ search })` | The header search box. Debounced live-suggest against `/Search`, dropdown of firm / advisor / team matches, keyboard navigation (↑ / ↓ / Enter / Esc), click-outside to close. `search(q)` is injected (defaults to a no-op if omitted) so the organism doesn't reach into the REST layer. Mounted by `Navbar` — pages should never instantiate it directly. |
| `SiteFooter()` | Footer with source link and package version. |
| `TransitionEventCard(t, fmts)` | Green-bordered event card for a `TransitionEvent`. |
| `DisclosureEventCard(d, fmts)` | Red-bordered event card for a `Disclosure`. |
| `articleEvidenceMap(article, resources)` | Article detail evidence brief. Groups public `ArticleView` rows into connected entities, extracted facts, event signals, source status, and next-step links while preserving limitation copy for missing public evidence. |
| `ArticleListBlock({ articles, fmtDate, articleSource })` | "Coverage" list on every profile page. Pass `articleSource` from `app.ts` so non-AdvisorHub sources (firm bios, Barron's, …) get the right initials and "Source →" label. |
| `FeedPostCard(item, fmts)` | A whole article rendered as a Facebook-style post. Reads `fmts.articleSource(article)` for the publisher chip + footer CTA, so a Morgan Stanley firm-bio post renders as "MS · Morgan Stanley" / "Read original on Morgan Stanley →" instead of falling back to "AH · AdvisorHub". |
| `CareerTimeline({ career, fmtDate })` | Vertical timeline on advisor profile. |
| `teamContinuityCard({ currentMembers, pastMembers, metricSnapshots, transitions, articles })` | Team profile continuity timeline. Renders public roster, metric snapshot, transition, and article evidence rows from `GET /TeamProfile/<id>`, including source-confidence copy, missing-date/evidence limitations, public advisor/firm/article links when available, and explicit private-data exclusions. |
| `SnapshotTable({ snaps, fmtMoney, humanize })` | Team metric history. Wrapped in `ScrollableTable` so it scrolls horizontally on narrow viewports. |
| `ScrollableTable(table)` | Wraps a wide `<table>` (e.g. provenance, snapshots) in a horizontally-scrollable container so it doesn't blow out a card on mobile. |
| `SkeletonCard()` | Loading placeholder. |
| `BrowseCard({ items })` | Left-rail Browse navigation. Public pages should use `primaryBrowseItems(active)` / `primaryBrowseCard(active)` so Home and interior rails stay identical, the current route gets `aria-current="page"`, and analyst-only links remain role-gated. |
| `RollupCard({ title, rows, renderRow })` | Small rail card listing items. |
| `DetailsCard({ title, pairs })` | Right-rail details card (KvList inside SectionCard). |

## 7. Async State Patterns

Every async route or section must render one of the canonical
state patterns from `src/web/design-system/index.ts`. Pages import
the helpers from the runtime barrel:

```js
import {
	AsyncStateNotice,
	LoadingState,
	resolveAsyncStateFallback,
} from './design-system/index.js';
```

Do not import `async-states.ts` directly from page code. The
barrel export keeps page imports stable when the internal tier
changes.

### Canonical Fallback Contract

`ASYNC_STATE_FALLBACKS` preserves PRD #141's behavior table. Route
code may refine the displayed title, body, or action label for a
specific surface, but must not change the message intent, primary
action, or retry rule.

| Failure type | Design-system kind | Message intent | Primary action | Retry rule | Required treatment |
|---|---|---|---|---|---|
| Loading | `loading` | Content is loading. | Wait for the request to resolve | None | Use skeletons that reserve final layout space. |
| Transient network or server failure | `error` | We couldn't load this right now. | Retry the failed request | Required | Keep the user on the current surface and preserve surrounding layout. |
| Empty data response | `empty` | No results are available yet. | Refresh or adjust search/filter if one exists | Optional refresh only | Empty is not an error; use empty-state styling, not error styling. |
| Not-found data | `notFound` | This item could not be found. | Return to the feed or previous navigable surface | Never retry | Do not loop retry for stable not-found responses. |
| Permission/auth failure | `permission` | You don't have access to this content. Sign in again to continue. | Sign in again or return to a safe surface | No automatic retry | Do not expose internal authorization details. |
| Partial related-resource failure | `partial` | Some details couldn't be loaded. | Retry the affected section when practical | Retry failed section only | Preserve loaded content and isolate the failed region. |

### Loading Guidance

Use `LoadingState({ surface, rows })` while a request is pending.
`surface: 'list'` is for feed and directory rows, `surface:
'detail'` is for profile/article pages, and `surface: 'inline'`
is for small async regions where full skeleton cards would be
noisy. Feed/list and detail/profile/article surfaces should use
skeleton rows or section-level skeleton blocks sized to the final
content layout so resolution does not shift the page.

### Non-loading Guidance

Use `AsyncStateNotice({ kind, title, body, actionLabel, onAction })`
for `empty`, `error`, `notFound`, `permission`, and `partial`
states. The component annotates the card with
`data-async-state` and `data-retry-rule` so route tests and future
instrumentation can assert behavior without depending on one-off
copy.

Use `resolveAsyncStateFallback(kind, overrides)` when a route needs
to decide behavior before rendering, such as choosing whether to
show a retry button. Overrides are for display copy only; the
canonical `kind`, `primaryAction`, and `retryRule` remain tied to
the PRD fallback.

### Surface Mapping

| Surface type | Loading pattern | Empty/error pattern |
|---|---|---|
| Feed/list surfaces | `LoadingState({ surface: 'list', rows })` or existing `SkeletonCard()` when card-shaped rows match final layout | `AsyncStateNotice({ kind: 'empty' \| 'error' })`; retry only for transient failures. |
| Detail/profile/article surfaces | `LoadingState({ surface: 'detail' })` inside the affected section or stable section skeletons | `notFound` returns to the previous public surface; `error` retries the failed request. |
| Small inline async regions | `LoadingState({ surface: 'inline' })` or compact progress text when skeletons add visual noise | Isolate the affected region; use `partial` if surrounding content loaded. |
| Account/session-dependent regions | Preserve public content and render `permission` in the gated region | Offer sign-in again or a safe public route; never show raw auth/backend details. |

---

`fmts = { fmtMoney, fmtPct, fmtDate, humanize, articleSource }` is
exported from `app.ts` and threaded through to organisms that need
to format values. This keeps organisms locale- and
project-agnostic.

`articleSource(article)` returns
`{ source, initials, ctaLabel }` derived from the article's URL
hostname. AdvisorHub posts → `{ 'AdvisorHub', 'AH', 'Read original
on AdvisorHub →' }`; firm-bio articles minted by the
`upsert-advisor` skill (`advisor.morganstanley.com`,
`fa.wellsfargoadvisors.com`, …) → the firm's name + 2-letter
initials. Unknown hosts fall back to a title-cased hostname.
Hardcoding "AdvisorHub" anywhere in `web/` is a bug — every place
the UI surfaces a publisher must go through this helper.

`humanize(s)` turns a raw enum identifier (`firm_internal`,
`closed_no_action`, `vehicleType`, `OutsideBusinessActivity`)
into a sentence-cased, space-separated label. All-uppercase
tokens (FINRA, SEC, LLC, TX) and already-spaced strings pass
through unchanged so we don't mangle acronyms. Use it anywhere
the UI would otherwise render a snake_case / camelCase /
PascalCase value straight from the database.

### Async-state patterns

Use the smallest component that covers the state. Pages should not
invent one-off loading or error copy when one of these rows applies.

| State | Component | Required copy/action |
|---|---|---|
| Page or card loading | `SkeletonCard()` for feed/detail cards; `InlineStatus({ kind: "loading" })` for rows, search, pagination, and rail refreshes | Do not show explanatory prose while loading. Keep layout stable and replace the skeleton/status when data resolves. |
| Empty collection | `AsyncStateCard({ kind: "empty" })` or `EntityList({ rows, empty })` inside an existing section | Explain that there is no data yet, not that an error happened. Do not offer retry unless the user can change filters or refresh. |
| Not found | `AsyncStateCard({ kind: "not-found" })` | Say the record was not found or may not be loaded. Do not expose raw backend ids unless the route already displays them for debugging. |
| Permission or auth failure | `AsyncStateCard({ kind: "permission", actionLabel: "Sign in", onAction })` for protected pages; navbar uses its built-in sign-in fallback for `/Me` failures | Use safe recovery copy. Never surface raw 401/403 internals in public UI. |
| Transient request failure | `AsyncStateCard({ kind: "transient", actionLabel: "Try again", onAction })` | Primary action retries the same request. Body can include a concise public error label, but not stack traces or internal policy text. |
| Partial-resource failure | `AsyncStateCard({ kind: "partial", actionLabel: "Retry section", onAction })` inside the failed section while keeping the rest of the page visible | Keep successfully loaded profile/feed content in place and scope the failure to the supporting section. |

`AsyncStateCard` owns full-card fallback layout. `InlineStatus`
owns compact feedback in an already framed region. `EmptyCard`
remains available for legacy/simple empty states, but new async
fallbacks should choose an explicit `AsyncStateCard.kind` so copy,
roles, and actions stay consistent across feed, detail, profile,
and inline surfaces.

---

## 8. Templates (`design-system/templates.ts`)

Templates own the global chrome (Navbar + footer + grid) and hand
the page back populated rail elements.

| Template | Layout | Build args |
|---|---|---|
| `mountThreeColumnPage` | Three-column grid (left rail / center / right rail). Rails collapse on tablet / mobile. The left rail starts with the shared Browse card so subpages keep a populated rail even when they only add center/right content. Pass `pageTitle` so the route has exactly one document-level `h1` without changing card titles. | `{ left, center, right, layout }` |
| `mountFullWidthPage` | Single full-width column. Reserve for exceptional utility pages; public content and directory pages should use `mountThreeColumnPage`. Pass `pageTitle` for the route-level `h1`. | `{ center, layout }` |
| `mountCenteredNarrowPage` | Single narrow centered column. Used by login. Pass `pageTitle` for the route-level `h1`. | `{ center, layout }`; accepts `maxWidth`. |

All three accept `{ active, refreshMe, logout, search, pageTitle, build }`.
Caller imports `refreshMe`, `logout`, and `search` from `app.ts`
and passes them in — this keeps templates decoupled from the
network layer. `search` is what powers the navbar's
`GlobalSearch` dropdown; pages that don't pass it get a search
box that does nothing, so always pass it.

```js
import { api, refreshMe, logout, search } from './app.js';
import { mountThreeColumnPage, SectionCard } from './design-system/index.js';

mountThreeColumnPage({
	active: 'firms',
	pageTitle: 'Firm directory',
	refreshMe, logout, search,
	build({ center, right }) {
		// populate center / right
	},
});
```

The legacy `mountPage({ active, build(layout) })` from `app.ts`
still works for older callers — it forwards to
`mountThreeColumnPage` and exposes `layout` (the grid root) to
the build callback. It also forwards `pageTitle` when supplied.

---

## 9. How to add a new component

1. **Decide the tier.** Single element with variants → atom.
   Composition of 2–3 atoms → molecule. Self-contained section
   with internal layout → organism. Page shell → template.

2. **Search first.** Open `src/web/design-system/{atoms,molecules,organisms}.ts`
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

5. **Re-export** the component from `design-system/index.ts` so
   pages can import it from the barrel.

6. **Update this doc** — add a row to the catalog table for the
   tier you used. (`CLAUDE.md` enforces this in the
   "Concrete triggers" list.)

7. **Use it** from the page. Inline markup that the new
   component now covers should be replaced.

---

## 10. Anti-patterns

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
- **Direct imports from `molecules.ts` or `organisms.ts`** in
  page files. Always go through `design-system/index.js`. (The
  internal cross-tier imports are fine *inside* the system.)
- **Direct imports from `async-states.ts`** in page files. Import
  async state helpers through `design-system/index.js` so the
  reusable fallback contract stays centralized.
- **Hand-rolling navigation chrome** in a page. Use one of the
  three `mount*Page` templates.

---

## 11. Migration status

The pages have been migrated to the system:

| Page | Template | Notable organisms used |
|---|---|---|
| `index.html` | `mountThreeColumnPage` | `FeedPostCard`, `BrowseCard`, `RollupCard`, `EntityRow`, `SectionCard` |
| `/advisors/<slug>-<id>` (`advisor.html?id=…`) | `mountThreeColumnPage` | `ProfileHead`, advisor trust checklist, `CareerTimeline`, `EntityList`, `DisclosureEventCard`, `TransitionEventCard`, `ArticleListBlock`, `DetailsCard`, `Tag`, `SourceAttribution` (Career + Licenses + reviewed discrepancy notes cite FINRA BrokerCheck; evidence freshness and fact confidence panels collapse into the center column on mobile) |
| `/firms/<slug>-<id>` (`firm.html?id=…`) | `mountThreeColumnPage` | `ProfileHead`, `EntityList`, `TransitionEventCard`, `DisclosureEventCard`, `ArticleListBlock`, `DetailsCard` |
| `/teams/<slug>-<id>` (`team.html?id=…`) | `mountThreeColumnPage` | `ProfileHead`, `teamContinuityCard`, `EntityList`, `SnapshotTable`, `TransitionEventCard`, `ArticleListBlock`, `DetailsCard` |
| `/articles/<slug>-<id>` (`article.html?id=…`) | `mountThreeColumnPage` | `PostHeader`, `ChipRow`, `articleEvidenceMap`, `TransitionEventCard`, `DisclosureEventCard`, `ScrollableTable`, `DetailsCard` |
| `/firms`, `/advisors`, `/teams` (`*.html`) | `mountThreeColumnPage` | `SectionCard`, `EntityList`, `EntityRow`, `DetailsCard` |
| `/rankings` (`rankings.html`) | `mountThreeColumnPage` | `SectionCard`, `ScrollableTable`, `RollupCard`, `DetailsCard`, `Tag` |
| `/regulatory` (`regulatory.html`) | `mountThreeColumnPage` | `SectionCard`, `DisclosureEventCard`, `DetailsCard` |
| `/corrections` (`correction-inbox.html`) | `mountThreeColumnPage` | `SectionCard`, `DetailsCard`, `Tag`, `Button`, `AsyncStateCard` |
| `/login` | `mountCenteredNarrowPage` | `SectionCard`, `Button`, `TextInput`, `LabeledField` |

The legacy `app.ts` exports (`navbar`, `siteFooter`, `mountPage`,
`profileHead`, `sectionCard`, `articleListBlock`, `transitionRow`,
`disclosureRow`, `entityChip`) are kept as thin shims to the
design-system equivalents so any unmigrated callers keep working.
New code should not use these names.

// @ts-nocheck
// AdvisorBook · Atomic Design — ORGANISMS
//
// Distinct, self-contained UI sections built from atoms +
// molecules. Card containers, the navbar, profile heads, event
// cards, the feed post, list rendering, etc. Organisms may import
// from atoms.js + molecules.js + dom.js. They never import from
// templates.js or page-level files.
//
// Search this file before adding a new section-level component.
// See docs/design-system.md.

import { el, clear } from './dom.js';
import { Avatar, Tag, Icon, EmptyText, Heading, Button } from './atoms.js';
import {
	PostHeader, EntityRow, EntityChip, KvList, SanctionPill,
	DealStrip, EventStat, NavRow, FirmArrow,
} from './molecules.js';
import { articlePath, entityPath } from '../urls.js';

// ─── Card ─────────────────────────────────────────────────────
// White rounded surface with shadow. The base container for
// every section in the center column and rails. Pass `tag: 'article'`
// when rendering an actual article (article-detail head etc.) so the
// element keeps semantic meaning.
export function Card({ tag = 'div', children, attrs = {} } = {}) {
	const cls = `card ${attrs.class || ''}`.trim();
	return el(tag, { ...attrs, class: cls }, ...arrify(children));
}

// ─── SectionCard ──────────────────────────────────────────────
// Card with a padded body and an h2 title. The single most-used
// container in the app.
//
// The title is a sibling of `.card-body`, not a child, so page
// wiring that re-renders by clearing `.card-body` keeps the title
// in place.
export function SectionCard({ title, body, attrs = {} } = {}) {
	return Card({
		attrs,
		children: [
			title ? Heading({ level: 2, attrs: { class: 'card-title' }, children: title }) : null,
			el('div', { class: 'card-body' }, ...arrify(body)),
		],
	});
}

// ─── EmptyCard ────────────────────────────────────────────────
// Common error / empty-state card.
export function EmptyCard({ title, body }) {
	return SectionCard({ title, body: EmptyText({ children: body }) });
}

// ─── ChipRow ──────────────────────────────────────────────────
// Horizontal flex of EntityChip elements.
//   { firms?, teams?, advisors? }  (each an array of entities)
export function ChipRow({ firms = [], teams = [], advisors = [] } = {}) {
	if (!firms.length && !teams.length && !advisors.length) return null;
	return el('div', { class: 'chip-row' },
		...firms.map(EntityChip),
		...teams.map(EntityChip),
		...advisors.map(EntityChip),
	);
}

// ─── EntityList ───────────────────────────────────────────────
// `<div class="entity-list">` wrapping a list of EntityRow nodes
// (or any pre-built rows). Returns an EmptyText node when empty.
export function EntityList({ rows, empty } = {}) {
	if (!rows || !rows.length) {
		return empty != null ? EmptyText({ children: empty }) : null;
	}
	return el('div', { class: 'entity-list' }, ...rows);
}

// ─── Paginated ────────────────────────────────────────────────
// Cursor-paginated list. Auto-loads the next page when a sentinel
// element scrolls into view; falls back to a visible "Load more"
// button so this works without IntersectionObserver and without a
// scrollable viewport (e.g. when fewer rows than fit on screen).
//
//   fetchPage(cursor) → Promise<{ items, nextCursor }>
//   renderRow(item)   → DOM node
//   empty?            → text shown when the very first page is empty
//   onTotal?(n)       → optional callback when first page reports total
//
// Returns a single DOM node. Drop into a SectionCard `body`.
export function Paginated({ fetchPage, renderRow, empty, onTotal } = {}) {
	const list = el('div', { class: 'entity-list' });
	const status = el('div', { class: 'paginated-status', 'aria-live': 'polite' });
	const loadMoreBtn = Button({
		variant: 'neutral',
		attrs: { class: 'paginated-load-more', type: 'button' },
		onClick: () => loadNext(),
		children: 'Load more',
	});
	const sentinel = el('div', { class: 'paginated-sentinel', 'aria-hidden': 'true' });
	const wrap = el('div', { class: 'paginated' }, list, status, loadMoreBtn, sentinel);

	let cursor = null;
	let loading = false;
	let done = false;
	let firstPage = true;

	async function loadNext() {
		if (loading || done) return;
		loading = true;
		loadMoreBtn.disabled = true;
		status.textContent = 'Loading…';
		try {
			const res = await fetchPage(cursor);
			const items = (res && res.items) || [];
			if (firstPage) {
				firstPage = false;
				if (typeof onTotal === 'function' && typeof res?.total === 'number') {
					onTotal(res.total);
				}
				if (!items.length) {
					list.replaceWith(empty != null ? EmptyText({ children: empty }) : el('div'));
					done = true;
					sentinel.remove();
					loadMoreBtn.remove();
					status.textContent = '';
					return;
				}
			}
			for (const it of items) list.appendChild(renderRow(it));
			cursor = res?.nextCursor || null;
			if (!cursor) {
				done = true;
				sentinel.remove();
				loadMoreBtn.remove();
				status.textContent = 'End of list.';
			} else {
				status.textContent = '';
			}
		} catch (err) {
			status.textContent = `Couldn't load more: ${err.message || err}`;
		} finally {
			loading = false;
			loadMoreBtn.disabled = false;
		}
	}

	// IntersectionObserver triggers loads as the sentinel enters the
	// viewport. rootMargin pre-loads ~one viewport early so the user
	// never sees a blank gap mid-scroll.
	if ('IntersectionObserver' in window) {
		const io = new IntersectionObserver((entries) => {
			for (const e of entries) if (e.isIntersecting) loadNext();
		}, { rootMargin: '600px' });
		// Defer attachment to the next microtask so the wrap is in the
		// DOM before we start observing.
		queueMicrotask(() => io.observe(sentinel));
	}

	loadNext();
	return wrap;
}

// ─── ProfileHead ──────────────────────────────────────────────
// Cover gradient + circular avatar + title + subtitle + tags.
// The marquee block at the top of every profile page.
//
//   { initialsText, title, subtitle?, tags?: [{kind?, label}] }
export function ProfileHead({ initialsText, title, subtitle, tags = [] } = {}) {
	return Card({
		children: [
			el('div', { class: 'profile-cover' }),
			el('div', { class: 'profile-head' },
				Avatar({ initials: initialsText, size: 'lg', tone: 'profile', attrs: { class: 'profile-avatar' } }),
				el('div', { class: 'profile-title' },
					Heading({ level: 1, children: title || '' }),
					subtitle ? el('div', { class: 'subtitle' }, subtitle) : null,
					tags.length
						? el('div', { class: 'profile-meta' },
							...tags.map((t) => Tag({ kind: t.kind || 'default', children: t.label })))
						: null,
				),
			),
		],
	});
}

// ─── GlobalSearch ─────────────────────────────────────────────
// Header search box. Debounced live-suggest against /Search,
// dropdown of firm / advisor / team hits, keyboard navigation
// (↑ / ↓ / Enter / Esc), click-outside to close. Wired into
// `Navbar` and used nowhere else, but lives here so it can be
// reused on a future "/search" landing page if we want one.
//
// Caller passes `{ search }`, where `search(q)` returns a
// Promise<{ items, counts }> (the /Search response shape). This
// keeps the organism decoupled from the REST layer.
export function GlobalSearch({ search } = {}) {
	const input = el('input', {
		type: 'search',
		placeholder: 'Search advisors, firms, teams',
		id: 'global-search',
		autocomplete: 'off',
		role: 'combobox',
		'aria-autocomplete': 'list',
		'aria-expanded': 'false',
		'aria-controls': 'global-search-results',
	});
	const dropdown = el('div', {
		class: 'gs-dropdown',
		id: 'global-search-results',
		role: 'listbox',
		hidden: '',
	});
	const wrap = el('label', { class: 'search gs-wrap' }, input, dropdown);

	let activeIndex = -1;
	let lastResults = [];
	let lastQuery = '';
	let debounceTimer = null;
	let inflight = 0;

	function showDropdown() {
		dropdown.removeAttribute('hidden');
		input.setAttribute('aria-expanded', 'true');
	}
	function hideDropdown() {
		dropdown.setAttribute('hidden', '');
		input.setAttribute('aria-expanded', 'false');
		activeIndex = -1;
	}

	function highlight(name, q) {
		if (!q) return name;
		const lower = String(name).toLowerCase();
		const idx = lower.indexOf(q);
		if (idx < 0) return name;
		return [
			name.slice(0, idx),
			el('mark', {}, name.slice(idx, idx + q.length)),
			name.slice(idx + q.length),
		];
	}

	function hrefFor(item) {
		return entityPath(item.kind, item);
	}

	function renderItems(q, items, counts) {
		clear(dropdown);
		lastResults = items;
		activeIndex = -1;
		if (!items.length) {
			dropdown.appendChild(el('div', { class: 'gs-empty' }, `No matches for "${q}".`));
			return;
		}
		items.forEach((it, i) => {
			const row = el('a', {
				class: 'gs-item',
				role: 'option',
				href: hrefFor(it),
				'data-idx': String(i),
			},
				el('span', { class: `gs-kind gs-kind-${it.kind}` }, it.kind),
				el('span', { class: 'gs-name' }, ...arrify(highlight(it.name, q))),
				it.sub ? el('span', { class: 'gs-sub' }, it.sub) : null,
			);
			row.addEventListener('mousemove', () => setActive(i));
			dropdown.appendChild(row);
		});
		if (counts && counts.total > items.length) {
			dropdown.appendChild(el('div', { class: 'gs-more' },
				`Showing ${items.length} of ${counts.total} matches — keep typing to narrow.`));
		}
	}

	function setActive(i) {
		const rows = dropdown.querySelectorAll('.gs-item');
		if (!rows.length) { activeIndex = -1; return; }
		activeIndex = ((i % rows.length) + rows.length) % rows.length;
		rows.forEach((r, j) => r.classList.toggle('gs-item-active', j === activeIndex));
		const row = rows[activeIndex];
		if (row) row.scrollIntoView({ block: 'nearest' });
	}

	async function runSearch(q) {
		if (!search) return;
		const myCall = ++inflight;
		try {
			const res = await search(q);
			// Drop stale responses — only render the most recent call's
			// payload. Without this, slow connections produce a flicker
			// of older results overwriting newer ones.
			if (myCall !== inflight) return;
			renderItems(q, (res && res.items) || [], res && res.counts);
			showDropdown();
		} catch (err) {
			if (myCall !== inflight) return;
			clear(dropdown);
			dropdown.appendChild(el('div', { class: 'gs-empty' },
				`Search failed: ${err && err.message ? err.message : 'unknown error'}`));
			showDropdown();
		}
	}

	input.addEventListener('input', () => {
		const q = input.value.trim().toLowerCase();
		lastQuery = q;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (q.length < 2) {
			hideDropdown();
			clear(dropdown);
			return;
		}
		debounceTimer = setTimeout(() => runSearch(q), 180);
	});

	input.addEventListener('focus', () => {
		if (lastResults.length) showDropdown();
	});

	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (dropdown.hasAttribute('hidden') && lastResults.length) showDropdown();
			setActive(activeIndex < 0 ? 0 : activeIndex + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive(activeIndex < 0 ? lastResults.length - 1 : activeIndex - 1);
		} else if (e.key === 'Enter') {
			const target = activeIndex >= 0 ? lastResults[activeIndex] : lastResults[0];
			if (target) {
				e.preventDefault();
				window.location.href = hrefFor(target);
			}
		} else if (e.key === 'Escape') {
			hideDropdown();
			input.blur();
		}
	});

	// Click-outside to close. We attach to document so any click
	// outside the wrap dismisses; pointerdown so it fires before the
	// click that follows it (which would re-focus the input).
	document.addEventListener('pointerdown', (e) => {
		if (!wrap.contains(e.target)) hideDropdown();
	});

	return wrap;
}

// ─── Navbar ───────────────────────────────────────────────────
// Sticky top nav: logo, search, page links, and the "me-spot"
// (signed-in name + sign-out, or sign-in link). On mobile the
// links + me-spot collapse into a right-side sliding drawer
// behind a hamburger.
//
// Caller passes:
//   { active: 'home'|'firms'|'advisors'|'teams', refreshMe, logout, search? }
// `refreshMe` / `logout` / `search` are injected so this organism
// doesn't hardwire to the API layer.
export function Navbar({ active, refreshMe, logout, search } = {}) {
	const link = (href, label) =>
		el('a', { href, class: active === label.toLowerCase() ? 'active' : null }, label);

	const meSpot = el('div', { class: 'me-spot' }, el('span', { class: 'me-loading' }));
	if (refreshMe) refreshMe().then(renderMe);
	function renderMe(me) {
		clear(meSpot);
		if (me?.authenticated) {
			meSpot.appendChild(el('span', { class: 'me-user', title: me.username }, me.username.split('@')[0]));
			meSpot.appendChild(Button({
				variant: 'neutral',
				attrs: { class: 'me-action' },
				onClick: (e) => { e.preventDefault(); logout && logout(); },
				children: 'Sign out',
			}));
		} else {
			meSpot.appendChild(el('a', { class: 'me-action', href: '/login.html' }, 'Sign in'));
		}
	}

	const links = el('div', { class: 'nav-links' },
		link('/', 'Home'),
		link('/firms', 'Firms'),
		link('/advisors', 'Advisors'),
		link('/teams', 'Teams'),
	);

	const burger = el('button', {
		class: 'nav-burger',
		'aria-label': 'Open menu',
		'aria-expanded': 'false',
		onClick: () => toggleDrawer(),
	}, el('span'), el('span'), el('span'));

	function toggleDrawer(force) {
		const open = force ?? !document.body.classList.contains('drawer-open');
		document.body.classList.toggle('drawer-open', open);
		burger.setAttribute('aria-expanded', String(open));
	}
	links.addEventListener('click', (e) => {
		if (e.target.tagName === 'A' || e.target.closest('a')) toggleDrawer(false);
	});

	const drawer = el('div', { class: 'nav-drawer' }, links, meSpot);
	const scrim = el('div', { class: 'nav-scrim', onClick: () => toggleDrawer(false) });

	return el('nav', { class: 'nav' },
		burger,
		el('div', { class: 'logo' }, el('a', { href: '/' }, 'AdvisorBook')),
		GlobalSearch({ search }),
		drawer,
		scrim,
	);
}

// ─── SiteFooter ───────────────────────────────────────────────
export function SiteFooter() {
	return el('footer', { class: 'site-footer' },
		'Sourced from AdvisorHub, FINRA BrokerCheck & firm bios · running on Harper · ',
		el('a', { href: 'https://github.com/CodySwannGT/advisory-rankings', target: '_blank', rel: 'noreferrer' }, 'source'),
	);
}

// ─── TransitionEventCard ──────────────────────────────────────
// The green-bordered card for a TransitionEvent. Renders firm
// arrow header, key stats, optional deal strip.
//
//   t = transition event card payload, fmts = { fmtMoney, fmtPct, fmtDate }
export function TransitionEventCard(t, fmts = {}) {
	const { fmtMoney, fmtPct, fmtDate } = fmts;
	return el('div', { class: 'event-card transition' },
		el('div', { class: 'event-title' },
			FirmArrow({ fromFirm: t.fromFirm, toFirm: t.toFirm }),
			t.subject ? Tag({ kind: 'default', children: t.subject.kind || 'subject' }) : null,
			t.subject ? el('span', {}, t.subject.name) : null,
			t.isBreakaway ? Tag({ kind: 'warn', children: 'breakaway' }) : null,
			t.isReturn ? Tag({ kind: 'default', children: 'return' }) : null,
		),
		el('div', { class: 'stats' },
			t.aumMoved != null && fmtMoney ? EventStat({ value: fmtMoney(t.aumMoved), label: 'AUM moved' }) : null,
			t.productionT12 != null && fmtMoney ? EventStat({ value: fmtMoney(t.productionT12), label: 'T-12 production' }) : null,
			t.headcountMoved != null ? EventStat({ value: t.headcountMoved, label: 'advisors moved' }) : null,
			t.moveDate && fmtDate ? EventStat({ value: fmtDate(t.moveDate), label: 'move date' }) : null,
		),
		t.deal ? DealStrip({ deal: t.deal, fmtPct }) : null,
	);
}

// ─── DisclosureEventCard ──────────────────────────────────────
// The red-bordered card for a Disclosure. Regulator + status,
// the allegation quote, and stacked SanctionPills.
export function DisclosureEventCard(d, fmts = {}) {
	const { fmtMoney, humanize = (x) => x } = fmts;
	const reg = [humanize(d.regulator), d.regulatorState].filter(Boolean).join(' / ');
	return el('div', { class: 'event-card disclosure' },
		el('div', { class: 'event-title' },
			Tag({ kind: 'danger', children: humanize(d.disclosureType) || 'Disclosure' }),
			reg ? el('span', {}, reg) : null,
			d.status ? Tag({ kind: 'default', children: humanize(d.status) }) : null,
			d.advisor ? el('a', { href: entityPath('advisor', d.advisor) }, d.advisor.name) : null,
		),
		d.allegationText ? el('div', { class: 'allegation' }, '"', d.allegationText, '"') : null,
		(d.sanctions && d.sanctions.length)
			? el('div', { class: 'sanctions-row' },
				...d.sanctions.map((s) => {
					const bits = [humanize(s.sanctionType)];
					if (s.amount && fmtMoney) bits.push(fmtMoney(s.amount));
					if (s.durationMonths) bits.push(`${s.durationMonths}mo`);
					if (s.jurisdiction) bits.push(`(${s.jurisdiction})`);
					return SanctionPill(bits);
				}))
			: null,
		d.awardAmount && fmtMoney ? el('div', { class: 'deal-strip' }, `Award: ${fmtMoney(d.awardAmount)}`) : null,
	);
}

// ─── ArticleListBlock ─────────────────────────────────────────
// Read-only list of articles (used on every profile page's
// "Coverage" section).
export function ArticleListBlock({ articles, fmtDate, articleSource } = {}) {
	if (!articles || !articles.length) return EmptyText({ children: 'No articles yet.' });
	return EntityList({
		rows: articles.map((a) => {
			const src = articleSource ? articleSource(a) : { source: 'External', initials: '?' };
			return EntityRow({
				avatar: src.initials,
				name: el('a', { href: articlePath(a) }, a.headline || a.id),
				sub: [a.category, fmtDate ? fmtDate(a.publishedDate) : a.publishedDate].filter(Boolean).join(' · '),
				tail: a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer' }, `${src.source} →`) : null,
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
export function FeedPostCard(item, fmts = {}) {
	const a = item.article;
	const { fmtDate, articleSource } = fmts;
	const src = articleSource ? articleSource(a) : { source: 'External', initials: '?', ctaLabel: 'Read original →' };
	const detailHref = articlePath(a);
	return el('article', { class: 'card' },
		PostHeader({
			initials: src.initials,
			source: src.source,
			authors: a.authors,
			when: fmtDate ? fmtDate(a.publishedDate, { mode: 'rel' }) : a.publishedDate,
			category: a.category,
		}),
		el('h2', { class: 'post-headline' },
			el('a', { href: detailHref }, a.headline || '(untitled)')),
		a.dek ? el('div', { class: 'post-dek' }, a.dek) : null,
		...(item.eventCards || []).map((c) =>
			c.kind === 'transition' ? TransitionEventCard(c, fmts) :
			c.kind === 'disclosure' ? DisclosureEventCard(c, fmts) : null
		).filter(Boolean),
		ChipRow({ firms: item.firms || [], teams: item.teams || [], advisors: item.advisors || [] }),
		el('div', { class: 'post-footer' },
			el('a', { href: detailHref }, 'View details'),
			a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer', class: 'ext-link' }, `${src.source} original →`) : null,
		),
	);
}

// ─── CareerTimeline ───────────────────────────────────────────
// Vertical timeline of EmploymentHistory steps with status
// markers (current = green, terminated = red, otherwise brand).
export function CareerTimeline({ career, fmtDate } = {}) {
	return el('div', { class: 'timeline' },
		...career.map((c) => {
			const cls = !c.endDate ? 'current'
				: c.reasonForLeaving === 'terminated_for_cause' ? 'terminated'
				: '';
			return el('div', { class: `step ${cls}` },
				el('div', { class: 'marker' }),
				el('div', { class: 'body' },
					el('div', { class: 'title' },
						c.firm
							? el('a', { href: entityPath('firm', c.firm) }, c.firm.name)
							: '?',
						c.branch ? el('span', { class: 'role' }, ` · ${c.branch.name}`) : null,
					),
					el('div', { class: 'when' },
						`${fmtDate(c.startDate, { mode: 'short' })} – ${c.endDate ? fmtDate(c.endDate, { mode: 'short' }) : 'present'}`),
					c.roleTitle ? el('div', { class: 'role' }, c.roleTitle) : null,
					c.reasonForLeaving === 'terminated_for_cause'
						? Tag({ kind: 'danger', children: 'terminated for cause' })
						: null,
					c.u5Filed ? Tag({ kind: 'warn', attrs: { style: 'margin-left:6px;' }, children: 'U5 filed' }) : null,
				));
		}),
	);
}

// ─── SnapshotTable ────────────────────────────────────────────
// Table of TeamMetricSnapshot rows on the team profile.
export function SnapshotTable({ snaps, fmtMoney, humanize = (x) => x } = {}) {
	return ScrollableTable(
		el('table', { class: 'snap-table' },
			el('thead', {}, el('tr', {},
				el('th', {}, 'As of'),
				el('th', { class: 'num' }, 'AUM'),
				el('th', { class: 'num' }, 'Annual rev.'),
				el('th', { class: 'num' }, 'Households'),
				el('th', { class: 'num' }, 'Team size'),
				el('th', {}, 'Source'),
			)),
			el('tbody', {}, ...snaps.map((s) =>
				el('tr', {},
					el('td', {}, s.asOf || '?'),
					el('td', { class: 'num' }, s.aum != null ? fmtMoney(s.aum) : '—'),
					el('td', { class: 'num' }, s.annualRevenue != null ? fmtMoney(s.annualRevenue) : '—'),
					el('td', { class: 'num' }, s.householdCount ?? '—'),
					el('td', { class: 'num' }, s.teamSize ?? '—'),
					el('td', {}, s.sourceType ? humanize(s.sourceType) : '—'),
				))),
		),
	);
}

// ─── ScrollableTable ──────────────────────────────────────────
// Wraps a wide table in a horizontally-scrollable container so it
// doesn't blow out the layout on narrow viewports.
export function ScrollableTable(table) {
	return el('div', { class: 'snap-table-scroll' }, table);
}

// ─── SkeletonCard ─────────────────────────────────────────────
// A card stuffed with skeleton bars — shown while the feed loads.
export function SkeletonCard() {
	return Card({
		children: el('div', { class: 'card-body' },
			el('div', { class: 'ab-skeleton', style: 'width: 60%; height: 18px;' }),
			el('div', { class: 'ab-skeleton' }),
			el('div', { class: 'ab-skeleton', style: 'width: 80%;' }),
			el('div', { class: 'ab-skeleton', style: 'width: 70%;' }),
		),
	});
}

// ─── BrowseCard (left rail "Browse" navigation card) ──────────
export function BrowseCard({ items } = {}) {
	return SectionCard({
		body: [
			Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: 'Browse' }),
			EntityList({
				rows: items.map((it) => NavRow(it)),
			}),
		],
	});
}

// ─── RollupCard (small list card for rails) ───────────────────
//   { title, rows, renderRow: (row) => { name, sub?, avatar? } }
export function RollupCard({ title, rows, renderRow }) {
	if (!rows || !rows.length) return el('div');
	return SectionCard({
		body: [
			Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: title }),
			EntityList({
				rows: rows.map((r) => {
					const cfg = renderRow(r);
					return EntityRow({
						avatar: cfg.avatar || el('div', { class: 'avatar' }, '→'),
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
export function DetailsCard({ title, pairs }) {
	return SectionCard({
		body: [
			Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: title }),
			KvList(pairs),
		],
	});
}

// ─── Internal helper ──────────────────────────────────────────
function arrify(x) {
	if (x == null) return [];
	return Array.isArray(x) ? x : [x];
}

// Re-export EntityChip etc for ergonomic single-import usage.
export { EntityChip, EntityRow, KvList } from './molecules.js';

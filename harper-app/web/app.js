// Shared utilities for every page in the web/ UI.
//
// We talk to Harper via the same origin we're served from (the static
// component and the REST resources both bind to port 9926 by default),
// so all calls are relative.  The custom resources in resources.js
// already do the cross-table joins; the browser just renders.

// ─── tiny DOM helpers ─────────────────────────────────────────────

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs || {})) {
		if (v == null || v === false) continue;
		if (k === 'class' || k === 'className') node.className = v;
		else if (k === 'dataset') Object.assign(node.dataset, v);
		else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
		else if (k === 'html') node.innerHTML = v;
		else node.setAttribute(k, v);
	}
	for (const child of children.flat(Infinity)) {
		if (child == null || child === false) continue;
		node.appendChild(typeof child === 'string' || typeof child === 'number'
			? document.createTextNode(String(child))
			: child);
	}
	return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// ─── REST client ──────────────────────────────────────────────────
// Same-origin fetches send the Harper session cookie automatically
// when the user is logged in, and nothing at all when they aren't.
// Anonymous and authenticated paths share the same call sites.

export async function api(path, init = {}) {
	const res = await fetch(path, {
		credentials: 'same-origin',
		...init,
		headers: { Accept: 'application/json', ...(init.headers || {}) },
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${text.slice(0, 200)}`);
	}
	return res.status === 204 ? null : res.json();
}

export function postJson(path, body) {
	return api(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body || {}),
	});
}

// ─── auth state (shared module singleton) ─────────────────────────

let _meCache = null;          // last /Me result
let _mePromise = null;        // dedupe in-flight calls
export function getCurrentUser() { return _meCache; }
export async function refreshMe() {
	if (!_mePromise) {
		_mePromise = api('/Me')
			.catch(() => ({ authenticated: false }))
			.then((m) => { _meCache = m; _mePromise = null; return m; });
	}
	return _mePromise;
}
export async function logout() {
	try { await postJson('/Logout'); } catch {}
	_meCache = { authenticated: false };
	// Use replace+reload so we end up on a freshly-rendered home
	// (otherwise setting href to the current page is a no-op).
	if (location.pathname.endsWith('/index.html') || location.pathname === '/') {
		location.reload();
	} else {
		location.href = 'index.html';
	}
}

// ─── formatting ───────────────────────────────────────────────────

export function fmtMoney(n, { compact = true } = {}) {
	if (n == null) return '—';
	if (compact) {
		if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
		if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
		if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
	}
	return `$${Math.round(n).toLocaleString()}`;
}

export function fmtPct(p) {
	if (p == null) return '—';
	return `${(p * 100).toFixed(0)}%`;
}

export function fmtDate(d, { mode = 'long' } = {}) {
	if (!d) return '—';
	const dt = new Date(d);
	if (Number.isNaN(dt.getTime())) return d;
	if (mode === 'short') {
		return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
	}
	if (mode === 'rel') {
		const today = new Date();
		const diffMs = today - dt;
		const day = 86400000;
		if (diffMs < day) return 'today';
		if (diffMs < 2 * day) return 'yesterday';
		if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
		if (diffMs < 30 * day) return `${Math.floor(diffMs / (7 * day))}w ago`;
		if (diffMs < 365 * day) return `${Math.floor(diffMs / (30 * day))}mo ago`;
		return `${Math.floor(diffMs / (365 * day))}y ago`;
	}
	return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function initials(name) {
	if (!name) return '?';
	const parts = String(name).trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getQueryParam(name) {
	return new URLSearchParams(location.search).get(name);
}

// ─── chip + small UI primitives shared between pages ──────────────

export function entityChip(entity) {
	if (!entity) return null;
	const href = entity.kind === 'firm' ? `firm.html?id=${encodeURIComponent(entity.id)}`
		: entity.kind === 'team' ? `team.html?id=${encodeURIComponent(entity.id)}`
		: entity.kind === 'advisor' ? `advisor.html?id=${encodeURIComponent(entity.id)}`
		: '#';
	const label = entity.short || entity.name || entity.id;
	const sub = entity.kind === 'advisor' && entity.firm
		? entity.firm.short || entity.firm.name
		: entity.kind === 'team' && entity.firm
		? entity.firm.short || entity.firm.name
		: entity.kind === 'firm' && entity.hq
		? entity.hq
		: null;
	return el('a', { href, class: `chip ${entity.kind}` },
		el('span', { class: 'chip-kind' }, entity.kind),
		label,
		sub ? el('span', { class: 'chip-sub' }, `· ${sub}`) : null,
	);
}

export function navbar({ active } = {}) {
	const link = (href, label) =>
		el('a', { href, class: active === label.toLowerCase() ? 'active' : null }, label);

	// The "Me" pill on the right shows current user + logout, or
	// "Sign in" when anonymous. Refresh it after the page mounts.
	const meSpot = el('div', { class: 'me-spot' }, el('span', { class: 'me-loading' }));
	refreshMe().then(renderMe);
	function renderMe(me) {
		clear(meSpot);
		if (me?.authenticated) {
			meSpot.appendChild(el('span', { class: 'me-user', title: me.username }, me.username.split('@')[0]));
			meSpot.appendChild(el('button', {
				class: 'me-action',
				onClick: (e) => { e.preventDefault(); logout(); },
			}, 'Sign out'));
		} else {
			meSpot.appendChild(el('a', { class: 'me-action', href: 'login.html' }, 'Sign in'));
		}
	}

	const links = el('div', { class: 'nav-links' },
		link('index.html', 'Home'),
		link('firms.html', 'Firms'),
		link('advisors.html', 'Advisors'),
		link('teams.html', 'Teams'),
	);

	// Mobile drawer: hamburger toggles a `drawer-open` class on <body>.
	// On wide screens the drawer's contents (links + me-spot) sit inline
	// in the navbar; on narrow screens they collapse into a sliding
	// right-side panel. Closing happens on link click or scrim click.
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
		el('div', { class: 'logo' }, el('a', { href: 'index.html' }, 'AdvisoryRankings')),
		el('label', { class: 'search' },
			el('input', { type: 'search', placeholder: 'Search advisors, firms, teams', id: 'global-search', autocomplete: 'off' }),
		),
		drawer,
		scrim,
	);
}

export function siteFooter() {
	return el('footer', { class: 'site-footer' },
		'Sourced from AdvisorHub · running on Harper · ',
		el('a', { href: 'https://github.com/CodySwannGT/advisory-rankings', target: '_blank', rel: 'noreferrer' }, 'source'),
	);
}

export function mountPage({ active, build }) {
	document.body.appendChild(navbar({ active }));
	const layout = el('div', { class: 'layout' });
	document.body.appendChild(layout);
	document.body.appendChild(siteFooter());
	build(layout);
}

// ─── shared building blocks for entity pages ──────────────────────

export function profileHead({ initialsText, title, subtitle, tags = [] }) {
	return el('div', { class: 'card' },
		el('div', { class: 'profile-cover' }),
		el('div', { class: 'profile-head' },
			el('div', { class: 'profile-avatar' }, initialsText || '?'),
			el('div', { class: 'profile-title' },
				el('h1', {}, title || ''),
				subtitle ? el('div', { class: 'subtitle' }, subtitle) : null,
				tags.length ? el('div', { class: 'profile-meta' }, ...tags.map((t) => el('span', { class: `tag ${t.kind || ''}` }, t.label))) : null,
			),
		),
	);
}

export function sectionCard(title, body) {
	return el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h2', { class: 'card-title' }, title),
			body,
		),
	);
}

export function articleListBlock(articles) {
	if (!articles || !articles.length) return el('div', { class: 'empty' }, 'No articles yet.');
	return el('div', { class: 'entity-list' },
		...articles.map((a) =>
			el('div', { class: 'row' },
				el('div', { class: 'avatar' }, 'AH'),
				el('div', { class: 'body' },
					el('div', { class: 'name' },
						el('a', { href: `article.html?id=${encodeURIComponent(a.id)}` }, a.headline || a.id)),
					el('div', { class: 'sub' }, [a.category, fmtDate(a.publishedDate)].filter(Boolean).join(' · ')),
				),
				el('div', { class: 'tail' },
					a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer' }, 'AdvisorHub →') : null,
				),
			),
		),
	);
}

export function transitionRow(t) {
	return el('div', { class: 'event-card transition' },
		el('div', { class: 'event-title' },
			el('span', { class: 'firm-arrow' },
				t.fromFirm ? el('a', { href: `firm.html?id=${encodeURIComponent(t.fromFirm.id)}` }, t.fromFirm.short || t.fromFirm.name) : '?',
				el('span', { class: 'arrow' }, '→'),
				t.toFirm ? el('a', { href: `firm.html?id=${encodeURIComponent(t.toFirm.id)}` }, t.toFirm.short || t.toFirm.name) : '?',
			),
			t.subject ? el('span', { class: 'tag' }, t.subject.kind || 'subject') : null,
			t.subject ? el('span', {}, t.subject.name) : null,
			t.isBreakaway ? el('span', { class: 'tag warn' }, 'breakaway') : null,
			t.isReturn ? el('span', { class: 'tag' }, 'return') : null,
		),
		el('div', { class: 'stats' },
			t.aumMoved != null ? el('div', { class: 'stat' }, el('strong', {}, fmtMoney(t.aumMoved)), 'AUM moved') : null,
			t.productionT12 != null ? el('div', { class: 'stat' }, el('strong', {}, fmtMoney(t.productionT12)), 'T-12 production') : null,
			t.headcountMoved != null ? el('div', { class: 'stat' }, el('strong', {}, t.headcountMoved), 'advisors moved') : null,
			t.moveDate ? el('div', { class: 'stat' }, el('strong', {}, fmtDate(t.moveDate)), 'move date') : null,
		),
		t.deal ? el('div', { class: 'deal-strip' },
			'Recruiting deal: ',
			t.deal.upfrontPctT12 != null ? el('strong', {}, fmtPct(t.deal.upfrontPctT12)) : null,
			t.deal.upfrontPctT12 != null ? ' upfront on T-12 · ' : '',
			t.deal.producerTier ? `tier: ${t.deal.producerTier}` : '',
			t.deal.backendMetrics ? ` · ${t.deal.backendMetrics}` : '',
		) : null,
	);
}

export function disclosureRow(d) {
	const reg = [d.regulator, d.regulatorState].filter(Boolean).join(' / ');
	return el('div', { class: 'event-card disclosure' },
		el('div', { class: 'event-title' },
			el('span', { class: 'tag danger' }, d.disclosureType || 'disclosure'),
			reg ? el('span', {}, reg) : null,
			d.status ? el('span', { class: 'tag' }, d.status) : null,
			d.advisor ? el('a', { href: `advisor.html?id=${encodeURIComponent(d.advisor.id)}` }, d.advisor.name) : null,
		),
		d.allegationText ? el('div', { class: 'allegation' }, '“', d.allegationText, '”') : null,
		(d.sanctions && d.sanctions.length) ? el('div', { class: 'sanctions-row' },
			...d.sanctions.map((s) => {
				const bits = [s.sanctionType];
				if (s.amount) bits.push(fmtMoney(s.amount));
				if (s.durationMonths) bits.push(`${s.durationMonths}mo`);
				if (s.jurisdiction) bits.push(`(${s.jurisdiction})`);
				return el('span', { class: 'sanction-pill' }, bits.join(' · '));
			}),
		) : null,
		d.awardAmount ? el('div', { class: 'deal-strip' }, `Award: ${fmtMoney(d.awardAmount)}`) : null,
	);
}

// AdvisorBook — URL routing helpers.
//
// One source of truth for every clean URL the app produces or
// consumes. The HTML shells in `web/` are served by the page-router
// resources in `harper-app/resources.js` at paths like
// `/firms/<slug>` and `/articles/<slug>`; this module is what the
// page scripts use to:
//
//   1. Read the active route off `location.pathname` (so detail
//      pages know which entity to fetch).
//   2. Build hrefs to other pages without hand-rolling `.html?id=`
//      strings — every page should call `firmPath(firm)` /
//      `advisorPath(a)` / `teamPath(t)` / `articlePath(art)` instead.
//
// All entity payloads from the REST layer carry both `id` and
// `slug`. The path helpers prefer `slug` and fall back to `id` so
// a row that hasn't been backfilled yet still renders a working
// link (the slug-or-id resolver in resources.js accepts either).

// Pull a slug-or-id from any chip / row shape. Tolerates `null`
// inputs so callers can `firmPath(maybeFirm) ?? '#'` without
// scattering optional chains.
function key(entity) {
	if (!entity) return '';
	const s = entity.slug;
	if (s) return String(s);
	const i = entity.id;
	return i == null ? '' : String(i);
}

export function firmPath(firm) {
	const k = key(firm);
	return k ? `/firms/${encodeURIComponent(k)}` : '#';
}

export function firmSubsectionPath(firm, section) {
	const k = key(firm);
	if (!k) return '#';
	if (!section) return `/firms/${encodeURIComponent(k)}`;
	return `/firms/${encodeURIComponent(k)}/${encodeURIComponent(section)}`;
}

export function advisorPath(advisor) {
	const k = key(advisor);
	return k ? `/advisors/${encodeURIComponent(k)}` : '#';
}

export function teamPath(team) {
	const k = key(team);
	return k ? `/teams/${encodeURIComponent(k)}` : '#';
}

export function articlePath(article) {
	const k = key(article);
	return k ? `/articles/${encodeURIComponent(k)}` : '#';
}

// Section anchors used by `/firms/<slug>/<section>` deep links.
// Shared between the firm page (which scrolls/expands the matching
// section on load) and any link-builder that wants a stable target.
export const FIRM_SECTIONS = Object.freeze({
	advisors: 'advisors',
	teams: 'teams',
});

// Parse `location.pathname` into a structured route object so
// detail pages can read the slug and an optional section without
// re-implementing the regex per page.
//
// Returns one of:
//   { type: 'home' }
//   { type: 'login' }
//   { type: 'firms' }                                  → directory
//   { type: 'firm',    slug, section?: string }        → detail / deep link
//   { type: 'advisors' }
//   { type: 'advisor', slug }
//   { type: 'teams' }
//   { type: 'team',    slug }
//   { type: 'article', slug }
//   { type: 'unknown', pathname }
//
// Trailing slashes are tolerated. Slugs are URL-decoded.
export function parseRoute(pathname = location.pathname) {
	const clean = String(pathname || '/').replace(/\/+$/, '') || '/';
	if (clean === '/' || clean === '/index.html') return { type: 'home' };
	if (clean === '/login' || clean === '/login.html') return { type: 'login' };

	const parts = clean.split('/').filter(Boolean);
	const [head, slugRaw, sectionRaw] = parts;
	const slug = slugRaw ? decodeURIComponent(slugRaw) : undefined;
	const section = sectionRaw ? decodeURIComponent(sectionRaw) : undefined;

	if (head === 'firms') {
		if (!slug) return { type: 'firms' };
		return { type: 'firm', slug, ...(section ? { section } : {}) };
	}
	if (head === 'advisors') {
		return slug ? { type: 'advisor', slug } : { type: 'advisors' };
	}
	if (head === 'teams') {
		return slug ? { type: 'team', slug } : { type: 'teams' };
	}
	if (head === 'articles') {
		return slug ? { type: 'article', slug } : { type: 'unknown', pathname: clean };
	}
	return { type: 'unknown', pathname: clean };
}

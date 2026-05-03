// AdvisorBook · Atomic Design — TEMPLATES
//
// Page-level layout shells. Templates own the global chrome
// (Navbar, SiteFooter) and the content grid; they hand the
// caller back the placeholder elements (left / center / right
// rails) to populate.
//
// Templates may import from atoms / molecules / organisms.
// Pages should call exactly one template and never hand-roll
// chrome elsewhere.

import { el } from './dom.js';
import { Navbar, SiteFooter } from './organisms.js';

// ─── ThreeColumnLayout ────────────────────────────────────────
// The default page shell: sticky navbar, three-column grid
// (left rail | center column | right rail), site footer. The
// rails collapse on tablet / mobile breakpoints (see app.css).
//
//   mountThreeColumnPage({
//     active: 'home',
//     refreshMe, logout, search,        // injected from app.js
//     build: ({ left, center, right }) => { … }
//   })
export function mountThreeColumnPage({ active, refreshMe, logout, search, build } = {}) {
	document.body.appendChild(Navbar({ active, refreshMe, logout, search }));
	const layout = el('div', { class: 'layout' });
	document.body.appendChild(layout);
	document.body.appendChild(SiteFooter());

	const left = el('aside', { class: 'left rail' });
	const center = el('section', { class: 'center' });
	const right = el('aside', { class: 'right rail' });
	layout.append(left, center, right);

	build({ left, center, right, layout });
}

// ─── FullWidthLayout ──────────────────────────────────────────
// Single full-width column inside the same .layout grid (used
// by the directory pages: /firms.html, /advisors.html, /teams.html).
export function mountFullWidthPage({ active, refreshMe, logout, search, build } = {}) {
	document.body.appendChild(Navbar({ active, refreshMe, logout, search }));
	const layout = el('div', { class: 'layout' });
	document.body.appendChild(layout);
	document.body.appendChild(SiteFooter());

	const center = el('section', { class: 'center', style: 'grid-column: 1 / -1;' });
	layout.appendChild(center);

	build({ center, layout });
}

// ─── CenteredNarrowLayout ─────────────────────────────────────
// Single narrow centered column (used by login.html).
export function mountCenteredNarrowPage({ active, refreshMe, logout, search, build, maxWidth = 420 } = {}) {
	document.body.appendChild(Navbar({ active, refreshMe, logout, search }));
	const layout = el('div', { class: 'layout' });
	document.body.appendChild(layout);
	document.body.appendChild(SiteFooter());

	const center = el('section', {
		class: 'center',
		style: `grid-column: 1 / -1; max-width: ${maxWidth}px; margin: 32px auto;`,
	});
	layout.appendChild(center);

	build({ center, layout });
}

// Home feed page — list of FeedPostCards plus left/right rail rollups.
//
// All UI components come from the design system. Page-level glue:
// fetch /Feed → render the three rails. See docs/design-system.md
// before adding any new visual element here.

import { api, refreshMe, logout, fmts, fmtMoney, initials } from './app.js';
import {
	mountThreeColumnPage, clear,
	SkeletonCard, EmptyCard, FeedPostCard, BrowseCard, RollupCard,
	SectionCard, EntityList, EntityRow, Heading, el,
} from './design-system/index.js';

mountThreeColumnPage({
	active: 'home',
	refreshMe,
	logout,
	build({ left, center, right }) {
		// Skeleton until /Feed resolves.
		center.append(SkeletonCard(), SkeletonCard());

		api('/Feed').then(({ items }) => {
			renderCenter(center, items);
			renderLeft(left, items);
			renderRight(right, items);
		}).catch((err) => {
			clear(center);
			center.appendChild(EmptyCard({ title: 'Could not load feed', body: String(err.message || err) }));
		});
	},
});

function renderCenter(root, items) {
	clear(root);
	if (!items.length) {
		root.appendChild(EmptyCard({
			title: 'No articles yet',
			body: 'Once the ingest crawler runs, articles appear here.',
		}));
		return;
	}
	for (const item of items) root.appendChild(FeedPostCard(item, fmts));
}

function renderLeft(root, items) {
	clear(root);
	root.appendChild(BrowseCard({
		items: [
			{ label: 'Home',       icon: '🏠', href: 'index.html' },
			{ label: 'Firms',      icon: '🏢', href: 'firms.html' },
			{ label: 'Advisors',   icon: '👤', href: 'advisors.html' },
			{ label: 'Teams',      icon: '🤝', href: 'teams.html' },
			{ label: 'Compliance', icon: '⚖️', href: 'compliance.html' },
		],
	}));

	const recentTransitions = items
		.flatMap((i) => (i.eventCards || []).filter((c) => c.kind === 'transition'))
		.slice(0, 4);
	root.appendChild(RollupCard({
		title: 'Recent transitions',
		rows: recentTransitions,
		renderRow: (t) => ({
			name: t.subject || 'Move',
			sub: el('div', { class: 'sub' },
				t.fromFirm?.short || '?', ' → ', t.toFirm?.short || '?',
				t.aumMoved ? ` · ${fmtMoney(t.aumMoved)}` : ''),
		}),
	}));
}

function renderRight(root, items) {
	clear(root);

	// Trending firms = firms most often mentioned across the feed.
	const firmHits = new Map();
	for (const i of items) for (const f of i.firms) {
		if (!firmHits.has(f.id)) firmHits.set(f.id, { firm: f, count: 0 });
		firmHits.get(f.id).count++;
	}
	const topFirms = [...firmHits.values()].sort((a, b) => b.count - a.count).slice(0, 6);

	root.appendChild(SectionCard({
		body: [
			Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: 'Trending firms' }),
			EntityList({
				rows: topFirms.map(({ firm, count }) => EntityRow({
					avatar: initials(firm.name),
					name: firm.short || firm.name,
					sub: [firm.channel, firm.hq].filter(Boolean).join(' · '),
					tail: `${count} mention${count === 1 ? '' : 's'}`,
					href: `firm.html?id=${encodeURIComponent(firm.id)}`,
				})),
			}),
		],
	}));

	// Recent disclosures — flagged in red.
	const recentDisc = items
		.flatMap((i) => (i.eventCards || []).filter((c) => c.kind === 'disclosure'))
		.slice(0, 4);
	if (recentDisc.length) {
		root.appendChild(SectionCard({
			body: [
				Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: 'Recent compliance events' }),
				EntityList({
					rows: recentDisc.map((d) => EntityRow({
						avatar: '⚠',
						name: d.advisor?.name || 'Disclosure',
						sub: [d.regulator, d.disclosureType].filter(Boolean).join(' · '),
						href: d.advisor ? `advisor.html?id=${encodeURIComponent(d.advisor.id)}` : '#',
					})),
				}),
			],
		}));
	}
}

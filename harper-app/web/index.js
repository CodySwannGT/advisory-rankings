import {
	$, api, el, mountPage, entityChip, fmtDate, fmtMoney, initials,
	transitionRow, disclosureRow,
} from './app.js';

mountPage({
	active: 'home',
	build(layout) {
		const left = el('aside', { class: 'left rail' });
		const center = el('section', { class: 'center' });
		const right = el('aside', { class: 'right rail' });
		layout.append(left, center, right);

		// Skeleton until /Feed resolves.
		center.append(skeletonCard(), skeletonCard());

		api('/Feed').then(({ items }) => {
			renderCenter(center, items);
			renderLeft(left, items);
			renderRight(right, items);
		}).catch((err) => {
			while (center.firstChild) center.removeChild(center.firstChild);
			center.appendChild(el('div', { class: 'card' },
				el('div', { class: 'card-body' },
					el('h2', { class: 'card-title' }, 'Could not load feed'),
					el('div', { class: 'empty' }, String(err.message || err)),
				)));
		});
	},
});

function skeletonCard() {
	return el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('div', { class: 'skeleton', style: 'width: 60%; height: 18px;' }),
			el('div', { class: 'skeleton' }),
			el('div', { class: 'skeleton', style: 'width: 80%;' }),
			el('div', { class: 'skeleton', style: 'width: 70%;' }),
		),
	);
}

function renderCenter(root, items) {
	while (root.firstChild) root.removeChild(root.firstChild);
	if (!items.length) {
		root.appendChild(el('div', { class: 'card' },
			el('div', { class: 'card-body' },
				el('h2', { class: 'card-title' }, 'No articles yet'),
				el('div', { class: 'empty' }, 'Once the ingest crawler runs, articles appear here.'),
			)));
		return;
	}
	for (const item of items) root.appendChild(feedCard(item));
}

function feedCard(item) {
	const a = item.article;
	const author = (a.authors && a.authors[0]) || 'AdvisorHub';
	return el('article', { class: 'card' },
		el('div', { class: 'post-header' },
			el('div', { class: 'post-avatar' }, 'AH'),
			el('div', { class: 'post-meta' },
				el('span', { class: 'src' },
					'AdvisorHub',
					a.authors?.length ? el('span', { style: 'color:var(--text-muted); font-weight: 400;' }, ` · ${a.authors.join(', ')}`) : null,
				),
				el('span', { class: 'when' },
					[fmtDate(a.publishedDate, { mode: 'rel' }), a.category].filter(Boolean).join(' · ')),
			),
		),
		el('h2', { class: 'post-headline' },
			el('a', { href: `article.html?id=${encodeURIComponent(a.id)}` }, a.headline || '(untitled)')),
		a.dek ? el('div', { class: 'post-dek' }, a.dek) : null,
		// Event cards (transitions, disclosures) — the "rich" inline metadata.
		...(item.eventCards || []).map((c) =>
			c.kind === 'transition' ? transitionRow(c) :
			c.kind === 'disclosure' ? disclosureRow(c) : null
		).filter(Boolean),
		// Entity chips.
		(item.advisors.length || item.firms.length || item.teams.length)
			? el('div', { class: 'chip-row' },
				...item.firms.map(entityChip),
				...item.teams.map(entityChip),
				...item.advisors.map(entityChip),
			)
			: null,
		el('div', { class: 'post-footer' },
			el('a', { href: `article.html?id=${encodeURIComponent(a.id)}` }, 'View details'),
			a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer', class: 'ext-link' }, 'AdvisorHub original →') : null,
		),
	);
}

// ─── side rails: things you can drill into ─────────────────────

function renderLeft(root, items) {
	while (root.firstChild) root.removeChild(root.firstChild);
	root.appendChild(el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, 'Browse'),
			el('div', { class: 'entity-list' },
				navRow('Home', '🏠', 'index.html'),
				navRow('Firms', '🏢', 'firms.html'),
				navRow('Advisors', '👤', 'advisors.html'),
				navRow('Teams', '🤝', 'teams.html'),
				navRow('Compliance', '⚖️', 'compliance.html'),
			),
		),
	));
	root.appendChild(rollupCard('Recent transitions',
		items.flatMap((i) => (i.eventCards || []).filter((c) => c.kind === 'transition')).slice(0, 4),
		(t) => el('div', { class: 'sub' },
			t.fromFirm?.short || '?', ' → ', t.toFirm?.short || '?',
			t.aumMoved ? ` · ${fmtMoney(t.aumMoved)}` : ''),
		(t) => t.subject || 'Move',
	));
}

function navRow(label, emoji, href) {
	return el('a', { href, style: 'text-decoration:none; color:inherit;' },
		el('div', { class: 'row' },
			el('div', { class: 'avatar' }, emoji),
			el('div', { class: 'body' }, el('div', { class: 'name' }, label)),
		),
	);
}

function renderRight(root, items) {
	while (root.firstChild) root.removeChild(root.firstChild);

	// Trending firms = firms most often mentioned across the feed.
	const firmHits = new Map();
	for (const i of items) for (const f of i.firms) {
		if (!firmHits.has(f.id)) firmHits.set(f.id, { firm: f, count: 0 });
		firmHits.get(f.id).count++;
	}
	const topFirms = [...firmHits.values()].sort((a, b) => b.count - a.count).slice(0, 6);
	root.appendChild(el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, 'Trending firms'),
			el('div', { class: 'entity-list' },
				...topFirms.map(({ firm, count }) =>
					el('a', { href: `firm.html?id=${encodeURIComponent(firm.id)}`, style: 'text-decoration:none; color:inherit;' },
						el('div', { class: 'row' },
							el('div', { class: 'avatar' }, initials(firm.name)),
							el('div', { class: 'body' },
								el('div', { class: 'name' }, firm.short || firm.name),
								el('div', { class: 'sub' }, [firm.channel, firm.hq].filter(Boolean).join(' · ')),
							),
							el('div', { class: 'tail' }, `${count} mention${count === 1 ? '' : 's'}`),
						))),
			),
		),
	));

	// Recent disclosures — flagged in red.
	const recentDisc = items
		.flatMap((i) => (i.eventCards || []).filter((c) => c.kind === 'disclosure'))
		.slice(0, 4);
	if (recentDisc.length) {
		root.appendChild(el('div', { class: 'card' },
			el('div', { class: 'card-body' },
				el('h3', { class: 'card-subtitle' }, 'Recent compliance events'),
				el('div', { class: 'entity-list' },
					...recentDisc.map((d) =>
						el('a', { href: d.advisor ? `advisor.html?id=${encodeURIComponent(d.advisor.id)}` : '#', style: 'text-decoration:none; color:inherit;' },
							el('div', { class: 'row' },
								el('div', { class: 'avatar' }, '⚠'),
								el('div', { class: 'body' },
									el('div', { class: 'name' }, d.advisor?.name || 'Disclosure'),
									el('div', { class: 'sub' }, [d.regulator, d.disclosureType].filter(Boolean).join(' · ')),
								),
							)),
					)),
			),
		));
	}
}

function rollupCard(title, rows, subFn, nameFn) {
	if (!rows.length) return el('div');
	return el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, title),
			el('div', { class: 'entity-list' },
				...rows.map((r) =>
					el('div', { class: 'row' },
						el('div', { class: 'avatar' }, '→'),
						el('div', { class: 'body' },
							el('div', { class: 'name' }, nameFn(r)),
							subFn(r),
						),
					)),
			),
		),
	);
}

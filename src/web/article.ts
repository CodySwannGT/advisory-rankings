// @ts-nocheck
// Article detail page.
// All UI comes from the design system — see docs/design-system.md.

import { api, refreshMe, logout, search, fmts, fmtDate, humanize, getArticleIdParam, articleSource, canonicalizeArticleRoute } from './app.js';
import {
	mountThreeColumnPage, el,
	EmptyCard, SectionCard, Card, PostHeader, ChipRow, DetailsCard,
	TransitionEventCard, DisclosureEventCard, ScrollableTable,
} from './design-system/index.js';

mountThreeColumnPage({
	active: 'home',
	refreshMe,
	logout,
	search,
	build({ center, right }) {
		const id = getArticleIdParam();
		if (!id) {
			center.appendChild(EmptyCard({ title: 'No article selected', body: 'Pick an article from the feed.' }));
			return;
		}
		api(`/ArticleView/${encodeURIComponent(id)}`)
			.then((d) => render(d, center, right))
			.catch((err) => center.appendChild(EmptyCard({ title: 'Error', body: String(err.message || err) })));
	},
});

function render(d, center, right) {
	if (d.error) {
		center.appendChild(EmptyCard({ title: 'Article not found', body: d.id || '' }));
		return;
	}
	const a = d.article;
	canonicalizeArticleRoute(a);
	const src = articleSource(a);

	const head = Card({
		tag: 'article',
		children: [
			PostHeader({
				initials: src.initials,
				source: src.source,
				authors: a.authors,
				when: fmtDate(a.publishedDate),
				category: a.category,
			}),
			el('h2', { class: 'post-headline' }, a.headline || '(untitled)'),
			a.dek ? el('div', { class: 'post-dek' }, a.dek) : null,
			...(d.eventCards || []).map((c) =>
				c.kind === 'transition' ? TransitionEventCard(c, fmts) :
				c.kind === 'disclosure' ? DisclosureEventCard(c, fmts) : null
			).filter(Boolean),
			ChipRow({ firms: d.firms, teams: d.teams, advisors: d.advisors }),
			el('div', { class: 'post-footer' },
				a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer', class: 'ext-link' }, src.ctaLabel) : null),
		],
	});
	center.appendChild(head);

	if (d.body?.text) {
		center.appendChild(SectionCard({
			title: 'Article body',
			body: el('div', {}, ...paragraphs(d.body.text)),
		}));
	}

	const evidenceRows = compactProvenance(d.provenance || []);
	if (evidenceRows.length) {
		center.appendChild(SectionCard({
			title: `Extracted facts (${evidenceRows.length})`,
			body: ScrollableTable(
				el('table', { class: 'snap-table' },
					el('thead', {}, el('tr', {},
						el('th', {}, 'Field'),
						el('th', {}, 'Value'),
					)),
					el('tbody', {}, ...evidenceRows.map((p) =>
						el('tr', {},
							el('td', {}, p.field),
							el('td', {}, p.value),
						))),
				),
			),
		}));
	}

	right.appendChild(DetailsCard({
		title: 'Article metadata',
		pairs: [
			['Slug',      a.slug],
			['Category',  humanize(a.category)],
			['Published', fmtDate(a.publishedDate)],
			['Modified',  fmtDate(a.modifiedDate)],
			['Authors',   (a.authors || []).join(', ')],
			['Source',    a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer' }, `${src.source} →`) : null],
		],
	}));
}

function paragraphs(text) {
	return text.split(/\n{2,}/).map((p) => el('p', {}, p));
}

function compactProvenance(rows) {
	const seen = new Set();
	const result = [];
	for (const row of rows) {
		const field = humanize(row.fieldName);
		const value = String(row.assertedValue || row.quotePhrase || '').trim();
		if (!field || !value) continue;
		const key = `${field.toLowerCase()}::${value.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push({ field, value });
	}
	return result;
}

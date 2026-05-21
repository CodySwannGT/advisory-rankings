// @ts-nocheck
// Article detail page.
// All UI comes from the design system — see docs/design-system.md.

import { api, refreshMe, logout, search, fmts, fmtDate, humanize, getQueryParam, articleSource } from './app.js';
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
		const id = getQueryParam('id');
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

	if (d.provenance && d.provenance.length) {
		center.appendChild(SectionCard({
			title: `Field-assertion provenance (${d.provenance.length})`,
			body: ScrollableTable(
				el('table', { class: 'snap-table' },
					el('thead', {}, el('tr', {},
						el('th', {}, 'Target'),
						el('th', {}, 'Field'),
						el('th', {}, 'Value'),
						el('th', {}, 'Quote'),
						el('th', {}, 'Confidence'),
					)),
					el('tbody', {}, ...d.provenance.map((p) =>
						el('tr', {},
							el('td', {}, humanize(p.targetTable)),
							el('td', {}, humanize(p.fieldName)),
							el('td', {}, p.assertedValue || ''),
							el('td', {}, p.quotePhrase ? `"${p.quotePhrase}"` : ''),
							el('td', {}, humanize(p.confidence) || ''),
						))),
				),
			),
		}));
	}

	right.appendChild(DetailsCard({
		title: 'Article metadata',
		pairs: [
			['Slug',      a.slug],
			['Category',  a.category],
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

import {
	api, el, mountPage, getQueryParam, fmtDate,
	entityChip, sectionCard, transitionRow, disclosureRow,
} from './app.js';

mountPage({
	active: 'home',
	build(layout) {
		const left = el('aside', { class: 'left rail' });
		const center = el('section', { class: 'center' });
		const right = el('aside', { class: 'right rail' });
		layout.append(left, center, right);

		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(emptyCard('No article selected', 'Pick an article from the feed.'));
			return;
		}
		api(`/ArticleView/${encodeURIComponent(id)}`)
			.then((d) => render(d, center, right))
			.catch((err) => center.appendChild(emptyCard('Error', String(err.message || err))));
	},
});

function emptyCard(title, body) {
	return el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h2', { class: 'card-title' }, title),
			el('div', { class: 'empty' }, body)));
}

function render(d, center, right) {
	if (d.error) {
		center.appendChild(emptyCard('Article not found', d.id || ''));
		return;
	}
	const a = d.article;
	const author = (a.authors && a.authors[0]) || 'AdvisorHub';

	const head = el('article', { class: 'card' },
		el('div', { class: 'post-header' },
			el('div', { class: 'post-avatar' }, 'AH'),
			el('div', { class: 'post-meta' },
				el('span', { class: 'src' }, 'AdvisorHub',
					a.authors?.length ? el('span', { style: 'color:var(--text-muted); font-weight: 400;' }, ` · ${a.authors.join(', ')}`) : null),
				el('span', { class: 'when' },
					[fmtDate(a.publishedDate), a.category].filter(Boolean).join(' · ')),
			),
		),
		el('h2', { class: 'post-headline' }, a.headline || '(untitled)'),
		a.dek ? el('div', { class: 'post-dek' }, a.dek) : null,
		...(d.eventCards || []).map((c) =>
			c.kind === 'transition' ? transitionRow(c) :
			c.kind === 'disclosure' ? disclosureRow(c) : null
		).filter(Boolean),
		(d.advisors.length || d.firms.length || d.teams.length)
			? el('div', { class: 'chip-row' },
				...d.firms.map(entityChip),
				...d.teams.map(entityChip),
				...d.advisors.map(entityChip))
			: null,
		el('div', { class: 'post-footer' },
			a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer', class: 'ext-link' }, 'Read original on AdvisorHub →') : null),
	);
	center.appendChild(head);

	if (d.body?.text) {
		center.appendChild(sectionCard('Article body', el('div', {}, ...paragraphs(d.body.text))));
	}

	if (d.provenance && d.provenance.length) {
		center.appendChild(sectionCard(
			`Field-assertion provenance (${d.provenance.length})`,
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
						el('td', {}, `${p.targetTable}`),
						el('td', {}, p.fieldName),
						el('td', {}, p.assertedValue || ''),
						el('td', {}, p.quotePhrase ? `“${p.quotePhrase}”` : ''),
						el('td', {}, p.confidence || ''),
					))),
			),
		));
	}

	right.appendChild(el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, 'Article metadata'),
			el('dl', { class: 'kvs' },
				...kv('Slug', a.slug),
				...kv('Category', a.category),
				...kv('Published', fmtDate(a.publishedDate)),
				...kv('Modified', fmtDate(a.modifiedDate)),
				...kv('Authors', (a.authors || []).join(', ')),
				...kv('Source', a.url ? el('a', { href: a.url, target: '_blank', rel: 'noreferrer' }, 'AdvisorHub →') : null),
			),
		),
	));
}

function paragraphs(text) {
	return text.split(/\n{2,}/).map((p) => el('p', {}, p));
}

function kv(label, value) {
	if (value == null || value === '' || value === false) return [];
	return [el('dt', {}, label), el('dd', {}, typeof value === 'object' ? value : String(value))];
}

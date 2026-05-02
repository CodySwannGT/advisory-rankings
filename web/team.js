import {
	api, el, mountPage, getQueryParam, fmtDate, fmtMoney, initials,
	profileHead, sectionCard, articleListBlock, transitionRow,
} from './app.js';

mountPage({
	active: 'teams',
	build(layout) {
		const left = el('aside', { class: 'left rail' });
		const center = el('section', { class: 'center' });
		const right = el('aside', { class: 'right rail' });
		layout.append(left, center, right);

		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(emptyCard('No team selected', 'Pick a team from a firm or feed.'));
			return;
		}
		api(`/TeamProfile/${encodeURIComponent(id)}`)
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
	const t = d.team;
	const latest = d.metricSnapshots[d.metricSnapshots.length - 1];
	const tags = [];
	if (t.serviceModel) tags.push({ label: t.serviceModel.replace(/_/g, ' ') + ' clients' });
	if (t.firmProgram) tags.push({ label: t.firmProgram });
	if (latest?.aum) tags.push({ kind: 'ok', label: `${fmtMoney(latest.aum)} AUM` });
	if (latest?.teamSize) tags.push({ label: `${latest.teamSize} members` });

	const subtitleParts = [];
	if (d.currentFirm) subtitleParts.push(`Currently at ${d.currentFirm.name}`);
	if (d.currentBranch) {
		const where = [d.currentBranch.buildingName || d.currentBranch.name, d.currentBranch.city, d.currentBranch.state].filter(Boolean).join(', ');
		if (where) subtitleParts.push(where);
	}

	center.appendChild(profileHead({
		initialsText: initials(t.name),
		title: t.name,
		subtitle: subtitleParts.join(' · '),
		tags,
	}));

	// Members — current first, then alumni.
	center.appendChild(sectionCard(
		`Current members (${d.currentMembers.length})`,
		d.currentMembers.length
			? memberList(d.currentMembers, { showStart: true })
			: el('div', { class: 'empty' }, 'No current members.'),
	));
	if (d.pastMembers.length) {
		center.appendChild(sectionCard(
			`Past members (${d.pastMembers.length})`,
			memberList(d.pastMembers, { showRange: true }),
		));
	}

	if (d.transitions.length) {
		center.appendChild(sectionCard(
			'Team transitions',
			el('div', {}, ...d.transitions.map(transitionRow)),
		));
	}

	if (d.metricSnapshots.length) {
		center.appendChild(sectionCard(
			`Metric history (${d.metricSnapshots.length} snapshot${d.metricSnapshots.length === 1 ? '' : 's'})`,
			snapshotTable(d.metricSnapshots),
		));
	}

	center.appendChild(sectionCard(
		`Coverage (${d.articles.length})`,
		articleListBlock(d.articles),
	));

	right.appendChild(el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, 'Team details'),
			el('dl', { class: 'kvs' },
				...kv('Name', t.name),
				...kv('Service model', t.serviceModel),
				...kv('Firm program', t.firmProgram),
				...kv('Founded', t.foundedYear),
				...kv('Dissolved', t.dissolvedYear),
				...kv('Current firm', d.currentFirm ? el('a', { href: `firm.html?id=${encodeURIComponent(d.currentFirm.id)}` }, d.currentFirm.name) : null),
			),
		),
	));

	if (latest) {
		right.appendChild(el('div', { class: 'card' },
			el('div', { class: 'card-body' },
				el('h3', { class: 'card-subtitle' }, `Latest metrics (${latest.asOf})`),
				el('dl', { class: 'kvs' },
					...kv('AUM', latest.aum != null ? fmtMoney(latest.aum) : null),
					...kv('Annual revenue', latest.annualRevenue != null ? fmtMoney(latest.annualRevenue) : null),
					...kv('Households', latest.householdCount),
					...kv('Team size', latest.teamSize),
					...kv('Source', latest.sourceType),
				),
			),
		));
	}
}

function memberList(members, { showStart = false, showRange = false } = {}) {
	return el('div', { class: 'entity-list' },
		...members.map((m) => {
			const a = m.advisor;
			let tail = '';
			if (showRange && m.startDate && m.endDate) tail = `${fmtDate(m.startDate, { mode: 'short' })} – ${fmtDate(m.endDate, { mode: 'short' })}`;
			else if (showStart && m.startDate) tail = `since ${fmtDate(m.startDate, { mode: 'short' })}`;
			return el('a', { href: `advisor.html?id=${encodeURIComponent(a.id)}`, style: 'text-decoration:none;color:inherit;' },
				el('div', { class: 'row' },
					el('div', { class: 'avatar' }, initials(a.name)),
					el('div', { class: 'body' },
						el('div', { class: 'name' }, a.name),
						el('div', { class: 'sub' }, m.role || a.careerStatus || ''),
					),
					el('div', { class: 'tail' }, tail),
				));
		}),
	);
}

function snapshotTable(snaps) {
	return el('table', { class: 'snap-table' },
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
				el('td', {}, s.sourceType || '—'),
			))),
	);
}

function kv(label, value) {
	if (value == null || value === '' || value === false) return [];
	return [el('dt', {}, label), el('dd', {}, typeof value === 'object' ? value : String(value))];
}

import {
	api, el, mountPage, getQueryParam, fmtDate, fmtMoney, initials,
	profileHead, sectionCard, articleListBlock, transitionRow, disclosureRow,
} from './app.js';

mountPage({
	active: 'firms',
	build(layout) {
		const left = el('aside', { class: 'left rail' });
		const center = el('section', { class: 'center' });
		const right = el('aside', { class: 'right rail' });
		layout.append(left, center, right);

		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(emptyCard('No firm selected', 'Open a firm from the feed.'));
			return;
		}

		api(`/FirmProfile/${encodeURIComponent(id)}`)
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
	const f = d.firm;
	const tags = [];
	if (f.channel) tags.push({ label: f.channel.replace(/_/g, ' ') });
	if (f.subChannel) tags.push({ label: f.subChannel.replace(/_/g, ' ') });
	if (f.dissolvedYear) tags.push({ kind: 'danger', label: `dissolved ${f.dissolvedYear}` });
	if (f.parentFirmId) tags.push({ kind: 'warn', label: 'subsidiary' });

	const subtitleParts = [];
	if (f.hqCity || f.hqState) subtitleParts.push([f.hqCity, f.hqState].filter(Boolean).join(', '));
	if (f.foundedYear) subtitleParts.push(`founded ${f.foundedYear}`);
	if (f.finraCrd) subtitleParts.push(`FINRA CRD ${f.finraCrd}`);

	center.appendChild(profileHead({
		initialsText: initials(f.name),
		title: f.name,
		subtitle: subtitleParts.join(' · '),
		tags,
	}));

	if (f.notes) {
		center.appendChild(sectionCard('About', el('div', {}, f.notes)));
	}

	// Current advisors — the sticky core: a firm's roster.
	center.appendChild(sectionCard(
		`Current advisors (${d.currentAdvisors.length})`,
		d.currentAdvisors.length
			? advisorListBlock(d.currentAdvisors, { showStart: true })
			: el('div', { class: 'empty' }, 'No current advisors on file.'),
	));

	// Past advisors.
	if (d.pastAdvisors.length) {
		center.appendChild(sectionCard(
			`Past advisors (${d.pastAdvisors.length})`,
			advisorListBlock(d.pastAdvisors, { showEnd: true }),
		));
	}

	// Teams currently here.
	if (d.currentTeams.length) {
		center.appendChild(sectionCard(
			`Teams currently at this firm (${d.currentTeams.length})`,
			el('div', { class: 'entity-list' },
				...d.currentTeams.map((t) =>
					el('a', { href: `team.html?id=${encodeURIComponent(t.id)}`, style: 'text-decoration:none;color:inherit;' },
						el('div', { class: 'row' },
							el('div', { class: 'avatar' }, initials(t.name)),
							el('div', { class: 'body' },
								el('div', { class: 'name' }, t.name),
								el('div', { class: 'sub' }, [
									t.serviceModel ? `${t.serviceModel} clients` : null,
									t.aum != null ? `${fmtMoney(t.aum)} AUM` : null,
									t.teamSize ? `${t.teamSize} members` : null,
								].filter(Boolean).join(' · ')),
							),
						))),
			),
		));
	}

	// Transitions in (recruits) and out (departures).
	if (d.transitionsIn.length) {
		center.appendChild(sectionCard(
			`Recent moves to ${f.short || f.name} (${d.transitionsIn.length})`,
			el('div', {}, ...d.transitionsIn.map(transitionRow)),
		));
	}
	if (d.transitionsOut.length) {
		center.appendChild(sectionCard(
			`Recent moves away from ${f.short || f.name} (${d.transitionsOut.length})`,
			el('div', {}, ...d.transitionsOut.map(transitionRow)),
		));
	}

	// Disclosures recorded while the advisor was at this firm.
	if (d.disclosuresAtThisFirm.length) {
		center.appendChild(sectionCard(
			`Disclosures filed while advisors were at ${f.short || f.name}`,
			el('div', {}, ...d.disclosuresAtThisFirm.map(disclosureRow)),
		));
	}

	// Articles mentioning the firm.
	center.appendChild(sectionCard(
		`Coverage (${d.articles.length})`,
		articleListBlock(d.articles),
	));

	// Right rail: HQ, branches, identifiers.
	right.appendChild(el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, 'Firm details'),
			el('dl', { class: 'kvs' },
				...kv('Channel', f.channel),
				...kv('Sub-channel', f.subChannel),
				...kv('Headquarters', [f.hqCity, f.hqState, f.hqCountry].filter(Boolean).join(', ')),
				...kv('Founded', f.foundedYear),
				...kv('Dissolved', f.dissolvedYear ? `${f.dissolvedYear} (${f.dissolutionReason || 'unknown'})` : null),
				...kv('FINRA CRD', f.finraCrd),
				...kv('SEC filer ID', f.secFilerId),
				...kv('Website', f.website ? el('a', { href: f.website, target: '_blank', rel: 'noreferrer' }, f.website) : null),
			),
		),
	));

	if (d.branches.length) {
		right.appendChild(el('div', { class: 'card' },
			el('div', { class: 'card-body' },
				el('h3', { class: 'card-subtitle' }, `Branches (${d.branches.length})`),
				el('div', { class: 'entity-list' },
					...d.branches.map((b) =>
						el('div', { class: 'row' },
							el('div', { class: 'avatar' }, b.level === 'market' ? 'M' : b.level === 'complex' ? 'C' : 'B'),
							el('div', { class: 'body' },
								el('div', { class: 'name' }, b.name || b.buildingName || '(unnamed)'),
								el('div', { class: 'sub' }, [b.level, [b.city, b.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')),
							),
						))),
			),
		));
	}
}

function advisorListBlock(rows, { showStart = false, showEnd = false } = {}) {
	return el('div', { class: 'entity-list' },
		...rows.map((r) => {
			const a = r.advisor;
			const sub = [r.roleTitle, r.roleCategory].filter(Boolean).join(' · ');
			let tail = '';
			if (showStart && r.startDate) tail = `since ${fmtDate(r.startDate, { mode: 'short' })}`;
			else if (showEnd && r.endDate) tail = `${fmtDate(r.startDate, { mode: 'short' })} – ${fmtDate(r.endDate, { mode: 'short' })}`;
			else if (r.startDate) tail = fmtDate(r.startDate, { mode: 'short' });
			return el('a', { href: `advisor.html?id=${encodeURIComponent(a.id)}`, style: 'text-decoration:none;color:inherit;' },
				el('div', { class: 'row' },
					el('div', { class: 'avatar' }, initials(a.name)),
					el('div', { class: 'body' },
						el('div', { class: 'name' }, a.name),
						sub ? el('div', { class: 'sub' }, sub) : null,
					),
					el('div', { class: 'tail' },
						tail,
						r.reasonForLeaving === 'terminated_for_cause' ? el('div', { class: 'tag danger', style: 'margin-top:2px;' }, 'terminated') : null,
					),
				));
		}),
	);
}

function kv(label, value) {
	if (value == null || value === '' || value === false) return [];
	return [el('dt', {}, label), el('dd', {}, typeof value === 'object' ? value : String(value))];
}

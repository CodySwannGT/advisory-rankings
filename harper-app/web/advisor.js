import {
	api, el, mountPage, getQueryParam, fmtDate, fmtMoney, initials,
	profileHead, sectionCard, articleListBlock, transitionRow, disclosureRow,
} from './app.js';

mountPage({
	active: 'advisors',
	build(layout) {
		const left = el('aside', { class: 'left rail' });
		const center = el('section', { class: 'center' });
		const right = el('aside', { class: 'right rail' });
		layout.append(left, center, right);

		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(emptyCard('No advisor selected', 'Pick an advisor from the feed.'));
			return;
		}
		api(`/AdvisorProfile/${encodeURIComponent(id)}`)
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
	const a = d.advisor;
	const tags = [];
	if (a.careerStatus) {
		const kind = a.careerStatus === 'active' ? 'ok'
			: a.careerStatus === 'barred' || a.careerStatus === 'suspended' ? 'danger'
			: a.careerStatus === 'retired' || a.careerStatus === 'deceased' ? 'warn'
			: '';
		tags.push({ kind, label: a.careerStatus });
	}
	if (a.yearsExperience) tags.push({ label: `${a.yearsExperience}y experience` });
	if (a.finraCrd) tags.push({ label: `CRD ${a.finraCrd}` });

	const currentEh = d.career.find((c) => !c.endDate);
	const subtitleParts = [];
	if (currentEh) {
		subtitleParts.push([currentEh.roleTitle, currentEh.firm?.name].filter(Boolean).join(' at '));
		if (currentEh.branch) subtitleParts.push(currentEh.branch.name);
	} else if (d.career.length) {
		const last = d.career[d.career.length - 1];
		subtitleParts.push(`Last seen at ${last.firm?.name || '?'}`);
	}

	center.appendChild(profileHead({
		initialsText: initials(d.displayName),
		title: d.displayName,
		subtitle: subtitleParts.filter(Boolean).join(' · '),
		tags,
	}));

	// Career timeline — the marquee section on an advisor profile.
	center.appendChild(sectionCard(
		`Career (${d.career.length} firm${d.career.length === 1 ? '' : 's'})`,
		d.career.length ? careerTimeline(d.career) : el('div', { class: 'empty' }, 'No employment history on file.'),
	));

	if (d.teams.length) {
		center.appendChild(sectionCard(
			`Teams`,
			el('div', { class: 'entity-list' },
				...d.teams.filter((t) => t.team).map((m) =>
					el('a', { href: `team.html?id=${encodeURIComponent(m.team.id)}`, style: 'text-decoration:none;color:inherit;' },
						el('div', { class: 'row' },
							el('div', { class: 'avatar' }, initials(m.team.name)),
							el('div', { class: 'body' },
								el('div', { class: 'name' }, m.team.name),
								el('div', { class: 'sub' }, [
									m.role,
									m.team.firm?.short || m.team.firm?.name,
								].filter(Boolean).join(' · ')),
							),
							el('div', { class: 'tail' },
								m.endDate
									? `${fmtDate(m.startDate, { mode: 'short' })} – ${fmtDate(m.endDate, { mode: 'short' })}`
									: m.startDate ? `since ${fmtDate(m.startDate, { mode: 'short' })}` : '',
							),
						))),
			),
		));
	}

	if (d.disclosures.length) {
		center.appendChild(sectionCard(
			`Disclosures (${d.disclosures.length})`,
			el('div', {}, ...d.disclosures.map(disclosureRow)),
		));
	}

	if (d.outsideBusinessActivities.length) {
		center.appendChild(sectionCard(
			`Outside business activities`,
			el('div', { class: 'entity-list' },
				...d.outsideBusinessActivities.map((o) =>
					el('div', { class: 'row' },
						el('div', { class: 'avatar' }, '🏷'),
						el('div', { class: 'body' },
							el('div', { class: 'name' }, o.name || o.vehicleType || 'Outside activity'),
							el('div', { class: 'sub' }, [
								o.vehicleType,
								o.withCustomers ? 'with customers' : null,
								o.disclosedToFirm ? 'disclosed' : 'undisclosed',
								o.startDate ? `${fmtDate(o.startDate, { mode: 'short' })}–${fmtDate(o.endDate, { mode: 'short' })}` : null,
							].filter(Boolean).join(' · ')),
						),
						el('div', { class: 'tail' },
							o.compensationAmountMin ? `≥ ${fmtMoney(o.compensationAmountMin)}` : null,
						),
					)),
			),
		));
	}

	if (d.transitions.length) {
		center.appendChild(sectionCard(
			'Transitions involving this advisor',
			el('div', {}, ...d.transitions.map(transitionRow)),
		));
	}

	center.appendChild(sectionCard(
		`Coverage (${d.articles.length})`,
		articleListBlock(d.articles),
	));

	right.appendChild(el('div', { class: 'card' },
		el('div', { class: 'card-body' },
			el('h3', { class: 'card-subtitle' }, 'Identity'),
			el('dl', { class: 'kvs' },
				...kv('Legal name', a.legalName),
				...kv('Preferred name', a.preferredName),
				...kv('FINRA CRD', a.finraCrd),
				...kv('SEC IARD', a.secIard),
				...kv('Industry start', a.industryStartDate),
				...kv('Years experience', a.yearsExperience),
				...kv('Career status', a.careerStatus),
				...kv('Birth year', a.birthYear),
				...kv('Gender', a.gender === 'undisclosed' ? null : a.gender),
			),
		),
	));

	if (d.registrationApplications.length) {
		right.appendChild(el('div', { class: 'card' },
			el('div', { class: 'card-body' },
				el('h3', { class: 'card-subtitle' }, 'Registration applications'),
				el('div', { class: 'entity-list' },
					...d.registrationApplications.map((r) =>
						el('div', { class: 'row' },
							el('div', { class: 'avatar' }, initials(r.firm?.name || '?')),
							el('div', { class: 'body' },
								el('div', { class: 'name' }, r.firm?.name || '?'),
								el('div', { class: 'sub' }, [
									r.status,
									r.appliedDate ? `applied ${fmtDate(r.appliedDate, { mode: 'short' })}` : null,
								].filter(Boolean).join(' · ')),
							),
						)),
				),
			),
		));
	}
}

function careerTimeline(career) {
	return el('div', { class: 'timeline' },
		...career.map((c) => {
			const cls = !c.endDate ? 'current' : c.reasonForLeaving === 'terminated_for_cause' ? 'terminated' : '';
			return el('div', { class: `step ${cls}` },
				el('div', { class: 'marker' }),
				el('div', { class: 'body' },
					el('div', { class: 'title' },
						c.firm
							? el('a', { href: `firm.html?id=${encodeURIComponent(c.firm.id)}` }, c.firm.name)
							: '?',
						c.branch ? el('span', { class: 'role' }, ` · ${c.branch.name}`) : null,
					),
					el('div', { class: 'when' },
						`${fmtDate(c.startDate, { mode: 'short' })} – ${c.endDate ? fmtDate(c.endDate, { mode: 'short' }) : 'present'}`),
					c.roleTitle ? el('div', { class: 'role' }, c.roleTitle) : null,
					c.reasonForLeaving === 'terminated_for_cause'
						? el('span', { class: 'tag danger' }, 'terminated for cause')
						: null,
					c.u5Filed ? el('span', { class: 'tag warn', style: 'margin-left:6px;' }, 'U5 filed') : null,
				));
		}),
	);
}

function kv(label, value) {
	if (value == null || value === '' || value === false) return [];
	return [el('dt', {}, label), el('dd', {}, typeof value === 'object' ? value : String(value))];
}

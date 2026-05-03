// Firm profile page.
// All UI comes from the design system — see docs/design-system.md.

import { api, refreshMe, logout, fmts, fmtMoney, fmtDate, humanize, initials, getQueryParam } from './app.js';
import {
	mountThreeColumnPage, el,
	EmptyCard, EmptyText, ProfileHead, SectionCard, EntityList, EntityRow,
	DetailsCard, ArticleListBlock, Tag, Heading, Paginated,
	TransitionEventCard, DisclosureEventCard, SourceAttribution,
} from './design-system/index.js';

mountThreeColumnPage({
	active: 'firms',
	refreshMe,
	logout,
	build({ center, right }) {
		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(EmptyCard({ title: 'No firm selected', body: 'Open a firm from the feed.' }));
			return;
		}

		api(`/FirmProfile/${encodeURIComponent(id)}`)
			.then((d) => render(d, center, right))
			.catch((err) => center.appendChild(EmptyCard({ title: 'Error', body: String(err.message || err) })));
	},
});

function render(d, center, right) {
	const f = d.firm;
	const tags = [];
	if (f.channel) tags.push({ label: humanize(f.channel) });
	if (f.subChannel) tags.push({ label: humanize(f.subChannel) });
	if (f.dissolvedYear) tags.push({ kind: 'danger', label: `dissolved ${f.dissolvedYear}` });
	if (f.parentFirmId) tags.push({ kind: 'warn', label: 'subsidiary' });

	const subtitleParts = [];
	if (f.hqCity || f.hqState) subtitleParts.push([f.hqCity, f.hqState].filter(Boolean).join(', '));
	if (f.foundedYear) subtitleParts.push(`founded ${f.foundedYear}`);
	if (f.finraCrd) subtitleParts.push(`FINRA CRD ${f.finraCrd}`);

	center.appendChild(ProfileHead({
		initialsText: initials(f.name),
		title: f.name,
		subtitle: subtitleParts.join(' · '),
		tags,
	}));

	if (f.notes) {
		center.appendChild(SectionCard({ title: 'About', body: el('div', {}, f.notes) }));
	}

	// Current advisors — the sticky core: a firm's roster. Paginated
	// via /FirmAdvisors/<id> so a firm with thousands of seats doesn't
	// drop a 50,000-row payload on the first paint.
	if (d.currentAdvisorCount > 0) {
		center.appendChild(SectionCard({
			title: `Current advisors (${d.currentAdvisorCount})`,
			body: paginatedAdvisors(f.id, 'current', { showStart: true }),
		}));
	} else {
		center.appendChild(SectionCard({
			title: 'Current advisors (0)',
			body: EmptyText({ children: 'No current advisors on file.' }),
		}));
	}

	if (d.pastAdvisorCount > 0) {
		center.appendChild(SectionCard({
			title: `Past advisors (${d.pastAdvisorCount})`,
			body: paginatedAdvisors(f.id, 'past', { showEnd: true }),
		}));
	}

	if (d.currentTeams.length) {
		center.appendChild(SectionCard({
			title: `Teams currently at this firm (${d.currentTeams.length})`,
			body: EntityList({
				rows: d.currentTeams.map((t) => EntityRow({
					avatar: initials(t.name),
					name: t.name,
					sub: [
						t.serviceModel ? `${humanize(t.serviceModel)} clients` : null,
						t.aum != null ? `${fmtMoney(t.aum)} AUM` : null,
						t.teamSize ? `${t.teamSize} members` : null,
					].filter(Boolean).join(' · '),
					href: `team.html?id=${encodeURIComponent(t.id)}`,
				})),
			}),
		}));
	}

	if (d.transitionsIn.length) {
		center.appendChild(SectionCard({
			title: `Recent moves to ${f.short || f.name} (${d.transitionsIn.length})`,
			body: el('div', {}, ...d.transitionsIn.map((t) => TransitionEventCard(t, fmts))),
		}));
	}
	if (d.transitionsOut.length) {
		center.appendChild(SectionCard({
			title: `Recent moves away from ${f.short || f.name} (${d.transitionsOut.length})`,
			body: el('div', {}, ...d.transitionsOut.map((t) => TransitionEventCard(t, fmts))),
		}));
	}

	if (d.disclosuresAtThisFirm.length) {
		center.appendChild(SectionCard({
			title: `Disclosures filed while advisors were at ${f.short || f.name}`,
			body: el('div', {}, ...d.disclosuresAtThisFirm.map((dis) => DisclosureEventCard(dis, fmts))),
		}));
	}

	center.appendChild(SectionCard({
		title: `Coverage (${d.articles.length})`,
		body: ArticleListBlock({ articles: d.articles, fmtDate }),
	}));

	right.appendChild(DetailsCard({
		title: 'Firm details',
		pairs: [
			['Channel',      humanize(f.channel)],
			['Sub-channel',  humanize(f.subChannel)],
			['Headquarters', [f.hqCity, f.hqState, f.hqCountry].filter(Boolean).join(', ')],
			['Founded',      f.foundedYear],
			['Dissolved',    f.dissolvedYear ? `${f.dissolvedYear} (${humanize(f.dissolutionReason) || 'unknown'})` : null],
			['FINRA CRD',    f.finraCrd],
			['SEC filer ID', f.secFilerId],
			['Website',      f.website ? el('a', { href: f.website, target: '_blank', rel: 'noreferrer' }, f.website) : null],
		],
	}));

	if (d.brokerCheckSnapshot) {
		right.appendChild(SectionCard({
			body: [
				Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: 'Regulatory record' }),
				el('div', { class: 'kv-list' },
					_kvRow('FINRA scope (BD)', d.brokerCheckSnapshot.bcScope),
					_kvRow('IA scope', d.brokerCheckSnapshot.iaScope),
					_kvRow('Disclosures', d.brokerCheckSnapshot.disclosureCount ?? '—'),
					_kvRow('State registrations', d.brokerCheckSnapshot.registeredStateCount ?? '—'),
				),
				SourceAttribution({
					source: 'FINRA BrokerCheck',
					url: `https://brokercheck.finra.org/firm/summary/${encodeURIComponent(d.brokerCheckSnapshot.subjectCrd)}`,
					termsUrl: 'https://brokercheck.finra.org/terms',
					fetchedAt: d.brokerCheckSnapshot.fetchedAt,
				}),
			],
		}));
	}

	if (d.branches.length) {
		right.appendChild(SectionCard({
			body: [
				Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: `Branches (${d.branches.length})` }),
				EntityList({
					rows: d.branches.map((b) => EntityRow({
						avatar: b.level === 'market' ? 'M' : b.level === 'complex' ? 'C' : 'B',
						name: b.name || b.buildingName || '(unnamed)',
						sub: [b.level, [b.city, b.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
					})),
				}),
			],
		}));
	}
}

function _kvRow(k, v) {
	if (v === null || v === undefined || v === '') return el('span');
	return el('div', { class: 'kv-row' },
		el('span', { class: 'kv-key' }, k),
		el('span', { class: 'kv-val' }, String(v)),
	);
}

function advisorRow(r, { showStart = false, showEnd = false } = {}) {
	const a = r.advisor;
	const sub = [r.roleTitle, humanize(r.roleCategory)].filter(Boolean).join(' · ');
	let tail = '';
	if (showStart && r.startDate) tail = `since ${fmtDate(r.startDate, { mode: 'short' })}`;
	else if (showEnd && r.endDate) tail = `${fmtDate(r.startDate, { mode: 'short' })} – ${fmtDate(r.endDate, { mode: 'short' })}`;
	else if (r.startDate) tail = fmtDate(r.startDate, { mode: 'short' });
	return EntityRow({
		avatar: initials(a.name),
		name: a.name,
		sub,
		tail: r.reasonForLeaving === 'terminated_for_cause'
			? [tail, Tag({ kind: 'danger', attrs: { style: 'margin-top:2px;display:block;' }, children: 'terminated' })]
			: tail,
		href: `advisor.html?id=${encodeURIComponent(a.id)}`,
	});
}

function paginatedAdvisors(firmId, status, opts) {
	return Paginated({
		fetchPage: async (cursor) => {
			const qs = new URLSearchParams({ status, limit: '50' });
			if (cursor) qs.set('cursor', cursor);
			return api(`/FirmAdvisors/${encodeURIComponent(firmId)}?${qs}`);
		},
		empty: status === 'past' ? 'No past advisors on file.' : 'No current advisors on file.',
		renderRow: (r) => advisorRow(r, opts),
	});
}

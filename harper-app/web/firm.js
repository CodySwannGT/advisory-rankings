// Firm profile page.
// All UI comes from the design system — see docs/design-system.md.

import { api, refreshMe, logout, fmts, fmtMoney, fmtDate, initials, getQueryParam } from './app.js';
import {
	mountThreeColumnPage, el,
	EmptyCard, EmptyText, ProfileHead, SectionCard, EntityList, EntityRow,
	DetailsCard, ArticleListBlock, Tag, Heading,
	TransitionEventCard, DisclosureEventCard,
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
	if (f.channel) tags.push({ label: f.channel.replace(/_/g, ' ') });
	if (f.subChannel) tags.push({ label: f.subChannel.replace(/_/g, ' ') });
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

	// Current advisors — the sticky core: a firm's roster.
	center.appendChild(SectionCard({
		title: `Current advisors (${d.currentAdvisors.length})`,
		body: d.currentAdvisors.length
			? advisorListBlock(d.currentAdvisors, { showStart: true })
			: EmptyText({ children: 'No current advisors on file.' }),
	}));

	if (d.pastAdvisors.length) {
		center.appendChild(SectionCard({
			title: `Past advisors (${d.pastAdvisors.length})`,
			body: advisorListBlock(d.pastAdvisors, { showEnd: true }),
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
						t.serviceModel ? `${t.serviceModel} clients` : null,
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
			['Channel',      f.channel],
			['Sub-channel',  f.subChannel],
			['Headquarters', [f.hqCity, f.hqState, f.hqCountry].filter(Boolean).join(', ')],
			['Founded',      f.foundedYear],
			['Dissolved',    f.dissolvedYear ? `${f.dissolvedYear} (${f.dissolutionReason || 'unknown'})` : null],
			['FINRA CRD',    f.finraCrd],
			['SEC filer ID', f.secFilerId],
			['Website',      f.website ? el('a', { href: f.website, target: '_blank', rel: 'noreferrer' }, f.website) : null],
		],
	}));

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

function advisorListBlock(rows, { showStart = false, showEnd = false } = {}) {
	return EntityList({
		rows: rows.map((r) => {
			const a = r.advisor;
			const sub = [r.roleTitle, r.roleCategory].filter(Boolean).join(' · ');
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
		}),
	});
}

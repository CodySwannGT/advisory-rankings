// Team profile page.
// All UI comes from the design system — see docs/design-system.md.

import { api, refreshMe, logout, fmts, fmtMoney, fmtDate, humanize, initials, getQueryParam, articleSource } from './app.js';
import {
	mountThreeColumnPage, el,
	EmptyCard, EmptyText, ProfileHead, SectionCard, EntityList, EntityRow,
	DetailsCard, ArticleListBlock, SnapshotTable,
	TransitionEventCard,
} from './design-system/index.js';

mountThreeColumnPage({
	active: 'teams',
	refreshMe,
	logout,
	build({ center, right }) {
		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(EmptyCard({ title: 'No team selected', body: 'Pick a team from a firm or feed.' }));
			return;
		}
		api(`/TeamProfile/${encodeURIComponent(id)}`)
			.then((d) => render(d, center, right))
			.catch((err) => center.appendChild(EmptyCard({ title: 'Error', body: String(err.message || err) })));
	},
});

function render(d, center, right) {
	const t = d.team;
	const latest = d.metricSnapshots[d.metricSnapshots.length - 1];
	const tags = [];
	if (t.serviceModel) tags.push({ label: `${humanize(t.serviceModel)} clients` });
	if (t.firmProgram) tags.push({ label: t.firmProgram });
	if (latest?.aum) tags.push({ kind: 'ok', label: `${fmtMoney(latest.aum)} AUM` });
	if (latest?.teamSize) tags.push({ label: `${latest.teamSize} members` });

	const subtitleParts = [];
	if (d.currentFirm) subtitleParts.push(`Currently at ${d.currentFirm.name}`);
	if (d.currentBranch) {
		const where = [d.currentBranch.buildingName || d.currentBranch.name, d.currentBranch.city, d.currentBranch.state].filter(Boolean).join(', ');
		if (where) subtitleParts.push(where);
	}

	center.appendChild(ProfileHead({
		initialsText: initials(t.name),
		title: t.name,
		subtitle: subtitleParts.join(' · '),
		tags,
	}));

	center.appendChild(SectionCard({
		title: `Current members (${d.currentMembers.length})`,
		body: d.currentMembers.length
			? memberList(d.currentMembers, { showStart: true })
			: EmptyText({ children: 'No current members.' }),
	}));
	if (d.pastMembers.length) {
		center.appendChild(SectionCard({
			title: `Past members (${d.pastMembers.length})`,
			body: memberList(d.pastMembers, { showRange: true }),
		}));
	}

	if (d.transitions.length) {
		center.appendChild(SectionCard({
			title: 'Team transitions',
			body: el('div', {}, ...d.transitions.map((tr) => TransitionEventCard(tr, fmts))),
		}));
	}

	if (d.metricSnapshots.length) {
		center.appendChild(SectionCard({
			title: `Metric history (${d.metricSnapshots.length} snapshot${d.metricSnapshots.length === 1 ? '' : 's'})`,
			body: SnapshotTable({ snaps: d.metricSnapshots, fmtMoney, humanize }),
		}));
	}

	center.appendChild(SectionCard({
		title: `Coverage (${d.articles.length})`,
		body: ArticleListBlock({ articles: d.articles, fmtDate, articleSource }),
	}));

	right.appendChild(DetailsCard({
		title: 'Team details',
		pairs: [
			['Name',          t.name],
			['Service model', humanize(t.serviceModel)],
			['Firm program',  t.firmProgram],
			['Founded',       t.foundedYear],
			['Dissolved',     t.dissolvedYear],
			['Current firm',  d.currentFirm
				? el('a', { href: `firm.html?id=${encodeURIComponent(d.currentFirm.id)}` }, d.currentFirm.name)
				: null],
		],
	}));

	if (latest) {
		right.appendChild(DetailsCard({
			title: `Latest metrics (${latest.asOf})`,
			pairs: [
				['AUM',            latest.aum != null ? fmtMoney(latest.aum) : null],
				['Annual revenue', latest.annualRevenue != null ? fmtMoney(latest.annualRevenue) : null],
				['Households',     latest.householdCount],
				['Team size',      latest.teamSize],
				['Source',         humanize(latest.sourceType)],
			],
		}));
	}
}

function memberList(members, { showStart = false, showRange = false } = {}) {
	return EntityList({
		rows: members.map((m) => {
			const a = m.advisor;
			let tail = '';
			if (showRange && m.startDate && m.endDate) tail = `${fmtDate(m.startDate, { mode: 'short' })} – ${fmtDate(m.endDate, { mode: 'short' })}`;
			else if (showStart && m.startDate) tail = `since ${fmtDate(m.startDate, { mode: 'short' })}`;
			return EntityRow({
				avatar: initials(a.name),
				name: a.name,
				sub: humanize(m.role || a.careerStatus) || '',
				tail,
				href: `advisor.html?id=${encodeURIComponent(a.id)}`,
			});
		}),
	});
}

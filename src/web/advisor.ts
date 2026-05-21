// @ts-nocheck
// Advisor profile page.
// All UI comes from the design system — see docs/design-system.md.

import { api, refreshMe, logout, search, fmts, fmtMoney, fmtDate, humanize, initials, getQueryParam, articleSource } from './app.js';
import {
	mountThreeColumnPage, el,
	EmptyCard, EmptyText, ProfileHead, SectionCard, EntityList, EntityRow,
	DetailsCard, ArticleListBlock, CareerTimeline, Heading,
	TransitionEventCard, DisclosureEventCard, SourceAttribution,
} from './design-system/index.js';

mountThreeColumnPage({
	active: 'advisors',
	refreshMe,
	logout,
	search,
	build({ center, right }) {
		const id = getQueryParam('id');
		if (!id) {
			center.appendChild(EmptyCard({ title: 'No advisor selected', body: 'Pick an advisor from the feed.' }));
			return;
		}
		api(`/AdvisorProfile/${encodeURIComponent(id)}`)
			.then((d) => render(d, center, right))
			.catch((err) => center.appendChild(EmptyCard({ title: 'Error', body: String(err.message || err) })));
	},
});

function render(d, center, right) {
	const a = d.advisor;
	const tags = [];
	if (a.careerStatus) {
		const kind = a.careerStatus === 'active' ? 'ok'
			: a.careerStatus === 'barred' || a.careerStatus === 'suspended' ? 'danger'
			: a.careerStatus === 'retired' || a.careerStatus === 'deceased' ? 'warn'
			: 'default';
		tags.push({ kind, label: humanize(a.careerStatus) });
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

	center.appendChild(ProfileHead({
		initialsText: initials(d.displayName),
		title: d.displayName,
		subtitle: subtitleParts.filter(Boolean).join(' · '),
		tags,
	}));

	// Career timeline — the marquee section on an advisor profile.
	const careerBody = el('div', {});
	if (d.career.length) {
		careerBody.appendChild(CareerTimeline({ career: d.career, fmtDate }));
	} else {
		careerBody.appendChild(EmptyText({ children: 'No employment history on file.' }));
	}
	if (d.brokerCheckSnapshot && d.career.length) {
		careerBody.appendChild(SourceAttribution({
			source: 'FINRA BrokerCheck',
			url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(d.brokerCheckSnapshot.subjectCrd)}`,
			termsUrl: 'https://brokercheck.finra.org/terms',
			fetchedAt: d.brokerCheckSnapshot.fetchedAt,
		}));
	}
	center.appendChild(SectionCard({
		title: `Career (${d.career.length} firm${d.career.length === 1 ? '' : 's'})`,
		body: careerBody,
	}));

	if (d.teams.length) {
		center.appendChild(SectionCard({
			title: 'Teams',
			body: EntityList({
				rows: d.teams.filter((t) => t.team).map((m) => EntityRow({
					avatar: initials(m.team.name),
					name: m.team.name,
					sub: [m.role, m.team.firm?.short || m.team.firm?.name].filter(Boolean).join(' · '),
					tail: m.endDate
						? `${fmtDate(m.startDate, { mode: 'short' })} – ${fmtDate(m.endDate, { mode: 'short' })}`
						: m.startDate ? `since ${fmtDate(m.startDate, { mode: 'short' })}` : '',
					href: `team.html?id=${encodeURIComponent(m.team.id)}`,
				})),
			}),
		}));
	}

	if (d.licenses && d.licenses.length) {
		const body = el('div', {},
			EntityList({
				rows: d.licenses.map((l) => EntityRow({
					avatar: initials(humanize(l.licenseType)),
					name: humanize(l.licenseType) || l.licenseType,
					sub: [
						l.state ? `state ${l.state}` : null,
						l.grantedDate ? `granted ${fmtDate(l.grantedDate, { mode: 'short' })}` : null,
						l.status && l.status !== 'active' ? humanize(l.status) : null,
					].filter(Boolean).join(' · '),
				})),
			}),
		);
		if (d.brokerCheckSnapshot) {
			body.appendChild(SourceAttribution({
				source: 'FINRA BrokerCheck',
				url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(d.brokerCheckSnapshot.subjectCrd)}`,
				termsUrl: 'https://brokercheck.finra.org/terms',
				fetchedAt: d.brokerCheckSnapshot.fetchedAt,
			}));
		}
		center.appendChild(SectionCard({
			title: `Licenses & exams (${d.licenses.length})`,
			body,
		}));
	}

	if (d.designations && d.designations.length) {
		center.appendChild(SectionCard({
			title: `Designations (${d.designations.length})`,
			body: EntityList({
				rows: d.designations.map((g) => EntityRow({
					avatar: g.code,
					name: g.code,
					sub: [
						g.grantingBody,
						g.earnedDate ? `earned ${fmtDate(g.earnedDate, { mode: 'short' })}` : null,
						g.status && g.status !== 'active' ? humanize(g.status) : null,
					].filter(Boolean).join(' · '),
				})),
			}),
		}));
	}

	if (d.education && d.education.length) {
		center.appendChild(SectionCard({
			title: `Education (${d.education.length})`,
			body: EntityList({
				rows: d.education.map((e) => EntityRow({
					avatar: initials(e.institution || '?'),
					name: e.institution || '(unknown institution)',
					sub: [
						e.degree,
						e.field,
						e.graduationYear,
					].filter(Boolean).join(' · '),
				})),
			}),
		}));
	}

	if (d.disclosures.length) {
		const discBody = el('div', {}, ...d.disclosures.map((dis) => DisclosureEventCard(dis, fmts)));
		if (d.brokerCheckSnapshot) {
			discBody.appendChild(SourceAttribution({
				source: 'FINRA BrokerCheck',
				url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(d.brokerCheckSnapshot.subjectCrd)}`,
				termsUrl: 'https://brokercheck.finra.org/terms',
				fetchedAt: d.brokerCheckSnapshot.fetchedAt,
			}));
		}
		center.appendChild(SectionCard({
			title: `Disclosures (${d.disclosures.length})`,
			body: discBody,
		}));
	}

	if (d.outsideBusinessActivities.length) {
		center.appendChild(SectionCard({
			title: 'Outside business activities',
			body: EntityList({
				rows: d.outsideBusinessActivities.map((o) => EntityRow({
					avatar: '🏷',
					name: o.name || humanize(o.vehicleType) || 'Outside activity',
					sub: [
						humanize(o.vehicleType),
						o.withCustomers ? 'with customers' : null,
						o.disclosedToFirm ? 'disclosed' : 'undisclosed',
						o.startDate ? `${fmtDate(o.startDate, { mode: 'short' })}–${fmtDate(o.endDate, { mode: 'short' })}` : null,
					].filter(Boolean).join(' · '),
					tail: o.compensationAmountMin ? `≥ ${fmtMoney(o.compensationAmountMin)}` : null,
				})),
			}),
		}));
	}

	if (d.transitions.length) {
		center.appendChild(SectionCard({
			title: 'Transitions involving this advisor',
			body: el('div', {}, ...d.transitions.map((t) => TransitionEventCard(t, fmts))),
		}));
	}

	center.appendChild(SectionCard({
		title: `Coverage (${d.articles.length})`,
		body: ArticleListBlock({ articles: d.articles, fmtDate, articleSource }),
	}));

	right.appendChild(DetailsCard({
		title: 'Identity',
		pairs: [
			['Legal name',       a.legalName],
			['Preferred name',   a.preferredName],
			['FINRA CRD',        a.finraCrd],
			['SEC IARD',         a.secIard],
			['Industry start',   a.industryStartDate],
			['Years experience', a.yearsExperience],
			['Career status',    humanize(a.careerStatus)],
			['Birth year',       a.birthYear],
			['Gender',           a.gender === 'undisclosed' ? null : a.gender],
		],
	}));

	if (d.registrationApplications.length) {
		right.appendChild(SectionCard({
			body: [
				Heading({ level: 3, attrs: { class: 'card-subtitle' }, children: 'Registration applications' }),
				EntityList({
					rows: d.registrationApplications.map((r) => EntityRow({
						avatar: initials(r.firm?.name || '?'),
						name: r.firm?.name || '?',
						sub: [
							humanize(r.status),
							r.appliedDate ? `applied ${fmtDate(r.appliedDate, { mode: 'short' })}` : null,
						].filter(Boolean).join(' · '),
					})),
				}),
			],
		}));
	}
}

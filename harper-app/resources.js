/**
 * Custom JS resources backing the Facebook-style web UI in `web/`.
 *
 * Why server-side aggregation instead of letting the browser fan out
 * to ~15 raw REST endpoints (the verify_via_rest.py pattern):
 *  - one round-trip per page = fewer auth + CORS + waterfall headaches.
 *  - the joins are dataset-shape-specific. Doing them in the browser
 *    means re-implementing them in two languages (Python + JS).
 *  - the per-table indexes Harper auto-builds are local to this
 *    process anyway.
 *
 * Endpoints (mounted on the same REST port as the auto-exported tables):
 *   GET /Feed                  → activity feed: latest articles, each
 *                                hydrated with the entities it mentions
 *                                and the events it documents.
 *   GET /ArticleView/<id>      → single article + every entity it touches.
 *   GET /FirmProfile/<id>      → firm, current/past advisors, current
 *                                teams, transitions in/out, articles.
 *   GET /AdvisorProfile/<id>   → advisor, career walk, teams,
 *                                disclosures + sanctions, OBAs, articles.
 *   GET /TeamProfile/<id>      → team, current/past members, metric
 *                                snapshots, transitions, articles.
 *
 * `tables` and `Resource` are injected as globals by Harper's jsResource
 * loader — see harperdb/application-template/resources.js.
 */

// ─── helpers ──────────────────────────────────────────────────────

async function collect(iter) {
	const out = [];
	for await (const row of iter) out.push(row);
	return out;
}

async function all(table) {
	return collect(table.search({}));
}

function indexBy(rows, key) {
	const m = new Map();
	for (const r of rows) m.set(r[key], r);
	return m;
}

function groupBy(rows, key) {
	const m = new Map();
	for (const r of rows) {
		const v = r[key];
		if (v == null) continue;
		if (!m.has(v)) m.set(v, []);
		m.get(v).push(r);
	}
	return m;
}

function advisorDisplayName(a) {
	if (!a) return null;
	return a.preferredName
		? `${a.preferredName} ${a.lastName ?? ''}`.trim()
		: (a.legalName ?? a.lastName ?? a.id);
}

function firmShort(name) {
	if (!name) return name;
	// Strip trailing entity descriptors so chips stay narrow.
	return name
		.replace(/\s+Wealth Management(\s+USA)?$/, '')
		.replace(/\s+Advisors$/, '')
		.replace(/\s+Group$/, '');
}

// Snapshot of every table, keyed for fast joins.  Built once per request
// from `all()` reads — fine for the sub-thousand-row dataset this app
// runs on.  If the dataset grows, switch the hot paths (Feed, profiles)
// to indexed `search({conditions:[...]})` queries.
async function loadAll() {
	const [
		articles,
		advisors, firms, teams, branches,
		employments, memberships,
		teamSnaps, advisorSnaps,
		transitions, deals,
		disclosures, sanctions, obas, clusters,
		regApps, branchAssignments,
		mAdv, mFirm, mTeam, mTE, mDisc,
		fieldAssertions,
	] = await Promise.all([
		all(tables.Article),
		all(tables.Advisor),
		all(tables.Firm),
		all(tables.Team),
		all(tables.Branch),
		all(tables.EmploymentHistory),
		all(tables.TeamMembership),
		all(tables.TeamMetricSnapshot),
		all(tables.AdvisorMetricSnapshot),
		all(tables.TransitionEvent),
		all(tables.RecruitingDealQuote),
		all(tables.Disclosure),
		all(tables.Sanction),
		all(tables.OutsideBusinessActivity),
		all(tables.DisclosureCluster),
		all(tables.RegistrationApplication),
		all(tables.BranchAssignment),
		all(tables.ArticleAdvisorMention),
		all(tables.ArticleFirmMention),
		all(tables.ArticleTeamMention),
		all(tables.ArticleTransitionEventMention),
		all(tables.ArticleDisclosureMention),
		all(tables.FieldAssertion),
	]);
	return {
		articles, advisors, firms, teams, branches,
		employments, memberships,
		teamSnaps, advisorSnaps,
		transitions, deals,
		disclosures, sanctions, obas, clusters,
		regApps, branchAssignments,
		mAdv, mFirm, mTeam, mTE, mDisc,
		fieldAssertions,
		byAdvisor: indexBy(advisors, 'id'),
		byFirm: indexBy(firms, 'id'),
		byTeam: indexBy(teams, 'id'),
		byBranch: indexBy(branches, 'id'),
		byArticle: indexBy(articles, 'id'),
		byTransition: indexBy(transitions, 'id'),
		byDeal: indexBy(deals, 'id'),
		byDisclosure: indexBy(disclosures, 'id'),
		byCluster: indexBy(clusters, 'id'),
	};
}

// Compact "subject" for an entity, suitable for chips and headers.
function advisorChip(a, db) {
	if (!a) return null;
	const eh = (db.employments || [])
		.filter((e) => e.advisorId === a.id && !e.endDate)
		.sort((x, y) => (y.startDate ?? '').localeCompare(x.startDate ?? ''))[0];
	const firm = eh ? db.byFirm.get(eh.firmId) : null;
	return {
		id: a.id,
		kind: 'advisor',
		name: advisorDisplayName(a),
		role: eh?.roleTitle || null,
		firm: firm ? { id: firm.id, name: firm.name, short: firmShort(firm.name) } : null,
		careerStatus: a.careerStatus || null,
	};
}

function firmChip(f) {
	if (!f) return null;
	return {
		id: f.id,
		kind: 'firm',
		name: f.name,
		short: firmShort(f.name),
		channel: f.channel,
		hq: [f.hqCity, f.hqState].filter(Boolean).join(', ') || null,
		dissolvedYear: f.dissolvedYear || null,
	};
}

function teamChip(t, db) {
	if (!t) return null;
	const firm = t.currentFirmId ? db.byFirm.get(t.currentFirmId) : null;
	const latestSnap = (db.teamSnaps || [])
		.filter((s) => s.teamId === t.id)
		.sort((x, y) => (y.asOf ?? '').localeCompare(x.asOf ?? ''))[0];
	return {
		id: t.id,
		kind: 'team',
		name: t.name,
		firm: firm ? { id: firm.id, name: firm.name, short: firmShort(firm.name) } : null,
		serviceModel: t.serviceModel || null,
		aum: latestSnap?.aum ?? null,
		teamSize: latestSnap?.teamSize ?? null,
	};
}

// Build a "summary card" for an article based on the events it documents.
// This is what makes the feed sticky vs. just dumping the headline.
function summarizeArticle(article, db) {
	// Transition-event articles → "from → to · $X AUM · N advisors"
	const teIds = db.mTE.filter((m) => m.articleId === article.id).map((m) => m.transitionEventId);
	if (teIds.length) {
		const transitions = teIds.map((id) => db.byTransition.get(id)).filter(Boolean);
		return transitions.map((te) => {
			const fromFirm = db.byFirm.get(te.fromFirmId);
			const toFirm = db.byFirm.get(te.toFirmId);
			const subject =
				(te.subjectTeamId && db.byTeam.get(te.subjectTeamId)?.name) ||
				(te.subjectAdvisorId && advisorDisplayName(db.byAdvisor.get(te.subjectAdvisorId))) ||
				(te.subjectFirmId && db.byFirm.get(te.subjectFirmId)?.name) ||
				null;
			const deal = te.recruitingDealId ? db.byDeal.get(te.recruitingDealId) : null;
			return {
				kind: 'transition',
				transitionEventId: te.id,
				subject,
				fromFirm: firmChip(fromFirm),
				toFirm: firmChip(toFirm),
				moveDate: te.moveDate,
				aumMoved: te.aumMoved,
				productionT12: te.productionT12,
				headcountMoved: te.headcountMoved,
				isBreakaway: te.isBreakaway,
				isReturn: te.isReturn,
				deal: deal && {
					upfrontPctT12: deal.upfrontPctT12,
					producerTier: deal.producerTier,
					backendMetrics: deal.backendMetrics,
				},
			};
		});
	}
	// Disclosure articles → "regulator · sanction · allegation"
	const discIds = db.mDisc.filter((m) => m.articleId === article.id).map((m) => m.disclosureId);
	if (discIds.length) {
		return discIds.map((id) => {
			const d = db.byDisclosure.get(id);
			if (!d) return null;
			const sancs = db.sanctions.filter((s) => s.disclosureId === d.id);
			const advisor = db.byAdvisor.get(d.advisorId);
			return {
				kind: 'disclosure',
				disclosureId: d.id,
				advisor: advisor && { id: advisor.id, name: advisorDisplayName(advisor) },
				disclosureType: d.disclosureType,
				regulator: d.regulator,
				regulatorState: d.regulatorState,
				forum: d.forum,
				status: d.status,
				dateInitiated: d.dateInitiated,
				dateResolved: d.dateResolved,
				allegationText: d.allegationText,
				allegationCategories: d.allegationCategories,
				ruleViolations: d.ruleViolations,
				awardAmount: d.awardAmount,
				sanctions: sancs.map((s) => ({
					sanctionType: s.sanctionType,
					amount: s.amount,
					durationMonths: s.durationMonths,
					jurisdiction: s.jurisdiction,
				})),
			};
		}).filter(Boolean);
	}
	return [];
}

// Derive a one-sentence dek if the article doesn't carry one already.
// (Most ingested articles don't fill `dek`; we still want the feed
// card to give the reader a reason to click.)
function deriveDek(article, eventCards) {
	if (article.dek) return article.dek;
	if (article.bodyText) return article.bodyText.slice(0, 240).replace(/\s+\S*$/, '') + '…';
	const t = (eventCards || [])[0];
	if (t?.kind === 'transition') {
		const aum = t.aumMoved ? ` ($${(t.aumMoved / 1e9).toFixed(2)}B AUM)` : '';
		return `${t.subject ?? 'Team'} moves from ${t.fromFirm?.short ?? '?'} to ${t.toFirm?.short ?? '?'}${aum}.`;
	}
	if (t?.kind === 'disclosure') {
		return `${t.advisor?.name ?? 'Advisor'}: ${t.regulator ?? 'regulatory'} ${t.disclosureType ?? 'matter'}.`;
	}
	return '';
}

function feedItem(article, db) {
	const eventCards = summarizeArticle(article, db);
	const advisorIds = db.mAdv.filter((m) => m.articleId === article.id).map((m) => m.advisorId);
	const firmIds = db.mFirm.filter((m) => m.articleId === article.id).map((m) => m.firmId);
	const teamIds = db.mTeam.filter((m) => m.articleId === article.id).map((m) => m.teamId);
	return {
		article: {
			id: article.id,
			headline: article.headline,
			dek: deriveDek(article, eventCards),
			url: article.url,
			slug: article.slug,
			publishedDate: article.publishedDate,
			modifiedDate: article.modifiedDate,
			authors: article.authors || [],
			category: article.category,
		},
		eventCards,
		advisors: advisorIds.map((id) => advisorChip(db.byAdvisor.get(id), db)).filter(Boolean),
		firms: firmIds.map((id) => firmChip(db.byFirm.get(id))).filter(Boolean),
		teams: teamIds.map((id) => teamChip(db.byTeam.get(id), db)).filter(Boolean),
	};
}

// ─── /Feed ────────────────────────────────────────────────────────

export class Feed extends Resource {
	async get() {
		const db = await loadAll();
		const items = db.articles
			.slice()
			.sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
			.map((a) => feedItem(a, db));
		return {
			generatedAt: new Date().toISOString(),
			count: items.length,
			items,
		};
	}
}

// ─── /ArticleView/<id> ────────────────────────────────────────────

export class ArticleView extends Resource {
	async get(target) {
		const id = typeof target === 'string' ? target : target?.toString?.();
		if (!id) return { error: 'missing article id' };
		const db = await loadAll();
		const article = db.byArticle.get(id);
		if (!article) return { error: 'not found', id };
		const item = feedItem(article, db);
		const fas = db.fieldAssertions
			.filter((f) => f.articleId === id)
			.map((f) => ({
				targetTable: f.targetTable,
				targetId: f.targetId,
				fieldName: f.fieldName,
				assertedValue: f.assertedValue,
				quotePhrase: f.quotePhrase,
				confidence: f.confidence,
			}));
		return {
			...item,
			body: { html: article.bodyHtml || null, text: article.bodyText || null },
			provenance: fas,
		};
	}
}

// ─── /FirmProfile/<id> ────────────────────────────────────────────

export class FirmProfile extends Resource {
	async get(target) {
		const id = typeof target === 'string' ? target : target?.toString?.();
		if (!id) return { error: 'missing firm id' };
		const db = await loadAll();
		const firm = db.byFirm.get(id);
		if (!firm) return { error: 'not found', id };

		// Bucket employment rows into current vs. past for the firm.
		const ehHere = db.employments.filter((e) => e.firmId === id);
		const currentAdvisors = [];
		const pastAdvisors = [];
		for (const e of ehHere) {
			const a = db.byAdvisor.get(e.advisorId);
			if (!a) continue;
			const row = {
				advisor: { id: a.id, name: advisorDisplayName(a), careerStatus: a.careerStatus },
				roleTitle: e.roleTitle,
				roleCategory: e.roleCategory,
				startDate: e.startDate,
				endDate: e.endDate,
				reasonForLeaving: e.reasonForLeaving,
				aumAtDeparture: e.aumAtDeparture,
			};
			(e.endDate ? pastAdvisors : currentAdvisors).push(row);
		}
		currentAdvisors.sort((x, y) => (y.startDate ?? '').localeCompare(x.startDate ?? ''));
		pastAdvisors.sort((x, y) => (y.endDate ?? '').localeCompare(x.endDate ?? ''));

		const teamsHere = db.teams
			.filter((t) => t.currentFirmId === id)
			.map((t) => teamChip(t, db));

		const transitionsIn = db.transitions
			.filter((t) => t.toFirmId === id)
			.sort((x, y) => (y.moveDate ?? '').localeCompare(x.moveDate ?? ''))
			.map((t) => transitionRow(t, db));
		const transitionsOut = db.transitions
			.filter((t) => t.fromFirmId === id)
			.sort((x, y) => (y.moveDate ?? '').localeCompare(x.moveDate ?? ''))
			.map((t) => transitionRow(t, db));

		const articleIds = new Set(db.mFirm.filter((m) => m.firmId === id).map((m) => m.articleId));
		const articles = [...articleIds]
			.map((aid) => db.byArticle.get(aid))
			.filter(Boolean)
			.sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
			.map((a) => articleStub(a));

		const branchesHere = db.branches.filter((b) => b.firmId === id);

		const firmDisclosures = db.disclosures
			.filter((d) => d.firmIdAtTime === id)
			.map((d) => disclosureRow(d, db));

		return {
			firm: {
				...firm,
				short: firmShort(firm.name),
			},
			currentAdvisors,
			pastAdvisors,
			currentTeams: teamsHere,
			transitionsIn,
			transitionsOut,
			branches: branchesHere,
			disclosuresAtThisFirm: firmDisclosures,
			articles,
		};
	}
}

function transitionRow(t, db) {
	const fromFirm = db.byFirm.get(t.fromFirmId);
	const toFirm = db.byFirm.get(t.toFirmId);
	const subject =
		(t.subjectTeamId && { kind: 'team', id: t.subjectTeamId, name: db.byTeam.get(t.subjectTeamId)?.name }) ||
		(t.subjectAdvisorId && { kind: 'advisor', id: t.subjectAdvisorId, name: advisorDisplayName(db.byAdvisor.get(t.subjectAdvisorId)) }) ||
		(t.subjectFirmId && { kind: 'firm', id: t.subjectFirmId, name: db.byFirm.get(t.subjectFirmId)?.name }) || null;
	const deal = t.recruitingDealId ? db.byDeal.get(t.recruitingDealId) : null;
	return {
		id: t.id,
		subject,
		fromFirm: firmChip(fromFirm),
		toFirm: firmChip(toFirm),
		moveDate: t.moveDate,
		aumMoved: t.aumMoved,
		productionT12: t.productionT12,
		headcountMoved: t.headcountMoved,
		isBreakaway: t.isBreakaway,
		isReturn: t.isReturn,
		deal: deal && {
			upfrontPctT12: deal.upfrontPctT12,
			producerTier: deal.producerTier,
			backendMetrics: deal.backendMetrics,
		},
	};
}

function disclosureRow(d, db) {
	const sancs = db.sanctions.filter((s) => s.disclosureId === d.id);
	const advisor = db.byAdvisor.get(d.advisorId);
	return {
		id: d.id,
		advisor: advisor && { id: advisor.id, name: advisorDisplayName(advisor) },
		disclosureType: d.disclosureType,
		regulator: d.regulator,
		regulatorState: d.regulatorState,
		forum: d.forum,
		status: d.status,
		admitDeny: d.admitDeny,
		dateInitiated: d.dateInitiated,
		dateResolved: d.dateResolved,
		allegationText: d.allegationText,
		allegationCategories: d.allegationCategories,
		ruleViolations: d.ruleViolations,
		awardAmount: d.awardAmount,
		settlementAmount: d.settlementAmount,
		damagesRequested: d.damagesRequested,
		clusterId: d.clusterId,
		sanctions: sancs,
	};
}

function articleStub(a) {
	return {
		id: a.id,
		headline: a.headline,
		publishedDate: a.publishedDate,
		category: a.category,
		url: a.url,
	};
}

// ─── /AdvisorProfile/<id> ─────────────────────────────────────────

export class AdvisorProfile extends Resource {
	async get(target) {
		const id = typeof target === 'string' ? target : target?.toString?.();
		if (!id) return { error: 'missing advisor id' };
		const db = await loadAll();
		const advisor = db.byAdvisor.get(id);
		if (!advisor) return { error: 'not found', id };

		const career = db.employments
			.filter((e) => e.advisorId === id)
			.sort((x, y) => (x.startDate ?? '').localeCompare(y.startDate ?? ''))
			.map((e) => {
				const firm = db.byFirm.get(e.firmId);
				const branch = e.branchId ? db.byBranch.get(e.branchId) : null;
				return {
					firm: firmChip(firm),
					branch: branch && { id: branch.id, name: branch.name, level: branch.level, city: branch.city, state: branch.state },
					roleTitle: e.roleTitle,
					roleCategory: e.roleCategory,
					startDate: e.startDate,
					endDate: e.endDate,
					reasonForLeaving: e.reasonForLeaving,
					aumAtDeparture: e.aumAtDeparture,
					productionT12AtDeparture: e.productionT12AtDeparture,
					signingBonusPromissoryNote: e.signingBonusPromissoryNote,
					u5Filed: e.u5Filed,
					u5FilingDate: e.u5FilingDate,
				};
			});

		const teams = db.memberships
			.filter((m) => m.advisorId === id)
			.map((m) => {
				const t = db.byTeam.get(m.teamId);
				return {
					team: t && teamChip(t, db),
					role: m.role,
					startDate: m.startDate,
					endDate: m.endDate,
				};
			});

		const disclosures = db.disclosures
			.filter((d) => d.advisorId === id)
			.sort((x, y) => (x.dateInitiated ?? x.dateResolved ?? '').localeCompare(y.dateInitiated ?? y.dateResolved ?? ''))
			.map((d) => disclosureRow(d, db));

		const obasHere = db.obas.filter((o) => o.advisorId === id);
		const regAppsHere = db.regApps.filter((r) => r.advisorId === id).map((r) => ({
			...r,
			firm: firmChip(db.byFirm.get(r.firmId)),
		}));

		const articleIds = new Set(db.mAdv.filter((m) => m.advisorId === id).map((m) => m.articleId));
		const articles = [...articleIds]
			.map((aid) => db.byArticle.get(aid)).filter(Boolean)
			.sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
			.map(articleStub);

		const transitions = db.transitions
			.filter((t) => t.subjectAdvisorId === id)
			.map((t) => transitionRow(t, db));

		return {
			advisor,
			displayName: advisorDisplayName(advisor),
			career,
			teams,
			disclosures,
			outsideBusinessActivities: obasHere,
			registrationApplications: regAppsHere,
			transitions,
			articles,
		};
	}
}

// ─── /TeamProfile/<id> ────────────────────────────────────────────

export class TeamProfile extends Resource {
	async get(target) {
		const id = typeof target === 'string' ? target : target?.toString?.();
		if (!id) return { error: 'missing team id' };
		const db = await loadAll();
		const team = db.byTeam.get(id);
		if (!team) return { error: 'not found', id };

		const memberRows = db.memberships.filter((m) => m.teamId === id);
		const currentMembers = [];
		const pastMembers = [];
		for (const m of memberRows) {
			const a = db.byAdvisor.get(m.advisorId);
			if (!a) continue;
			const row = {
				advisor: { id: a.id, name: advisorDisplayName(a), careerStatus: a.careerStatus },
				role: m.role,
				startDate: m.startDate,
				endDate: m.endDate,
			};
			(m.endDate ? pastMembers : currentMembers).push(row);
		}
		// Lead first, then by start date ascending.
		const ROLE_ORDER = { lead: 0, founding_partner: 1, partner: 2, support_csa: 3 };
		const sortMembers = (arr) =>
			arr.sort((x, y) => {
				const r = (ROLE_ORDER[x.role] ?? 99) - (ROLE_ORDER[y.role] ?? 99);
				if (r) return r;
				return (x.startDate ?? '').localeCompare(y.startDate ?? '');
			});
		sortMembers(currentMembers);
		sortMembers(pastMembers);

		const snaps = db.teamSnaps
			.filter((s) => s.teamId === id)
			.sort((x, y) => (x.asOf ?? '').localeCompare(y.asOf ?? ''));

		const transitions = db.transitions
			.filter((t) => t.subjectTeamId === id)
			.map((t) => transitionRow(t, db));

		const articleIds = new Set(db.mTeam.filter((m) => m.teamId === id).map((m) => m.articleId));
		const articles = [...articleIds]
			.map((aid) => db.byArticle.get(aid)).filter(Boolean)
			.sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
			.map(articleStub);

		const firm = team.currentFirmId ? db.byFirm.get(team.currentFirmId) : null;
		const branch = team.currentBranchId ? db.byBranch.get(team.currentBranchId) : null;

		return {
			team,
			currentFirm: firm && firmChip(firm),
			currentBranch: branch && { id: branch.id, name: branch.name, level: branch.level, address: branch.address, city: branch.city, state: branch.state, buildingName: branch.buildingName },
			currentMembers,
			pastMembers,
			metricSnapshots: snaps,
			transitions,
			articles,
		};
	}
}

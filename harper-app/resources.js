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
 *                                disclosures + sanctions, OBAs,
 *                                licenses, designations, education,
 *                                articles.
 *   GET /TeamProfile/<id>      → team, current/past members, metric
 *                                snapshots, transitions, articles.
 *
 * `tables` and `Resource` are injected as globals by Harper's jsResource
 * loader — see harperdb/application-template/resources.js.
 */

// ─── helpers ──────────────────────────────────────────────────────

// Robust date comparator. Harper returns dates as Date instances when
// queried via `tables.X.search({})` (production path), but as ISO-8601
// strings when read through the operations-API SQL endpoint (the path
// scripts/dev_server uses locally). The first cluster deploy fell over
// because Date.localeCompare doesn't exist; coerce to ms-since-epoch
// instead so sort handles both shapes.
// `target` for /FirmProfile/<id> arrives differently per transport:
//   - Local dev_server passes the raw id (string).
//   - Production Harper passes a RequestTarget whose toString() yields
//     the matched path slice — sometimes "<id>", sometimes "/<id>".
// Strip a single leading slash so both shapes resolve.
function normalizeId(target) {
	if (target == null) return '';
	// Harper's RequestTarget extends URLSearchParams and exposes the
	// pre-parsed path id at `target.id`. Prefer that when present, fall
	// back to toString() for the dev_server bridge and any older callers.
	if (typeof target === 'object' && target.id != null) return String(target.id);
	const s = typeof target === 'string' ? target : (target.toString?.() ?? '');
	return s.startsWith('/') ? s.slice(1) : s;
}

// Pull cursor + limit off a Harper RequestTarget (or the dev_server's
// URLSearchParams-compatible shim). Returns concrete defaults so call
// sites don't need to repeat them.
//
//   cursor : opaque base64url-encoded `${sortKey}|${id}` token. The
//            resource decodes/encodes it; clients just round-trip the
//            value they got from `nextCursor`.
//   limit  : 1..MAX_LIMIT, default 50.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
function parsePagination(target) {
	let cursor = null;
	let limitRaw = null;
	if (target && typeof target.get === 'function') {
		cursor = target.get('cursor') || null;
		limitRaw = target.get('limit');
	}
	// Harper also pre-parses `?limit=` onto target.limit as a number.
	if (limitRaw == null && target && typeof target.limit === 'number') limitRaw = target.limit;
	const parsed = parseInt(limitRaw, 10);
	const limit = Math.min(parsed > 0 ? parsed : DEFAULT_LIMIT, MAX_LIMIT);
	return { cursor, limit };
}

// Cursor encoding: opaque to clients, but readable in logs. Pack the
// last seen sort key + id so we can resume on inserts that land
// between two adjacent records.
function encodeCursor(sortKey, id) {
	const raw = `${sortKey ?? ''}\x00${id ?? ''}`;
	return Buffer.from(raw, 'utf8').toString('base64url');
}
function decodeCursor(cursor) {
	if (!cursor) return null;
	try {
		const raw = Buffer.from(cursor, 'base64url').toString('utf8');
		const idx = raw.indexOf('\x00');
		if (idx < 0) return null;
		return { sortKey: raw.slice(0, idx), id: raw.slice(idx + 1) };
	} catch {
		return null;
	}
}

// Pack a date into a fixed-width string that lex-compares in
// reverse-chronological order — newest first.  Used as the sort key
// for advisor employment rows so we can paginate "most-recent first"
// with the same string-cursor machinery `paginate` uses.
function inverseDateKey(date) {
	const ms = dateMs(date);
	// 14 digits comfortably covers any plausible epoch-ms value
	// (Number.MAX_SAFE_INTEGER is 16 digits).
	const inv = 99999999999999n - BigInt(Math.max(0, ms));
	return String(inv).padStart(14, '0');
}

// Slice a pre-sorted array after the cursor and return at most `limit`
// items plus the next cursor.  `keyOf(row)` must produce the same value
// the input array was sorted by, AND the sort must be lexical-ascending
// on (keyOf, idOf).
function paginate(sorted, { cursor, limit }, keyOf, idOf = (r) => r.id) {
	let start = 0;
	if (cursor) {
		const { sortKey, id } = cursor;
		// Skip past the row identified by the cursor.  Linear scan is
		// fine for our dataset; switch to binary search if the directory
		// ever exceeds tens of thousands of rows.
		for (let i = 0; i < sorted.length; i++) {
			const k = keyOf(sorted[i]) ?? '';
			if (k > sortKey || (k === sortKey && idOf(sorted[i]) > id)) {
				start = i;
				break;
			}
			if (i === sorted.length - 1) start = sorted.length;
		}
	}
	const items = sorted.slice(start, start + limit);
	const more = start + limit < sorted.length;
	const last = items[items.length - 1];
	const nextCursor = more && last ? encodeCursor(keyOf(last) ?? '', idOf(last)) : null;
	return { items, nextCursor };
}

function dateMs(v) {
	if (v == null) return 0;
	if (v instanceof Date) return v.getTime();
	if (typeof v === 'number') return v;
	const n = Date.parse(String(v));
	return Number.isFinite(n) ? n : 0;
}
const cmpAsc = (key) => (a, b) => dateMs(a[key]) - dateMs(b[key]);
const cmpDesc = (key) => (a, b) => dateMs(b[key]) - dateMs(a[key]);

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
	const last = a.lastName ?? '';
	const pref = a.preferredName;
	if (pref) {
		// preferredName is conventionally the first-name form ("James" for
		// "C. James Taylor"). Some sources publish a full preferred form
		// ("Steven M. Swann") — detect that and don't double-stamp the
		// last name.
		if (last && pref.toLowerCase().endsWith(last.toLowerCase())) {
			return pref;
		}
		return `${pref} ${last}`.trim();
	}
	return a.legalName ?? a.lastName ?? a.id;
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
	// `safeAll` guards tables that may not exist yet at runtime — we
	// added `BrokerCheckSnapshot` to schema.graphql but the running
	// component will throw a TypeError on `tables.BrokerCheckSnapshot`
	// until it has been redeployed-and-reloaded.
	const safeAll = async (t) => (t ? all(t) : []);
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
		bcSnaps,
		licenses, designations, education,
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
		safeAll(tables.BrokerCheckSnapshot),
		safeAll(tables.License),
		safeAll(tables.Designation),
		safeAll(tables.Education),
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
		bcSnaps,
		licenses, designations, education,
		byAdvisor: indexBy(advisors, 'id'),
		byFirm: indexBy(firms, 'id'),
		byTeam: indexBy(teams, 'id'),
		byBranch: indexBy(branches, 'id'),
		byArticle: indexBy(articles, 'id'),
		byTransition: indexBy(transitions, 'id'),
		byDeal: indexBy(deals, 'id'),
		byDisclosure: indexBy(disclosures, 'id'),
		byCluster: indexBy(clusters, 'id'),
		bcSnapByAdvisor: indexBy((bcSnaps || []).filter((s) => s.subjectKind === 'individual'), 'subjectAdvisorId'),
		bcSnapByFirm: indexBy((bcSnaps || []).filter((s) => s.subjectKind === 'firm'), 'subjectFirmId'),
	};
}

// Compact "subject" for an entity, suitable for chips and headers.
function advisorChip(a, db) {
	if (!a) return null;
	const eh = (db.employments || [])
		.filter((e) => e.advisorId === a.id && !e.endDate)
		.sort(cmpDesc('startDate'))[0];
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
		.sort(cmpDesc('asOf'))[0];
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

// All five resources override `allowRead` to return true so the
// public Facebook-style UI doesn't make the visitor log in just to
// see a published article feed. The data we expose here is sourced
// from public AdvisorHub coverage; nothing private leaves the
// cluster through these routes. Mutating ops (PUT/DELETE/POST) on
// the underlying tables still require auth — that's enforced by
// Harper's table-level allowUpdate/allowCreate defaults.
export class Feed extends Resource {
	allowRead() { return true; }
	async get() {
		const db = await loadAll();
		const items = db.articles
			.slice()
			.sort(cmpDesc('publishedDate'))
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
	allowRead() { return true; }
	async get(target) {
		const id = normalizeId(target);
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
	allowRead() { return true; }
	async get(target) {
		const id = normalizeId(target);
		if (!id) return { error: 'missing firm id' };
		const db = await loadAll();
		const firm = db.byFirm.get(id);
		if (!firm) return { error: 'not found', id };

		// Count employment rows bucketed by current/past for the section
		// titles — the actual rows are paginated by `/FirmAdvisors/<id>`
		// so this endpoint stays small and the firm page first paints
		// without a 500-row payload.
		let currentAdvisorCount = 0;
		let pastAdvisorCount = 0;
		for (const e of db.employments) {
			if (e.firmId !== id) continue;
			if (!db.byAdvisor.has(e.advisorId)) continue;
			if (e.endDate) pastAdvisorCount++;
			else currentAdvisorCount++;
		}

		const teamsHere = db.teams
			.filter((t) => t.currentFirmId === id)
			.map((t) => teamChip(t, db));

		const transitionsIn = db.transitions
			.filter((t) => t.toFirmId === id)
			.sort(cmpDesc('moveDate'))
			.map((t) => transitionRow(t, db));
		const transitionsOut = db.transitions
			.filter((t) => t.fromFirmId === id)
			.sort(cmpDesc('moveDate'))
			.map((t) => transitionRow(t, db));

		const articleIds = new Set(db.mFirm.filter((m) => m.firmId === id).map((m) => m.articleId));
		const articles = [...articleIds]
			.map((aid) => db.byArticle.get(aid))
			.filter(Boolean)
			.sort(cmpDesc('publishedDate'))
			.map((a) => articleStub(a));

		const branchesHere = db.branches.filter((b) => b.firmId === id);

		const firmDisclosures = db.disclosures
			.filter((d) => d.firmIdAtTime === id)
			.map((d) => disclosureRow(d, db));

		const bcSnap = db.bcSnapByFirm.get(id) || null;

		return {
			firm: {
				...firm,
				short: firmShort(firm.name),
			},
			currentAdvisorCount,
			pastAdvisorCount,
			currentTeams: teamsHere,
			transitionsIn,
			transitionsOut,
			branches: branchesHere,
			disclosuresAtThisFirm: firmDisclosures,
			articles,
			brokerCheckSnapshot: bcSnap && {
				fetchedAt: bcSnap.fetchedAt,
				subjectCrd: bcSnap.subjectCrd,
				bcScope: bcSnap.bcScope,
				iaScope: bcSnap.iaScope,
				disclosureCount: bcSnap.disclosureCount,
				registeredStateCount: bcSnap.registeredStateCount,
			},
		};
	}
}

// ─── /FirmAdvisors/<firmId>?status=current|past&cursor=…&limit=50 ─
//
// Splits the (formerly inlined) `currentAdvisors` / `pastAdvisors`
// arrays out of `/FirmProfile` so the firm page can paginate them.
// `status` defaults to "current".
//
// Returns `{ items, nextCursor }`.  `items` matches the shape the
// firm page already renders (advisor + role + dates).
export class FirmAdvisors extends Resource {
	allowRead() { return true; }
	async get(target) {
		const id = normalizeId(target);
		if (!id) return { error: 'missing firm id', items: [], nextCursor: null };
		const status = (target && typeof target.get === 'function' && target.get('status')) === 'past'
			? 'past' : 'current';
		const { cursor, limit } = parsePagination(target);

		const db = await loadAll();
		const rows = [];
		for (const e of db.employments) {
			if (e.firmId !== id) continue;
			const a = db.byAdvisor.get(e.advisorId);
			if (!a) continue;
			const isPast = !!e.endDate;
			if (status === 'past' ? !isPast : isPast) continue;
			rows.push({
				// Sort key matches the visible ordering on the firm page:
				// most-recent start (current) or end (past) first.  The
				// inverse-date encoding makes the lexical compare used
				// by `paginate` agree with that order.
				_sortKey: inverseDateKey(status === 'past' ? e.endDate : e.startDate),
				_id: e.id || a.id,
				advisor: { id: a.id, name: advisorDisplayName(a), careerStatus: a.careerStatus },
				roleTitle: e.roleTitle,
				roleCategory: e.roleCategory,
				startDate: e.startDate,
				endDate: e.endDate,
				reasonForLeaving: e.reasonForLeaving,
				aumAtDeparture: e.aumAtDeparture,
			});
		}
		rows.sort((a, b) => {
			if (a._sortKey !== b._sortKey) return a._sortKey < b._sortKey ? -1 : 1;
			return (a._id || '').localeCompare(b._id || '');
		});

		const keyOf = (r) => r._sortKey;
		const idOf = (r) => r._id;
		const { items, nextCursor } = paginate(rows, { cursor: decodeCursor(cursor), limit }, keyOf, idOf);
		// Strip the internal sort fields before sending.
		return {
			items: items.map(({ _sortKey, _id, ...rest }) => rest),
			nextCursor,
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
	allowRead() { return true; }
	async get(target) {
		const id = normalizeId(target);
		if (!id) return { error: 'missing advisor id' };
		const db = await loadAll();
		const advisor = db.byAdvisor.get(id);
		if (!advisor) return { error: 'not found', id };

		const career = db.employments
			.filter((e) => e.advisorId === id)
			.sort(cmpAsc('startDate'))
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
			.sort((x, y) => dateMs(x.dateInitiated ?? x.dateResolved) - dateMs(y.dateInitiated ?? y.dateResolved))
			.map((d) => disclosureRow(d, db));

		const obasHere = db.obas.filter((o) => o.advisorId === id);
		const regAppsHere = db.regApps.filter((r) => r.advisorId === id).map((r) => ({
			...r,
			firm: firmChip(db.byFirm.get(r.firmId)),
		}));

		const articleIds = new Set(db.mAdv.filter((m) => m.advisorId === id).map((m) => m.articleId));
		const articles = [...articleIds]
			.map((aid) => db.byArticle.get(aid)).filter(Boolean)
			.sort(cmpDesc('publishedDate'))
			.map(articleStub);

		const transitions = db.transitions
			.filter((t) => t.subjectAdvisorId === id)
			.map((t) => transitionRow(t, db));

		const bcSnap = db.bcSnapByAdvisor.get(id) || null;

		// License / Designation / Education — surfaced for the advisor
		// profile page. Sorted by grantedDate / earnedDate / graduationYear
		// so the UI can render a stable order.
		const licenses = (db.licenses || [])
			.filter((l) => l.advisorId === id)
			.sort(cmpAsc('grantedDate'))
			.map((l) => ({
				id: l.id,
				licenseType: l.licenseType,
				state: l.state,
				grantedDate: l.grantedDate,
				expiresDate: l.expiresDate,
				status: l.status,
			}));
		const designations = (db.designations || [])
			.filter((d2) => d2.advisorId === id)
			.sort(cmpAsc('earnedDate'))
			.map((d2) => ({
				id: d2.id,
				code: d2.code,
				grantingBody: d2.grantingBody,
				earnedDate: d2.earnedDate,
				expiresDate: d2.expiresDate,
				status: d2.status,
			}));
		const education = (db.education || [])
			.filter((e) => e.advisorId === id)
			.sort((x, y) => (x.graduationYear || 0) - (y.graduationYear || 0))
			.map((e) => ({
				id: e.id,
				institution: e.institution,
				degree: e.degree,
				field: e.field,
				graduationYear: e.graduationYear,
			}));

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
			licenses,
			designations,
			education,
			brokerCheckSnapshot: bcSnap && {
				fetchedAt: bcSnap.fetchedAt,
				subjectCrd: bcSnap.subjectCrd,
				bcScope: bcSnap.bcScope,
				iaScope: bcSnap.iaScope,
				disclosureCount: bcSnap.disclosureCount,
				employmentCount: bcSnap.employmentCount,
				examCount: bcSnap.examCount,
			},
		};
	}
}

// ─── /TeamProfile/<id> ────────────────────────────────────────────

export class TeamProfile extends Resource {
	allowRead() { return true; }
	async get(target) {
		const id = normalizeId(target);
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
				return dateMs(x.startDate) - dateMs(y.startDate);
			});
		sortMembers(currentMembers);
		sortMembers(pastMembers);

		const snaps = db.teamSnaps
			.filter((s) => s.teamId === id)
			.sort(cmpAsc('asOf'));

		const transitions = db.transitions
			.filter((t) => t.subjectTeamId === id)
			.map((t) => transitionRow(t, db));

		const articleIds = new Set(db.mTeam.filter((m) => m.teamId === id).map((m) => m.articleId));
		const articles = [...articleIds]
			.map((aid) => db.byArticle.get(aid)).filter(Boolean)
			.sort(cmpDesc('publishedDate'))
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

// ─── public directory endpoints ───────────────────────────────────
// The /firms.html, /advisors.html, /teams.html pages used to call
// the auto-export `/Firm/`, `/Advisor/`, `/Team/` routes directly.
// Those still require auth (the auto-export endpoints inherit Harper's
// table-level allowRead, which expects an authenticated user). The
// resources below mirror the same payload but are explicitly public
// — same data, friendlier for the unauthenticated visitor that the
// feed UI is built for.

export class PublicFirms extends Resource {
	allowRead() { return true; }
	async get() {
		const rows = await all(tables.Firm);
		rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
		return rows;
	}
}

// `/PublicAdvisors?cursor=…&limit=50` — paginated, ordered by lastName.
//
// Returns `{ items, nextCursor, total }`.  `nextCursor` is null on the
// last page.  `total` is the row count across the whole dataset, sent
// back on every page so the section card can render "All advisors (N)"
// without the client tracking it separately.
export class PublicAdvisors extends Resource {
	allowRead() { return true; }
	async get(target) {
		const rows = await all(tables.Advisor);
		const keyOf = (a) => (a.lastName || a.legalName || '').toLowerCase();
		rows.sort((a, b) => {
			const ka = keyOf(a), kb = keyOf(b);
			if (ka !== kb) return ka < kb ? -1 : 1;
			return (a.id || '').localeCompare(b.id || '');
		});
		const { cursor, limit } = parsePagination(target);
		const { items, nextCursor } = paginate(rows, { cursor: decodeCursor(cursor), limit }, keyOf);
		return { items, nextCursor, total: rows.length };
	}
}

export class PublicTeams extends Resource {
	allowRead() { return true; }
	async get() {
		const [teams, firms] = await Promise.all([all(tables.Team), all(tables.Firm)]);
		const byFirm = new Map(firms.map((f) => [f.id, f]));
		teams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
		// Inline the current firm's name so the directory page doesn't
		// need a second auth'd /Firm/ fetch to render the subtitle.
		return teams.map((t) => ({
			...t,
			currentFirmName: t.currentFirmId ? byFirm.get(t.currentFirmId)?.name ?? null : null,
		}));
	}
}

// `/Search?q=…&limit=…` — global header search.
//
// Backs the navbar search box. Returns a small mixed list of advisor /
// firm / team matches, ranked by how closely the query matches the
// entity's display name. Public so an anonymous visitor can use it.
//
// Response shape:
//   {
//     q,                     // the (trimmed) query the server interpreted
//     items: [               // up to `limit` rows, mixed kinds, best first
//       { kind, id, name, sub, score },
//     ],
//     counts: { firms, advisors, teams, total }   // total matches per kind
//                                                 //   before truncation
//   }
//
// Ranking is name-only and case-insensitive. We score:
//   3 — full string equals query
//   2 — name starts with query
//   2 — any whitespace-separated word starts with query
//   1 — substring match
// Higher score wins; ties break alphabetically. Firm matches are nudged
// up half a point so "Wells" prefers the firm "Wells Fargo Advisors"
// over an advisor named "Wells".
//
// The dataset is sub-thousand rows so a linear scan is fine. If it ever
// grows past ~10k entities, switch to indexed `tables.X.search` calls
// per field and merge.
export class Search extends Resource {
	allowRead() { return true; }
	async get(target) {
		const q = (target && typeof target.get === 'function' && target.get('q')) || '';
		const norm = String(q).trim().toLowerCase();
		const lim = parsePagination(target).limit;
		const cap = Math.min(lim, 20);
		if (norm.length < 2) {
			return { q: norm, items: [], counts: { firms: 0, advisors: 0, teams: 0, total: 0 } };
		}

		const [advisors, firms, teams, employments] = await Promise.all([
			all(tables.Advisor),
			all(tables.Firm),
			all(tables.Team),
			all(tables.EmploymentHistory),
		]);
		const byFirm = indexBy(firms, 'id');

		// Pre-compute each advisor's current firm so the dropdown can
		// render "James Taylor · Wells Fargo Advisors" without the
		// caller doing a second lookup.
		const currentFirmByAdvisor = new Map();
		for (const e of employments) {
			if (e.endDate) continue;
			const existing = currentFirmByAdvisor.get(e.advisorId);
			if (!existing || dateMs(e.startDate) > dateMs(existing.startDate)) {
				currentFirmByAdvisor.set(e.advisorId, e);
			}
		}

		const scoreName = (name) => {
			if (!name) return 0;
			const n = String(name).toLowerCase();
			if (n === norm) return 3;
			if (n.startsWith(norm)) return 2;
			// Word-prefix: "morgan" → "JP Morgan" hits via "morgan".
			for (const w of n.split(/\s+/)) {
				if (w.startsWith(norm)) return 2;
			}
			return n.includes(norm) ? 1 : 0;
		};

		const matches = [];

		for (const f of firms) {
			const score = Math.max(scoreName(f.name), scoreName(f.legalName));
			if (!score) continue;
			matches.push({
				kind: 'firm',
				id: f.id,
				name: f.name,
				sub: [f.hqCity, f.hqState].filter(Boolean).join(', ') || f.channel || null,
				score: score + 0.5,
				sortKey: (f.name || '').toLowerCase(),
			});
		}

		for (const a of advisors) {
			const display = advisorDisplayName(a) || a.legalName;
			const score = Math.max(
				scoreName(display),
				scoreName(a.legalName),
				scoreName(a.preferredName),
				scoreName(a.firstName),
				scoreName(a.lastName),
			);
			if (!score) continue;
			const eh = currentFirmByAdvisor.get(a.id);
			const firm = eh ? byFirm.get(eh.firmId) : null;
			matches.push({
				kind: 'advisor',
				id: a.id,
				name: display,
				sub: firm ? firm.name : (a.careerStatus || null),
				score,
				sortKey: (a.lastName || display || '').toLowerCase(),
			});
		}

		for (const t of teams) {
			const score = scoreName(t.name);
			if (!score) continue;
			const firm = t.currentFirmId ? byFirm.get(t.currentFirmId) : null;
			matches.push({
				kind: 'team',
				id: t.id,
				name: t.name,
				sub: firm ? firm.name : null,
				score,
				sortKey: (t.name || '').toLowerCase(),
			});
		}

		matches.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
		});

		const counts = matches.reduce(
			(c, m) => { c[m.kind + 's']++; c.total++; return c; },
			{ firms: 0, advisors: 0, teams: 0, total: 0 },
		);

		const items = matches.slice(0, cap).map(({ sortKey, ...row }) => row);
		return { q: norm, items, counts };
	}
}

// ─── Auth: cookie-session login/logout/me ─────────────────────────
// Why session cookies and not JWT-in-localStorage:
//   - This is a browser app. enableSessions: true is on in
//     harperdb-config.yaml so Harper already manages a Set-Cookie
//     session for us; we just call context.login() and it sticks.
//   - No client-side header juggling: same-origin fetches
//     automatically include the cookie.
//   - Logout is an explicit server-side delete instead of "hope the
//     client clears localStorage".
//   - Crucially, this avoids the WWW-Authenticate: Basic prompt
//     trap. Browsers cache basic-auth credentials per origin and
//     replay them on every request — the cause of the "Login failed"
//     error a real anonymous visit was hitting.

export class Login extends Resource {
	allowCreate() { return true; } // anonymous can attempt login
	async post(...args) {
		// Harper's Resource.post signature varies depending on whether
		// the request URL had a trailing id segment. For our URL
		// (POST /Login, no id), the JSON body lands at args[0]. For
		// a POST /Login/<id> shape it would land at args[1]. Find it
		// either way.
		const body = args.find((a) => a && typeof a === 'object' && (a.email || a.username || a.password)) || {};
		const ctx = this.getContext();
		const username = body.email || body.username;
		const password = body.password;
		if (!username || !password) {
			const e = new Error('email and password required');
			e.status = 400;
			throw e;
		}
		try {
			await ctx.login(username, password);
		} catch (err) {
			const e = new Error('Invalid credentials');
			e.status = 401;
			throw e;
		}
		return { ok: true, username };
	}
}

// Logout: clear the session by issuing an empty session via
// session.update(). Harper's session middleware re-issues a Set-Cookie
// whenever the session state mutates; an empty session means the next
// request's cookie maps to no user → /Me returns authenticated:false.
// session.delete() alone removes the server-side session row but
// doesn't trigger a clearing Set-Cookie, so the cookie stays sticky.
export class Logout extends Resource {
	allowCreate() { return true; }
	async post() {
		const ctx = this.getContext();
		try { ctx.session?.update?.({}); } catch {}
		try { await ctx.session?.delete?.(ctx.session.id); } catch {}
		return { ok: true };
	}
}

export class Me extends Resource {
	allowRead() { return true; }
	async get() {
		const user = this.getCurrentUser();
		if (!user) return { authenticated: false };
		return {
			authenticated: true,
			username: user.username,
			role: user.role?.role || null,
		};
	}
}

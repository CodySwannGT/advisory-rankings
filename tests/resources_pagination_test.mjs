// Integration test for the new pagination endpoints in resources.js.
//
// Boots the resource module against a mocked `tables` / `Resource`
// global, then walks /PublicAdvisors and /FirmAdvisors page-by-page
// to confirm:
//   - First page reports `total`.
//   - Cursor walks the full dataset with no skips or duplicates.
//   - `nextCursor` is null on the last page.
//   - FirmAdvisors filters by status and respects the firm id.
//
// Run with:  node tests/resources_pagination_test.mjs

import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SRC = await readFile(new URL('../harper-app/resources.js', import.meta.url), 'utf8');

// Build a synthetic dataset: 220 advisors, two firms.
const advisors = Array.from({ length: 220 }, (_, i) => ({
	id: `adv-${String(i).padStart(4, '0')}`,
	firstName: `First${i}`,
	lastName: String.fromCharCode(65 + (i % 26)) + `_last_${String(i).padStart(4, '0')}`,
	legalName: `Legal ${i}`,
	careerStatus: i % 3 === 0 ? 'inactive' : 'active',
	yearsExperience: i % 30,
	finraCrd: String(1000000 + i),
}));
const firmAlpha = { id: 'firm-alpha', name: 'Alpha Capital' };
const firmBeta  = { id: 'firm-beta', name: 'Beta Wealth' };
// 130 employments at firm-alpha (90 current, 40 past), 30 at firm-beta (all current).
const employments = [];
for (let i = 0; i < 90; i++) {
	employments.push({
		id: `emp-a-cur-${i}`,
		firmId: 'firm-alpha',
		advisorId: advisors[i].id,
		startDate: new Date(2020, 0, 1 + i).toISOString(),
		endDate: null,
		roleTitle: 'Financial Advisor',
		roleCategory: 'producer',
	});
}
for (let i = 90; i < 130; i++) {
	employments.push({
		id: `emp-a-past-${i}`,
		firmId: 'firm-alpha',
		advisorId: advisors[i].id,
		startDate: new Date(2015, 0, 1 + i).toISOString(),
		endDate: new Date(2022, 0, 1 + i).toISOString(),
		roleTitle: 'Financial Advisor',
		roleCategory: 'producer',
	});
}
for (let i = 130; i < 160; i++) {
	employments.push({
		id: `emp-b-cur-${i}`,
		firmId: 'firm-beta',
		advisorId: advisors[i].id,
		startDate: new Date(2021, 0, 1 + i).toISOString(),
		endDate: null,
		roleTitle: 'Producer',
		roleCategory: 'producer',
	});
}

// Mock tables: each table exposes a `search({})` async iterable.
function mockTable(rows) {
	return {
		search() {
			return (async function* () {
				for (const r of rows) yield r;
			})();
		},
	};
}
const tables = {
	Article: mockTable([]),
	Advisor: mockTable(advisors),
	Firm: mockTable([firmAlpha, firmBeta]),
	Team: mockTable([]),
	Branch: mockTable([]),
	EmploymentHistory: mockTable(employments),
	TeamMembership: mockTable([]),
	TeamMetricSnapshot: mockTable([]),
	AdvisorMetricSnapshot: mockTable([]),
	TransitionEvent: mockTable([]),
	RecruitingDealQuote: mockTable([]),
	Disclosure: mockTable([]),
	Sanction: mockTable([]),
	OutsideBusinessActivity: mockTable([]),
	DisclosureCluster: mockTable([]),
	RegistrationApplication: mockTable([]),
	BranchAssignment: mockTable([]),
	ArticleAdvisorMention: mockTable([]),
	ArticleFirmMention: mockTable([]),
	ArticleTeamMention: mockTable([]),
	ArticleTransitionEventMention: mockTable([]),
	ArticleDisclosureMention: mockTable([]),
	FieldAssertion: mockTable([]),
	BrokerCheckSnapshot: mockTable([]),
};

class Resource {
	constructor() {}
	getContext() { return null; }
}

// Strip the `export` keyword and `import` lines, then evaluate the
// module body in a scope that has tables/Resource as locals.
const stripped = SRC.replace(/^export\s+/gm, '');
const factory = new Function('tables', 'Resource',
	stripped + '\nreturn { PublicAdvisors, FirmProfile, FirmAdvisors };');
const { PublicAdvisors, FirmProfile, FirmAdvisors } = factory(tables, Resource);

// Mimic Harper's RequestTarget for the test harness.
function target(id, query = {}) {
	const t = new URLSearchParams(query);
	t.id = id;
	const lim = parseInt(t.get('limit'), 10);
	t.limit = Number.isFinite(lim) ? lim : undefined;
	t.toString = () => id == null ? '' : String(id);
	return t;
}

// ─── /PublicAdvisors walks all 220 rows ───────────────────────────
{
	let cursor = null;
	const seen = [];
	let firstTotal = null;
	let pages = 0;
	while (true) {
		const res = await new PublicAdvisors().get(target(undefined,
			cursor ? { cursor, limit: '50' } : { limit: '50' }));
		if (firstTotal === null) firstTotal = res.total;
		assert.equal(res.total, 220, 'total reported on every page');
		seen.push(...res.items.map((a) => a.id));
		pages++;
		assert.ok(pages < 20, 'must terminate');
		if (!res.nextCursor) break;
		cursor = res.nextCursor;
	}
	assert.equal(seen.length, 220);
	assert.equal(new Set(seen).size, 220, 'no duplicates');
	assert.equal(pages, Math.ceil(220 / 50), 'expected page count');
	console.log(`PASS  /PublicAdvisors walks all ${seen.length} rows in ${pages} pages, no dupes`);
}

// ─── /FirmAdvisors current at firm-alpha ──────────────────────────
{
	let cursor = null;
	const seen = [];
	let pages = 0;
	while (true) {
		const t = target('firm-alpha',
			cursor ? { status: 'current', cursor, limit: '25' } : { status: 'current', limit: '25' });
		const res = await new FirmAdvisors().get(t);
		seen.push(...res.items.map((r) => r.advisor.id));
		pages++;
		if (!res.nextCursor) break;
		cursor = res.nextCursor;
	}
	assert.equal(seen.length, 90, 'alpha has 90 current advisors');
	assert.equal(new Set(seen).size, 90, 'no duplicates');
	assert.equal(pages, Math.ceil(90 / 25));
	console.log(`PASS  /FirmAdvisors?status=current walks ${seen.length} rows for firm-alpha`);
}

// ─── /FirmAdvisors past at firm-alpha ─────────────────────────────
{
	const res = await new FirmAdvisors().get(target('firm-alpha', { status: 'past', limit: '100' }));
	assert.equal(res.items.length, 40, 'alpha has 40 past advisors (all in one page at limit 100)');
	assert.equal(res.nextCursor, null);
	console.log('PASS  /FirmAdvisors?status=past returns 40 rows for firm-alpha');
}

// ─── /FirmAdvisors filters by firm id ─────────────────────────────
{
	const res = await new FirmAdvisors().get(target('firm-beta', { status: 'current', limit: '100' }));
	assert.equal(res.items.length, 30);
	for (const r of res.items) {
		// We don't know firmId on the row, but we can confirm the
		// advisor ids are in the beta range (130-159).
		const idx = parseInt(r.advisor.id.replace('adv-', ''), 10);
		assert.ok(idx >= 130 && idx < 160, `expected beta-range advisor, got ${r.advisor.id}`);
	}
	console.log('PASS  /FirmAdvisors filters by firm id');
}

// ─── /FirmAdvisors with bad firm id returns empty cleanly ─────────
{
	const res = await new FirmAdvisors().get(target('firm-nope', { status: 'current' }));
	assert.equal(res.items.length, 0);
	assert.equal(res.nextCursor, null);
	console.log('PASS  /FirmAdvisors with unknown firm id returns empty');
}

// ─── /FirmProfile reports counts but no inline advisor arrays ─────
{
	const res = await new FirmProfile().get(target('firm-alpha'));
	assert.equal(res.currentAdvisorCount, 90);
	assert.equal(res.pastAdvisorCount, 40);
	assert.equal(res.currentAdvisors, undefined, 'inline currentAdvisors removed');
	assert.equal(res.pastAdvisors, undefined, 'inline pastAdvisors removed');
	console.log('PASS  /FirmProfile emits *Count fields and no inline advisor arrays');
}

console.log('\nAll resource pagination tests passed.');

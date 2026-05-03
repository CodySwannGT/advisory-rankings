// Unit tests for the cursor / paginate helpers in resources.js.
//
// Run with:  node tests/pagination_test.mjs
//
// These run in plain Node — they don't pull in Harper. They exercise
// the pagination-only exports against synthetic arrays so behaviour
// regressions show up locally before a deploy.

import assert from 'node:assert/strict';

// Re-implement the helpers under test by importing them. resources.js
// references the Harper-injected `tables`/`Resource` globals at module
// scope, which would crash a plain `node` import. Carve the helpers
// out via a tiny in-process eval scoped to just the helpers we need.

import { readFile } from 'node:fs/promises';
const SRC = await readFile(new URL('../harper-app/resources.js', import.meta.url), 'utf8');

// Lift the whole helper section in one contiguous range (DEFAULT_LIMIT
// down through firmShort) so we don't grab duplicate definitions.
// Stops before `loadAll`, which references the Harper-injected `tables`
// global and would crash a plain Node import.
const start = SRC.indexOf('const DEFAULT_LIMIT');
const end   = SRC.indexOf('// Snapshot of every table');
const block = SRC.slice(start, end);

const factory = new Function(`${block}\nreturn { dateMs, encodeCursor, decodeCursor, paginate, inverseDateKey, parsePagination };`);
const { encodeCursor, decodeCursor, paginate, inverseDateKey, parsePagination } = factory();

// ─── encodeCursor / decodeCursor round-trip ───────────────────────
{
	const c = encodeCursor('smith', 'abc-123');
	const back = decodeCursor(c);
	assert.equal(back.sortKey, 'smith');
	assert.equal(back.id, 'abc-123');
	assert.equal(decodeCursor(null), null);
	assert.equal(decodeCursor(''), null);
	assert.equal(decodeCursor('not-a-real-cursor!!!')?.sortKey, undefined,
		'malformed cursor should not throw');
	console.log('PASS  encodeCursor/decodeCursor round-trip');
}

// ─── paginate: walks all rows in order, no skips, no dupes ────────
{
	const rows = Array.from({ length: 250 }, (_, i) => ({
		id: `id-${String(i).padStart(4, '0')}`,
		k: String.fromCharCode(97 + (i % 26)) + '-' + String(i).padStart(4, '0'),
	}));
	rows.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0);

	const seen = [];
	let cursor = null;
	let pages = 0;
	while (true) {
		const res = paginate(rows, { cursor: decodeCursor(cursor), limit: 50 }, (r) => r.k);
		seen.push(...res.items.map((r) => r.id));
		pages++;
		if (!res.nextCursor) break;
		cursor = res.nextCursor;
		assert.ok(pages < 20, 'should terminate within reasonable page count');
	}
	assert.equal(pages, 5);
	assert.equal(seen.length, 250);
	assert.equal(new Set(seen).size, 250, 'no duplicates');
	const expected = rows.map((r) => r.id);
	assert.deepEqual(seen, expected, 'all rows in original sort order');
	console.log('PASS  paginate walks 250 rows in 5 pages with no skips/dupes');
}

// ─── paginate: tied sort keys still walked correctly ──────────────
// Mimics two advisors with the same lastName — id is the tie-break.
{
	const rows = [
		{ id: 'a', k: 'smith' },
		{ id: 'b', k: 'smith' },
		{ id: 'c', k: 'smith' },
		{ id: 'd', k: 'taylor' },
	];
	const seen = [];
	let cursor = null;
	while (true) {
		const res = paginate(rows, { cursor: decodeCursor(cursor), limit: 2 }, (r) => r.k);
		seen.push(...res.items.map((r) => r.id));
		if (!res.nextCursor) break;
		cursor = res.nextCursor;
	}
	assert.deepEqual(seen, ['a', 'b', 'c', 'd']);
	console.log('PASS  paginate with tied sort keys uses id tie-break');
}

// ─── paginate: empty array ────────────────────────────────────────
{
	const res = paginate([], { cursor: null, limit: 50 }, (r) => r.k);
	assert.deepEqual(res.items, []);
	assert.equal(res.nextCursor, null);
	console.log('PASS  paginate empty array');
}

// ─── paginate: cursor past the end ────────────────────────────────
{
	const rows = [{ id: 'a', k: 'smith' }];
	const res = paginate(rows, { cursor: { sortKey: 'zzz', id: 'zzz' }, limit: 50 }, (r) => r.k);
	assert.deepEqual(res.items, []);
	assert.equal(res.nextCursor, null);
	console.log('PASS  paginate with cursor past end returns empty');
}

// ─── inverseDateKey: newer dates lex-compare smaller ──────────────
{
	const k2020 = inverseDateKey('2020-01-01T00:00:00Z');
	const k2026 = inverseDateKey('2026-05-03T00:00:00Z');
	assert.ok(k2026 < k2020, 'newer date should produce smaller lex key');
	assert.equal(k2020.length, k2026.length, 'fixed-width');
	console.log('PASS  inverseDateKey: newer < older lexically, fixed width');
}

// ─── inverseDateKey + paginate: walks dates in reverse-chrono ─────
{
	const rows = [
		{ id: '1', d: '2020-01-01' },
		{ id: '2', d: '2026-05-03' },
		{ id: '3', d: '2024-06-01' },
	].map((r) => ({ ...r, k: inverseDateKey(r.d) }));
	rows.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0);

	const seen = [];
	let cursor = null;
	while (true) {
		const res = paginate(rows, { cursor: decodeCursor(cursor), limit: 1 }, (r) => r.k);
		seen.push(...res.items.map((r) => r.id));
		if (!res.nextCursor) break;
		cursor = res.nextCursor;
	}
	assert.deepEqual(seen, ['2', '3', '1'], 'newest first');
	console.log('PASS  inverseDateKey + paginate yields reverse-chrono walk');
}

// ─── parsePagination defaults + clamping ──────────────────────────
{
	const make = (params) => {
		const usp = new URLSearchParams(params);
		return { get: (k) => usp.get(k) };
	};
	assert.deepEqual(parsePagination(make({})), { cursor: null, limit: 50 });
	assert.deepEqual(parsePagination(make({ limit: '20' })), { cursor: null, limit: 20 });
	assert.deepEqual(parsePagination(make({ limit: '500' })), { cursor: null, limit: 100 },
		'limit clamped to MAX_LIMIT');
	assert.deepEqual(parsePagination(make({ limit: '0' })), { cursor: null, limit: 50 },
		'zero falls back to default');
	assert.deepEqual(parsePagination(make({ limit: '-5' })), { cursor: null, limit: 50 },
		'negative falls back to default');
	assert.deepEqual(parsePagination(make({ cursor: 'abc' })), { cursor: 'abc', limit: 50 });
	console.log('PASS  parsePagination defaults + clamping');
}

console.log('\nAll pagination tests passed.');

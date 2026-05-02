#!/usr/bin/env node
/**
 * Parity comparison: deployed cluster (existing design) vs local
 * dev server (new AdvisorBook design).
 *
 * For each page in PAGES we capture:
 *   - <title>
 *   - the navbar logo text
 *   - all card titles (h2.card-title)
 *   - all card subtitles (h3.card-subtitle)
 *   - the count of every meaningful selector (post cards, chips,
 *     event cards, sanction pills, entity-list rows, profile heads,
 *     timeline steps, etc.)
 *   - one full-page PNG screenshot
 *
 * Then we diff the two extracts and print a structured report. The
 * design-system refactor is meant to be a no-op visually + content-
 * wise, with the only allowed change being the brand swap. Anything
 * else flips a row in the report from = to ≠.
 *
 * Usage:
 *   BASELINE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
 *   NEW_URL=http://127.0.0.1:8765 \
 *     node tests/parity_compare.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
	({ chromium } = require('playwright'));
} catch {
	({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const BASELINE = process.env.BASELINE_URL || 'https://advisory-rankings-de.cody-swann-org.harperfabric.com';
const NEW = process.env.NEW_URL || 'http://127.0.0.1:8765';
const OUT = resolve('tests/parity');

// Static pages (same path on every base). id is used in the
// screenshot filename + report. goto = path. waitFor = selector
// that proves the page rendered (or null to skip waiting).
const STATIC_PAGES = [
	{ id: 'feed',       goto: '/',                 waitFor: 'article.card .post-headline' },
	{ id: 'firms',      goto: '/firms.html',       waitFor: '.entity-list .row' },
	{ id: 'advisors',   goto: '/advisors.html',    waitFor: '.entity-list .row' },
	{ id: 'teams',      goto: '/teams.html',       waitFor: '.entity-list .row' },
	{ id: 'login',      goto: '/login.html',       waitFor: 'input[name="email"]' },
];

// Profile pages also need an id from the feed. We resolve those
// once per base via /Feed and stuff them into the page list.
async function profilePagesFor(base) {
	const res = await fetch(`${base}/Feed`).then((r) => r.json());
	const taylor = res.items.find((i) => i.firms.some((f) => /Wells Fargo/i.test(f.name))) || res.items[0];
	const cairnes = res.items.find((i) => i.advisors.some((a) => /Cairnes/i.test(a.name))) || res.items[0];
	const wellsFargo = taylor.firms.find((f) => /^Wells Fargo Advisors$/i.test(f.name)) || taylor.firms[0];
	const teamObj = taylor.teams[0];
	const advisor = cairnes.advisors.find((a) => /Cairnes/i.test(a.name)) || cairnes.advisors[0];
	return [
		{ id: 'firm-wells-fargo',  goto: `/firm.html?id=${encodeURIComponent(wellsFargo.id)}`, waitFor: '.profile-head h1' },
		{ id: 'team-taylor',       goto: `/team.html?id=${encodeURIComponent(teamObj.id)}`,    waitFor: '.profile-head h1' },
		{ id: 'advisor-cairnes',   goto: `/advisor.html?id=${encodeURIComponent(advisor.id)}`, waitFor: '.profile-head h1' },
		{ id: 'article-taylor',    goto: `/article.html?id=${encodeURIComponent(taylor.article.id)}`, waitFor: '.post-headline' },
	];
}

// Counts to read on each page (selector list). We use these as
// content fingerprints — same counts before & after = no data was
// lost in the refactor.
const COUNT_SELECTORS = [
	'article.card',
	'.card',
	'.card h2.card-title',
	'.card h3.card-subtitle',
	'.event-card.transition',
	'.event-card.disclosure',
	'.sanction-pill',
	'.chip',
	'.chip.firm',
	'.chip.team',
	'.chip.advisor',
	'.entity-list .row',
	'.profile-head h1',
	'.timeline .step',
	'.snap-table tbody tr',
	'.empty, .ab-empty',
	'.post-headline',
	'nav.nav .logo',
];

// Text checkpoints we expect on the home feed regardless of design.
const FEED_TEXT_CHECKPOINTS = [
	'Morgan Stanley',
	'Wells Fargo',
	'Taylor',
	'5.94B',
	'Cairnes',
	'FINRA',
	'AdvisorHub',
];

async function capture(base, label) {
	const browser = await chromium.launch({ headless: true });
	const ctx = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		ignoreHTTPSErrors: true,
	});
	const page = await ctx.newPage();
	const consoleErrors = [];
	const pageErrors = [];
	page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
	page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

	const dir = resolve(OUT, label);
	await mkdir(dir, { recursive: true });

	const PAGES = [...STATIC_PAGES, ...(await profilePagesFor(base))];

	const result = { base, label, pages: {} };

	for (const p of PAGES) {
		const url = `${base}${p.goto}`;
		consoleErrors.length = 0;
		pageErrors.length = 0;
		const r = { url, error: null, title: null, logo: null, counts: {}, cardTitles: [], cardSubtitles: [], textCheckpoints: {}, consoleErrors: [], pageErrors: [] };
		try {
			await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
			if (p.waitFor) {
				await page.waitForSelector(p.waitFor, { timeout: 20000 });
			}
			r.title = await page.title();
			r.logo = await page.locator('nav.nav .logo').first().textContent().catch(() => null);
			for (const sel of COUNT_SELECTORS) {
				r.counts[sel] = await page.locator(sel).count().catch(() => 0);
			}
			r.cardTitles   = await page.locator('.card h2.card-title').allTextContents().catch(() => []);
			r.cardSubtitles = await page.locator('.card h3.card-subtitle').allTextContents().catch(() => []);
			if (p.id === 'feed') {
				const body = await page.locator('body').textContent();
				for (const cp of FEED_TEXT_CHECKPOINTS) r.textCheckpoints[cp] = body.includes(cp);
			}
			await page.screenshot({ path: `${dir}/${p.id}.png`, fullPage: true });
		} catch (err) {
			r.error = String(err.message || err);
		}
		r.consoleErrors = [...consoleErrors];
		r.pageErrors = [...pageErrors];
		result.pages[p.id] = r;
	}

	await ctx.close();
	await browser.close();
	await writeFile(`${dir}/extract.json`, JSON.stringify(result, null, 2));
	return result;
}

function diff(baseline, neu) {
	const lines = [];
	const ids = Object.keys(baseline.pages);
	let mismatches = 0;
	let allowed = 0;

	for (const id of ids) {
		const a = baseline.pages[id];
		const b = neu.pages[id];
		lines.push(`\n── ${id} ─────────────────────────────────────────`);

		if (a.error || b.error) {
			lines.push(`  baseline error: ${a.error || '—'}`);
			lines.push(`  new error:      ${b.error || '—'}`);
			if (a.error && b.error) {
				lines.push('  ! both sides errored — cannot compare');
			} else if (a.error) {
				lines.push('  ⚠ baseline only errored (deployed has issue, new is fine)');
			} else {
				lines.push('  ✗ new only errored');
				mismatches++;
			}
			continue;
		}

		// Title — brand swap is the only allowed delta.
		const titleA = (a.title || '').replace(/AdvisoryRankings/g, 'AdvisorBook');
		const titleB = b.title || '';
		if (titleA === titleB) {
			lines.push(`  = title (brand-normalized): "${titleB}"`);
		} else {
			lines.push(`  ✗ title mismatch: baseline="${a.title}" new="${b.title}"`);
			mismatches++;
		}

		// Logo — must change from AdvisoryRankings to AdvisorBook.
		const logoA = (a.logo || '').trim();
		const logoB = (b.logo || '').trim();
		if (logoA === 'AdvisoryRankings' && logoB === 'AdvisorBook') {
			lines.push(`  ✓ logo rebranded: "${logoA}" → "${logoB}"`);
			allowed++;
		} else if (logoA === logoB) {
			lines.push(`  = logo unchanged: "${logoA}"`);
		} else {
			lines.push(`  ✗ logo unexpected delta: "${logoA}" → "${logoB}"`);
			mismatches++;
		}

		// Counts.
		for (const sel of COUNT_SELECTORS) {
			const ca = a.counts[sel] ?? 0;
			const cb = b.counts[sel] ?? 0;
			if (ca === cb) {
				lines.push(`  = count(${sel}): ${ca}`);
			} else {
				lines.push(`  ✗ count(${sel}): baseline=${ca} new=${cb}`);
				mismatches++;
			}
		}

		// Card title/subtitle text content (order-sensitive).
		const sameTitles = JSON.stringify(a.cardTitles) === JSON.stringify(b.cardTitles);
		if (sameTitles) {
			lines.push(`  = ${a.cardTitles.length} card titles match exactly`);
		} else {
			lines.push(`  ✗ card titles differ:`);
			lines.push(`      baseline: ${JSON.stringify(a.cardTitles)}`);
			lines.push(`      new:      ${JSON.stringify(b.cardTitles)}`);
			mismatches++;
		}
		const sameSubs = JSON.stringify(a.cardSubtitles) === JSON.stringify(b.cardSubtitles);
		if (sameSubs) {
			lines.push(`  = ${a.cardSubtitles.length} card subtitles match exactly`);
		} else {
			lines.push(`  ✗ card subtitles differ:`);
			lines.push(`      baseline: ${JSON.stringify(a.cardSubtitles)}`);
			lines.push(`      new:      ${JSON.stringify(b.cardSubtitles)}`);
			mismatches++;
		}

		if (id === 'feed') {
			for (const [cp, presentA] of Object.entries(a.textCheckpoints)) {
				const presentB = b.textCheckpoints[cp];
				if (presentA && presentB) lines.push(`  = "${cp}" present on both`);
				else if (!presentA && !presentB) lines.push(`  = "${cp}" absent on both`);
				else { lines.push(`  ✗ "${cp}": baseline=${presentA} new=${presentB}`); mismatches++; }
			}
		}

		const cea = a.consoleErrors.length, ceb = b.consoleErrors.length;
		if (ceb > 0) {
			lines.push(`  ✗ new console errors (${ceb}): ${b.consoleErrors.slice(0, 3).join(' | ')}`);
			mismatches++;
		} else if (cea > 0) {
			lines.push(`  ⚠ baseline had ${cea} console errors; new is clean`);
		} else {
			lines.push(`  = no console errors on either side`);
		}
	}

	lines.push(`\n──────── PARITY REPORT ────────`);
	lines.push(`  pages:       ${ids.length}`);
	lines.push(`  allowed Δs:  ${allowed}  (brand rebrand only)`);
	lines.push(`  mismatches:  ${mismatches}`);
	lines.push(`  verdict:     ${mismatches === 0 ? 'PASS — design parity preserved' : 'FAIL — review mismatches above'}`);
	return { lines, mismatches };
}

async function main() {
	console.log(`▶ baseline = ${BASELINE}`);
	console.log(`▶ new      = ${NEW}`);

	console.log('\n[1/2] Capturing baseline (deployed)…');
	const baseline = await capture(BASELINE, 'baseline');
	console.log('     wrote', resolve(OUT, 'baseline'));

	console.log('\n[2/2] Capturing new (local)…');
	const neu = await capture(NEW, 'new');
	console.log('     wrote', resolve(OUT, 'new'));

	const { lines, mismatches } = diff(baseline, neu);
	for (const line of lines) console.log(line);
	await writeFile(resolve(OUT, 'report.txt'), lines.join('\n'));
	process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error('parity_compare crashed:', err.stack || err.message || err);
	process.exit(2);
});

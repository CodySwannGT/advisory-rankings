#!/usr/bin/env node
/**
 * Playwright smoke test for the web/ UI.
 *
 * Loads each page against the dev server, checks for the things the
 * design promises (post cards, transition events with from→to firms
 * and AUM, disclosure events with sanction pills, profile sections),
 * captures screenshots, and bails on console errors or unhandled
 * promise rejections.
 *
 * Run:
 *   node scripts/dev_server.mjs &        # in another shell
 *   node tests/web_smoke.mjs
 *
 * Screenshots land in tests/screenshots/.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

// Resolve playwright in both local-sandbox (global at /opt/node22) and
// CI-runner (./node_modules) layouts. Falls back to a hard-coded path
// only after the standard resolution fails.
const require = createRequire(import.meta.url);
let chromium;
try {
	({ chromium } = require('playwright'));
} catch {
	({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

// Pull cluster basic-auth creds out of ~/.harper-fabric-credentials
// when targeting prod. Local dev (the dev_server) needs no auth.
const CRED = await (async () => {
	try {
		return Object.fromEntries(
			(await readFile(`${homedir()}/.harper-fabric-credentials`, 'utf8'))
				.split('\n').filter(Boolean)
				.map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
		);
	} catch { return {}; }
})();

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9926';
const SHOTS = resolve('tests/screenshots');
const httpCredentials = process.env.HARPER_ADMIN_USERNAME || CRED.HARPER_ADMIN_USERNAME
	? { username: process.env.HARPER_ADMIN_USERNAME || CRED.HARPER_ADMIN_USERNAME,
	    password: process.env.HARPER_ADMIN_PASSWORD || CRED.HARPER_ADMIN_PASSWORD }
	: undefined;

const failures = [];
const checks = [];

function ok(label) { checks.push(`✓ ${label}`); }
function fail(label, detail) {
	failures.push(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
	checks.push(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
	await mkdir(SHOTS, { recursive: true });
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		ignoreHTTPSErrors: true,
		httpCredentials,
	});
	console.log('▶ smoke against', BASE, httpCredentials ? `(auth: ${httpCredentials.username})` : '');
	const page = await context.newPage();

	const consoleErrors = [];
	const pageErrors = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));

	async function shot(name) {
		await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
	}

	function flushPageErrors(label) {
		if (consoleErrors.length) fail(`${label}: console errors`, consoleErrors.join(' | '));
		if (pageErrors.length) fail(`${label}: page errors`, pageErrors.join(' | '));
		consoleErrors.length = 0;
		pageErrors.length = 0;
	}

	// ── /  (home feed) ────────────────────────────────────
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('article.card .post-headline', { timeout: 10000 });

	const postCount = await page.locator('article.card').count();
	postCount >= 2 ? ok(`/ feed: ${postCount} post cards`) : fail(`/ feed: only ${postCount} cards`);

	const taylorHeadline = await page.locator('article.card .post-headline')
		.filter({ hasText: 'Morgan Stanley' }).first().textContent();
	taylorHeadline ? ok('/ feed: Taylor article headline present') : fail('/ feed: Taylor headline missing');

	// Transition event card with from→to + AUM moved.
	const transition = page.locator('.event-card.transition').first();
	await transition.waitFor({ timeout: 5000 });
	const transitionText = await transition.textContent();
	/Morgan Stanley/.test(transitionText) && /Wells Fargo/.test(transitionText)
		? ok('/ feed: transition event shows Morgan Stanley → Wells Fargo')
		: fail('/ feed: transition event missing firm arrow', transitionText.slice(0, 120));
	/\$5\.94B/.test(transitionText) || /5\.94/.test(transitionText)
		? ok('/ feed: transition event shows $5.94B AUM')
		: fail('/ feed: transition event missing $5.94B AUM', transitionText.slice(0, 120));
	/275%|2\.75/.test(transitionText)
		? ok('/ feed: transition event shows 275% T-12 deal')
		: fail('/ feed: transition event missing deal terms', transitionText.slice(0, 120));

	// Disclosure event card with sanction pills.
	const disclosure = page.locator('.event-card.disclosure').first();
	await disclosure.waitFor({ timeout: 5000 });
	const sanctionPills = await page.locator('.sanction-pill').count();
	sanctionPills >= 2
		? ok(`/ feed: ${sanctionPills} sanction pills rendered`)
		: fail(`/ feed: only ${sanctionPills} sanction pills (expected 2+)`);
	const disclosureText = await disclosure.textContent();
	/FINRA/.test(disclosureText)
		? ok('/ feed: disclosure event shows FINRA')
		: fail('/ feed: disclosure event missing FINRA', disclosureText.slice(0, 120));

	// Entity chips on the Taylor card (firm + team + advisor).
	const taylorCard = page.locator('article.card').filter({ hasText: 'Morgan Stanley Team' }).first();
	const chipKinds = await taylorCard.locator('.chip-row .chip').evaluateAll((els) =>
		els.map((e) => Array.from(e.classList).find((c) => ['firm', 'team', 'advisor'].includes(c))));
	const distinctKinds = new Set(chipKinds);
	distinctKinds.has('firm') && distinctKinds.has('team') && distinctKinds.has('advisor')
		? ok(`/ feed: Taylor card shows firm/team/advisor chips (${chipKinds.length} total)`)
		: fail(`/ feed: Taylor card chip kinds = ${[...distinctKinds].join(',')}`);

	// Right rail: trending firms.
	(await page.locator('.right .card').filter({ hasText: 'Trending firms' }).count()) >= 1
		? ok('/ feed: right rail shows Trending firms') : fail('/ feed: right rail missing trending');

	await shot('01-feed');
	flushPageErrors('/ feed');

	// ── click into a firm chip ────────────────────────────
	// hasText: 'Wells Fargo' would match both "Wells Fargo" and the
	// FiNet chip. Use the exact-match regex to grab the parent firm.
	// Chip textContent is "firmWells Fargo · St. Louis, MO" (firmShort
	// strips the trailing " Advisors") for the parent vs.
	// "firmWells Fargo Advisors Financial Network (FiNet) ·…" for FiNet.
	const wellsChip = taylorCard.locator('.chip.firm').filter({ hasText: /^firmWells Fargo·/ }).first();
	await wellsChip.click();
	await page.waitForSelector('.profile-head h1', { timeout: 10000 });

	const firmTitle = await page.locator('.profile-head h1').textContent();
	/Wells Fargo/.test(firmTitle) ? ok(`firm.html: header "${firmTitle.trim()}"`) : fail(`firm.html: header was "${firmTitle}"`);

	const sectionTitles = await page.locator('.card h2.card-title').allTextContents();
	const hasCurrent = sectionTitles.some((s) => /Current advisors/i.test(s));
	const hasPast = sectionTitles.some((s) => /Past advisors/i.test(s));
	const hasIn = sectionTitles.some((s) => /moves to/i.test(s));
	hasCurrent ? ok('firm.html: "Current advisors" section') : fail('firm.html: missing current-advisors section');
	hasPast ? ok('firm.html: "Past advisors" section') : fail('firm.html: missing past-advisors section');
	hasIn ? ok('firm.html: "Recent moves to" section') : fail('firm.html: missing inbound transitions');

	// Past advisors should include Cairnes with terminated tag.
	const pastBlock = page.locator('.card').filter({ hasText: 'Past advisors' }).first();
	const pastText = await pastBlock.textContent();
	/Cairnes/.test(pastText)
		? ok('firm.html: past-advisor list includes Cairnes')
		: fail('firm.html: past-advisor list missing Cairnes', pastText.slice(0, 200));
	/terminated/i.test(pastText)
		? ok('firm.html: terminated-for-cause flagged')
		: fail('firm.html: terminated tag missing', pastText.slice(0, 200));

	// Right rail: branch tree.
	(await page.locator('.right .card').filter({ hasText: 'Branches' }).count()) >= 1
		? ok('firm.html: right rail shows Branches')
		: fail('firm.html: right rail missing Branches');

	await shot('02-firm-wells-fargo');
	flushPageErrors('firm.html');

	// ── click into Cairnes from the past-advisors list ────
	await pastBlock.locator('a').filter({ hasText: 'Cairnes' }).first().click();
	await page.waitForSelector('.profile-head h1', { timeout: 10000 });

	const advTitle = await page.locator('.profile-head h1').textContent();
	/Cairnes/.test(advTitle) ? ok(`advisor.html: header "${advTitle.trim()}"`) : fail(`advisor.html: header "${advTitle}"`);

	// Career timeline with 3 firms.
	const steps = await page.locator('.timeline .step').count();
	steps >= 3
		? ok(`advisor.html: career timeline has ${steps} steps`)
		: fail(`advisor.html: career timeline only ${steps} steps`);

	// At least one disclosure rendered with sanction pills.
	const advDiscCount = await page.locator('.event-card.disclosure').count();
	advDiscCount >= 5
		? ok(`advisor.html: ${advDiscCount} disclosure events`)
		: fail(`advisor.html: only ${advDiscCount} disclosure events (expected 5)`);

	const advSanctionCount = await page.locator('.sanction-pill').count();
	advSanctionCount >= 3
		? ok(`advisor.html: ${advSanctionCount} sanction pills (3 expected: fine, suspension, TX bar)`)
		: fail(`advisor.html: only ${advSanctionCount} sanction pills`);

	// Status tag is "suspended" (danger).
	const statusTag = await page.locator('.profile-head .tag.danger').first().textContent().catch(() => '');
	/suspended/.test(statusTag)
		? ok('advisor.html: career status "suspended" flagged red')
		: fail(`advisor.html: status tag was "${statusTag}"`);

	await shot('03-advisor-cairnes');
	flushPageErrors('advisor.html');

	// ── Taylor team profile ──────────────────────────────
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chip.team', { timeout: 10000 });
	await page.locator('.chip.team').filter({ hasText: 'Taylor' }).first().click();
	await page.waitForSelector('.profile-head h1', { timeout: 10000 });

	const teamTitle = await page.locator('.profile-head h1').textContent();
	/Taylor/.test(teamTitle) ? ok(`team.html: header "${teamTitle.trim()}"`) : fail(`team.html: header "${teamTitle}"`);

	const memberRows = await page.locator('.card').filter({ hasText: 'Current members' })
		.first().locator('.row').count();
	memberRows >= 9
		? ok(`team.html: ${memberRows} current members`)
		: fail(`team.html: only ${memberRows} current members (expected 9)`);

	// Metric snapshot table — should have 2 rows (2023 + 2026).
	const snapRows = await page.locator('.snap-table tbody tr').count();
	snapRows >= 2
		? ok(`team.html: ${snapRows} metric snapshot rows`)
		: fail(`team.html: only ${snapRows} snapshot rows (expected 2)`);

	await shot('04-team-taylor-group');
	flushPageErrors('team.html');

	// ── article detail with provenance ───────────────────
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('article.card .post-headline', { timeout: 10000 });
	await page.locator('article.card .post-headline a').first().click();
	await page.waitForSelector('.post-headline', { timeout: 10000 });

	const articleHasProvenance = await page.locator('.card').filter({ hasText: 'Field-assertion provenance' }).count();
	articleHasProvenance >= 1
		? ok('article.html: provenance section present')
		: fail('article.html: missing provenance section');

	const provQuotes = await page.locator('.snap-table tbody tr').count();
	provQuotes >= 4
		? ok(`article.html: ${provQuotes} provenance rows`)
		: fail(`article.html: only ${provQuotes} provenance rows (expected 4+)`);

	await shot('05-article-detail');
	flushPageErrors('article.html');

	// ── flat directory pages ──────────────────────────────
	for (const page2 of ['firms.html', 'advisors.html', 'teams.html']) {
		await page.goto(`${BASE}/${page2}`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.entity-list .row', { timeout: 10000 });
		const rows = await page.locator('.entity-list .row').count();
		rows >= 1
			? ok(`${page2}: ${rows} rows`)
			: fail(`${page2}: empty`);
		await shot(`06-${page2.replace('.html','')}`);
		flushPageErrors(page2);
	}

	await browser.close();

	console.log('\n──────── SMOKE TEST RESULTS ────────');
	for (const c of checks) console.log('  ' + c);
	console.log(`──────── ${failures.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failures.length}/${checks.length}) ────────\n`);
	if (failures.length) {
		console.log('Screenshots written to', SHOTS);
		process.exit(1);
	}
	console.log('Screenshots written to', SHOTS);
}

main().catch((err) => {
	console.error('test runner crashed:', err.stack || err.message || err);
	process.exit(2);
});

#!/usr/bin/env node
// @ts-nocheck
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
 *   bun run dev:server &        # in another shell
 *   bun run smoke
 *
 * Screenshots land in tests/screenshots/.
 */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { loadCreds, createAuthTokens } from '../src/scripts/_auth.js';

// Resolve playwright in both layouts:
//   - CI runner — `bun install` populates `./node_modules/playwright`,
//     reachable from the standard resolver chain.
//   - Local sandbox — Playwright is installed globally at
//     `/opt/node22/lib/node_modules` and not reachable from the
//     standard chain unless symlinked. We fall back to that path.
const require = createRequire(import.meta.url);
let chromium;
try {
	({ chromium } = require('playwright'));
} catch {
	({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9926';
const SHOTS = resolve('tests/screenshots');
const isLocalDev = /^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE);

// Auth strategy: hit the deployed cluster *as a real anonymous
// visitor would* — no Authorization header. The point of this UI
// is a public-facing news feed; if the routes 401, the user sees
// a sad error card. The custom resources override `allowRead` to
// allow anonymous reads (see resources.js). Set AUTH=jwt to opt
// into a JWT bearer — useful when probing admin-only routes.
let extraHeaders = undefined;
if (!isLocalDev && process.env.AUTH === 'jwt') {
	const creds = loadCreds();
	if (creds.username && creds.password) {
		const { operation_token } = await createAuthTokens(creds);
		extraHeaders = { Authorization: `Bearer ${operation_token}` };
	}
}

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
		extraHTTPHeaders: extraHeaders,
	});
	console.log('▶ smoke against', BASE, extraHeaders ? '(JWT bearer)' : '(anonymous, as a real visitor)');
	const page = await context.newPage();

	const consoleErrors = [];
	const pageErrors = [];
	page.on('console', (msg) => {
		const text = msg.text();
		if (msg.type() === 'error' && text !== 'Failed to load resource: net::ERR_HTTP2_PROTOCOL_ERROR') {
			consoleErrors.push(text);
		}
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

	function cleanProfilePath(kind, url) {
		const path = new URL(url).pathname;
		const canonical = new RegExp(`^/${kind}/[a-z0-9-]+-[0-9a-f-]{36}$`, 'i');
		const legacySlug = new RegExp(`^/${kind}/[a-z0-9-]+$`, 'i');
		const legacyId = new RegExp(`^/${kind}/[0-9a-f-]{36}$`, 'i');
		return canonical.test(path) || legacySlug.test(path) || legacyId.test(path);
	}

	// ── /  (home feed) ────────────────────────────────────
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('article.card .post-headline', { timeout: 10000 });

	const postCount = await page.locator('article.card').count();
	postCount >= 2 ? ok(`/ feed: ${postCount} post cards`) : fail(`/ feed: only ${postCount} cards`);

		const taylorCard = page.locator('article.card').filter({ hasText: 'The Taylor Group' }).first();
		await taylorCard.waitFor({ timeout: 10000 });
		const taylorHeadline = await taylorCard.locator('.post-headline').textContent();
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
		const wellsChip = taylorCard.locator('.chip.firm').filter({ hasText: /^firmWells Fargo(?:·|$)/ }).first();
	await wellsChip.click();
	await page.waitForSelector('.profile-head h1', { timeout: 10000 });
	cleanProfilePath('firms', page.url())
		? ok('firm URL: clean /firms/... path')
		: fail('firm URL: expected clean /firms/... path', page.url());

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
	await pastBlock.scrollIntoViewIfNeeded();
	const cairnesLink = pastBlock.locator('a').filter({ hasText: 'Cairnes' }).first();
	await cairnesLink.waitFor({ timeout: 10000 }).catch(() => {});
	const pastText = await pastBlock.textContent();
	(await cairnesLink.count()) >= 1
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
	cleanProfilePath('advisors', page.url())
		? ok('advisor URL: clean /advisors/... path')
		: fail('advisor URL: expected clean /advisors/... path', page.url());

	const advTitle = await page.locator('.profile-head h1').textContent();
	/Cairnes/.test(advTitle) ? ok(`advisor.html: header "${advTitle.trim()}"`) : fail(`advisor.html: header "${advTitle}"`);

	// Career timeline. After the BrokerCheck enrichment lands, this is
	// 5 firms (Merrill → Stanford → Wells Fargo Investments → Wells
	// Fargo Clearing → Chelsea); pre-enrichment it was 3. Accept ≥ 3.
	const steps = await page.locator('.timeline .step').count();
	steps >= 3
		? ok(`advisor.html: career timeline has ${steps} steps`)
		: fail(`advisor.html: career timeline only ${steps} steps`);

	// At least one disclosure rendered with sanction pills. BrokerCheck
	// adds 1 over the AdvisorHub-extracted set (FINRA AWC + Texas state
	// + U5 + 3 customer disputes = 6), so ≥ 5 is the floor.
	const advDiscCount = await page.locator('.event-card.disclosure').count();
	advDiscCount >= 5
		? ok(`advisor.html: ${advDiscCount} disclosure events`)
		: fail(`advisor.html: only ${advDiscCount} disclosure events (expected ≥ 5)`);

	const advSanctionCount = await page.locator('.sanction-pill').count();
	advSanctionCount >= 3
		? ok(`advisor.html: ${advSanctionCount} sanction pills`)
		: fail(`advisor.html: only ${advSanctionCount} sanction pills`);

	// Status tag (danger). After BrokerCheck enrichment Cairnes shows
	// "Withdrawn" (registration lapsed) rather than "Suspended" (which
	// is what AdvisorHub reported at article time). Accept either.
	const statusTag = await page.locator('.profile-head .tag').filter({ hasText: /suspended|withdrawn/i }).first().textContent().catch(() => '');
	/suspended|withdrawn/i.test(statusTag)
		? ok(`advisor.html: career status flagged ("${statusTag.trim()}")`)
		: fail(`advisor.html: status tag was "${statusTag}"`);

	// FINRA CRD badge surfaced in the profile-head tags.
	const crdBadge = await page.locator('.profile-head .tag').filter({ hasText: /CRD/i }).count();
	if (crdBadge >= 1) ok(`advisor.html: FINRA CRD badge present`);
	else if (isLocalDev) ok('advisor.html: local seed has no BrokerCheck CRD badge');
	else fail(`advisor.html: missing CRD badge in profile head`);

	// BrokerCheck attribution footer — required by the BrokerCheck ToU
	// whenever we surface regulator-of-record facts. The career and
	// disclosures sections each render one.
	const sourceAttrs = await page.locator('.ab-source-attr').count();
	if (sourceAttrs >= 1) ok(`advisor.html: ${sourceAttrs} BrokerCheck attribution footer(s)`);
	else if (isLocalDev) ok('advisor.html: local seed has no BrokerCheck attribution footer');
	else fail(`advisor.html: missing BrokerCheck attribution footer (ToU requirement)`);
	const sourceAttrText = await page.locator('.ab-source-attr').first().textContent().catch(() => '');
	if (/FINRA BrokerCheck/i.test(sourceAttrText) && /as of/i.test(sourceAttrText)) {
		ok('advisor.html: attribution names FINRA BrokerCheck and shows "as of <date>"');
	} else if (isLocalDev) {
		ok('advisor.html: local seed skips BrokerCheck attribution text');
	} else {
		fail(`advisor.html: attribution malformed: "${sourceAttrText.slice(0, 120)}"`);
	}
	const tosLink = await page.locator('.ab-source-attr a[href*="brokercheck.finra.org/terms"]').count();
	if (tosLink >= 1) ok('advisor.html: attribution links to BrokerCheck ToU (required by ToU)');
	else if (isLocalDev) ok('advisor.html: local seed skips BrokerCheck ToU link');
	else fail('advisor.html: attribution missing ToU link');

	await shot('03-advisor-cairnes');
	flushPageErrors('advisor.html');

	// ── Taylor team profile ──────────────────────────────
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chip.team', { timeout: 10000 });
	await page.locator('.chip.team').filter({ hasText: 'Taylor' }).first().click();
	await page.waitForSelector('.profile-head h1', { timeout: 10000 });
	cleanProfilePath('teams', page.url())
		? ok('team URL: clean /teams/... path')
		: fail('team URL: expected clean /teams/... path', page.url());

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
		const articleWithProvenance = await page.evaluate(async () => {
			const feed = await fetch('/Feed').then((r) => r.json());
			for (const item of feed.items || []) {
				const id = item.article?.id || item.id;
				const detail = await fetch(`/ArticleView/${encodeURIComponent(id)}`).then((r) => r.json());
				if (detail.provenance?.length) {
					return document.querySelector(`a[href*="${id}"]`)?.getAttribute('href') || `/articles/${id}`;
				}
			}
			return null;
		});
		articleWithProvenance
			? ok('article.html: found feed article with provenance')
			: fail('article.html: no feed article with provenance');
		if (!articleWithProvenance) throw new Error('no feed article with provenance');
		await page.goto(`${BASE}${articleWithProvenance}`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.post-headline', { timeout: 10000 });
	cleanProfilePath('articles', page.url())
		? ok('article URL: clean /articles/... path')
		: fail('article URL: expected clean /articles/... path', page.url());

	const articleHasProvenance = await page.locator('.card').filter({ hasText: 'Field-assertion provenance' }).count();
	articleHasProvenance >= 1
		? ok('article.html: provenance section present')
		: fail('article.html: missing provenance section');

	const provQuotes = await page.locator('.snap-table tbody tr').count();
	provQuotes >= 3
		? ok(`article.html: ${provQuotes} provenance rows`)
		: fail(`article.html: only ${provQuotes} provenance rows (expected 3+)`);

	await shot('05-article-detail');
	flushPageErrors('article.html');

	// ── flat directory pages ──────────────────────────────
	for (const page2 of ['firms', 'advisors', 'teams']) {
		await page.goto(`${BASE}/${page2}`, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('.entity-list .row', { timeout: 10000 });
		const rows = await page.locator('.entity-list .row').count();
		rows >= 1
			? ok(`${page2}: ${rows} rows`)
			: fail(`${page2}: empty`);
		await shot(`06-${page2}`);
		flushPageErrors(page2);
	}

	// ── auth flow: anonymous → sign in → /Me reflects → sign out ──
	await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('article.card .post-headline', { timeout: 10000 });
	const meSpotInitial = await page.locator('.me-spot .me-action').first().textContent().catch(() => '');
	/Sign in/i.test(meSpotInitial)
		? ok('navbar: anonymous shows "Sign in"')
		: fail(`navbar: expected "Sign in", got "${meSpotInitial}"`);

	if (isLocalDev) {
		ok('navbar: local smoke skips signed-in flow');
	} else {
		await page.locator('.me-spot a:has-text("Sign in")').first().click();
		await page.waitForSelector('input[name="email"]', { timeout: 8000 });
		const creds = { email: process.env.HARPER_ADMIN_USERNAME || 'cody.swann@gmail.com', password: process.env.HARPER_ADMIN_PASSWORD || 'Har2026!!' };
		await page.locator('input[name="email"]').fill(creds.email);
		await page.locator('input[name="password"]').fill(creds.password);
		await page.locator('button[type="submit"]').click();
		await page.waitForSelector('article.card', { timeout: 10000 });
		const meSpotSignedIn = await page.locator('.me-spot').first().textContent();
		new RegExp(creds.email.split('@')[0], 'i').test(meSpotSignedIn)
			? ok(`navbar: signed-in shows username ("${meSpotSignedIn.trim()}")`)
			: fail(`navbar: expected username, got "${meSpotSignedIn.trim()}"`);
		await shot('07-signed-in');
		flushPageErrors('signed in');

		await page.locator('.me-spot button:has-text("Sign out")').click();
		await page.waitForFunction(() => !document.querySelector('.me-spot .me-user'), null, { timeout: 8000 }).catch(() => {});
		await page.waitForSelector('.me-spot a:has-text("Sign in")', { timeout: 8000 });
		ok('navbar: sign-out returns to anonymous');
	}

	// ── mobile drawer: at iPhone-width the burger toggles a drawer ──
	const mobile = await browser.newContext({
		viewport: { width: 390, height: 844 }, // iPhone 14 portrait
		ignoreHTTPSErrors: true,
		extraHTTPHeaders: extraHeaders,
	});
	const mPage = await mobile.newPage();
	await mPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
	await mPage.waitForSelector('article.card', { timeout: 10000 });

	// On mobile the inline links should be hidden; the burger visible.
	const burgerVisible = await mPage.locator('.nav-burger').isVisible();
	const linksHiddenInline = await mPage.locator('.nav-drawer').evaluate((el) => {
		// drawer is fixed-position translateX(100%) when closed
		const t = getComputedStyle(el).transform;
		return t === 'matrix(1, 0, 0, 1, 300, 0)' || t.includes('matrix(1, 0, 0, 1,');
	}).catch(() => false);
	burgerVisible ? ok('mobile: hamburger visible') : fail('mobile: hamburger not visible');
	linksHiddenInline ? ok('mobile: drawer is offscreen (translateX)') : fail('mobile: drawer not in expected closed state');
	await mPage.screenshot({ path: `${SHOTS}/08-mobile-closed.png` });

	await mPage.locator('.nav-burger').click();
	await mPage.waitForFunction(() => document.body.classList.contains('drawer-open'), null, { timeout: 3000 });
	await mPage.waitForTimeout(300); // animation
	const drawerOpen = await mPage.locator('.nav-drawer').isVisible();
	const homeLinkInDrawer = await mPage.locator('.nav-drawer .nav-links a:has-text("Home")').isVisible();
	drawerOpen && homeLinkInDrawer
		? ok('mobile: drawer opens, nav links visible inside')
		: fail(`mobile: drawer state wrong (open=${drawerOpen}, link=${homeLinkInDrawer})`);
	await mPage.screenshot({ path: `${SHOTS}/09-mobile-drawer-open.png` });

	// Tap Firms in the drawer; should navigate and the drawer should close.
	await mPage.locator('.nav-drawer .nav-links a:has-text("Firms")').click();
	await mPage.waitForURL(/\/firms$/, { timeout: 8000 });
	await mPage.waitForTimeout(300);
	const drawerClosedAfterClick = await mPage.evaluate(() => !document.body.classList.contains('drawer-open'));
	drawerClosedAfterClick ? ok('mobile: drawer closes after clicking a link') : fail('mobile: drawer stayed open after click');

	await mobile.close();

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

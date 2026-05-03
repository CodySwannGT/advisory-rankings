#!/usr/bin/env node
/**
 * Targeted Playwright smoke test for the BrokerCheck UI surface.
 *
 * Verifies the things the BrokerCheck integration must show on the
 * deployed advisor / firm profile pages:
 *
 *   - FINRA CRD badge in the profile-head tag row.
 *   - SourceAttribution footer ("Source: FINRA BrokerCheck (as of …)
 *     . Terms of use.") under sections fed by BrokerCheck.
 *   - Footer links to BrokerCheck and to the BrokerCheck ToU
 *     (required by the ToU itself).
 *   - Career timeline / disclosures populated from the enriched
 *     BrokerCheck data.
 *
 * Runs against the deployed cluster by default. Override:
 *   BASE_URL=https://… node tests/brokercheck_web_smoke.mjs
 *
 * Cairnes is the canonical disclosure-rich case — his record drives
 * most of the assertions here. Pick any known-good firm CRD for the
 * firm checks; defaults to Wells Fargo Clearing's URL slug if a
 * Wells Fargo Advisors row with finraCrd is present in the DB.
 */
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const BASE = process.env.BASE_URL ||
	'https://advisory-rankings-de.cody-swann-org.harperfabric.com';
const SHOTS = resolve('tests/screenshots');

// Admin auth for the auto-exported `/Advisor/` and `/Disclosure/`
// list endpoints (the AdvisorProfile/FirmProfile *resources* are
// public via allowRead, but the underlying tables still require
// auth to enumerate). Reads ~/.harper-fabric-credentials.
function loadAuth() {
	const env = (k) => process.env[k];
	let user = env('HARPER_ADMIN_USERNAME') || env('HDB_ADMIN_USERNAME');
	let pass = env('HARPER_ADMIN_PASSWORD') || env('HDB_ADMIN_PASSWORD');
	try {
		const cred = Object.fromEntries(
			readFileSync(`${homedir()}/.harper-fabric-credentials`, 'utf8')
				.split('\n').filter(Boolean).map((l) => {
					const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
				}));
		user = user || cred.HARPER_ADMIN_USERNAME || cred.HDB_ADMIN_USERNAME;
		pass = pass || cred.HARPER_ADMIN_PASSWORD || cred.HDB_ADMIN_PASSWORD;
	} catch {}
	user = (user || '').replace(/^[“"']+|[”"']+$/g, '');
	pass = (pass || '').replace(/^[“"']+|[”"']+$/g, '');
	if (!user || !pass) return null;
	return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}
const AUTH = loadAuth();

const failures = [];
const checks = [];
const ok = (msg) => { checks.push(`✓ ${msg}`); };
const fail = (msg, detail) => {
	const line = `✗ ${msg}${detail ? ` — ${detail}` : ''}`;
	failures.push(line);
	checks.push(line);
};

// API client uses Playwright's request fixture so it works regardless
// of which origin the page is on (page.evaluate(fetch(...)) is gated
// by CORS until the browser has navigated to BASE).
async function apiGet(request, path) {
	const headers = { Accept: 'application/json' };
	if (AUTH) headers.Authorization = AUTH;
	const res = await request.get(BASE + path, { headers });
	if (!res.ok()) return null;
	return await res.json();
}

async function findAdvisorByCrd(request, crd) {
	const rows = await apiGet(request, `/Advisor/?finraCrd=${encodeURIComponent(crd)}`);
	return Array.isArray(rows) ? rows[0] || null : null;
}

async function findFirmWithSnapshot(request) {
	const snaps = await apiGet(request, '/BrokerCheckSnapshot/');
	const firmSnap = (snaps || []).find((s) => s.subjectKind === 'firm');
	if (!firmSnap) return null;
	const firms = await apiGet(request, '/Firm/?finraCrd=' + firmSnap.subjectCrd);
	return Array.isArray(firms) ? firms[0] || null : null;
}

async function main() {
	await mkdir(SHOTS, { recursive: true });
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		ignoreHTTPSErrors: true,
	});
	const request = context.request;
	const page = await context.newPage();

	console.log(`▶ smoke against ${BASE}`);

	// ── Cairnes (or any disclosure-rich CRD) advisor profile ──
	const cairnes = await findAdvisorByCrd(request, '4068906');
	if (!cairnes) {
		fail('Cairnes (CRD 4068906) not found in DB — run the scraper first');
	} else {
		await page.goto(`${BASE}/advisor.html?id=${encodeURIComponent(cairnes.id)}`);
		await page.waitForSelector('.profile-head h1', { timeout: 10000 });

		const title = await page.locator('.profile-head h1').textContent();
		/Cairnes/i.test(title)
			? ok(`advisor.html: title "${title.trim()}"`)
			: fail(`advisor.html: title was "${title}"`);

		// CRD badge in the head tags
		const crdBadge = await page.locator('.profile-head .tag').filter({ hasText: /CRD/i }).count();
		crdBadge >= 1 ? ok('advisor.html: CRD badge in profile head')
			: fail('advisor.html: CRD badge missing');

		// Career timeline
		const steps = await page.locator('.timeline .step').count();
		steps >= 5 ? ok(`advisor.html: career timeline has ${steps} firms (5 expected from BC)`)
			: fail(`advisor.html: career timeline only ${steps} firms (expected ≥ 5)`);

		// Disclosure cards
		const discCount = await page.locator('.event-card.disclosure').count();
		discCount >= 6 ? ok(`advisor.html: ${discCount} disclosure cards (6 expected from BC)`)
			: fail(`advisor.html: only ${discCount} disclosure cards (expected ≥ 6)`);

		// Sanction pills (FINRA fine + suspension + Texas denial + undertaking)
		const sancCount = await page.locator('.sanction-pill').count();
		sancCount >= 4 ? ok(`advisor.html: ${sancCount} sanction pills (≥ 4 expected)`)
			: fail(`advisor.html: only ${sancCount} sanction pills`);

		// SourceAttribution — required by FINRA BrokerCheck ToU
		const attrCount = await page.locator('.ab-source-attr').count();
		attrCount >= 1 ? ok(`advisor.html: ${attrCount} BrokerCheck attribution footer(s)`)
			: fail('advisor.html: missing BrokerCheck attribution footer');

		const attrText = await page.locator('.ab-source-attr').first().textContent().catch(() => '');
		/FINRA BrokerCheck/i.test(attrText)
			? ok('advisor.html: attribution names FINRA BrokerCheck')
			: fail(`advisor.html: attribution text wrong: "${attrText.slice(0, 100)}"`);
		/as of/i.test(attrText)
			? ok('advisor.html: attribution shows "as of <date>" (ToU requirement)')
			: fail('advisor.html: attribution missing "as of <date>"');

		const tosLink = await page.locator('.ab-source-attr a[href*="brokercheck.finra.org/terms"]').count();
		tosLink >= 1 ? ok('advisor.html: attribution links to BrokerCheck Terms of Use (ToU requirement)')
			: fail('advisor.html: attribution missing ToU link');

		const bcLink = await page.locator('.ab-source-attr a[href*="brokercheck.finra.org/individual"]').count();
		bcLink >= 1 ? ok('advisor.html: attribution links to advisor-specific BrokerCheck page')
			: fail('advisor.html: attribution missing BrokerCheck individual link');

		// Career-timeline section: the attribution must appear inside it
		// (not just disclosures), so users see the source for the
		// employment dates too.
		const careerSectionAttr = await page.locator('.card', { hasText: /Career/i })
			.locator('.ab-source-attr').count();
		careerSectionAttr >= 1
			? ok('advisor.html: Career section carries its own attribution')
			: fail('advisor.html: Career section missing attribution');

		await page.screenshot({ path: `${SHOTS}/bc-advisor-cairnes.png`, fullPage: true });
	}

	// ── A firm profile with a BrokerCheckSnapshot ──
	const firm = await findFirmWithSnapshot(request);
	if (!firm) {
		console.log('  (no firm-level BrokerCheckSnapshot in DB — skipping firm checks)');
	} else {
		await page.goto(`${BASE}/firm.html?id=${encodeURIComponent(firm.id)}`);
		await page.waitForSelector('.profile-head h1', { timeout: 10000 });
		const title = await page.locator('.profile-head h1').textContent();
		ok(`firm.html: title "${title.trim()}"`);
		const firmAttr = await page.locator('.ab-source-attr').count();
		firmAttr >= 1 ? ok(`firm.html: ${firmAttr} BrokerCheck attribution footer(s)`)
			: fail('firm.html: BrokerCheck attribution footer missing');
		const firmTosLink = await page.locator('.ab-source-attr a[href*="brokercheck.finra.org/terms"]').count();
		firmTosLink >= 1 ? ok('firm.html: attribution links to BrokerCheck ToU')
			: fail('firm.html: attribution missing ToU link');

		// Right-rail "Regulatory record" block we added with disclosure
		// counts and the SourceAttribution.
		const regCard = await page.locator('.card').filter({ hasText: /Regulatory record/i }).count();
		regCard >= 1 ? ok('firm.html: "Regulatory record" right-rail card present')
			: fail('firm.html: missing "Regulatory record" card');

		await page.screenshot({ path: `${SHOTS}/bc-firm.png`, fullPage: true });
	}

	// ── /Advisor/ list shape: every BC-enriched advisor exposes a CRD ──
	const advisorsResp = (await apiGet(request, '/Advisor/')) || [];
	const withCrd = advisorsResp.filter((a) => a.finraCrd).length;
	withCrd >= 8
		? ok(`API: ${withCrd}/${advisorsResp.length} advisors have finraCrd populated`)
		: fail(`API: only ${withCrd}/${advisorsResp.length} advisors have CRDs`);

	const snapResp = (await apiGet(request, '/BrokerCheckSnapshot/')) || [];
	snapResp.length >= 8
		? ok(`API: ${snapResp.length} BrokerCheckSnapshot rows`)
		: fail(`API: only ${snapResp.length} BrokerCheckSnapshot rows (expected ≥ 8)`);

	const sourceTypeResp = (await apiGet(request, '/Disclosure/?sourceType=brokercheck')) || [];
	sourceTypeResp.length >= 6
		? ok(`API: ${sourceTypeResp.length} Disclosures with sourceType=brokercheck`)
		: fail(`API: only ${sourceTypeResp.length} Disclosures with sourceType=brokercheck`);

	await browser.close();

	console.log('\n──────── BROKERCHECK SMOKE RESULTS ────────');
	for (const c of checks) console.log('  ' + c);
	console.log(`──────── ${failures.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failures.length}/${checks.length}) ────────\n`);
	console.log('Screenshots written to', SHOTS);
	if (failures.length) process.exit(1);
}

main().catch((err) => {
	console.error('test runner crashed:', err.stack || err.message || err);
	process.exit(2);
});

#!/usr/bin/env node
// @ts-nocheck
/**
 * Offline smoke test for harper-app/resources.js.
 *
 * Why this exists: this sandbox kernel can't bind Harper's REST TCP
 * port (the same SO_REUSEPORT issue documented in
 * docs/fabric-runbook.md §5), so curl http://127.0.0.1:9926/Feed
 * doesn't work locally. Once deployed to Fabric, port 443 fronts the
 * REST endpoints just fine; locally we still want to verify that the
 * Feed/profile resources produce sane output.
 *
 * What it does: pulls every @export table out of Harper via the
 * operations-API SQL endpoint (which IS reachable, via the
 * `~/.harperdb/operations-server` Unix socket), stubs out a
 * `globalThis.tables` shim that resembles what Harper would inject,
 * imports resources.js, and prints the JSON each resource returns.
 *
 * Run:
 *   bun run preview                         # /Feed
 *   bun run preview -- firm <id>
 *   bun run preview -- advisor <id>
 *   bun run preview -- team <id>
 *   bun run preview -- article <id>
 *
 * Reads HDB_ADMIN_USERNAME / HDB_ADMIN_PASSWORD from the env, falling
 * back to admin/admin-local (the bootstrap.sh defaults).
 */

import { request } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SOCKET = process.env.HDB_OPS_SOCKET || `${process.env.HOME}/.harperdb/operations-server`;
const USER = process.env.HDB_ADMIN_USERNAME || 'admin';
const PASS = process.env.HDB_ADMIN_PASSWORD || 'admin-local';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

const TABLES = [
	'Firm', 'FirmSuccession', 'Branch', 'BranchAssignment', 'Advisor',
	'Education', 'Designation', 'License', 'EmploymentHistory',
	'RegistrationApplication', 'Team', 'TeamMembership',
	'TeamMetricSnapshot', 'AdvisorMetricSnapshot', 'TransitionEvent',
	'RecruitingDealQuote', 'Disclosure', 'DisclosureCluster', 'Sanction',
	'OutsideBusinessActivity', 'EmployerConcentration', 'Ranking',
	'RankingEntry', 'Article', 'ArticleAdvisorMention',
	'ArticleFirmMention', 'ArticleTeamMention',
	'ArticleTransitionEventMention', 'ArticleDisclosureMention',
	'FieldAssertion',
];

function opsCall(body) {
	return new Promise((resolve, reject) => {
		const req = request({
			socketPath: SOCKET,
			method: 'POST',
			path: '/',
			headers: { 'Content-Type': 'application/json', Authorization: AUTH },
		}, (res) => {
			let buf = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => { buf += chunk; });
			res.on('end', () => {
				try { resolve(JSON.parse(buf)); }
				catch (e) { reject(new Error(`bad json: ${buf.slice(0, 200)}`)); }
			});
		});
		req.on('error', reject);
		req.write(JSON.stringify(body));
		req.end();
	});
}

async function loadTable(name) {
	const res = await opsCall({ operation: 'sql', sql: `SELECT * FROM data.${name}` });
	if (Array.isArray(res)) return res;
	if (Array.isArray(res?.data)) return res.data;
	if (res?.error) {
		// Empty / unknown table → just skip.
		return [];
	}
	return [];
}

async function main() {
	const cmd = process.argv[2] || 'feed';
	const id = process.argv[3];

	// 1. Pull everything once.
	const data = {};
	for (const t of TABLES) data[t] = await loadTable(t);

	// 2. Build a `tables.X.search({})` shim that returns an AsyncIterable
	//    over the rows we just loaded.
	const tables = {};
	for (const t of TABLES) {
		const rows = data[t];
		tables[t] = {
			search: (_query) => (async function* () { for (const r of rows) yield r; })(),
		};
	}

	// 3. Stub Resource so resources.js can `extends Resource`.
	class Resource { constructor() {} }

	globalThis.tables = tables;
	globalThis.Resource = Resource;

	const mod = await import(pathToFileURL(resolve('harper-app/resources.js')).href);

	let result;
	if (cmd === 'feed') {
		result = await new mod.Feed().get();
	} else if (cmd === 'firm') {
		result = await new mod.FirmProfile().get(id);
	} else if (cmd === 'advisor') {
		result = await new mod.AdvisorProfile().get(id);
	} else if (cmd === 'team') {
		result = await new mod.TeamProfile().get(id);
	} else if (cmd === 'article') {
		result = await new mod.ArticleView().get(id);
	} else {
		console.error(`unknown command: ${cmd}`);
		process.exit(2);
	}

	console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
	console.error(err.stack || err.message || err);
	process.exit(1);
});

#!/usr/bin/env node
/**
 * Local dev server for the web/ UI.
 *
 * Why this exists: this sandbox kernel can't bind Harper's REST TCP
 * port (see docs/fabric-runbook.md §5/§8 for the SO_REUSEPORT
 * background), so http://127.0.0.1:9926/ — where Harper would
 * normally serve both the static web/ and the JS resources — is
 * unreachable.  This server reproduces that surface in plain Node:
 *   - Static GET for /             → web/index.html
 *   - Static GET for /<file>       → web/<file>
 *   - GET /Feed                    → resources.js Feed.get()
 *   - GET /ArticleView/<id>        → resources.js ArticleView.get(id)
 *   - GET /FirmProfile/<id>        → resources.js FirmProfile.get(id)
 *   - GET /AdvisorProfile/<id>     → resources.js AdvisorProfile.get(id)
 *   - GET /TeamProfile/<id>        → resources.js TeamProfile.get(id)
 *   - GET /<TableName>/            → operations-API SQL passthrough
 *
 * Backend store is the running local Harper, accessed exclusively
 * over its operations-server Unix socket — the same socket
 * `seed.py`, `verify.py`, and `preview_feed.mjs` already use.
 *
 * Usage:
 *   node scripts/dev_server.mjs                    # listens on :9926
 *   PORT=8080 node scripts/dev_server.mjs          # listens on :8080
 */

import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 9926);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve('harper-app/web');
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

// ── ops API helpers ─────────────────────────────────────────────

function opsCall(body) {
	return new Promise((resolveP, reject) => {
		const req = httpRequest({
			socketPath: SOCKET,
			method: 'POST',
			path: '/',
			headers: { 'Content-Type': 'application/json', Authorization: AUTH },
		}, (res) => {
			let buf = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => { buf += chunk; });
			res.on('end', () => {
				try { resolveP(JSON.parse(buf)); }
				catch (e) { reject(new Error(`bad json from ops API: ${buf.slice(0, 200)}`)); }
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
	return [];
}

// ── load resources.js with a tables shim ────────────────────────

let resources = null;
async function loadResources() {
	const data = {};
	for (const t of TABLES) data[t] = await loadTable(t);
	const tables = {};
	for (const t of TABLES) {
		const rows = data[t];
		tables[t] = {
			search: () => (async function* () { for (const r of rows) yield r; })(),
		};
	}
	class Resource { constructor() {} }
	globalThis.tables = tables;
	globalThis.Resource = Resource;
	if (!resources) {
		resources = await import(pathToFileURL(resolve('harper-app/resources.js')).href);
	}
	return resources;
}

// ── static + routing ────────────────────────────────────────────

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
};

async function serveStatic(req, res) {
	let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
	if (p === '/') p = '/index.html';
	const file = join(ROOT, p);
	if (!file.startsWith(ROOT)) {
		res.writeHead(403).end('forbidden');
		return;
	}
	try {
		const s = await stat(file);
		if (!s.isFile()) throw new Error('not a file');
		const body = await readFile(file);
		res.writeHead(200, {
			'Content-Type': MIME[extname(file)] || 'application/octet-stream',
			'Cache-Control': 'no-store',
		});
		res.end(body);
	} catch {
		res.writeHead(404).end('not found');
	}
}

function sendJson(res, code, body) {
	const buf = Buffer.from(JSON.stringify(body));
	res.writeHead(code, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': buf.length,
		'Cache-Control': 'no-store',
	});
	res.end(buf);
}

// Tiny in-memory session store so /Login /Logout /Me work locally.
// On the deployed cluster this is all handled by Harper's own
// session middleware (enableSessions: true in harperdb-config.yaml).
const sessions = new Map(); // sid → { username }
function readCookie(req, name) {
	const raw = req.headers['cookie'] || '';
	const m = raw.split(/;\s*/).find((c) => c.startsWith(name + '='));
	return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function newSid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// Mimic Harper's RequestTarget (extends URLSearchParams with `.id`,
// `.pathname`, parsed `.limit`) so resources.js can read the same shape
// in dev that production hands them. Just enough for our endpoints —
// not a full reimplementation of Harper's parser.
function makeTarget(id, searchParams) {
	const t = new URLSearchParams(searchParams || '');
	t.id = id;
	const lim = parseInt(t.get('limit'), 10);
	t.limit = Number.isFinite(lim) ? lim : undefined;
	t.toString = () => id == null ? '' : String(id);
	return t;
}

async function readBody(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	if (!chunks.length) return null;
	const text = Buffer.concat(chunks).toString('utf8');
	try { return JSON.parse(text); } catch { return null; }
}

async function handle(req, res) {
	const url = new URL(req.url, 'http://x');
	const p = url.pathname;
	try {
		// Auth surface (mirrors the deployed cluster's Login/Logout/Me).
		if (p === '/Login' && req.method === 'POST') {
			const body = await readBody(req);
			const u = body?.email || body?.username;
			if (!u || !body?.password) return sendJson(res, 400, { error: 'email and password required' });
			// Trust any non-empty credentials in dev — the deployed
			// cluster does the real validation via context.login().
			const sid = newSid();
			sessions.set(sid, { username: u });
			res.setHeader('Set-Cookie', `dev_sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
			return sendJson(res, 200, { ok: true, username: u });
		}
		if (p === '/Logout' && req.method === 'POST') {
			const sid = readCookie(req, 'dev_sid');
			if (sid) sessions.delete(sid);
			res.setHeader('Set-Cookie', 'dev_sid=; Path=/; Max-Age=0');
			return sendJson(res, 200, { ok: true });
		}
		if (p === '/Me') {
			const sid = readCookie(req, 'dev_sid');
			const sess = sid ? sessions.get(sid) : null;
			return sendJson(res, 200, sess
				? { authenticated: true, username: sess.username, role: 'super_user' }
				: { authenticated: false });
		}
		// Custom JS resources without an id segment.
		const noArgMatch = p.match(/^\/(Feed|PublicFirms|PublicAdvisors|PublicTeams)$/);
		if (noArgMatch) {
			const r = await loadResources();
			return sendJson(res, 200, await new r[noArgMatch[1]]().get(makeTarget(undefined, url.searchParams)));
		}
		const profileMatch = p.match(/^\/(ArticleView|FirmProfile|AdvisorProfile|TeamProfile|FirmAdvisors)\/(.+)$/);
		if (profileMatch) {
			const [, kind, id] = profileMatch;
			const r = await loadResources();
			const out = await new r[kind]().get(makeTarget(decodeURIComponent(id), url.searchParams));
			return sendJson(res, 200, out);
		}
		// Auto-export table list passthrough → SQL via ops API.
		const tableMatch = p.match(/^\/([A-Z][A-Za-z]+)\/?$/);
		if (tableMatch && TABLES.includes(tableMatch[1])) {
			const rows = await loadTable(tableMatch[1]);
			return sendJson(res, 200, rows);
		}
		// Static.
		await serveStatic(req, res);
	} catch (err) {
		console.error('500', p, err.stack || err.message || err);
		sendJson(res, 500, { error: String(err.message || err) });
	}
}

// Hot-reload resources.js by clearing cache between requests in dev.
// (Cheap; the dataset load dominates anyway.)
function devMode(req, res) {
	resources = null;
	handle(req, res);
}

createServer(process.env.HOT === '1' ? devMode : handle).listen(PORT, HOST, () => {
	console.log(`dev server listening on http://${HOST}:${PORT}`);
	console.log(`  static: ${ROOT}`);
	console.log(`  ops socket: ${SOCKET}`);
});

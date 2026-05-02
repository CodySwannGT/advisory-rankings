#!/usr/bin/env node
/**
 * Deploy the local harper-app/ component to the Fabric cluster
 * through Studio's operations proxy.
 *
 * Why this script and not `harperdb deploy_component` from the
 * runbook §3?
 *   - Studio's :443 proxy is reachable from this sandbox.  Direct
 *     :9925 ops API isn't (datacenter-egress firewall, see
 *     fabric-runbook §5).  Studio is reachable from anywhere a
 *     browser can sign in.
 *   - Studio's session-cookie auth covers any cluster operation, so
 *     we don't need a separate credential surface.
 *
 * Flow:
 *   1. POST /Login/ with email + password → session cookie.
 *   2. tar+gzip the component dir, base64-encode the bytes.
 *   3. POST /Cluster/<id>/operation/ with body
 *        { operation:"deploy_component", project, payload, restart, replicated }.
 *      The cluster writes the bundle into its components dir,
 *      restarts the http worker (because restart:true), and broadcasts
 *      to peers (replicated:true).
 *   4. Poll /Cluster/<id> until http listener is back up.
 *
 * Usage:
 *   npm run deploy                     # deploys ./harper-app
 *   PROJECT=advisor-app DIR=./harper-app node scripts/deploy.mjs
 *
 * Reads HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD from env or
 * ~/.harper-fabric-credentials.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const CRED = (() => {
	try {
		return Object.fromEntries(
			readFileSync(`${homedir()}/.harper-fabric-credentials`, 'utf8')
				.split('\n').filter(Boolean)
				.map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; })
		);
	} catch { return {}; }
})();
const env = (k, d) => process.env[k] ?? CRED[k] ?? d;
const STUDIO = env('HARPER_STUDIO_URL', 'https://fabric.harper.fast');
const CLUSTER_ID = env('HARPER_CLUSTER_ID', 'clu-nzeaqmqh1c5zrp9w');
const USER = env('HARPER_ADMIN_USERNAME');
const PASS = env('HARPER_ADMIN_PASSWORD');
const PROJECT = process.env.PROJECT || 'advisor-app';
const DIR = process.env.DIR || 'harper-app';

if (!USER || !PASS) {
	console.error('missing HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD (env or ~/.harper-fabric-credentials)');
	process.exit(2);
}

let cookieJar = '';
async function call(url, init = {}) {
	const r = await fetch(url, {
		...init,
		headers: { 'Content-Type': 'application/json', ...(init.headers || {}), ...(cookieJar ? { Cookie: cookieJar } : {}) },
		redirect: 'manual',
	});
	const sc = r.headers.getSetCookie?.() || [];
	for (const s of sc) {
		const [pair] = s.split(';');
		const [name] = pair.split('=');
		const existing = cookieJar.split('; ').filter(Boolean).filter((p) => !p.startsWith(name + '='));
		cookieJar = [...existing, pair].join('; ');
	}
	return r;
}

async function login() {
	const r = await call(`${STUDIO}/Login/`, { method: 'POST', body: JSON.stringify({ email: USER, password: PASS }) });
	if (r.status !== 200) {
		const t = await r.text();
		throw new Error(`login failed: ${r.status} ${t.slice(0, 200)}`);
	}
}

async function op(operation, extra = {}) {
	const r = await call(`${STUDIO}/Cluster/${CLUSTER_ID}/operation/`, {
		method: 'POST',
		body: JSON.stringify({ operation, ...extra }),
	});
	const body = await r.json().catch(() => null);
	return { status: r.status, body };
}

function buildTarball(dir) {
	// Skip node_modules (Harper installs its own runtime; bootstrap.sh
	// symlinks one in, but it's invalid on the cluster) and other
	// caches that don't belong in a deploy.
	const tmp = mkdtempSync(join(tmpdir(), 'hdb-deploy-'));
	const out = join(tmp, 'pkg.tar.gz');
	const args = [
		'--exclude=./node_modules',
		'--exclude=./.git',
		'--exclude=./.harperdb',
		'--exclude=./tests/screenshots',
		'-czf', out,
		'-C', dir, '.',
	];
	const r = spawnSync('tar', args, { stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`tar failed (${r.status})`);
	const bytes = readFileSync(out);
	rmSync(tmp, { recursive: true, force: true });
	return bytes;
}

function fmtBytes(n) {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

async function main() {
	console.log(`▶ login as ${USER}`);
	await login();

	console.log(`▶ packaging ${DIR}/`);
	const tgz = buildTarball(DIR);
	const payload = tgz.toString('base64');
	console.log(`  package: ${fmtBytes(tgz.length)} → ${fmtBytes(payload.length)} base64`);

	console.log(`▶ deploy_component project=${PROJECT}`);
	const dep = await op('deploy_component', {
		project: PROJECT,
		payload,
		restart: true,
		replicated: true,
	});
	console.log(`  status: ${dep.status}`);
	console.log(`  body:   ${JSON.stringify(dep.body).slice(0, 300)}`);
	if (dep.status !== 200) process.exit(1);

	// 2. Wait for the http worker to come back. /Firm/ as a heartbeat.
	const cluster = CRED.HARPER_CLUSTER_URL || env('HARPER_CLUSTER_URL');
	if (cluster) {
		console.log(`▶ waiting for ${cluster}/Firm/ to respond …`);
		const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 2000));
			const r = await fetch(`${cluster}/Firm/`, { headers: { Authorization: auth, Accept: 'application/json' } }).catch(() => null);
			if (r && r.ok) { console.log(`  back up after ${i * 2 + 2}s`); break; }
			process.stdout.write('.');
		}
		console.log();

		// 3. Verify our resources.js made it.
		const feed = await fetch(`${cluster}/Feed`, { headers: { Authorization: auth, Accept: 'application/json' } });
		console.log(`▶ ${cluster}/Feed → HTTP ${feed.status}`);
		if (feed.ok) {
			const j = await feed.json();
			console.log(`  count=${j.count}, items=${j.items?.length ?? 0}`);
		} else {
			console.log('  body:', (await feed.text()).slice(0, 300));
		}
	}
}

main().catch((err) => { console.error(err.stack || err.message || err); process.exit(1); });

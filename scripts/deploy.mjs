#!/usr/bin/env node
/**
 * Deploy the local harper-app/ component to the Fabric cluster.
 *
 *   - Control-plane call (deploy_component) → Studio :443 proxy with
 *     a session cookie. That's the only Fabric-exposed path: the
 *     cluster's ops API at :9925 is firewalled from datacenter egress
 *     (see fabric-runbook §5), and the cluster's own :443 returns 404
 *     for ops calls. Fabric does not expose long-lived API tokens.
 *   - Data-plane verification (post-restart /Firm/, /Feed) → native
 *     Harper JWT bearer minted via `create_authentication_tokens`.
 *     That's the documented Harper auth flow for REST routes.
 *
 * See scripts/_auth.mjs for the helpers and the rationale.
 *
 * Usage:
 *   npm run deploy                     # ./harper-app
 *   PROJECT=advisor-app DIR=./harper-app node scripts/deploy.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCreds, StudioSession } from './_auth.mjs';

const PROJECT = process.env.PROJECT || 'advisor-app';
const DIR = process.env.DIR || 'harper-app';
const creds = loadCreds();
if (!creds.username || !creds.password) {
	console.error('missing HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD (env or ~/.harper-fabric-credentials)');
	process.exit(2);
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
	console.log(`▶ Studio login as ${creds.username}`);
	const studio = await new StudioSession(creds).login();

	console.log(`▶ packaging ${DIR}/`);
	const tgz = buildTarball(DIR);
	const payload = tgz.toString('base64');
	console.log(`  package: ${fmtBytes(tgz.length)} → ${fmtBytes(payload.length)} base64`);

	console.log(`▶ deploy_component project=${PROJECT}`);
	const dep = await studio.clusterOp(creds.clusterId, 'deploy_component', {
		project: PROJECT,
		payload,
		restart: true,
		replicated: true,
	});
	console.log(`  status: ${dep.status}`);
	console.log(`  body:   ${JSON.stringify(dep.body).slice(0, 300)}`);
	if (dep.status !== 200) process.exit(1);

	if (!creds.clusterUrl) {
		console.log('  (HARPER_CLUSTER_URL not set; skipping post-deploy verification)');
		return;
	}

	// Verify as an anonymous visitor would: /Feed is public (the
	// resource overrides allowRead). If a future change locks /Feed
	// down again, this catches it. For admin-only routes use a JWT
	// minted with `npm run token`.
	console.log(`▶ waiting for ${creds.clusterUrl}/Feed to respond …`);
	let feed;
	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 2000));
		feed = await fetch(`${creds.clusterUrl}/Feed`, { headers: { Accept: 'application/json' } }).catch(() => null);
		if (feed && feed.ok) { console.log(`  back up after ${i * 2 + 2}s`); break; }
		process.stdout.write('.');
	}
	console.log();
	if (!feed || !feed.ok) {
		console.log('  /Feed never came back up:', feed?.status, (await feed?.text())?.slice(0, 300));
		process.exit(1);
	}
	const j = await feed.json();
	console.log(`▶ ${creds.clusterUrl}/Feed → HTTP 200, count=${j.count}, items=${j.items?.length ?? 0}`);
}

main().catch((err) => { console.error(err.stack || err.message || err); process.exit(1); });

# Deploy to Harper Fabric

This project runs locally via `npm run bootstrap`. To deploy it to
Harper Fabric (Harper's managed cloud — formerly Harper Cloud), follow
the steps below.

> **This is the planning doc.** It describes the deploy flow as Harper
> documents it. The *operating* doc — what we actually had to do for
> the live `advisory-rankings-dev` cluster, including every workaround
> we hit (SSH deploy keys for private repos, root-level `config.yaml`
> on a `fabric-deploy` branch because Fabric's import form has no
> "component path" field, REST PUT/GET wrappers for seed/verify
> because port 9925 is firewalled from datacenter networks) — is in
> [`docs/fabric-runbook.md`](fabric-runbook.md). Read both.

> Sources for this guide: <https://www.harper.fast/start>,
> <https://docs.harperdb.io/fabric>,
> <https://docs.harperdb.io/docs/developers/applications>.
> Verify command flags against current docs before a production deploy
> — Harper iterates fast.

---

## 1. Create a Harper account

1. Go to **<https://fabric.harper.fast/#/sign-up>**.
2. Sign up with your email (or an SSO provider if offered).
3. Verify the email address.
4. On first login, **create an organization**. The org name becomes
   part of every cluster URL: `<cluster>.<org>.harperfabric.com`.

The free tier is sufficient for a small dev cluster — you can upgrade
later without redeploying.

---

## 2. Create a cluster

In the Fabric UI:

1. **Clusters → New Cluster**.
2. Pick a name (e.g., `advisory-rankings-dev`). Region near you.
3. Set the admin username and password — **save these**, you'll need
   them for every CLI call below. Treat them like a database root
   password.
4. Wait for the cluster to provision (~1–2 minutes).
5. Copy the cluster's URL. It will look like:

   ```
   advisory-rankings-dev.acme-corp.harperfabric.com
   ```

   We'll call this `<CLUSTER_URL>` in the rest of this guide.

---

## 3. Pick a deployment mode

Harper Fabric supports two flows. Pick **one**:

### Option A — Pull-based (Git, possible but no longer primary)

Fabric clones your repo, builds, and runs. This project now keeps
TypeScript as source and emits Harper/browser JavaScript during
`npm run build`, so pull deploy is only safe when Fabric runs the
build before loading `harper-app/` or when a prepared deploy branch
already contains generated artifacts. The live project uses the
push-based GitHub Actions flow below as the primary path.

1. Push the branch you want to deploy to GitHub (already done — this
   project lives on `claude/research-advisor-schema-RLV0N`, with `main`
   as the long-term default).
2. In Fabric → **Applications → Import Application**.
3. Enter the repository URL. Public HTTPS is fine; private repos need
   an SSH deploy key (Fabric will guide you through generating one).
4. **Component path**: `harper-app` — that's where our `config.yaml`
   and `schema.graphql` live.
5. Optionally pin a version: tag, branch, or commit SHA. For
   production we recommend tagging releases (`git tag v0.1.0 && git
   push --tags`) and pointing Fabric at the tag.
6. Click **Deploy**. Fabric clones, runs `npm install` if a
   `package.json` is detected, mounts the component, and starts the
   server. Confirm that `harper-app/resources.js` and
   `harper-app/web/*.js` exist in the deployed package; they are
   generated from TypeScript and are not committed to `main`.

When the cluster says **Running**, the schema is live and REST
endpoints are auto-generated at
`https://<CLUSTER_URL>/<TableName>`.

### Option B — Push-based (CLI, fastest iteration)

You run a single `harperdb deploy_component` from your laptop and
Fabric receives the bundle directly. No Git round-trip.

```bash
export HARPER_CLUSTER_URL=https://<CLUSTER_URL>
export HARPER_ADMIN_USERNAME=<ADMIN_USER>
export HARPER_ADMIN_PASSWORD=<ADMIN_PASS>
npm run deploy
```

Flags:

| Flag | Meaning |
|---|---|
| `project` | The component name to register on the cluster. Use `advisor-app` to match the local symlink we set up in `bootstrap.sh`. |
| `package` | `npm run deploy` builds TypeScript, then packages `harper-app/`. |
| `target` | Your cluster URL from Step 2. |
| `username` / `password` | Admin credentials from Step 2. |
| `restart=true` | Restart the cluster process after deploy so the new schema is loaded. |
| `replicated=true` | Replicate the deployed component across every node in the cluster. |

---

## 4. Point the seed/verify/ingest/load scripts at Fabric

The local scripts default to the on-host Unix domain socket. Override
that by setting environment variables that point them at the Fabric
cluster's HTTPS endpoint:

```bash
export HDB_TARGET_URL=https://<CLUSTER_URL>/
export HDB_ADMIN_USERNAME=<ADMIN_USER>
export HDB_ADMIN_PASSWORD=<ADMIN_PASS>

# Now any of these target Fabric instead of localhost:
npm run seed                         # load the canonical sample data
npm run ingest                       # load whatever is in research/wpjson/
npm run load:extractions             # load LLM-produced extractions
npm run verify                       # cross-table SQL spot-checks
```

The scripts auto-detect: if `HDB_TARGET_URL` is set, they use HTTPS
basic auth against that URL. If it's unset, they fall back to the
local Unix socket at `~/.harperdb/operations-server`.

---

## 5. Run the ingestion skills against Fabric

The two skills shipped in this repo (`/ingest-advisorhub` and
`/extract-advisorhub-articles`) shell out to the same npm-backed
TypeScript scripts, so as long as the env vars in Step 4 are set in
the session, the skills target Fabric automatically.

A typical first deploy looks like:

```bash
# 1. crawl AdvisorHub from your laptop
npm run crawl:wpjson -- --out research/wpjson

# 2. point at Fabric
export HDB_TARGET_URL=https://<CLUSTER_URL>/
export HDB_ADMIN_USERNAME=<ADMIN_USER>
export HDB_ADMIN_PASSWORD=<ADMIN_PASS>

# 3. seed (one-time canonical data)
npm run seed

# 4. ingest the crawler's output
npm run ingest

# 5. (optional) extract richer entities via the LLM skill
#     /extract-advisorhub-articles in a Claude Code session

# 6. spot-check
npm run verify
```

---

## 6. Production checklist

Before pointing a real workload at this:

- [ ] **Rotate the admin password** off the value you typed in Step 2;
      use a strong password from your secrets manager.
- [ ] **Move credentials into env / a secrets manager** — never commit
      them. The deploy/auth scripts read `HARPER_ADMIN_USERNAME` /
      `HARPER_ADMIN_PASSWORD` from env first, then macOS Keychain,
      then `~/.harper-fabric-credentials`; 1Password CLI / Doppler /
      AWS Secrets Manager all work.
- [ ] **Enable replication** if you provisioned > 1 node
      (`replicated=true` on every `deploy_component`).
- [ ] **Pin to a Git tag** if using pull-based deploy. Don't deploy
      the moving `main` branch directly.
- [ ] **Add a CNAME** for a friendly domain
      (e.g. `harper.advisory-rankings.com`) → CNAME →
      `<CLUSTER_URL>`. Lets you rotate clusters without changing
      every consumer.
- [ ] **Re-evaluate `threads.count`**. Our local config forces
      `threads.count: 1` to work around sandbox kernels that reject
      `SO_REUSEPORT`. Fabric's hosts have full kernel support — bump
      the thread count back up (3 or `<num_cpus>`) for higher
      throughput. The setting lives in
      `~/.harperdb/harperdb-config.yaml` locally; on Fabric you tune
      it via the Cluster → Config tab in the UI.
- [ ] **Decide on the MQTT listeners**. Local config disables them.
      If you intend to use Harper as a real-time message broker, flip
      them back on before deploy.

---

## 7. Updating the schema after deploy

When you change `harper-app/schema.graphql`:

- **Pull-based**: push the commit to the tracked branch/tag. Fabric
  picks it up on the next pull cycle (configurable; manual via
  **Applications → Reload**).
- **Push-based**: re-run the `deploy_component` command from Step 3.

Harper preserves existing data when the schema changes additively
(new tables, new columns). For breaking changes (renames, type
narrowing), do a forward-compatible migration: add the new shape, dual-
write, backfill, then drop the old. The provenance log
(`FieldAssertion`) makes that backfill auditable.

---

## 8. Cost notes

Harper Fabric's free tier covers a single small cluster — fine for a
demo or dev. Paid tiers are priced per cluster + per replicated GB +
per 1 M operations. Check current pricing at
<https://www.harper.fast/pricing>. For the workload this app
generates (a few thousand article ingests/month, low query volume),
expect to land well inside an entry tier.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401 Unauthorized` on every script | Wrong `HDB_ADMIN_USERNAME` / `HDB_ADMIN_PASSWORD` — they default to `admin` / `admin-local` for local dev, which is **not** what your Fabric cluster has. |
| Scripts still hit `localhost` | `HDB_TARGET_URL` not exported in the session. `echo $HDB_TARGET_URL` to confirm. |
| `deploy_component` hangs at "Sending package" | Slow upstream; the component dir is small (~30 KB) so this should be sub-second. Check the cluster's region / your network. |
| Schema didn't take effect after deploy | `restart=true` was missing or false on the `deploy_component` call. Re-run with it set. |
| `describe_all` returns empty | The component didn't auto-mount. In Fabric → Applications, verify `advisor-app` is **Running** and the component path matched `harper-app`. |

# Fabric runbook — `advisory-rankings-dev`

The companion to `docs/deploy-to-harper-fabric.md`. That doc is the
*plan*; this one is the *log* — what actually happened deploying this
project to Harper Fabric, every workaround we needed, and how to keep
operating it.

> The Fabric account, organization, and cluster were created on
> **2026-05-02** by an automated Playwright pass. If you are picking
> this up later, every ID and URL below is real and reachable.

---

## 1. Inventory

| What | Value |
|---|---|
| Fabric console | <https://fabric.harper.fast/> |
| Fabric login | `cody.swann@gmail.com` |
| Org name / id | "Cody Swann Org" / `org-q31yvqoihmulbrks` |
| Cluster name / id | `advisory-rankings-dev` / `clu-nzeaqmqh1c5zrp9w` |
| Cluster URL (app) | `https://advisory-rankings-de.cody-swann-org.harperfabric.com/` |
| Cluster URL (ops API) | `https://advisory-rankings-de.cody-swann-org.harperfabric.com:9925/` |
| Cluster admin username | `cody.swann@gmail.com` *(set via the Fabric Finish-Setup wizard; `HDB_ADMIN` is also present internally but our app-level ops use the email user)* |
| Cluster admin password | rotate me — see §9 |
| Plan | `fabric-block-level-0` (free tier, 6-month license, expires **2026-11-02**) |
| Instances | 2 — `us-east1-b-1` + `us-west1-a-1`, replicated |
| Component | `advisor-app`, deployed from `fabric-deploy` branch |
| Source repo | `CodySwannGT/advisory-rankings` (private) |

> **Treat `~/.harper-fabric-credentials` as the source of truth for
> secrets.** It's chmod 600 outside the repo. The runbook here only
> repeats what's safe to keep in version control.

---

## 2. Deployment topology

```
GitHub                Fabric Studio                 Harper cluster
─────────             ──────────────                ──────────────
codyswanngt/          fabric.harper.fast            advisory-rankings-de
  advisory-rankings    │                            .cody-swann-org
  (private)            │                            .harperfabric.com
                       │                              │
                       │  pull-deploy via SSH         │
   fabric-deploy ──────┼──────────────────────────►  /home/harperdb/harper
   branch              │  (uses deploy key, see §4)   /components/advisor-app
                       │                              │
                       └─ Studio operations proxy ◄─┐ │
                          (POST /Cluster/{id}/      │ │
                           operation/)              │ │
                                                    └─┘
                                                     ops API :9925
                                                     (firewalled from
                                                      datacenter egress)

Browser                                              app routes :443
─────                                                ─────────────
   ─────────────────────────────────────────────►   /          (web UI, see §6)
                                                    /<TableName>/   (REST CRUD)
                                                    HTTP basic auth.
```

The app component declares its URL surface in `config.yaml` at the
**root** of the `fabric-deploy` branch (see §3 for why root, not
`harper-app/`):

```yaml
graphqlSchema:
  files: '*.graphql'
rest: true
static:
  files: 'web/*'
```

That gives us, on `:443`:
- One auto-generated REST resource per `@table @export` type (~34 of
  them; 23 currently have rows).
- A static UI under `/` (HTML + CSS + JS in `web/`).
- HTTP-basic auth required on every route under the same realm; one
  prompt covers both static assets and REST.

---

## 3. The `fabric-deploy` branch (component-path workaround)

**Symptom:** Fabric pull-deploy from the repo's default `harper-app/`
subdirectory failed with

> /home/harperdb/harper/components/advisor-app did not load any
> modules, resources, or files, is this a valid component?

**Root cause:** Harper Fabric's pull deploy passes the repo URL straight
to `npm install`, which clones the whole repo to
`/home/harperdb/harper/components/<project>/`. Harper then looks for
`config.yaml` at the **root** of that directory. There is no built-in
"subdirectory" or "component path" parameter exposed in the Fabric
import form (the doc's `Component path: harper-app` field doesn't
exist in the current Studio UI), and npm's git URLs don't support
subdirectory addressing the way Yarn workspaces do.

**Fix:** a dedicated `fabric-deploy` branch where `config.yaml` and
`schema.graphql` are copied to the **root** alongside a minimal
`package.json` and a static `web/` dir. The original `harper-app/`
files stay where they are on `main` so the local-Harper bootstrap
still works.

```
fabric-deploy branch layout (commit a03f495):
  config.yaml           ← lifted from harper-app/, plus `static: { files: 'web/*' }`
  schema.graphql        ← lifted from harper-app/
  package.json          ← minimal: { "name": "advisor-app", "version": "0.1.0" }
  web/                  ← static UI for browsing the data
    index.html
    app.js
    style.css
  (everything else inherited from main)
```

**To update the deployed schema** (or UI, or anything else):

```bash
git checkout fabric-deploy
git merge main                         # bring in any main-side changes
# … hand-curate root-level config.yaml / schema.graphql / web/ as needed …
git push origin fabric-deploy
```

Then either:
- Fabric → Applications → `advisor-app` → **Reload** (pull-based), or
- Re-run the deploy from §4.

> **Don't try to delete `harper-app/` on this branch.** Keep it as a
> mirror so that the local-Harper bootstrap (`npm run bootstrap`)
> still works on a developer machine. Harper only loads the root
> `config.yaml`; the duplicates under `harper-app/` are inert.

---

## 4. SSH deploy key flow (private-repo workaround)

The repo is private, so Fabric's HTTPS Git clone fails with
`Permission denied (publickey)` (npm rewrites GitHub HTTPS URLs to SSH
under the hood, and the cluster has no GitHub credentials by default).
Fabric's "Requires Auth" tab in the import form tells you to manage
keys under **Config → SSH Keys**; that's the path we used.

**One-time setup (already done for this cluster):**

1. Generate an Ed25519 keypair:
   ```bash
   node scripts/gen_fabric_deploy_key.js
   # writes /tmp/harper-signup/fabric-deploy-key{,.pub}, chmod 600
   ```
   (We use Node's `crypto.generateKeyPairSync` because `ssh-keygen`
   isn't installed on the sandbox we ran from. The script emits
   both the OpenSSH-format private key and the `ssh-ed25519 …` public
   line.)

2. Upload the **private** key to Fabric:
   - Fabric → cluster → **Config → SSH Keys → + Add**
   - Name: `advisory-rankings-deploy`
   - Key: paste the contents of `fabric-deploy-key`
   - Host: `advisory-rankings.github.com`  *(the alias we use in the
     git URL — gives Fabric a hostname-to-key mapping in its SSH
     config)*
   - Hostname: `github.com`
   - Known Hosts: leave blank — Fabric auto-resolves GitHub's known
     hosts when hostname is `github.com`.

3. Add the **public** key to GitHub:
   - <https://github.com/CodySwannGT/advisory-rankings/settings/keys/new>
   - Title: `Harper Fabric (advisory-rankings-dev)`
   - Key: paste `fabric-deploy-key.pub`
   - **Allow write access: unchecked** — read-only is sufficient.

4. Use the SSH URL with the host alias when importing:
   ```
   git@advisory-rankings.github.com:CodySwannGT/advisory-rankings.git#fabric-deploy
   ```

**Failed attempts we tried first** (documented for posterity, so the
next person doesn't repeat them):

- *HTTPS clone with no creds* → Fabric rewrites to `ssh://git@…` and
  fails with `publickey`. Fabric will not honor PAT-embedded HTTPS
  URLs through its npm-based clone path.
- *GitHub Actions workflow that calls `gh api .../keys` to add the
  deploy key itself* — the file is at
  `.github/workflows/add-fabric-deploy-key.yml` on `main`, kept around
  as a marker. **It does not work**: deploy-key creation requires
  `admin:public_key` scope, which `${{ secrets.GITHUB_TOKEN }}` does
  not get even with `permissions: administration: write`. The workflow
  runs but the API call returns 403. **Delete or ignore that file.**

**To rotate the deploy key:** generate a new pair (§4 step 1), upload
new private to Fabric (replaces the old one — same Name+Host triple),
delete the old GitHub deploy key, add the new public key. The cluster
keeps cloning until the next deploy, so you can do this without
downtime.

---

## 5. The `:9925` firewall caveat — biggest gotcha

**Harper's Operations API listens on port 9925**. That's where
`describe_all`, `sql`, `deploy_component`, user management, etc. all
live. Harper Fabric's clusters expose `:9925` on the public internet,
but **the sandbox we're running from has datacenter-egress firewalls
that block outbound `:9925`**, so any tool that tries to talk to it
directly times out at 15s.

What this means in practice:

| Tool | Port it wants | Works from sandbox? | Workaround |
|---|---|---|---|
| `harperdb deploy_component` CLI | 9925 | ❌ | Use Fabric Studio UI (§6) |
| `harper-app/seed.py` (operations API for `upsert`) | 9925 | ❌ | `scripts/seed_via_rest.py` (§7) |
| `harper-app/verify.py` (operations API for `sql`) | 9925 | ❌ | `scripts/verify_via_rest.py` (§7) |
| Any Studio UI page that triggers admin ops (e.g. the Finish-Setup wizard's direct-connect login probe) | 9925 | ❌ | Drive Studio from a non-datacenter network |
| Auto-generated REST routes (`GET/PUT/DELETE /<TableName>/<id>`) | 443 | ✅ | — |
| Static UI (`/`, `/style.css`, `/app.js`) | 443 | ✅ | — |
| Fabric Studio's operations proxy `POST https://fabric.harper.fast/Cluster/{id}/operation/` | 443 | ✅ | Use it instead of direct-to-cluster |

The Fabric Studio proxy is the escape hatch — when you sign in to
fabric.harper.fast, the Studio itself runs admin operations through a
443-served reverse-proxy. That's how we managed to drop and redeploy
components from the sandbox: by driving Studio in headless Chromium
rather than calling `:9925` directly.

**From a residential network** (home wifi, phone hotspot, coffee
shop), `:9925` is reachable and the standard tooling works:
```bash
export HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com:9925/
export HDB_ADMIN_USERNAME=cody.swann@gmail.com
export HDB_ADMIN_PASSWORD=…   # from ~/.harper-fabric-credentials
npm run seed
npm run verify
```

If you're unsure whether your network can reach :9925:
```bash
curl -sk -m 6 -o /dev/null -w '%{http_code}\n' https://advisory-rankings-de.cody-swann-org.harperfabric.com:9925/
# 401 → your network is fine, the cluster just rejected the empty auth
# 000 → port is blocked; use the REST workarounds in §7
```

---

## 6. Updating the deployed app

### Schema (`schema.graphql`)
```bash
git checkout fabric-deploy
# edit schema.graphql at root
git commit -am "schema: …"
git push origin fabric-deploy
```
Then in Fabric Studio: **Applications → `advisor-app` → Reload**.
Additive changes (new tables, new columns) preserve existing rows;
breaking changes need a forward-compatible migration (add new shape,
dual-write, backfill from `FieldAssertion`, then drop the old).

### Static UI (`web/`)
```bash
git checkout fabric-deploy
# edit web/index.html / web/app.js / web/style.css
git commit -am "web: …"
git push origin fabric-deploy
```
Then **Reload** in Studio (same as schema). The `static:` extension
re-reads files on reload; no special handling.

> The current `web/app.js` reads from `/<TableName>/` via the same
> basic-auth credentials the browser already has cached. Only one
> auth prompt per session because the static realm and REST realm
> share Harper's authentication.

### Component dependencies
Edit the root `package.json` and push. Fabric runs `npm install` on
deploy. The current package.json is intentionally minimal (no
runtime deps); avoid adding any unless absolutely necessary, and
specifically avoid `harperdb` itself since it's already on the
cluster.

### From the CLI (only works on a network with :9925 access)
```bash
./node_modules/.bin/harperdb deploy_component \
  project=advisor-app \
  package='git@advisory-rankings.github.com:CodySwannGT/advisory-rankings.git#fabric-deploy' \
  target=https://advisory-rankings-de.cody-swann-org.harperfabric.com:9925/ \
  username=cody.swann@gmail.com \
  password=<HARPER_ADMIN_PASSWORD> \
  restart=true \
  replicated=true
```

### Drop and redeploy (when a deploy left the component in a bad state)
The first deploy attempt left files on disk but failed to register
the component. Fabric's UI then refused to import a second time
because the name was taken, but didn't expose a delete button on the
broken state. Workaround: call `drop_component` via the Studio
operations proxy, then re-import. We did this from Playwright but
you can do it from any logged-in browser:
```js
fetch('https://fabric.harper.fast/Cluster/clu-nzeaqmqh1c5zrp9w/operation/', {
  method: 'POST',
  credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({operation: 'drop_component', project: 'advisor-app'}),
}).then(r => r.text()).then(console.log)
```
Returns `{"message":"Successfully dropped: advisor-app","replicated":[…]}`
and the import form's "Import Application" button re-enables.

---

## 7. REST-based seed / verify (the `:9925`-firewalled path)

`scripts/seed_via_rest.py` and `scripts/verify_via_rest.py` are
sandbox-friendly equivalents of `harper-app/seed.py` /
`harper-app/verify.py`. They use only the table-level REST endpoints
on `:443`, which means they work from anywhere a browser can reach
Harper.

```bash
export HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com
export HDB_ADMIN_USERNAME=cody.swann@gmail.com
export HDB_ADMIN_PASSWORD=…   # from ~/.harper-fabric-credentials

python3 scripts/seed_via_rest.py     # PUTs each canonical record via /<TableName>/<id>
python3 scripts/verify_via_rest.py   # GETs each table and joins client-side
```

How they work:

- `seed_via_rest.py` — imports `harper-app/seed.py` after monkey-
  patching `_harper.upsert` to call `PUT /<TableName>/<id>` per
  record. Idempotent because PUT is upsert-by-id in Harper. Output
  matches `npm run seed` exactly: 99 records across 23 tables.

- `verify_via_rest.py` — re-implements `verify.py` without SQL:
  fetches each `@export` table once, builds id→record dicts, and
  resolves joins client-side. Output is the same eight sections as
  `npm run verify` (row counts, Taylor career walk, AUM time-series,
  recruiting deal, Cairnes disclosures, sanction stack, field
  assertions, mention counts).

**Limitations:**
- These scripts depend on every record carrying its `id` in the body.
  All canonical seed records do; if you write a script that produces
  records without `id`, generate one before PUT.
- `verify_via_rest.py` re-implements the joins and is therefore tied
  to the schema shape. If you add tables, it'll still count their
  rows in the row-count section but won't include them in the
  spot-check sections unless you add the join logic.

When operating from a residential network, prefer the original
`npm run seed` / `npm run verify` — they're simpler and run server-
side SQL.

---

## 8. Web UI (`web/`)

Plain HTML + vanilla JS + CSS, served by Harper's built-in `static:`
extension. No build step. No framework. Reads exclusively from
`/<TableName>/` REST endpoints.

Features:
- Sidebar with one entry per `@export` table, dim if empty, count if
  not.
- Highlights bar with four hand-curated entry points (Taylor move,
  Cairnes cluster, sanctions, provenance).
- Per-table list view with column auto-detection (shows the most
  populous fields first).
- FK columns rendered as labels (e.g. `George J. Cairnes` instead of
  the UUID), clickable to navigate to the related record.
- Per-record view with `dl/dt/dd` rows; FK fields are clickable.

Auth: relies on the browser's stored basic-auth — visit `/` once,
enter `cody.swann@gmail.com` + the admin password, and every
subsequent fetch reuses the cached credential.

To build a richer UI later, this exact pattern still applies —
Harper's REST is the API surface. If the UI gets large enough to
warrant a build step, drop a `web/dist/` and update `static.files` to
match.

---

## 9. Rotating credentials (production checklist)

This cluster was provisioned with credentials that have been seen by
automation (and are in conversation transcripts). **Treat them as
compromised; rotate before anything sensitive lives on it.**

1. **Admin password.** Sign in to Fabric Studio →
   advisory-rankings-dev → **Config → Users** → edit the
   `cody.swann@gmail.com` user → set a fresh password from a
   secrets manager. Update `HARPER_ADMIN_PASSWORD` in
   `~/.harper-fabric-credentials`. Same for `HDB_ADMIN` if it's still
   active (we set the email user; the bootstrap `HDB_ADMIN` may
   still hold the cluster's original temp password — check via
   Config → Users).

2. **GitHub deploy key.** New keypair (§4 step 1). New private to
   Fabric (Config → SSH Keys → edit `advisory-rankings-deploy`).
   New public to GitHub (Settings → Deploy keys → add new, then
   delete the old). Cluster will pick up the new key on its next
   pull.

3. **Fabric account password.** Profile → Change password.

4. **Move secrets to a manager.** The scripts read
   `HDB_ADMIN_USERNAME` / `HDB_ADMIN_PASSWORD` from env, so any of
   1Password CLI / Doppler / AWS Secrets Manager works. Stop relying
   on the flat-file `~/.harper-fabric-credentials` for production.

---

## 10. Cleanup checklist

These artifacts on `main` are leftovers from the deploy attempt and
should be tidied:

| Path | Status | Recommendation |
|---|---|---|
| `.github/fabric-deploy-key.pub` | Public key, harmless to keep | Optional: delete (the same key is already a deploy key on the repo) |
| `.github/workflows/add-fabric-deploy-key.yml` | Dead (GITHUB_TOKEN can't add deploy keys; see §4) | **Delete** |

The `fabric-deploy` branch itself is **load-bearing** — Fabric pulls
from it. Don't delete it. Pin Fabric to a tag from this branch
before you start treating the deployment as production:

```bash
git checkout fabric-deploy
git tag fabric-deploy-v0.1.0
git push origin fabric-deploy-v0.1.0
```

Then in Fabric Studio → Applications → advisor-app → Settings →
change the ref from `fabric-deploy` to `fabric-deploy-v0.1.0`. The
moving-branch deploy is fine for dev; for production you want
deploys to be explicit.

---

## 11. Fabric Studio quick reference

Some operations route through Studio because the local CLI can't
reach `:9925`. Useful URLs (all live behind the org+cluster prefix):

```
Cluster home          /#/org-q31yvqoihmulbrks/clu-nzeaqmqh1c5zrp9w
Applications          /#/org-q31yvqoihmulbrks/clu-nzeaqmqh1c5zrp9w (default tab)
Databases (data browser)  same URL → "Databases" tab
APIs                  same URL → "APIs" tab
Status                same URL → "Status" tab
Logs                  same URL → "Logs" tab
Config (this-instance) same URL → "Config" tab
Config → Users        /#/org-q31yvqoihmulbrks/clu-nzeaqmqh1c5zrp9w/config/users
Config → SSH Keys     /#/org-q31yvqoihmulbrks/clu-nzeaqmqh1c5zrp9w/config/ssh-keys
```

The "* Restart Requested" banner that shows after every config change
is expected; click it (or wait — the cluster auto-restarts on next
deploy). Restarts complete in ~10s; the REST endpoints come back up
serving the updated schema.

---

## 12. What this guide does not cover

- **MQTT.** The local config disables MQTT listeners; the Fabric
  cluster has them off too. If you want Harper as a real-time broker,
  flip `mqtt.requireAuthentication` and the listener config in the
  Studio Config tab.
- **Replication topology.** Two instances are auto-replicated; if you
  scale up to more nodes, every `add_ssh_key` / `deploy_component`
  needs `replicated: true` to fan out (the scripts already do this).
- **Custom domains.** `<CLUSTER_URL>` is the auto-generated
  `harperfabric.com` subdomain. Add a CNAME pointing
  `harper.advisory-rankings.com → <CLUSTER_URL>` if you want a stable
  external URL across cluster rebuilds.
- **Threads count.** Fabric's hosts default to 1 worker thread for
  free-tier clusters; bump it via Config tab if your read volume
  justifies it.

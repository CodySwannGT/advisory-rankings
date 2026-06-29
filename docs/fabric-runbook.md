# Fabric runbook — `<HARPER_CLUSTER_NAME>`

The companion to `docs/deploy-to-harper-fabric.md`. That doc is the
*plan*; this one is the *log* — what actually happened deploying this
project to Harper Fabric, every workaround we needed, and how to keep
operating it.

> The Fabric account, organization, and cluster were created on
> **2026-05-02** by an automated Playwright pass. If you are picking
> this up later, resolve the placeholders below from Fabric Studio,
> GitHub settings, or the local credential loader instead of committing
> environment-specific values to this file.

---

## 1. Inventory

| What | Value |
|---|---|
| Fabric console | <https://fabric.harper.fast/> |
| Fabric login | `<FABRIC_LOGIN_EMAIL>` |
| Org name / id | "<FABRIC_ORG_NAME>" / `<FABRIC_ORG_ID>` |
| Cluster name / id | `<HARPER_CLUSTER_NAME>` / `<HARPER_CLUSTER_ID>` |
| Cluster URL (app) | `<HARPER_CLUSTER_APP_URL>` |
| Cluster URL (ops API) | `<HARPER_CLUSTER_OPS_URL>` |
| Cluster admin username | `<FABRIC_LOGIN_EMAIL>` *(set via the Fabric Finish-Setup wizard; `HDB_ADMIN` is also present internally but our app-level ops use the email user)* |
| Cluster admin password | aligned with the Studio password (§9). Stored locally in macOS Keychain services `<KEYCHAIN_USERNAME_SERVICE>` / `<KEYCHAIN_PASSWORD_SERVICE>`; `<LOCAL_CREDENTIALS_FILE>` is the fallback. Rotate before anything sensitive lives on this cluster. |
| Plan | `fabric-block-level-0` (free tier, 6-month license, expires **2026-11-02**) |
| Instances | 2 — `us-east1-b-1` + `us-west1-a-1`, replicated |
| Component | `advisor-app`, deployed from `fabric-deploy` branch |
| Source repo | `CodySwannGT/advisory-rankings` |

> **Treat macOS Keychain as the local source of truth for secrets.**
> The flat-file `<LOCAL_CREDENTIALS_FILE>` is still supported as
> a chmod 600 fallback outside the repo. The runbook here only repeats
> what's safe to keep in version control.

### Resolving Placeholders

Agents should resolve placeholders at runtime instead of hard-coding
the resolved values here. Prefer non-secret environment variables and
GitHub repository variables; use secrets only by presence/name, never
by printing values.

1. Check the repo workflow and GitHub configuration:

   ```bash
   rg -n "HARPER_|FABRIC_|DEPLOY_KEY" .github src docs README.md
   gh variable list
   gh secret list
   ```

   `gh secret list` only prints secret names. If a needed value is
   present only as a secret, use the workflow or script that consumes
   it rather than trying to reveal it.

2. Check local non-secret/default resolution in `src/scripts/_auth.ts`:

   ```bash
   rg -n "HARPER_STUDIO_URL|HARPER_CLUSTER_URL|HARPER_CLUSTER_ID|KEYCHAIN|credentials" src/scripts/_auth.ts
   ```

   This identifies the environment variable names, Keychain service
   names, and optional fallback file path that local scripts use. Do
   not print the fallback file contents.

3. If Fabric Studio access is available, find Fabric-owned identifiers
   there:

   - `<FABRIC_LOGIN_EMAIL>`: account profile or the admin user shown in
     the cluster's Config -> Users page.
   - `<FABRIC_ORG_NAME>` / `<FABRIC_ORG_ID>`: select the organization;
     the browser hash route includes the org id.
   - `<HARPER_CLUSTER_NAME>` / `<HARPER_CLUSTER_ID>`: select the
     cluster; the browser hash route includes the cluster id.
   - `<HARPER_CLUSTER_APP_URL>`: cluster or application overview.
   - `<FABRIC_SSH_KEY_NAME>`: cluster Config -> SSH Keys.

4. Derive `<HARPER_CLUSTER_OPS_URL>` only when needed by appending the
   Harper operations port to `<HARPER_CLUSTER_APP_URL>`. Verify network
   reachability before using direct operations calls:

   ```bash
   curl -sk -m 6 -o /dev/null -w '%{http_code}\n' <HARPER_CLUSTER_OPS_URL>
   ```

   `401` means the endpoint is reachable and rejected empty auth. `000`
   usually means the network cannot reach the operations port; use the
   Studio proxy path instead.

Do not paste resolved passwords, bearer tokens, private deploy keys,
session cookies, or local credential file contents into this document.

---

## 2. Deployment topology

```
GitHub                Fabric Studio                 Harper cluster
─────────             ──────────────                ──────────────
codyswanngt/          fabric.harper.fast            <HARPER_CLUSTER_APP_URL>
  advisory-rankings    │
                       │
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
                                                    /mcp      (MCP JSON-RPC)
                                                    Public UI/MCP routes plus
                                                    auth-gated raw tables.
```

The app component declares its URL surface in `config.yaml` at the
**root** of the `fabric-deploy` branch (see §3 for why root, not
`harper-app/`):

```yaml
graphqlSchema:
  files: '*.graphql'
rest: true
jsResource:
  files: 'resources.js'
fastifyRoutes:
  urlPath: '.'
  files:
    - 'branches/index.js'
    - 'firms/index.js'
    - 'advisors/index.js'
    - 'teams/index.js'
    - 'articles/index.js'
    - 'data-coverage/index.js'
    - 'investor-proof/index.js'
    - 'recruiting/index.js'
    - 'recruiting-deal-gaps/index.js'
    - 'recruiting-shortlist/index.js'
    - 'research-freshness/index.js'
    - 'source-triage-route/index.js'
    - 'rankings/index.js'
    - 'regulatory/index.js'
    - 'regulatory-discrepancies/index.js'
    - 'corrections/index.js'
    - 'compare/index.js'
    - 'report-packet/index.js'
    - 'watchlists/index.js'
    - 'login/index.js'
    - 'favicon/index.js'
    - 'static-web/index.js'
static:
  files: 'web/**'
  extensions:
    - 'html'
```

That gives us, on `:443`:
- One auto-generated REST resource per `@table @export` type (~35 of
  them; 23 currently have rows).
- Custom resources from generated `resources.js` that pre-join across
  tables for the UI: `/Feed`, `/ArticleView/<id>`,
  `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/TeamProfile/<id>`,
  `/DataCoverage`, plus public read-only MCP at `POST /mcp`. Doing the
  joins server-side keeps the page-load to one round-trip.
- A Facebook-style activity-feed UI under `/` (HTML + CSS tracked in
  `web/`, JavaScript generated from `src/web/**/*.ts`).
- Harper static serving owns `/`, built `web/**` assets, and its own wildcard
  miss handler. `static-web/index.js` is intentionally registered after the
  clean route modules for runtimes that mount `fastifyRoutes`, but deployed
  Fabric also needs lowercase direct-mapped Harper resources for dynamic clean
  paths such as `/firms/<slug>-<id>`, `/advisors/<slug>-<id>`, and
  `/articles/<slug>-<id>`, plus advertised top-level shells such as `/login`
  and `/corrections`. Deploy verification probes those routes so a green deploy
  cannot hide a bare `Not found` response.
- `static.extensions: ['html']` should keep extensionless shell URLs such as
  `/source-triage?category=...` resolving to the tracked `web/*.html` files even
  when the public edge does not expose Fastify route modules. The deploy gate
  also probes `/source-triage` directly because a stale public runtime can
  otherwise keep returning the old bare `Not found` response after a green core
  smoke.
- Clean data coverage route `/coverage`, served by
  `data-coverage/index.js` and backed by `/DataCoverage`.
- Clean investor proof packet route `/investor-proof`, served by
  `investor-proof/index.js` and backed by `/InvestorProofPacket`.
- Clean recruiting deal gaps route `/recruiting/deal-gaps`, served by
  `web/recruiting/deal-gaps.html` through Harper's `static.extensions:
  ['html']` fallback and backed by `/RecruitingDealDataGaps`. The
  `recruiting-deal-gaps/index.js` Fastify route stays registered, but this
  Fabric runtime has not served nested Fastify routes reliably.
- Clean source article triage route `/source-triage`, served by
  `source-triage-route/index.js` and backed by `/SourceArticleTriage`. The
  route module directory intentionally does not match the URL path because a
  deployed `source-triage/` directory can make Harper treat `/source-triage`
  as a static-directory request before the Fastify route table.
- `fastifyRoutes.urlPath: '.'` is required; otherwise Harper mounts these route
  modules under the component/project prefix instead of the public root path.
- Clean comparison packet route `/report-packet?ids=...`, served by
  `report-packet/index.js` and backed by `/AdvisorComparison`.
- Public UI and MCP routes are explicitly allowed by their JS resources.
  Raw table REST routes remain Harper-authenticated.

---

## 3. The `fabric-deploy` branch (component-path workaround)

**Symptom:** Fabric pull-deploy from the repo's default `harper-app/`
subdirectory failed with

> /home/harperdb/harper/components/advisor-app did not load any
> modules, resources, or files, is this a valid component?

**Root cause:** Harper Fabric's pull deploy passes the repo URL straight
to its package-manager install path, which clones the whole repo to
`/home/harperdb/harper/components/<project>/`. Harper then looks for
`config.yaml` at the **root** of that directory. There is no built-in
"subdirectory" or "component path" parameter exposed in the Fabric
import form (the doc's `Component path: harper-app` field doesn't
exist in the current Studio UI), and npm's git URLs don't support
subdirectory addressing the way Yarn workspaces do. After the switch to
Bun, this pull-deploy path remains unverified; keep using the push
deploy path unless Fabric's Bun build behavior has been tested again.

**Fix:** historically, a dedicated `fabric-deploy` branch copied
`config.yaml`, `schema.graphql`, `resources.js`, and `web/` to the
root. After the TypeScript migration, `resources.js` and
`web/**/*.js` are generated artifacts, so the branch must be prepared
only after `bun run build`. The primary deploy path is now the
GitHub Actions / `bun run deploy` push path in §6, which builds on
`main` and packages `harper-app/` directly.

```
fabric-deploy branch layout (commit a03f495):
  config.yaml           ← lifted from harper-app/, includes
                          graphqlSchema + rest + jsResource +
                          fastifyRoutes + static: { files: 'web/**' }
  schema.graphql        ← lifted from harper-app/
  resources.js          ← generated by bun run build from src/harper/resources.ts
  package.json          ← minimal: { "name": "advisor-app", "version": "0.1.0" }
  branches/ / firms/ / advisors/ / teams/ / articles/ / data-coverage/ / investor-proof/ / recruiting/ / recruiting-deal-gaps/ / recruiting-shortlist/ / rankings/ / regulatory/ / regulatory-discrepancies/ / corrections/ / compare/ / report-packet/ / watchlists/ / login/ / favicon/ + seo_shell.js
                        ← clean URL Fastify routes for directories, detail pages, and favicon assets
  web/                  ← Facebook-style UI (see §8); copy whole dir after build
    index.html / index.js     home feed
    article.html / article.js article detail
    branches.html / branches.js branch explorer
    firm.html / firm.js       firm profile
    advisor.html / advisor.js advisor profile
    team.html / team.js       team profile
    firms.html / advisors.html / teams.html  directory pages
    coverage.html / coverage.js              public data coverage dashboard
    investor-proof.html / investor-proof-packet.js  public investor proof packet
    recruiting.html / recruiting.js          recruiting market explorer
    recruiting-deal-gaps.html / recruiting-deal-gaps.js  recruiting deal gap queue
    recruiting/deal-gaps.html                nested static shell for /recruiting/deal-gaps
    recruiting-shortlist.html / recruiting-shortlist.js  recruiting shortlist brief
    rankings.html / rankings.js              interactive rankings explorer
    regulatory.html                          compliance page shell
    regulatory-discrepancies.html            analyst discrepancy queue shell
    correction-inbox.html / correction-inbox.js analyst correction request inbox
    compare.html / compare.js                advisor comparison workspace
    report-packet.html / report-packet.js    comparison report packet shell
    app.css / app.js          shared CSS + JS
  (everything else inherited from main)
```

**To update the deployed schema** (or UI, or anything else):

```bash
git checkout fabric-deploy
bun run build
git merge main                         # bring in any main-side changes
# … hand-curate root-level config.yaml / schema.graphql / resources.js / web/ as needed …
git push origin fabric-deploy
```

Then either:
- Fabric → Applications → `advisor-app` → **Reload** (pull-based), or
- Re-run the deploy from §4.

> **Don't try to delete `harper-app/` on this branch.** Keep it as a
> mirror so that the local-Harper bootstrap (`bun run bootstrap`)
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
   bun run build
   node dist/scripts/gen_fabric_deploy_key.js
   # writes /tmp/harper-signup/fabric-deploy-key{,.pub}, chmod 600
   ```
   (We use Node's `crypto.generateKeyPairSync` because `ssh-keygen`
   isn't installed on the sandbox we ran from. The script emits
   both the OpenSSH-format private key and the `ssh-ed25519 …` public
   line.)

2. Upload the **private** key to Fabric:
   - Fabric → cluster → **Config → SSH Keys → + Add**
   - Name: `<FABRIC_SSH_KEY_NAME>`
   - Key: paste the contents of `fabric-deploy-key`
   - Host: `advisory-rankings.github.com`  *(the alias we use in the
     git URL — gives Fabric a hostname-to-key mapping in its SSH
     config)*
   - Hostname: `github.com`
   - Known Hosts: leave blank — Fabric auto-resolves GitHub's known
     hosts when hostname is `github.com`.

3. Add the **public** key to GitHub:
   - <https://github.com/CodySwannGT/advisory-rankings/settings/keys/new>
   - Title: `Harper Fabric (<HARPER_CLUSTER_NAME>)`
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
  URLs through its Bun-based clone path.
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
but **the original datacenter sandbox these notes were written from has
egress firewalls that block outbound `:9925`**, so any tool that tries to
talk to it directly times out at 15s.

> **Correction (2026-06-09): this firewall is sandbox-specific, not
> universal.** GitHub-hosted Actions runners have open outbound egress and
> **can** reach `:9925` (verified from an `ubuntu-latest` runner: HTTPS connect
> returns 200 in ~0.3 s). The deploy job therefore uses the direct `:9925`
> Operations API as its **primary** path (Basic auth), bypassing the Studio
> proxy entirely. This was driven by a chronic failure where the Studio proxy
> lost its instance domain socket and returned 500 "Instance domain socket does
> not exist." for every control op while the runtime stayed healthy (issue
> #1075). Direct deploy also lands straight on the public serving node, so the
> freshness gate no longer waits on east→west replication. The Studio proxy is
> kept only as a fallback for networks that genuinely cannot reach `:9925`
> (`DEPLOY_VIA=studio` forces it).

What this means in practice:

| Tool | Port it wants | Works from sandbox? | Workaround |
|---|---|---|---|
| `harperdb deploy_component` CLI | 9925 | ❌ | Use Fabric Studio UI (§6) |
| `bun run seed` (operations API for `upsert`) | 9925 | ❌ | `bun run seed:rest` (§7) |
| `bun run verify` (operations API for `sql`) | 9925 | ❌ | `bun run verify:rest` (§7) |
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
export HDB_TARGET_URL=<HARPER_CLUSTER_OPS_URL>
export HDB_ADMIN_USERNAME=<FABRIC_LOGIN_EMAIL>
export HDB_ADMIN_PASSWORD=…   # from <LOCAL_CREDENTIALS_FILE>
bun run seed
bun run verify
```

If you're unsure whether your network can reach :9925:
```bash
curl -sk -m 6 -o /dev/null -w '%{http_code}\n' <HARPER_CLUSTER_OPS_URL>
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
# edit any web/*.{html,js,css}
git commit -am "web: …"
git push origin fabric-deploy
```
Then **Reload** in Studio (same as schema). The `static:` extension
re-reads files on reload; no special handling.

> The UI is the **AdvisorBook** SPA: one page per entity kind
> (`index.html` = feed, `firm.html`, `advisor.html`, `team.html`,
> `article.html`) plus directories (`firms.html` / `advisors.html` /
> `teams.html`), `coverage.html`, `investor-proof.html`, `recruiting.html`,
> `recruiting-deal-gaps.html`, `recruiting-shortlist.html`, `rankings.html`, `regulatory.html`,
> `compare.html`, `correction-inbox.html`, and
> `report-packet.html`.
> Clean routes (`/firms`, `/advisors`, `/teams`, `/coverage`,
> `/investor-proof`, `/recruiting`, `/recruiting/deal-gaps`, `/recruiting/shortlist`, `/rankings`,
> `/regulatory`, `/compare`,
> `/report-packet`, `/watchlists`, `/corrections`, `/login`,
> `/articles/<slug>-<id>`, and entity
> `/<kind>/<slug>-<id>` paths) are Fastify shells that serve those
> same HTML files. `/login` serves `login/shell.html`, while `/login.html`
> redirects to `/login` for old bookmarks instead of serving a static file.
> Harper static serves `/`, built assets from `web/**` (`/app.css`, generated
> `/*.js`, and nested `design-system/*`), and its wildcard miss handler.
> `static-web/index.js` also registers exact root and built-asset routes, but it
> must stay after the clean route modules in `config.yaml` for runtimes that
> mount `fastifyRoutes`; deployed dynamic profile/article URLs plus `/login`
> and `/corrections` are additionally served by lowercase direct-mapped Harper
> resources. Do not remove the
> static-web routes as duplicate-looking code without deployed replay. Earlier
> deployed attempts showed the static wildcard miss handler
> consumed top-level unknown routes before `setNotFoundHandler`, a
> single-segment `/:unknownRoute`, the `/*` wildcard, or the root `*` wildcard
> could run, even though direct `/404.html` assets were live. A later
> `wildcard: false` attempt, followed by removing explicit static-web asset
> routes, made deployed misses return HTTP 500 `Cannot read properties of
> undefined (reading 'length')`; keep the deploy-safe wildcard mode and explicit
> asset routes until Harper's missing-document path can be handled without
> regressing static or API routes.
> Each page is a thin shell that
> imports a per-page JS module, which calls the matching custom
> resource (`/Feed`, `/FirmProfile/<id>`, etc.) for one
> round-trip of already-joined data. UI components are organized
> as an Atomic Design library under `web/design-system/` (tokens
> / atoms / molecules / organisms / templates) — see
> `docs/design-system.md`. `src/web/app.ts` holds non-UI utilities
> (network, auth, formatters). All requests are same-origin so
> the basic-auth session covers both static and JSON.

> **`config.yaml` static glob caveat — symptom: deployed
> `/design-system/*` returns 404.** Root cause: a non-recursive
> glob like `static.files: 'web/*'` only matches the immediate
> children of `web/`, so anything in a subdirectory ships
> nowhere. Fix: use `web/**` (the current value). Hit while
> deploying the Atomic Design refactor on 2026-05-02 — the first
> deploy succeeded HTTP-wise but every `web/design-system/`
> asset 404'd until the glob was changed and the component
> redeployed.

> **Static query-string caveat — symptom: deployed pages stay blank.**
> Harper/Fabric may return the JavaScript or CSS body while still
> reporting `404` when the asset is requested with a cache-busting
> query string such as `/index.js?v=...`. Browsers reject failed
> module-script responses, so the HTML shell title updates but the SPA
> never renders. Keep web shell, CSS import, and generated module
> specifiers query-free (`/index.js`, `/app.css`, `./app.js`) unless the
> static handler is proven to return `200` for query-string asset URLs.

> **`/Feed?category=<x>` 500 from date-less Article rows — symptom: deploy
> smoke times out at `selectEmptyMoveCategory` waiting for "No feed posts
> match these filters".** Root cause: every Article feed query sorts by
> `publishedDate`, and Harper throws `SyntaxError: Invalid value for attribute
> publishedDate: "undefined", expecting Date` as soon as a sorted result set
> contains a row with a missing `publishedDate` (some ingested rows have one,
> despite the schema). The unfiltered `"all"` path already guarded against
> this with an indexed `publishedDate > 1970-01-01` condition (which both
> satisfies Harper's "needs ≥1 condition" rule and drops the date-less rows
> before the sort); the category-filtered path used only `category equals <x>`
> and so 500'd for **every** category. The smoke surfaced it indirectly: its
> empty-move-category probe read the 500 body (no `items`) as "this category is
> empty", picked `advisor_moves` (a category that actually has a move), and the
> empty state never rendered. Fix (`src/harper/resource-directory-search-queries.ts`
> `feedArticlePage`): apply the `publishedDate > epoch` floor on the category
> path too — date-less rows are already hidden from the default feed, so
> hiding them from category views is consistent. Regression test:
> `tests/feed_category_published_floor.test.ts`. Also hardened the smoke probe
> (`tests/web_smoke_feed_filters.ts`) to throw on a non-2xx `/Feed` response
> instead of mis-reading it as an empty category. **Lesson: any feed query
> that sorts by `publishedDate` must filter date-less rows first; do not assume
> the schema guarantees the field.**

> **Transient connection-reset resilience — symptom: deploy smoke
> intermittently fails (e.g. a feed-filter `waitForSelector` times out), and
> a fresh page load occasionally renders blank / the boot-recovery
> fallback.** Root cause: the shared dev serving node intermittently resets
> connections (`net::ERR_CONNECTION_RESET`) under the browser's concurrent
> request bursts. Measured: roughly **1-in-3 fresh page loads** dropped at
> least one static module/CSS asset (a different asset each time —
> `design-system/*.js`, `tokens.css`, `watchlist-*.js`, …), which aborts the
> whole ES-module graph so the SPA never boots and never fetches `/Feed`.
> `curl` and single requests are stable (no 4xx/5xx); only the browser's
> concurrent module fan-out trips it. A single blip surfaced as a dead-end and
> broke the gate. Current mitigation has four parts:
>
> 1. **Boot guard** — an identical, dependency-free inline `<script>` in every
>    `harper-app/web/*.html` shell (between the `ab-boot-guard:start/end`
>    markers). If the page is still unbooted (no `.nav` /
>    `.route-loading-feedback`), it reloads — bounded to 5 attempts per path
>    via `sessionStorage`, cleared on success — then shows a manual Reload
>    fallback. Independent reloads recover ~100% of resets (validated 20/20
>    against the deployed cluster). Keep the snippet byte-identical across
>    shells.
> 2. **Resource retry** — `api()` (`src/web/app.ts` →
>    `src/web/api-retry.ts`) retries **idempotent** (`GET`/`HEAD`) requests a
>    few times with backoff when `fetch` *throws* (the reset signature).
>    Returned HTTP error statuses (404, server 503, …) are deliberately
>    **not** retried, so deterministic failures and the existing manual-retry
>    UI are unchanged, and mutations never double-apply.
> 3. **Per-attempt timeout** — every `fetchWithRetry` attempt runs under
>    `DEFAULT_REQUEST_TIMEOUT_MS` (12s). A bare `fetch` has no timeout, so the
>    deploy *cutover* failure mode — the serving node cold-starts and the first
>    request after the restart hangs ~30s before responding (or never settles)
>    — pinned the whole page open and dead-ended the feed and session UI for
>    the full stall ("Could not load feed" + "Session status is temporarily
>    unavailable"). An attempt that does not settle in time is aborted; the
>    abort surfaces as a thrown error and is retried exactly like a reset, so
>    the retry lands on the now-warmed node instead of blocking on the cold
>    one. The window sits well above healthy latency (sub-second) and below the
>    observed cold-start stall. Mutations still never retry, so a timed-out
>    `POST` fails fast rather than double-applying.
> 4. **Bundled page entries** — `bun run build` uses Bun's browser bundler to
>    emit one JavaScript module per HTML shell entrypoint (`index.js`,
>    `login.js`, `regulatory.js`, `advisor.js`, and peers) instead of copying
>    the full transitive `dist/web/**` module tree. That removes the
>    reset-prone burst of separate `design-system/*.js` and helper-module
>    requests during boot while preserving the same source files and HTML
>    entrypoint names.
>
> Tempting but wrong: cache-busting the failed module via a query string —
> blocked by the query-string caveat above, and a failed transitive import is
> cached in the realm's module map, so a plain `import()` retry returns the
> cached rejection; only a full reload re-fetches.

### Custom JS resources (`resources.js`)
Edit `src/harper/resources.ts`, run `bun run build`, then deploy the
generated `harper-app/resources.js`. After
**Reload** Studio re-executes the file; the `Feed` / `*Profile`
classes re-register at their REST routes. Their bodies issue
`tables.X.search({})` calls — fine for the current ~99-row dataset.
Once the dataset grows past ~10k rows, narrow them to indexed
`search({ conditions: [...] })` queries on the hot paths
(article-by-publishedDate, employments-by-firmId, etc.).

**Paginated directory endpoints:** `/PublicAdvisors`, `/PublicFirms`,
`/PublicTeams`, `/PublicBranches`, and `/FirmAdvisors/<id>` accept
`?cursor=…&limit=…`
(default 50, max 100). Directory endpoints return
`{ items, nextCursor, total }`, where `total` is the filtered row count;
`/FirmAdvisors/<id>` returns `{ items, nextCursor }`. The cursor is
opaque base64url and stable under inserts — clients round-trip whatever
they got.

Supported public directory filters:

| Endpoint | Filters |
|---|---|
| `/PublicAdvisors` | `q` matches advisor display/legal/preferred/first/last name substrings; `firm` matches current firm id or name substrings after firm-alias canonicalization; `careerStatus` exactly matches `Advisor.career_status`; `hasCrd=true|false` filters whether `finra_crd` is present. |
| `/PublicFirms` | `q` matches firm name/legal name substrings; `channel` exactly matches `Firm.channel`; `state` exactly matches `Firm.hq_state`; `active=true|false` filters on missing/present `dissolved_year`. `status=active` and `status=dissolved|inactive` are compatibility aliases. |
| `/PublicTeams` | `q` matches team name substrings; `firm` matches current firm id or name substrings after firm-alias canonicalization; `serviceModel` exactly matches `Team.service_model`. |
| `/PublicBranches` | `q` matches branch name, building, address, city, state, or firm name substrings; `firm` matches firm id or name substrings; `gapGroup` exactly matches the public branch gap group (`loaded`, `partial`, `unavailable`, `zero-advisor`, or `missing-source`); `state` exactly matches `Branch.state`; `city` and `market` match city/name/building/address substrings; `sourceType` exactly matches linked `EmploymentHistory.source_type`; `level` exactly matches `Branch.level`; `minAdvisorCount` filters on distinct current advisor count. |

All filter comparisons are case-insensitive. Unsupported, missing, or
empty filter values are ignored except booleans, where unsupported
values behave like no filter.

**Global search (`/Search?q=…`):** Public endpoint backing the navbar
search box. Does an in-memory case-insensitive name match across
`Advisor`, `Firm`, and `Team`, ranks by prefix / word-prefix /
substring, returns up to 20 results plus per-kind counts. Linear-scan
implementation is fine for the current sub-thousand-row dataset; if
the dataset grows past ~10k rows, switch to indexed
`tables.X.search({ conditions: [...] })` per name field and merge.
Queries shorter than 2 characters short-circuit to an empty list so
a stray keystroke doesn't spam the cluster.

`/FirmProfile/<id>` no longer inlines `currentAdvisors` / `pastAdvisors`
arrays; it emits `currentAdvisorCount` / `pastAdvisorCount` instead.
**This is a breaking shape change for `/FirmProfile`** — frontend
(`src/web/firm.ts`) and backend (`src/harper/resources.ts`) must
deploy together, which is the default because `bun run deploy` builds
and packages them together. Symptom of a half-deploy: the firm page renders empty
"Current advisors (0)" cards even when the firm has employees.

The pagination machinery lives in the `parsePagination` /
`encodeCursor` / `decodeCursor` / `inverseDateKey` / `paginate`
helpers near the top of `src/harper/resources.ts`. Unit tests for cursor walks
live at `tests/resources_pagination.test.ts` — run `bun run test` before
pushing a change to those helpers.

### Shared TypeScript helpers under `harper-app/lib/`
The build (`src/build/build.ts`) mirrors `dist/lib/` into
`harper-app/lib/` and rewrites parent-dir imports in the copied harper
resources (`from "../lib/..."` → `from "./lib/..."`). This keeps the
deployed component self-contained: Node ESM resolves the file's *real*
path (not the Fabric symlink), so a literal `../lib/` would resolve to
`<repo-root>/lib/` and the component would fail to load with
`ERR_MODULE_NOT_FOUND` on every reload.

The current consumer is `harper-app/resource-advisor-token-query.js`
(it shares `splitQueryTokens` / `normalizeQueryToken` with the
write-side `bun run backfill:search-index`), but any future harper
resource that needs a `src/lib/` helper will follow the same path
automatically — no per-file build wiring required.

`harper-app/lib/` is generated and gitignored. If you add a new
`from "../lib/..."` import to a `src/harper/*.ts` file, run
`bun run build` once to verify the matching `harper-app/lib/<file>.js`
appears, and confirm `bun run test:e2e` boots Harper without an
ERR_MODULE_NOT_FOUND in `~/.harperdb/log/hdb.log`. The
`tests/build_harper_lib_imports.test.ts` regression test walks
`dist/harper/*.js`, finds every `from "../lib/..."`, and fails if any
target file is missing from `dist/lib/` — so the next time a
resource grows a new shared-lib import that the build forgets to
ship, CI catches it before deploy.

### `tables.X.search({ conditions: [], sort })` is rejected by Harper

- **Symptom.** `/Feed?limit=10` (and any other Article query that
  applied no category filter) crashed with
  `Invalid value for attribute publishedDate: 'undefined'` thrown from
  Harper's `autoCast` layer.
- **Root cause.** `tables.X.search({ conditions, sort, limit, offset })`
  with `conditions === []` requires the planner to seed the index
  cursor before applying `sort`. With no condition value to cast, the
  cast layer falls over on the *sort* attribute (here
  `publishedDate`). Confirmed by removing `sort` — the empty-conditions
  call succeeds; confirmed again by adding any indexed condition — the
  sorted call succeeds.
- **Fix.** When the route has no real filter (the "all" category in
  `feedArticlePage`, `src/harper/resource-directory-search-queries.ts`),
  emit a sentinel condition that matches every row via the existing
  `@indexed` btree on the sort attribute:
  `{ attribute: "publishedDate", comparator: "greater_than", value: "1970-01-01" }`.
  Every real `Article` has a `publishedDate` after the epoch, so the
  sentinel never narrows the result set; it just gives Harper a btree
  range to seed the sorted scan from.
- **Tempting alternatives that don't work.**
  - *Drop the `sort` clause and re-sort in process.* Unorders the
    `/Feed` and breaks the "newest first" contract. Also loses the
    Harper-side limit pushdown, defeating the whole point of this
    issue.
  - *Switch to raw SQL (`SELECT … ORDER BY publishedDate DESC LIMIT`).*
    Bypasses the btree path we deliberately rely on (`publishedDate`
    is `@indexed`) and gives up the same index seeding that the
    sentinel condition unlocks; the SQL planner exhibits the same
    failure mode for empty `WHERE`.
  - *Use SQL `count(*)` to estimate `total`.* Masks the same constraint
    elsewhere and produces a count that disagrees with the indexed
    path used to fetch the page rows.

### Component dependencies
Edit the root `package.json` and deploy through the GitHub Actions /
`bun run deploy` path. The current package includes local tooling
dependencies needed to build and smoke-test the generated Harper bundle,
but the cluster itself already has Harper; avoid adding runtime
dependencies unless absolutely necessary.

### Login / logout for browser users

The web UI uses **Harper session cookies** (`enableSessions: true` is
on in `harperdb-config.yaml`) for the authenticated experience —
not basic auth, and not bearer tokens in `localStorage`.

Why session cookies over the alternatives:

- **Basic auth was the bug we hit on mobile.** Safari caches it per
  origin and replays stale credentials on every request, even after
  the route became public. There is no clean logout.
- **Bearer tokens in localStorage** would also work but require
  manual header injection, manual token refresh, and the cluster
  exposes no token-minting op on `:443` (the cluster's `:9925` is
  firewalled — see §5).
- **Session cookies** are issued automatically by Harper's middleware
  on `context.login()`, sent on every same-origin request without
  the page having to manage them, and don't trigger Safari's basic-
  auth prompt.

Endpoints (implemented in `src/harper/resources.ts` and emitted to
`harper-app/resources.js`):

| Route | Method | Auth | Behavior |
|---|---|---|---|
| `/Login` | POST | `allowCreate=true` (anonymous) | Body `{email, password}`. Calls `context.login()`. On success, Harper issues a Set-Cookie session for that user. Returns `{ok:true, username}`. 401 on bad creds. |
| `/Logout` | POST | `allowCreate=true` | Calls `ctx.session.update({})` then `ctx.session.delete(ctx.session.id)`. The first triggers Harper's middleware to clear server-side session state; the second cleans the row. Returns `{ok:true}`. |
| `/Me` | GET | `allowRead=true` | Returns `{authenticated, username, role}` if `getCurrentUser()` resolves a user, otherwise `{authenticated:false}`. The frontend hits this on every page load to render the navbar's sign-in/sign-out affordance. |
| `/AdvisorCorrectionRequest` | GET/POST | `allowRead=true`, `allowCreate=true`, session required for writes | GET returns an analyst-only pending correction inbox envelope for `/corrections`; anonymous and non-analyst callers receive no private rows. POST creates a pending correction request row for signed-in users without changing source-backed advisor facts. Body includes advisor id, field name, displayed/proposed values, submitter note, and source context. |
| `/AdvisorCorrectionRequest/<id>` | GET/POST | `allowRead=true`, `allowCreate=true`, session required in handler | Reads one request or persists analyst disposition fields (`accepted` / `rejected`, reviewer note, reviewer id, reviewed timestamp). |
| `/RegulatoryDiscrepancyQueue` | GET | `allowRead=true`, details require session | Returns `{authenticated:false, items:[]}` for anonymous users and open source-conflict review rows for authenticated analyst sessions. |
| `/AdvisorResearchQueue` | GET | `allowRead=true` | Returns public-safe due advisor research rows and returned-slice priority groups for `sourceType`, `staleDays`, `status`, `missingField`, and `limit` filters. Rows reuse `selectDueAdvisors` semantics, `status=never_checked` selects advisors with no check for the active source type, and the payload omits user-private rating/watchlist data. |

Browser flow:

1. The `/login` shell posts `{email, password}` to `/Login`.
2. Harper sets `Set-Cookie: <domain>-hdb-session=<uuid>; HttpOnly; Secure; SameSite=None; …`.
3. Subsequent same-origin fetches automatically include it.
4. The "Sign out" button calls `/Logout`, which clears the server-
   side session. The cookie itself stays on the browser, but the
   next request maps to "no user" and `/Me` returns
   `authenticated:false`.

There's one gotcha: `ctx.session.delete()` alone removes the row
but does not trigger a Set-Cookie clearing-header on the response,
so the cookie itself remains. We rely on the server-side state being
gone — the cookie just becomes dead weight. If you ever care about
*the cookie value itself* being scrubbed (e.g. for compliance), add
explicit response-header manipulation here.

### Authenticated test account (non-admin)

A dedicated non-admin user exists on the dev cluster for verifying the
signed-in experience (watchlist notes, private ratings, packet private
sections) without using the `super_user` admin login.

| What | Value |
|---|---|
| Username / email | `advisorbook-test@advisory-rankings.dev` |
| Role | `app_user` — non-`super_user`; **`read` on the public `data` content tables only, and NO direct access to the user-private tables** (`User`, `UserRating`, `AdvisorCorrectionRequest`, `UserWatchlist`, `UserWatchlistEntry`). Private data is reached exclusively through the scoped resources (`/AdvisorRating`, `/AdvisorCorrectionRequest`, `/UserWatchlists`), which run with elevated context and enforce per-user ownership/workflow rules in code. Granting a regular role table-level access to the user-private tables would otherwise be a privacy hole — Harper RBAC is table-level, not row-scoped. None of the user-private tables are `@export`ed, so no raw table routes exist for them. |
| Password storage | macOS Keychain services `advisory-rankings-testuser-username` / `advisory-rankings-testuser-password`. Never stored in a tracked file. |
| Seeded data | Owns a `UserWatchlist` named "Smoke Test Watchlist" with one `UserWatchlistEntry` note, plus one `UserRating`, both on advisor `0005c389-42b5-55ee-aa4b-be86d586d5d5`. |

Resolve the credentials at runtime, never by printing them:

```bash
security find-generic-password -s advisory-rankings-testuser-username -w
security find-generic-password -s advisory-rankings-testuser-password -w
```

The `app_user` role and the user were created through the Studio
control-plane proxy (`add_role` / `add_user` via `StudioSession.clusterOp`
in `src/scripts/_auth.ts`), the same path deploys use. To re-create on a
fresh cluster, run those two ops with the role permission map covering the
`data` tables, then store a freshly generated password in the keychain
services above.

> **Watchlist resource binding (#999 / #1020):** if `/UserWatchlists` returns
> `503 "UserWatchlist table is unavailable"` while `/AdvisorRating` still
> works, the resource failed to resolve its table handle. The root cause of
> #999 was the `isSearchableTable` guard in
> `src/harper/resource-user-watchlists-store.ts` rejecting Harper's
> function-typed table handles (`typeof tables.UserWatchlist === "function"`);
> PR #1020 fixed the guard to accept object- and function-typed handles. The
> tables are `@table` without `@export` — binding does not depend on the raw
> export route. Anonymous watchlist checks are not sufficient: verify with an
> authenticated operation-token probe and confirm repeated `GET /UserWatchlists`
> calls return 200 after redeploy/restart.

### Public vs. authenticated routes

The point of the Facebook-style UI is a public-facing news feed, so
the data-plane routes that back it return 200 to anonymous visitors.
Everything else still requires auth.

| Route | Anonymous | Why |
|---|---|---|
| `GET /` (the SPA shell) | ✅ 200 | Static; served by the bundled `static` extension. |
| `GET /Feed`, `/ArticleView/<id>`, `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/AdvisorComparison?ids=<id>,<id>`, `/TeamProfile/<id>` | ✅ 200 | Each `Resource` subclass overrides `allowRead()` to return `true`. The data they expose is sourced from public AdvisorHub coverage. |
| `GET /PublicFirms`, `/PublicAdvisors`, `/PublicTeams`, `/PublicBranches` | ✅ 200 | Public directory resources with cursor pagination, filtered totals, and documented query filters, so directory pages don't need to call the auth-gated `/<TableName>/` routes. `/PublicBranches` exposes aggregate branch context only: firm name, location, source metadata, coverage status, and current advisor count. |
| `GET /Search?q=…` | ✅ 200 | Backs the navbar header search. Same `allowRead() { return true; }` model as the rest of the public surface. |
| `GET /DataCoverage` | ✅ 200 | Public dashboard payload for `/coverage`: entity counts, public resource probes, rankings/recruiting gaps, research freshness, source-table context, and limitations. It reports aggregate counts and public-resource provenance only; it does not expose private user rows or secrets. |
| `GET /AdvisorResearchQueue?limit=…` | ✅ 200 | Public-safe research-work queue rows plus priority groups: advisor identity, firm context, source/check status, missing public fields, profile URLs, returned-slice counts, and group filter mappings. No private user tables are loaded. |
| `GET /SourceArticleTriage?category=…&reason=…&limit=…` | ✅ 200 | Public source-article extraction-gap queue: article metadata, source and ArticleView links, public entity/event counts, body/provenance state, and stable reason tokens. It reads public Article/FieldAssertion evidence and omits private analyst/user rows. |
| `GET /InvestorProofPacket` | ✅ 200 | Public-safe investor proof packet data composed from `/DataCoverage`, `/AdvisorResearchQueue`, `/Feed`, `/PublicFirms`, `/RankingsExplorer`, and `/RecruitingMarket`: coverage metrics, freshness pressure, representative replay links, source ids, and explicit unavailable states. No private watchlist, rating, correction, or analyst rows are loaded. |
| `GET /RegulatoryDiscrepancyQueue` | ✅ 200 envelope, no rows | Authenticated analyst sessions receive queue rows; anonymous visitors receive `{authenticated:false, items:[]}` so source-conflict detail is not exposed. |
| `POST /mcp` | ✅ 200 | Streamable HTTP MCP transport implemented as lowercase `mcp` because Harper maps resource export names directly to route names. It accepts unauthenticated JSON-RPC POST for curated read-only tools and resources only. |
| `GET /<TableName>/` (auto-export, e.g. `/Firm/`) | ❌ 401 | Default Harper RBAC; reads of the raw tables require an authenticated user. |
| `GET /UserRating/`, `/AdvisorCorrectionRequest/`, `/UserWatchlist/`, `/UserWatchlistEntry/`, `/User/` | ❌ 404 | These user-private/review tables are `@table` **without** `@export` (`schema.graphql` §USER LAYER), so no raw route is generated. Private watchlist access must use the scoped `/UserWatchlists` resource, and correction access must use scoped `/AdvisorCorrectionRequest`, which enforces session and workflow rules. |
| `GET/POST /AdvisorCorrectionRequest`, `GET/POST /AdvisorCorrectionRequest/<id>` | ❌ anonymous writes / ✅ session | The scoped resource allows correction submission and review only after `getCurrentUser()` resolves a signed-in user; anonymous and non-analyst inbox reads return no private correction rows. Source-backed `AdvisorProfile` fields are not mutated by request writes. |
| `PUT/POST/DELETE` anywhere else | ❌ 401 | Same. The custom UI resources mostly define `get` + `allowRead`; scoped mutating resources enforce auth in their handlers. `/mcp` is the one public POST route and its JSON-RPC handler exposes no write/admin methods. |

If a future change needs to lock the public routes back down, drop
the `allowRead() { return true; }` overrides — they're flagged in a
single comment block at the top of `Feed` in `resources.js`.

### Data coverage dashboard replay

Use deployed dev as the reviewer replay target for `/DataCoverage` and
`/coverage`:

```bash
BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com

curl -fsS "$BASE_URL/DataCoverage" \
  | jq '{generatedAt, sectionIds: [.sections[].id], limitationCount: (.limitations | length), provenance}'
```

The response should include the public coverage sections
`public-entity-groups`, `rankings`, `recruiting`, `research-freshness`,
and `source-context`. `provenance.sourceTables` names the public/source
tables used to build the aggregate rollups, while
`provenance.publicResources` names the public routes the dashboard helps
audit (`/PublicAdvisors`, `/PublicFirms`, `/PublicTeams`, `/Feed`,
`/Search`, `/RankingsExplorer`, `/RecruitingMarket`, and
`/AdvisorResearchQueue`). The `limitations` array is expected when source
coverage is incomplete; cite those caveats as aggregate source limitations,
not as private-data defects.

Capture desktop and mobile screenshots from the deployed page with:

```bash
mkdir -p artifacts/coverage-replay
node --input-type=module -e 'import { chromium } from "playwright";
const url = "https://advisory-rankings-de.cody-swann-org.harperfabric.com/coverage";
const dataUrl = "https://advisory-rankings-de.cody-swann-org.harperfabric.com/DataCoverage";
const cases = [{name:"desktop",width:1280,height:900},{name:"mobile",width:390,height:844}];
const data = await fetch(dataUrl).then((response) => {
  if (!response.ok) throw new Error(`/DataCoverage returned ${response.status}`);
  return response.json();
});
const expectedLimitations = data.limitations.length;
const browser = await chromium.launch({headless:true});
for (const c of cases) {
  const page = await browser.newPage({viewport:{width:c.width,height:c.height}});
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.waitForSelector("[data-coverage-section]",{timeout:30000});
  const title = (await page.locator("h1").first().textContent())?.trim();
  if (title !== "Data coverage") throw new Error(`${c.name}: unexpected title ${title}`);
  const sections = await page.locator("[data-coverage-section]").count();
  if (sections !== 5) throw new Error(`${c.name}: expected 5 sections, got ${sections}`);
  const limitations = await page.locator(".coverage-limitation-list li").count();
  if (limitations !== expectedLimitations) {
    throw new Error(`${c.name}: expected ${expectedLimitations} limitations, got ${limitations}`);
  }
  await page.screenshot({path:`artifacts/coverage-replay/${c.name}.png`,fullPage:true});
  console.log(`${c.name}: title=${title} sections=${sections} limitations=${limitations}`);
  await page.close();
}
await browser.close();'
```

For the current dev deployment, the replay should load the `Data coverage`
page, render five `[data-coverage-section]` cards, and show the same
limitations count returned by `/DataCoverage`.

### Source article triage replay

Use deployed dev as the reviewer replay target for `/SourceArticleTriage`,
`/source-triage`, and the PRD sample ArticleView rows:

```bash
BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com

curl -fsS "$BASE_URL/SourceArticleTriage?category=unknown&reason=no-event-cards&limit=10" \
  | jq '{
      itemCount: (.items | length),
      nextCursor,
      first: .items[0] | {
        id,
        category,
        triageReasons,
        articleUrl,
        sourceUrl,
        eventCardCount,
        firmCount,
        advisorCount,
        teamCount,
        hasBody,
        provenanceCount,
        candidateProvenanceCount
      }
    }'

curl -fsS -H 'Accept: text/html' \
  "$BASE_URL/source-triage?category=unknown&reason=no-event-cards&limit=10" \
  | grep -F 'Source Article Triage - AdvisorBook'
```

The first JSON row should include sample article
`dd893ee1-92ff-5b63-9e45-c39d63c50904`, `category: "unknown"`, zero event
cards, one firm, no advisors or teams, no body, two provenance rows, and two
candidate provenance rows. The filtered response should also include
`a5550239-6c67-5289-937d-6669653cc0da`, which has zero event cards, no entity
chips, no body, and no provenance. Open both ArticleView rows when replaying
manually so the article limitation context is visible from the linked detail
pages.

The codified replay is:

```bash
RUN_WEB_SOURCE_TRIAGE_REGRESSION=1 bunx vitest run tests/web_source_triage_regression.test.ts
```

That test serves local generated web assets, proxies `/SourceArticleTriage` and
`/ArticleView` to deployed dev, verifies the desktop and mobile filtered route
state, checks that the two PRD sample ArticleView payloads preserve the expected
gap counts, and captures `tests/screenshots/source-triage-regression-desktop.png`
plus `tests/screenshots/source-triage-regression-mobile.png`.

### Auth model (data plane vs. Fabric control plane)

Harper has two distinct auth surfaces and we use both — neither is a
hack:

| Plane | Surface | Auth |
|---|---|---|
| **Data plane** — REST routes on the cluster (`/<TableName>/`, `/Feed`, `/FirmProfile/<id>`, `/mcp`, …) | `https://<cluster>/` (`:443`) | **Native Harper JWT bearer for protected raw table routes.** Mint with the `create_authentication_tokens` operation: returns `operation_token` (sub:`operation`, ~24h) and `refresh_token` (sub:`refresh`, ~30d). Pass the op token as `Authorization: Bearer <jwt>`. Basic auth also works but bearer is the documented convention. Public UI resources and read-only MCP do not require auth. |
| **Control plane on Fabric** — `deploy_component`, `restart_service`, `get_components`, `list_users`, … | `https://fabric.harper.fast/Cluster/<id>/operation/` | **Studio session cookie.** `POST /Login/` with email + password → cookie. Fabric does not expose a long-lived API token (verified: `/User/tokens`, `/APIKey`, `/APIToken`, `/Token`, `/AccessToken` all 404). The cluster's own ops API at `:9925` accepts the same Bearer JWTs but is firewalled (§5); the cluster's `:443` returns 404 for ops calls. |

`src/scripts/_auth.ts` exposes both: `createAuthTokens(creds)` for the
JWT pair and `StudioSession` for the cookie-backed control-plane
calls. Every other script in this repo routes through it:

| Caller | Plane | Auth |
|---|---|---|
| `src/scripts/deploy.ts` | control + data | session cookie for Studio `deploy_component` and `restart`; Basic auth for stale-runtime recovery against the public node's `:9925` Operations API; then data-plane checks for `/Feed`, `/version.js`, `/`, `/app.css`, `/compare.js`, and `/AdvisorComparison` with bounded public route retries |
| `src/scripts/get_token.ts` | — | mints + prints a JWT for use with `curl -H "Authorization: Bearer …"` |
| `tests/web_smoke.ts` | data | JWT in `extraHTTPHeaders` against the deployed cluster |

CI gets the same: `HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD`
are repo secrets, the workflow mints a fresh JWT per run, and the
30-day refresh token isn't stored anywhere.

### Push-deploy from anywhere (`bun run deploy` → direct `:9925`, Studio fallback)

`bun run deploy` runs `bun run build`, then `src/scripts/deploy.ts`
packages `harper-app/` into a tarball, base64-encodes it, and deploys it.
**The primary path is the instance's direct Operations API on `:9925`**
(`deploy_component` with `restart: true`, Basic auth). It is preferred
because it bypasses the Fabric Studio proxy — which chronically loses its
instance domain socket and then returns 500 "Instance domain socket does
not exist." for every control op while the runtime stays healthy (§5,
issue #1075) — and because it lands straight on the public serving node,
so the freshness gate never waits on east→west replication. GitHub-hosted
runners can reach `:9925`, so this is the CI path too. Component uploads
use a deploy-scale timeout; aborting after only the restart budget can
leave the server-side component replacement running, and an immediate
retry can collide with that in-progress replacement.

If the direct ops API is unreachable (a network that genuinely blocks
`:9925`, or `DEPLOY_VIA=studio`), the script falls back to the **Studio
control-plane proxy**: log in over `:443`, POST `deploy_component` through
`fabric.harper.fast`, then an explicit bounded `restart`. A Studio
`deploy_component` request can drop after Fabric accepts the upload but
before the proxy returns; the script treats that as indeterminate and
continues to the data-plane freshness checks. If the post-deploy freshness
check still sees a stale serving node, `recoverPublicRuntime` re-attempts
the direct `:9925` deploy once and re-verifies.

Harper can also return HTTP 500 from the direct `:9925` deploy with
`was deployed on the origin node but failed to replicate`. Because the direct
path targets the public serving node, that response is a freshness-checkable
partial success: the workflow now skips the Studio fallback, explicitly
restarts the public runtime, and lets `/Feed`, `/version.js`, and bundle
freshness decide whether the deploy is usable. This avoids the Fabric Connect
body-size limit on larger packages while still failing if the public runtime
remains stale.

The public-route checks (`/`, `/app.css`, `/compare.js`, and
`/AdvisorComparison`) poll with a short per-attempt timeout instead of a
single shot: a freshly restarted static or resource route cold-starts and
its first request can take several seconds, so `verifyPublicRoute` retries
(6 attempts, 5 s apart, 15 s per attempt) before failing. A single slow
first hit no longer fails an otherwise healthy deploy or kicks off the
recovery path.

```bash
# Reads HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD from env,
# then macOS Keychain, then <LOCAL_CREDENTIALS_FILE>.
# Tarball excludes node_modules, .git, .harperdb, tests/screenshots.
bun run deploy
```

Data-write scripts share the same credential lookup. `bun run ingest`,
`bun run load:extractions`, `bun run backfill:recruiting-articles`, and
write-mode scraper scripts use
`HDB_TARGET_URL` when it is explicitly set; otherwise they default to the
Fabric cluster URL from `HARPER_CLUSTER_URL` (or the repo's dev-cluster
default) with `:9925` for Harper operations. `HDB_ADMIN_USERNAME` and
`HDB_ADMIN_PASSWORD` are optional when `HARPER_ADMIN_USERNAME` /
`HARPER_ADMIN_PASSWORD`, the macOS Keychain services
`<KEYCHAIN_USERNAME_SERVICE>` /
`<KEYCHAIN_PASSWORD_SERVICE>`, or `<LOCAL_CREDENTIALS_FILE>`
are populated.

Output on success — restart finishes in ~2 s and `/Feed` is back up:

```
▶ login as <FABRIC_LOGIN_EMAIL>
▶ packaging harper-app/
  package: 31.5KB → 42.0KB base64
▶ deploy_component project=advisor-app
  status: 200
  body:   {"message":"Successfully deployed: advisor-app, restarting Harper", …}
▶ restart Harper runtime
  status: 200
▶ waiting for https://…/Feed to respond …
  back up after 2s
▶ https://…/Feed → HTTP 200, count=2, items=2
▶ https://…/version.js → 0.1.x (expected 0.1.x)
▶ public comparison assets/resources verified
```

#### Deploy log

| Date | What | Result |
|---|---|---|
| 2026-05-21 | Switched the Lisa `harper-fabric` project type and this repo from npm-managed scripts to Bun-managed scripts. `package.json` now pins `packageManager: bun@1.3.11`, CI passes `package_manager: 'bun'`, and `.github/workflows/deploy.yml` runs `bun install --frozen-lockfile`, `bun run deploy`, `bunx playwright install`, and `bun run smoke`. Deployed with `bun run deploy`: package 53.7 KB → 71.6 KB base64, `deploy_component` HTTP 200, `/Feed` back after 2 s with count=5. Fabric again reported the known `self-signed certificate in certificate chain` replication warning for `oju-us-west1-a-1`; app URL verified with `BASE_URL=<HARPER_CLUSTER_APP_URL> bun run smoke` (40/40). | OK with known replication warning |
| 2026-05-21 | Applied Lisa's new `harper-fabric` project type locally. Lisa now manages the TypeScript/Bun toolchain, generated-artifact ignores, Codex/Claude project files, and generic Harper/Fabric rules while this repo keeps only project-specific facts in `AGENTS.md` / `CLAUDE.md`. Re-deployed with `bun run deploy`: package 53.7 KB → 71.6 KB base64, `deploy_component` HTTP 200, `/Feed` back after 2 s with count=5. Fabric again reported the known `self-signed certificate in certificate chain` replication warning for `oju-us-west1-a-1`; app URL verified with `BASE_URL=<HARPER_CLUSTER_APP_URL> bun run smoke` (40/40). | OK with known replication warning |
| 2026-05-21 | Added macOS Keychain credential lookup (`<KEYCHAIN_USERNAME_SERVICE>` / `<KEYCHAIN_PASSWORD_SERVICE>`) ahead of the legacy `<LOCAL_CREDENTIALS_FILE>` fallback. First TypeScript build deploy via Studio proxy returned HTTP 200 and restarted Harper; Studio reported replication failure on `oju-us-west1-a-1` with `self-signed certificate in certificate chain`, but the primary app URL remained reachable and is verified by the Playwright smoke. | OK with replication warning |
| 2026-05-21 | TypeScript migration. `src/` is now source of truth; `harper-app/resources.js` and `harper-app/web/**/*.js` are generated by `bun run build` and ignored by git. Deploy workflow now runs `bun run deploy`, which builds before packaging `harper-app/`. | OK |
| 2026-05-02 | AdvisorBook rebrand + Atomic Design refactor (commits `11f13da`, `cd7409c`). First deploy left `/design-system/*` returning 404 because `static.files: 'web/*'` was non-recursive; changed to `web/**` and redeployed. Verified with `tests/parity_compare.ts`: 9 pages × 18 selector counts = 215 matches, 0 mismatches against local. | OK |
| 2026-05-02 | Re-deploy of `harper-app/` at branch tip (no code delta vs. origin/main). `bun run deploy` from sandbox via Studio proxy. Package 45.7 KB → 60.9 KB base64. Replicated to `oju-us-west1-a-1`. `/Feed` back after 2 s, HTTP 200, count=2. | OK |

Under the hood (handy if you want to replay it by hand):

```js
// 1. session login → cookie jar
fetch('https://fabric.harper.fast/Login/', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: '<USER>', password: '<PASS>'}),
});

// 2. deploy_component via Studio's cluster-ops proxy
fetch('https://fabric.harper.fast/Cluster/<HARPER_CLUSTER_ID>/operation/', {
  method: 'POST', credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    operation: 'deploy_component',
    project: 'advisor-app',
    payload: '<base64 of tar -czf - -C harper-app .>',
    restart: true,
    replicated: true,
  }),
});
```

### Auto-deploy on merge to `main` (CI)

`.github/workflows/deploy.yml` follows Lisa's release-and-deploy shape:
determine the target environment, bump `package.json`, commit/tag the
release with `[skip ci]`, then check out the released branch and run
`bun install` -> `bun run deploy` -> `HDB_TARGET_URL=$HARPER_CLUSTER_URL bun run seed:rest`
-> `bunx playwright install --with-deps chromium` -> Playwright smoke
(`SMOKE_SCOPE=core bun run smoke`, backed by `tests/web_smoke.ts`) against
the live cluster URL. The REST seed step keeps the public smoke fixture
present on the served node when Fabric clustering replication is
disconnected. Release deploys use the core scope so the workflow verifies
the live app/feed/search path without depending on longer evidence
journeys whose assertions vary with live dataset shape. Required repo
secrets:

| Secret | Source |
|---|---|
| `DEPLOY_KEY` | GitHub deploy key used by Lisa's release workflow to push version bumps. |
| `HARPER_ADMIN_USERNAME` | `<FABRIC_LOGIN_EMAIL>` |
| `HARPER_ADMIN_PASSWORD` | GitHub Actions secret, matching the local Keychain value |

If the smoke fails, CI uploads `tests/screenshots/` as a
build artifact. The workflow also runs on `workflow_dispatch` for
manual releases/deploys.

### Node topology, replication, and how a deploy reaches the served node

The cluster has two instances: `9w8-…us-east1-b-1` (east) and
`oju-…us-west1-a-1` (west). The **public app URL is served by the west
node**, but a Studio `deploy_component` (the `:443` control-plane proxy,
the only path reachable from CI) lands on **east**. So a deploy only
reaches the served node if east→west **replication** carries the new
component.

**The replication cert fix (2026-06-01).** Replication had been failing
with `Error: self-signed certificate in certificate chain`, leaving the
served (west) node frozen on stale assets. Root cause: each node presents
a cert signed by its own `Harper-Certificate-Authority-<node>` for the
`:9933` replication transport, and neither node trusted the other's CA
(`replication.enableRootCAs: true` only trusts public roots — east's
Let's Encrypt cert is trusted, west's self-signed Harper CA is not). Fix
— cross-add each node's CA to the other's trust store and restart, via
the Operations API (run from a network with `:9925` access, e.g. local):

```jsonc
// POST https://<east-host>:9925/  (Basic auth, admin creds)
{ "operation": "add_certificate",
  "name": "Harper-Certificate-Authority-oju-us-west1-a-1.<cluster-host>",
  "certificate": "<west CA PEM from list_certificates on west>",
  "is_authority": true }
// then the same with east's CA POSTed to the west host, then
{ "operation": "restart" }  // on each node
```

Verify with `{"operation":"cluster_status"}`: the peer connection's
`database_sockets` for `data` and `system` should report
`"connected": true`. This trust is stored in each node's cert store and
survives restarts.

**Why the deploy can report a replica failure (and why that's OK).**
The direct `:9925` deploy lands on the public serving node and Fabric then
tries to replicate the component to the other node; that replica push
frequently fails (`read ECONNRESET` / `WebSocket was closed before the
connection was established` / TLS disconnect). **This is harmless**: the
node we deployed to is the one that serves `:443`, and the freshness gate
proves it. Fabric public-node deployments can take several minutes while
still completing, so `deploy.ts` uses `HARPER_DEPLOY_TIMEOUT_MS` (default
420 seconds) for `deploy_component` and `HARPER_RESTART_TIMEOUT_MS`
(default 60 seconds) for restarts. After deploy it **polls `/version.js`
and `/index.js` on the public URL until both match the freshly built
`package.json` version and bundle** (`verifyRuntimeFreshness`), then checks
the static/resource routes. Because the public URL can briefly route one read
to the fresh node and a later read to a stale peer, the gate samples consecutive
fresh `/version.js` and `/index.js` rounds before it reports success. The
post-deploy smoke also receives the release version as `SMOKE_EXPECTED_VERSION`
and fails if the public `version.js` is not that exact build. Before the route
checks retried (above) and before the deploy moved to the direct `:9925` path,
a transient cold-start
on `/AdvisorComparison` failed verification on a fully-propagated deploy
and then burned the full `HARPER_DEPLOY_TIMEOUT_MS` against the (then
Studio-routed) recovery before failing the build (run `27203171950`,
2026-06-09).

**Secondary indexes do not replicate reliably to the served node
(2026-06-03).** A subtler layer of the same east→west replication gap:
*row data* replicates to the west (served) node, but *secondary indexes*
do not always rebuild there. The symptom is node-specific and silent — on
the served node a full `tables.X.search({})` scan returns a row, but an
indexed `tables.X.search({ conditions: [{ attribute: "<indexed-attr>",
value }] })` for that same row returns **nothing**. Confirmed on the live
cluster: `/Feed?mode=event` (and `recruiting` / `compliance`) returned 0
items for every visitor while `/ArticleView/<id>` for a seeded
transition/disclosure article rendered its full event card — because
`ArticleView` reads via the full-scan `loadAll()` and `/Feed` (after
PR #771) read the article→mention join via indexed `articleId` lookups.
`ArticleFirmMention` happened to work only because the crawler writes it
heavily enough to keep its index materialized on the served node; the
sparsely-seeded advisor / team / transition / disclosure mention tables
did not. Querying the same conditioned search against the **east** node's
`:9925` Operations API returned the row correctly — proof the defect is the
served node's index, not the query or the data.

This repeatedly broke the deploy smoke gate (`smokeFeed` waits for an
event-backed feed headline that never rendered) since ~2026-05-28, the
date PR #771 swapped `/Feed` off `loadAll()`. Fix: the feed's article→mention
join (`loadArticleMentions` in `src/harper/resource-feed-page-load.ts`) now
reads each tiny mention table with a full `search({})` scan and filters by
the page's `articleId` set in memory, so the join no longer depends on
served-node secondary-index replication. The large entity tables (Advisor,
EmploymentHistory, …) are still hydrated by indexed primary-key / id
lookups — the `id` (primary-key) index does replicate reliably, and those
tables are too large to scan (the #721/#771 motivation). Regression coverage:
`tests/feed_stale_secondary_index.test.ts` simulates a served node whose
`articleId`-conditioned search is empty while its full scan works, and
asserts the feed join still resolves. **Do not** revert the mention join to
indexed `search({ conditions })` lookups — that reintroduces the dependency
and re-breaks the deploy.

### Firm source import automation

Codex Automation is the scheduled path for running all production-ready firm
source adapters without a local operator. The automation is `AdvisorBook: Major
Firm Source Imports` and its prompt is the single skill call
`$firm-source-major-imports`. It dispatches a bounded run for Morgan Stanley,
Merrill / Bank of America, Wells Fargo Advisors, RBC Wealth Management, Raymond
James, Edward Jones, Stifel, and UBS Wealth Management USA.

Scheduled runs write to the dev Fabric cluster with `--write` and default to 25
advisors per source. `.github/workflows/firm-source-imports.yml` remains only
as a manual `workflow_dispatch` operator path; do not add a GitHub Actions cron
trigger for firm-source imports.

For a manual bounded replay, make the cap, target, and evidence directory
explicit:

```bash
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
  bun run firm-source:major-imports -- \
    --max-advisors 5 \
    --write \
    --output-dir artifacts/firm-source-imports/<run-id>
```

Omit `--write` for a parser-only dry-run. The importer writes `summary.json`
plus one artifact per adapter under `--output-dir`; those files are the durable
record of command inputs, source blocking, normalized samples, counts, and
write errors. Do not raise the cap to force a green-looking run when a public
source reports bot protection or a feed shape change; keep the artifact and
treat that source as retryable evidence.

This workflow is separate from `bun run load:extractions`. The extraction
loader expects local files under `research/extractions/*.json`, then archives
loaded files into `research/extractions/.loaded/`; if a future automation
creates those files, call `bun run load:extractions` in that extraction-specific
job rather than in the firm locator matrix.

### Data-depth runbook

Use these paths when an operator needs to prove data depth after an audit,
source import, AdvisorHub extraction, or deployed verification run.

**Coverage audit surfaces.** The deployed public resources expose the loaded
source depth without requiring the firewalled operations port:

```bash
curl -s \
  'https://advisory-rankings-de.cody-swann-org.harperfabric.com/RecruitingMarket?limit=3' \
  | jq '{summary, marketActivity, recentMoves: [.recentMoves[] | {id, subject, fromFirm, toFirm, sourceStatus, provenance}]}'

curl -s \
  'https://advisory-rankings-de.cody-swann-org.harperfabric.com/RecruitingDealDataGaps?limit=3' \
  | jq '{summary, items: [.items[] | {id, gapTypes, missingFieldLabels, links}]}'

curl -s \
  'https://advisory-rankings-de.cody-swann-org.harperfabric.com/RecruitingDealDataGaps?gapType=missing-deal-terms&limit=3' \
  | jq '{filters, summary, items: [.items[] | {id, gapTypes, missingFieldLabels, links}]}'

curl -s \
  'https://advisory-rankings-de.cody-swann-org.harperfabric.com/RankingsExplorer?limit=10' \
  | jq '{coverage, items: [.items[] | {id, label: (.subject.displayName // .id), firmText, sourceStatus}]}'
```

`/RecruitingMarket` is backed by `src/harper/resource-recruiting-market.ts` and
reports transition-event depth by firm, market, recent move, source-status flag,
and provenance ID. `/RecruitingDealDataGaps` narrows the same public move model
to gap-bearing rows with firm/state/year/direction/gapType/unresolved filters
and public link metadata for follow-up. `/RankingsExplorer` reports ranking-row
coverage buckets and source-status gaps. Treat these resource payloads as the
first coverage audit before opening screenshots or table-level REST.

For deal-gap queue replay, capture both default JSON and a filtered slice. The
filtered `/RecruitingDealDataGaps?gapType=missing-deal-terms&limit=3` response
must echo `filters.gapType = "missing-deal-terms"` and `filters.limit = 3`, and
each visible row should keep `gapTypes`, `missingFieldLabels`, and public
`links` for article, firm/advisor/team when available. Then open the matching
browser route on desktop and mobile:

```bash
BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com
mkdir -p artifacts/recruiting-deal-gaps-replay

bunx playwright screenshot \
  --viewport-size=1440,1000 \
  "$BASE_URL/recruiting/deal-gaps?gapType=missing-deal-terms&limit=3" \
  artifacts/recruiting-deal-gaps-replay/desktop.png

bunx playwright screenshot \
  --viewport-size=390,844 \
  "$BASE_URL/recruiting/deal-gaps?gapType=missing-deal-terms&limit=3" \
  artifacts/recruiting-deal-gaps-replay/mobile.png
```

Inspect the screenshots for the `Recruiting Deal Gaps` heading, three
`.deal-gap-row` cards, source-backed status/missing-field labels, public
follow-up links, and no horizontal overflow. This replay is public-data-only:
do not require private notes, paid APIs, watchlists, analyst assignments,
correction internals, or reviewer data to complete it.

For recruiting expansion replay, `sourceStatus` is the main interpretation
field. `source-backed` rows have public article URLs suitable for UI and JSON
inspection. `missing-source` rows still contribute to market context but need
article provenance. Missing-field tags such as `missing-aum`, `missing-t12`,
`missing-total-pct-t12`, `missing-clawback-terms`, and `missing-location`
identify the next source-pass priorities. Source-error entries in the importer
artifacts mean the upstream public source was protected, rate-limited, or
unavailable during the bounded run; preserve the artifact and rerun later
instead of treating missing rows as deleted data.

**Firm source imports.** For local parser proof, run a bounded dry-run against
one adapter:

```bash
bun run scrape:merrill -- --query 10022 --max-advisors 5 --json
```

For a controlled write, either add `--write` to a single adapter or run the
bounded major importer:

```bash
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
  bun run scrape:merrill -- --query 10022 --max-advisors 5 --json --write

HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
  bun run firm-source:major-imports -- --max-advisors 25 --write
```

**AdvisorHub extraction loading.** The extraction loader consumes local JSON
payloads produced by extraction automation:

```bash
find research/extractions -maxdepth 1 -name '*.json' -print
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
  bun run load:extractions
```

Loaded files move to `research/extractions/.loaded/`, making re-runs
idempotent by file lifecycle as well as row IDs.

For a non-destructive recruiting-only pass, use the bounded backfill wrapper.
It keeps source files in place, requires an explicit limit, loads only public
AdvisorHub recruiting extraction candidates, and emits article, move, skipped,
and unresolved counts to `artifacts/recruiting-backfill-summary.json`:

```bash
bun run backfill:recruiting-articles -- --limit 5
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
  bun run backfill:recruiting-articles -- --limit 5 --write
```

**Deployed verification.** After any write, run the REST verifier against the
public cluster URL. It fetches each exported table through `:443` and joins
client-side, so it works when `:9925` is blocked:

```bash
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
  bun run verify:rest
```

Then open the corresponding UI slice or run `bun run smoke` when the change is
UI-facing. For Recruiting Market updates, inspect `/recruiting` and
`/RecruitingMarket?limit=3`; for ranking coverage, inspect `/rankings` and
`/RankingsExplorer?limit=10`. `bun run baseline:data-depth` is a threshold gate:
if it fails with move, firm-momentum, market-activity, or filter-slice counts
below the reported thresholds, treat the recruiting expansion as incomplete and
use the importer artifacts plus `sourceStatus` gaps to choose the next bounded
source pass.

> **Don't drop the `bun install` step — symptom: smoke fails with
> `Cannot find module '/opt/node22/lib/node_modules/playwright'`.**
> Root cause: `tests/web_smoke.ts` imports the `playwright` JS
> module, and `bunx playwright install` only fetches the browser
> binary, not the JS package. The CI runner has neither
> `./node_modules/playwright` nor the sandbox's
> `/opt/node22/lib/node_modules/playwright`. Fix: run `bun install`
> before either step. Hit on 2026-05-02 — see `.github/workflows/deploy.yml`.

### From the CLI (only works on a network with :9925 access)

If you're on a residential network that can reach `:9925` directly,
the upstream Harper CLI still works:

```bash
./node_modules/.bin/harperdb deploy_component \
  project=advisor-app \
  package='git@advisory-rankings.github.com:CodySwannGT/advisory-rankings.git#fabric-deploy' \
  target=<HARPER_CLUSTER_OPS_URL> \
  username=<FABRIC_LOGIN_EMAIL> \
  password=<HARPER_ADMIN_PASSWORD> \
  restart=true \
  replicated=true
```

### What we tried first that did not work

- **Direct `:9925` ops API** from this sandbox / GH Actions runners —
  the cluster firewall returns no response (`curl` exits with code
  000). Use `bun run deploy` (Studio proxy) or operate from a
  residential network. See §5.
- **`@harperdb/static` published to npm** — referenced by some web
  guides but not actually published. Use the bundled `static`
  extension that ships inside the `harperdb` package (already
  configured in `harper-app/config.yaml`). See §6 › Static UI.
- **Sorting dates with `String#localeCompare`** in `resources.js`.
  `tables.X.search({})` returns `Date` objects in production but ISO
  strings via the dev-server's SQL passthrough; one path silently
  works, the other throws `localeCompare is not a function`. Always
  coerce dates to ms via the `dateMs()` helper at the top of the
  file before comparing.
- **Bare id matching in custom resource `get(target)` handlers** —
  Harper passes `target` as `<id>` from the dev server but `/<id>`
  from the cluster's HTTP layer. Use the `normalizeId()` helper.
- **Bundling `node_modules/` in the tarball.** `bootstrap.sh`
  symlinks `harper-app/node_modules/harperdb` to the local install,
  which `tar` happily preserves and the cluster then rejects with
  *"is not a valid symlink"*. `src/scripts/deploy.ts` excludes it.

### Drop and redeploy (when a deploy left the component in a bad state)
The first deploy attempt left files on disk but failed to register
the component. Fabric's UI then refused to import a second time
because the name was taken, but didn't expose a delete button on the
broken state. Workaround: call `drop_component` via the Studio
operations proxy, then re-import. We did this from Playwright but
you can do it from any logged-in browser:
```js
fetch('https://fabric.harper.fast/Cluster/<HARPER_CLUSTER_ID>/operation/', {
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

`src/scripts/seed_via_rest.ts` and `src/scripts/verify_via_rest.ts`
are sandbox-friendly equivalents of `bun run seed` / `bun run verify`.
They use only the table-level REST endpoints
on `:443`, which means they work from anywhere a browser can reach
Harper.

```bash
export HDB_TARGET_URL=<HARPER_CLUSTER_APP_URL>
export HDB_ADMIN_USERNAME=<FABRIC_LOGIN_EMAIL>
export HDB_ADMIN_PASSWORD=…   # from <LOCAL_CREDENTIALS_FILE>

bun run seed:rest                    # PUTs each canonical record via /<TableName>/<id>
bun run verify:rest                  # GETs each table and joins client-side
```

How they work:

- `seed_via_rest.ts` — loads `src/data/seed-data.json` and calls
  `PUT /<TableName>/<id>` per record. Idempotent because PUT is
  upsert-by-id in Harper. It iterates **every top-level key** in
  `seed-data.json` and PUTs by table name, so adding a new fixture
  table (e.g. `AdvisorResearchCheck`) requires no script change — the
  rows flow automatically. Output matches `bun run seed` exactly:
  118 records across 28 tables.

- `verify_via_rest.ts` — re-implements the verification without SQL:
  fetches each `@export` table once, builds id→record dicts, and
  resolves joins client-side. Output is the same eight sections as
  `bun run verify` (row counts, Taylor career walk, AUM time-series,
  recruiting deal, Cairnes disclosures, sanction stack, field
  assertions, mention counts).

**Limitations:**
- These scripts depend on every record carrying its `id` in the body.
  All canonical seed records do; if you write a script that produces
  records without `id`, generate one before PUT.
- `verify_via_rest.ts` re-implements the joins and is therefore tied
  to the schema shape. If you add tables, it'll still count their
  rows in the row-count section but won't include them in the
  spot-check sections unless you add the join logic.

When operating from a residential network, prefer the original
`bun run seed` / `bun run verify` — they're simpler and run server-
side SQL.

### Advisor evidence fixtures (PRD #256 / issue #683)

`seed-data.json` carries `AdvisorResearchCheck` rows and
advisor-targeted `FieldAssertion` rows so the advisor-profile
public **Profile provenance** summary and analyst-only **Evidence
freshness** / **Fact confidence** detail panels are empirically verifiable
against real data, not just in unit tests. The fixtures intentionally
cover three states:

- **Loaded** — advisor `4fbd3720-bde5-5cd5-b1a2-7b37424ad7ea`
  (C. James Taylor): research checks across all four source types
  (`web_research`, `firm_bio`, `rankings`, `press`) with a clean latest
  status, plus advisor-targeted assertions spanning `asserted` /
  `inferred` / `derived` so `confidenceSummary` totals are non-trivial.
- **Warning** — advisor `f574f6e2-56b9-5650-9c43-c3d52f81d94f`
  (Shane Drumm): latest check status is `failed` (with an earlier
  `ambiguous`), driving the degraded-evidence tone.
- **No data** — advisor `906ecafe-f925-5704-ade3-bf10e94f0b60`
  (Michaella Irvine): intentionally left with zero checks and zero
  advisor-targeted assertions so the explicit public provenance empty
  state renders.

**Served public read store.** `GET /AdvisorProfile/<id>` reads the
deployed component's table store. After editing `seed-data.json`, the
fixtures only become visible on the dev deployment once they are PUT to
the **served** store — running `bun run seed:rest` against
`HDB_TARGET_URL=<HARPER_CLUSTER_APP_URL>` (the `:443` app URL, not the
`:9925` ops API) is what populates the read path. Confirm with
`curl -s "$HDB_TARGET_URL/AdvisorProfile/4fbd3720-bde5-5cd5-b1a2-7b37424ad7ea" | jq '.evidenceFreshness,.confidenceSummary'`
returning a payload (not `{"error":"not found"}`).

### BrokerCheck enrichment

`bun run brokercheck --` populates `Advisor.finraCrd`,
`Firm.finraCrd`, `EmploymentHistory`, `Disclosure`, `Sanction`,
`License`, and `BrokerCheckSnapshot` from the FINRA BrokerCheck JSON
endpoint. It uses the same REST PUT-by-id transport as
`seed_via_rest.ts` (the `:9925` ops API is firewalled here too).

Common entry points:

```bash
export HDB_TARGET_URL=<HARPER_CLUSTER_APP_URL>

# Backfill CRDs onto every Advisor row that lacks one:
bun run brokercheck -- --enrich --max 20

# Add a firm-level Regulatory record card:
bun run brokercheck -- --firm-id 19616

# Discover net-new advisors at a known firm:
bun run brokercheck -- --firm-roster 47770 --max 50
```

Politeness: 1.5 s ± 0.5 s between requests, exponential backoff on
4xx/5xx (5 s → 15 s → 45 s), `BC_RATE_SECONDS=3` for slower runs.
Resumable via `research/brokercheck-state.json`. ToU constraints
and the full mode reference: `docs/brokercheck-spike.md` §5–§7.

### Advisor web-research queue

`src/scripts/research_advisors.ts` backs the scheduled public-web
research workflow. It does not search the web by itself; instead it
provides the durable queue and bookkeeping that an agent Automation
uses before and after targeted public searches that follow the
`upsert-advisor` skill.

The deployed operator surface has two matching entrypoints:
`GET /AdvisorResearchQueue` returns the public-safe queue payload, and
`/research/freshness` renders the same rows in the browser. Both support
`sourceType`, `staleDays`, `status`, `missingField`, and `limit`; the web UI
keeps those filters in the URL and forwards them to the resource. The browser
workbench renders a priority summary above the queue with four fixed shortcut
groups: `missing_contact_data`, `missing_profile_substance`,
`stale_checked_profiles`, and `never_checked_profiles`. Each shortcut uses the
resource-provided replay filters, pushes them into the `/research/freshness`
query string, and reloads `/AdvisorResearchQueue` in place.

Compact queue rows are the operator scan surface. Each row exposes advisor
name, current firm/role, FINRA CRD, source type, check status, missing fields,
freshness timing, provenance ids, and an advisor-profile link without nesting
the older details-card layout per row.

Deployed replay path:

1. Open
   `https://advisory-rankings-de.cody-swann-org.harperfabric.com/research/freshness?sourceType=web_research&staleDays=30&limit=25`.
2. Confirm the summary loads with priority-group buttons and compact
   `Advisor queue rows`.
3. Click `Missing contact data` when its count is nonzero.
4. Confirm the route URL and the `/AdvisorResearchQueue` request include the
   group filters, usually `missingField=businessEmail` for the contact group,
   while the visible rows stay compact and expose the selected missing-field
   evidence.
5. Repeat at a mobile width and confirm there is no horizontal overflow.

```bash
export HDB_TARGET_URL=<HARPER_CLUSTER_APP_URL>
export HDB_ADMIN_USERNAME=<FABRIC_LOGIN_EMAIL>
export HDB_ADMIN_PASSWORD=…   # from <LOCAL_CREDENTIALS_FILE>

# Pick the next five advisors whose web research is missing/stale.
bun run research:advisors -- due --max 5 --stale-days 30 --json

# Record a completed check so the same advisor is not retried daily.
bun run research:advisors -- record \
  --advisor-id <advisor-id> \
  --status no_new_data \
  --sources https://example.com/bio,https://example.com/ranking \
  --notes "No new source-backed facts found"
```

When `HDB_TARGET_URL` is set the script reads ordinary tables through
Fabric's operations proxy rather than assuming every new table has a
mounted REST export immediately. Without `HDB_TARGET_URL` it uses the
local Harper operations socket. Check rows land in
`AdvisorResearchCheck`; source-backed facts discovered by the agent
still belong in the relevant entity table plus `FieldAssertion`.
Advisor headshots are stored on `Advisor.headshotUrl`; firm logos are
stored on `Firm.logoUrl` when a scraped/extracted source provides a
public image URL.

`src/scripts/backfill_media.ts` backs one-off public-web media
enrichment for already-loaded rows. It searches for advisors or firms
missing those fields, checks candidate pages for likely headshot/logo
images, verifies the candidate URL returns an image, and writes only
when `--write` is supplied:

```bash
bun run media:backfill -- --target firms --max 10
bun run media:backfill -- --target advisors --max 10 --write
bun run media:backfill -- --target firms --name "Wells Fargo Advisors" \
  --source-url https://www.wellsfargoadvisors.com/ --write
```

Search engines may return bot challenges from datacenter networks. When
you already know a firm bio, team page, or advisor profile URL,
`--source-url` bypasses search and extracts media directly from that
page.

### Smoke-testing the custom JS resources locally

`src/scripts/preview_feed.ts` (a.k.a. `bun run preview`) renders the
`Feed` / `*Profile` resources defined in `harper-app/resources.js`
against a locally-running Harper, even when port 9926 isn't
reachable. It pulls every `@export` table out via the ops-API
Unix socket (`~/.harperdb/operations-server`), stubs
`globalThis.tables` and `globalThis.Resource`, then imports
generated `resources.js` and prints the JSON each resource returns.

```bash
bun run preview                        # /Feed
bun run preview -- firm    <id>
bun run preview -- advisor <id>
bun run preview -- team    <id>
bun run preview -- article <id>
```

This is purely a local dev aid; the deployed Fabric cluster serves
the same JSON over HTTPS at `/Feed`, `/FirmProfile/<id>`, etc.

### Parity-comparing the deployed cluster to a local dev server

`tests/parity_compare.ts` (Playwright) fingerprints both bases on
the same set of pages — `/`, `/firms`, `/advisors`,
`/teams`, `/login`, plus four profile pages whose IDs
are pulled from `/Feed` — and reports any drift in `<title>`,
navbar logo, count-of-every-meaningful-selector, card title /
subtitle text, or console errors. Brand swaps (logo
`AdvisoryRankings` → `AdvisorBook`) are flagged separately as
allowed deltas; everything else is a mismatch.

```bash
BASELINE_URL=<HARPER_CLUSTER_APP_URL> \
NEW_URL=http://127.0.0.1:8765 \
  bun run build && node dist/tests/parity_compare.js
```

Used to gate the AdvisorBook + Atomic Design refactor deploy on
2026-05-02 — pre-deploy report flagged 5 brand-rebrand deltas
across the 5 static pages and 0 other mismatches; post-deploy
report flagged 0 deltas across 9 pages (5 static + 4 profile)
and 0 mismatches.

---

## 8. Web UI (`web/`)

Plain HTML + compiled TypeScript browser modules + CSS, served by
Harper's built-in `static:` extension. `bun run build` emits the
runtime `.js` files into `harper-app/web/`. No framework. The UI is structured as
the **AdvisorBook** Facebook-style activity feed: a centered
column of article cards, with chrome rails and entity rollups on
either side. Components are organized as an Atomic Design library
under `src/web/design-system/` (tokens / atoms / molecules /
organisms / templates) — see `docs/design-system.md`.

### Pages

| URL | What it shows |
|---|---|
| `/` (`index.html`) | Activity feed of every `Article` ordered by `publishedDate desc`, each card hydrated with the entities it documents. Transition articles render an inline event block (`from-firm → to-firm · AUM · T-12 · headcount · upfront % of T-12`); regulatory articles render a stacked-sanctions block (regulator + each sanction as a pill). |
| `/branches` | Branch explorer backed by `PublicBranches`: URL-backed firm, state, city/market, gap-state, source-type, branch-level, and minimum-advisor filters; rows link back to firm profiles and advisor directory context while distinguishing no matches from unavailable or partial branch coverage. |
| `/firms/<slug>-<id>` (`firm.html?id=…` still works) | Firm profile: current advisors, past advisors with reason-for-leaving, current teams, transitions in / out, branches (market → complex → branch), disclosures filed at the firm, coverage. This is the "sticky" view the user asked for — open Wells Fargo and you get the live roster, alumni, and the two teams that came / went. |
| `/advisors/<slug>-<id>` (`advisor.html?id=…` still works) | Advisor profile: career timeline (each `EmploymentHistory` row, terminated-for-cause flag if any), teams, disclosures with sanction pills, OBAs, registration applications, transitions, coverage. |
| `/teams/<slug>-<id>` (`team.html?id=…` still works) | Team profile: current and past members ordered by role (lead first), `TeamMetricSnapshot` history as a small table, transitions, coverage. |
| `/articles/<slug>-<id>` (`article.html?id=…` still works) | Single-article view: same event blocks as the feed card + the article body + the `FieldAssertion` provenance table. |
| `/firms`, `/advisors`, `/teams` (`*.html` still works) | Plain directory pages (alphabetical), driven by public directory resources with GET filters and cursor pagination. |
| `/recruiting` (`recruiting.html` still works) | Recruiting Market Map: state filter, summary KPIs, firm momentum, market activity, and recent advisor-team moves from `/RecruitingMarket`. |
| `/recruiting/deal-gaps` (`recruiting-deal-gaps.html` still works) | Recruiting Deal Gaps queue: public incomplete recruiting move rows from `/RecruitingDealDataGaps`, with URL-backed firm/state/year/direction/gap/unresolved filters, missing-field labels, source-backed status, and public article/profile/market follow-up links. |
| `/recruiting/shortlist?firm=<name>&firm=<name>` (`recruiting-shortlist.html?firm=…` still works) | Recruiting Shortlist Brief: public share/print packet for repeated firm queries, with firm-by-firm inbound/outbound moves, net known AUM, missing-field/source-status flags, branch coverage context, and evidence links from `/RecruitingMarket`. |
| `/coverage` (`coverage.html` still works) | Public data coverage dashboard: entity counts, rankings/recruiting gaps, research freshness pressure, source tables, public resource provenance, and limitations from `/DataCoverage`. |
| `/investor-proof` (`investor-proof.html` still works) | Public investor proof packet: generated-at timing, coverage metrics, freshness pressure, representative replay links, public resources, and explicit unavailable states from `/InvestorProofPacket`. |
| `/mcp-gallery` (`mcp-gallery.html` still works) | Public MCP gallery: endpoint/server metadata, read-only tool and resource-template inventory, persona-oriented query templates, copyable no-credential Inspector/Streamable HTTP snippets, private-data boundary copy, stale/fresh status, and explicit unavailable states from `/McpCatalog`. |
| `/rankings` (`rankings.html` still works) | Advisor Rankings Browser: category/year/firm/state/city filters, resolved/unresolved profile-match status, source URLs, unavailable score labels, ranking data-quality context, and ranking rows from `/RankingsExplorer`. |
| `/regulatory` (`regulatory.html` still works) | Compliance events page: recent disclosure cards sourced from `/Feed`, with regulatory context and load-error fallback. |
| `/regulatory/discrepancies` (`regulatory-discrepancies.html`) | Authenticated analyst queue for open `RegulatoryDiscrepancy` rows, showing compared source values, event clues, provenance, severity, status, and available review actions from `/RegulatoryDiscrepancyQueue`. |
| `/corrections` (`correction-inbox.html`) | Authenticated analyst inbox for pending advisor-submitted correction requests, showing advisor, field, displayed/proposed values, submitter note, source context, age, and disposition controls from `/AdvisorCorrectionRequest`. |
| `/research/freshness` (`research-freshness.html`) | Public research freshness workbench for advisors due for source checks, showing URL-backed filters, priority-group shortcuts, compact advisor rows, status/missing-field counts, provenance ids, and profile links from `/AdvisorResearchQueue`. |
| `/source-triage` (`source-triage.html`) | Public source article triage workbench for extraction-gap rows, showing URL-backed category/reason filters, ArticleView links, original-source links, entity/event counts, body/provenance state, and reason labels from `/SourceArticleTriage`. |
| `/report-packet?ids=<id>,<id>` (`report-packet.html?ids=…` still works) | Public report packet shell that replays the comparison selection, shows generated metadata, selected advisors, and normalized selection caveats from `/AdvisorComparison`. |

### How the joins happen

The richer pages would otherwise require ~10 client-side fetches
each. Instead, the browser hits **one** custom resource per page,
defined in `src/harper/resources.ts`:

| Browser fetches | Resource | Joins it does server-side |
|---|---|---|
| `GET /Feed` | `Feed` | Articles + per-target mention tables + `TransitionEvent` (with deal) + `Disclosure` (with sanctions) + advisor / firm / team chips. |
| `GET /ArticleView/<id>` | `ArticleView` | Same as `/Feed` for one article, plus body + `FieldAssertion` rows. |
| `GET /FirmProfile/<id>` | `FirmProfile` | Employments → advisors, current vs. past; teams; transitions in / out; branches; disclosures at firm; mention articles. |
| `GET /AdvisorProfile/<id>` | `AdvisorProfile` | Career walk + teams + disclosures + sanctions + OBAs + reg apps + transitions + mention articles. |
| `GET /AdvisorComparison?ids=<id>,<id>` | `AdvisorComparison` | Two-to-four advisor comparison payload with identity, firm, regulatory, career, rankings/articles, data confidence, and attribution sections. |
| `GET /TeamProfile/<id>` | `TeamProfile` | Memberships current/past, snapshots, transitions, mention articles. |
| `GET /PublicBranches` | `PublicBranches` | Branch rows joined to firm names and linked `EmploymentHistory` rows for source metadata and distinct current advisor counts. |
| `GET /RecruitingMarket` | `RecruitingMarket` | Transition events, advisor/team/firm names, recruiting-deal terms, state and city activity, source URLs, and Recruiting Market Map rollups. |
| `GET /RecruitingDealDataGaps` | `RecruitingDealDataGaps` | Public recruiting move rows with missing deal-data fields, source-status gap types, missing-field labels, shareable filters, cursor pagination, and public follow-up links. |
| `GET /SourceArticleTriage` | `SourceArticleTriage` | Public source-article extraction-gap rows with category/reason filters, source and ArticleView links, entity/event counts, body/provenance state, reason labels, and cursor pagination. |
| `GET /DataCoverage` | `DataCoverage` | Public entity counts, route/resource probes, rankings and recruiting coverage gaps, research freshness, source-table context, and limitations for `/coverage`. |
| `GET /InvestorProofPacket` | `InvestorProofPacket` | Investor-facing packet data composed from `DataCoverage` and `AdvisorResearchQueue`, plus representative public links for feed, firm, rankings, and recruiting proof. |
| `GET /McpCatalog` | `McpCatalog` | Same-origin public metadata for the MCP gallery: endpoint URL, initialize result, curated tools, resource templates, read-only boundary status, and unavailable fallback state. |
| `GET /RankingsExplorer` | `RankingsExplorer` | Ranking and ranking-entry rows, resolved profile links, firm aliases, filters, source metadata, and unavailable-field states. |
| `GET /RegulatoryDiscrepancyQueue` | `RegulatoryDiscrepancyQueue` | Open discrepancy rows joined to advisor, current firm, disclosure, source value, regulator, docket, and review-action context for authenticated analyst review. |
| `POST /mcp` | `mcp` | Streamable HTTP JSON-RPC transport for curated read-only AdvisorBook tools and resources. |

The classes in `src/harper/resources.ts` extend Harper's globally-injected
`Resource` and use `tables.X.search({})` for the underlying reads.
Updating any page's data shape means editing the matching method
**and** the matching `src/web/<page>.ts` renderer in the same change.

The MCP endpoint and same-origin catalog are composed from
`src/harper/resource-mcp*.ts` and emitted
through the same `resources.js` bundle. Supported JSON-RPC methods are
`initialize`, `tools/list`, `tools/call`, `resources/templates/list`, and
`resources/read`. The tool list is `search_advisorbook`, `get_feed`,
`get_advisor_profile`, `get_firm_profile`, `get_team_profile`, and
`get_article`. Resource templates are `advisorbook://feed`,
`advisorbook://advisor/{id}`, `advisorbook://firm/{id}`,
`advisorbook://team/{id}`, and `advisorbook://article/{id}`. The root
`server.json` manifest points remote clients at
`https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp` and
does not require auth headers or secrets. `GET /McpCatalog` wraps the
same dispatch path for public gallery pages and reports `status:
"unavailable"` instead of exposing partial inventory when probing fails.

### Auth

Same realm covers both `/` and `/<TableName>/` and `/Feed` etc.,
so a single basic-auth prompt unlocks the entire surface for the
session.

### Local sandbox caveat

Harper's REST/static HTTP listener (`http.port: 9926`) silently
fails to bind on container kernels that don't support
`SO_REUSEPORT` — same family of issue as MQTT in §3 of
`harper-app/README.md`, but with no Unix-socket fallback. To smoke-
test the resources without a TCP listener, run
`bun run preview` (a.k.a. `node dist/scripts/preview_feed.js` after build); it
pulls every `@export` table out via the ops-API socket, stubs
`globalThis.tables`, and runs the resource methods directly. On
Fabric (and any normal VM) TCP 9926 — and therefore `:443` to the
public REST domain — works fine and the workaround is unnecessary.

### What we tried first that did not work

- **`@harperdb/static` package** — surfaces in some web docs but
  is not actually published to npm (`npm view @harperdb/static` →
  E404). Use the bundled `static:` extension; it's part of the
  `harperdb` package itself.
- **Browser-side joins via the auto-export endpoints only** —
  works, and `src/scripts/verify_via_rest.ts` already does this for
  the REST verifier. But re-implementing the joins in browser JS for
  five pages would mean two parallel implementations to keep in
  sync. Server-side custom resources collapse that to one
  implementation in one language, at the cost of making the
  `src/harper/resources.ts` file the central place to change when the schema
  changes.

---

## 9. Rotating credentials (production checklist)

This cluster was provisioned with credentials that have been seen by
automation (and are in conversation transcripts). **Treat them as
compromised; rotate before anything sensitive lives on it.**

1. **Admin password.** Sign in to Fabric Studio →
   <HARPER_CLUSTER_NAME> → **Config → Users** → edit the
   `<FABRIC_LOGIN_EMAIL>` user → set a fresh password from a
   secrets manager. Update local Keychain services
   `<KEYCHAIN_USERNAME_SERVICE>` and
   `<KEYCHAIN_PASSWORD_SERVICE>`, plus the GitHub Actions
   secrets. Same for `HDB_ADMIN` if it's still active (we set the
   email user; the bootstrap `HDB_ADMIN` may still hold the cluster's
   original temp password — check via Config → Users).

2. **GitHub deploy key.** New keypair (§4 step 1). New private to
   Fabric (Config → SSH Keys → edit `<FABRIC_SSH_KEY_NAME>`).
   New public to GitHub (Settings → Deploy keys → add new, then
   delete the old). Cluster will pick up the new key on its next
   pull.

3. **Fabric account password.** Profile → Change password.

4. **Use a secret manager.** Local scripts read env first, then macOS
   Keychain, then the flat-file fallback. CI uses GitHub Actions
   secrets. For production, prefer Keychain / 1Password CLI / Doppler
   / AWS Secrets Manager over `<LOCAL_CREDENTIALS_FILE>`.

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
Cluster home          /#/<FABRIC_ORG_ID>/<HARPER_CLUSTER_ID>
Applications          /#/<FABRIC_ORG_ID>/<HARPER_CLUSTER_ID> (default tab)
Databases (data browser)  same URL → "Databases" tab
APIs                  same URL → "APIs" tab
Status                same URL → "Status" tab
Logs                  same URL → "Logs" tab
Config (this-instance) same URL → "Config" tab
Config → Users        /#/<FABRIC_ORG_ID>/<HARPER_CLUSTER_ID>/config/users
Config → SSH Keys     /#/<FABRIC_ORG_ID>/<HARPER_CLUSTER_ID>/config/ssh-keys
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

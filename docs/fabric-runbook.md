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
static:
  files: 'web/**'
```

That gives us, on `:443`:
- One auto-generated REST resource per `@table @export` type (~35 of
  them; 23 currently have rows).
- Custom resources from generated `resources.js` that pre-join across
  tables for the UI: `/Feed`, `/ArticleView/<id>`,
  `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/TeamProfile/<id>`, plus
  public read-only MCP at `POST /mcp`. Doing the joins server-side keeps
  the page-load to one round-trip.
- A Facebook-style activity-feed UI under `/` (HTML + CSS tracked in
  `web/`, JavaScript generated from `src/web/**/*.ts`).
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
  firms/ / advisors/ / teams/ / articles/ / recruiting/ + seo_shell.js
                        ← clean URL Fastify routes for directories and detail pages
  web/                  ← Facebook-style UI (see §8); copy whole dir after build
    index.html / index.js     home feed
    article.html / article.js article detail
    firm.html / firm.js       firm profile
    advisor.html / advisor.js advisor profile
    team.html / team.js       team profile
    firms.html / advisors.html / teams.html  directory pages
    recruiting.html / recruiting.js          recruiting market explorer
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
but **the sandbox we're running from has datacenter-egress firewalls
that block outbound `:9925`**, so any tool that tries to talk to it
directly times out at 15s.

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
> `teams.html`), `recruiting.html`, and `login.html`. Clean routes (`/firms`,
> `/advisors`, `/teams`, `/recruiting`, `/articles/<slug>-<id>`, and entity
> `/<kind>/<slug>-<id>` paths) are Fastify shells that serve those
> same HTML files. Each page is a thin shell that
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

### Custom JS resources (`resources.js`)
Edit `src/harper/resources.ts`, run `bun run build`, then deploy the
generated `harper-app/resources.js`. After
**Reload** Studio re-executes the file; the `Feed` / `*Profile`
classes re-register at their REST routes. Their bodies issue
`tables.X.search({})` calls — fine for the current ~99-row dataset.
Once the dataset grows past ~10k rows, narrow them to indexed
`search({ conditions: [...] })` queries on the hot paths
(article-by-publishedDate, employments-by-firmId, etc.).

**Paginated endpoints (added 2026-05-03):** `/PublicAdvisors` and
`/FirmAdvisors/<id>` accept `?cursor=…&limit=…` (default 50, max 100)
and return `{ items, nextCursor }` (PublicAdvisors also returns
`total`). The cursor is opaque base64url and stable under inserts —
clients round-trip whatever they got.

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

Browser flow:

1. `web/login.html` posts `{email, password}` to `/Login`.
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

### Public vs. authenticated routes

The point of the Facebook-style UI is a public-facing news feed, so
the data-plane routes that back it return 200 to anonymous visitors.
Everything else still requires auth.

| Route | Anonymous | Why |
|---|---|---|
| `GET /` (the SPA shell) | ✅ 200 | Static; served by the bundled `static` extension. |
| `GET /Feed`, `/ArticleView/<id>`, `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/TeamProfile/<id>` | ✅ 200 | Each `Resource` subclass overrides `allowRead()` to return `true`. The data they expose is sourced from public AdvisorHub coverage. |
| `GET /PublicFirms`, `/PublicAdvisors`, `/PublicTeams` | ✅ 200 | Tiny wrappers added to `resources.js` so the directory pages (`firms.html`, `advisors.html`, `teams.html`) don't need to call the auth-gated `/<TableName>/` routes. |
| `GET /Search?q=…` | ✅ 200 | Backs the navbar header search. Same `allowRead() { return true; }` model as the rest of the public surface. |
| `POST /mcp` | ✅ 200 | Streamable HTTP MCP transport implemented as lowercase `mcp` because Harper maps resource export names directly to route names. It accepts unauthenticated JSON-RPC POST for curated read-only tools and resources only. |
| `GET /<TableName>/` (auto-export, e.g. `/Firm/`) | ❌ 401 | Default Harper RBAC; reads of the raw tables require an authenticated user. |
| `PUT/POST/DELETE` anywhere else | ❌ 401 | Same. The custom UI resources only define `get` + `allowRead`; mutating ops fall through to the table defaults. `/mcp` is the one public POST route and its JSON-RPC handler exposes no write/admin methods. |

If a future change needs to lock the public routes back down, drop
the `allowRead() { return true; }` overrides — they're flagged in a
single comment block at the top of `Feed` in `resources.js`.

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
| `src/scripts/deploy.ts` | control + data | session cookie for `deploy_component`, then JWT for the post-restart `/Firm/`,`/Feed` checks |
| `src/scripts/get_token.ts` | — | mints + prints a JWT for use with `curl -H "Authorization: Bearer …"` |
| `tests/web_smoke.ts` | data | JWT in `extraHTTPHeaders` against the deployed cluster |

CI gets the same: `HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD`
are repo secrets, the workflow mints a fresh JWT per run, and the
30-day refresh token isn't stored anywhere.

### Push-deploy from anywhere (`bun run deploy` → Studio proxy)

`bun run deploy` runs `bun run build`, then `src/scripts/deploy.ts`
packages `harper-app/` into a tarball, base64-
encodes it, logs into Studio over `:443`, and POSTs `deploy_component`
through Studio's operations proxy. Same effect as the CLI below, but
works from datacenter networks where `:9925` is firewalled (this
sandbox, every cloud CI runner I've tried).

```bash
# Reads HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD from env,
# then macOS Keychain, then <LOCAL_CREDENTIALS_FILE>.
# Tarball excludes node_modules, .git, .harperdb, tests/screenshots.
bun run deploy
```

Data-write scripts share the same credential lookup. `bun run ingest`,
`bun run load:extractions`, and write-mode scraper scripts use
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
▶ waiting for https://…/Firm/ to respond …
  back up after 2s
▶ https://…/Feed → HTTP 200
  count=2, items=2
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
`bun install` -> `bun run deploy` -> `bunx playwright install --with-deps chromium`
-> Playwright smoke (`bun run smoke`, backed by `tests/web_smoke.ts`)
against the live cluster URL. Required repo secrets:

| Secret | Source |
|---|---|
| `DEPLOY_KEY` | GitHub deploy key used by Lisa's release workflow to push version bumps. |
| `HARPER_ADMIN_USERNAME` | `<FABRIC_LOGIN_EMAIL>` |
| `HARPER_ADMIN_PASSWORD` | GitHub Actions secret, matching the local Keychain value |

If the smoke fails, CI uploads `tests/screenshots/` as a
build artifact. The workflow also runs on `workflow_dispatch` for
manual releases/deploys.

### Firm source import automation

`.github/workflows/firm-source-imports.yml` is the Codex/GitHub Actions path
for running all production-ready firm source adapters without a local operator.
It runs every Tuesday and Friday at 08:23 UTC and dispatches a bounded matrix
for Morgan Stanley, Merrill / Bank of America, Wells Fargo Advisors, RBC Wealth
Management, Raymond James, Edward Jones, Stifel, and UBS Wealth Management USA.

Scheduled runs write to the dev Fabric cluster with `--write` and default to 25
advisors per source. Manual workflow dispatch defaults to dry-run; set
`write=true` and tune `max_advisors` for a larger controlled import. The
workflow uses the same `HARPER_ADMIN_USERNAME` and `HARPER_ADMIN_PASSWORD`
secrets as deploy, limits source pressure with `max-parallel: 2`, and uploads a
per-firm JSON artifact for review.

This workflow is separate from `bun run load:extractions`. The extraction
loader expects local files under `research/extractions/*.json`, then archives
loaded files into `research/extractions/.loaded/`; if a future automation
creates those files, call `bun run load:extractions` in that extraction-specific
job rather than in the firm locator matrix.

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
  upsert-by-id in Harper. Output matches `bun run seed` exactly:
  99 records across 23 tables.

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
`/teams`, `/login.html`, plus four profile pages whose IDs
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
| `/firms/<slug>-<id>` (`firm.html?id=…` still works) | Firm profile: current advisors, past advisors with reason-for-leaving, current teams, transitions in / out, branches (market → complex → branch), disclosures filed at the firm, coverage. This is the "sticky" view the user asked for — open Wells Fargo and you get the live roster, alumni, and the two teams that came / went. |
| `/advisors/<slug>-<id>` (`advisor.html?id=…` still works) | Advisor profile: career timeline (each `EmploymentHistory` row, terminated-for-cause flag if any), teams, disclosures with sanction pills, OBAs, registration applications, transitions, coverage. |
| `/teams/<slug>-<id>` (`team.html?id=…` still works) | Team profile: current and past members ordered by role (lead first), `TeamMetricSnapshot` history as a small table, transitions, coverage. |
| `/articles/<slug>-<id>` (`article.html?id=…` still works) | Single-article view: same event blocks as the feed card + the article body + the `FieldAssertion` provenance table. |
| `/firms`, `/advisors`, `/teams` (`*.html` still works) | Plain directory pages (alphabetical), driven by public directory resources. |
| `/recruiting` (`recruiting.html` still works) | Recruiting Market Map: state filter, summary KPIs, firm momentum, market activity, and recent advisor-team moves from `/RecruitingMarket`. |

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
| `GET /TeamProfile/<id>` | `TeamProfile` | Memberships current/past, snapshots, transitions, mention articles. |
| `GET /RecruitingMarket` | `RecruitingMarket` | Transition events, advisor/team/firm names, state and city activity, source URLs, and Recruiting Market Map rollups. |
| `POST /mcp` | `mcp` | Streamable HTTP JSON-RPC transport for curated read-only AdvisorBook tools and resources. |

The classes in `src/harper/resources.ts` extend Harper's globally-injected
`Resource` and use `tables.X.search({})` for the underlying reads.
Updating any page's data shape means editing the matching method
**and** the matching `src/web/<page>.ts` renderer in the same change.

The MCP endpoint is composed from `src/harper/resource-mcp*.ts` and emitted
through the same `resources.js` bundle. Supported JSON-RPC methods are
`initialize`, `tools/list`, `tools/call`, `resources/templates/list`, and
`resources/read`. The tool list is `search_advisorbook`, `get_feed`,
`get_advisor_profile`, `get_firm_profile`, `get_team_profile`, and
`get_article`. Resource templates are `advisorbook://feed`,
`advisorbook://advisor/{id}`, `advisorbook://firm/{id}`,
`advisorbook://team/{id}`, and `advisorbook://article/{id}`. The root
`server.json` manifest points remote clients at
`https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp` and
does not require auth headers or secrets.

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

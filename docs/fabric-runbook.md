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
| Cluster admin password | aligned with the Studio password (§9). Stored in `~/.harper-fabric-credentials`. Rotate before anything sensitive lives on this cluster. |
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
jsResource:
  files: 'resources.js'
static:
  files: 'web/*'
```

That gives us, on `:443`:
- One auto-generated REST resource per `@table @export` type (~34 of
  them; 23 currently have rows).
- Five custom resources from `resources.js` that pre-join across
  tables for the UI: `/Feed`, `/ArticleView/<id>`,
  `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/TeamProfile/<id>`.
  Doing the joins server-side keeps the page-load to one round-trip.
- A Facebook-style activity-feed UI under `/` (HTML + CSS + JS in
  `web/`).
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
  config.yaml           ← lifted from harper-app/, includes
                          graphqlSchema + rest + jsResource +
                          static: { files: 'web/*' }
  schema.graphql        ← lifted from harper-app/
  resources.js          ← lifted from harper-app/ — Feed/Profile resources
  package.json          ← minimal: { "name": "advisor-app", "version": "0.1.0" }
  web/                  ← Facebook-style UI (see §8); copy whole dir
    index.html / index.js     home feed
    article.html / article.js article detail
    firm.html / firm.js       firm profile
    advisor.html / advisor.js advisor profile
    team.html / team.js       team profile
    firms.html / advisors.html / teams.html  directory pages
    app.css / app.js          shared CSS + JS
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
# edit any web/*.{html,js,css}
git commit -am "web: …"
git push origin fabric-deploy
```
Then **Reload** in Studio (same as schema). The `static:` extension
re-reads files on reload; no special handling.

> The UI is the **AdvisorBook** SPA: one page per entity kind
> (`index.html` = feed, `firm.html`, `advisor.html`, `team.html`,
> `article.html`) plus directories (`firms.html` / `advisors.html` /
> `teams.html`) and `login.html`. Each page is a thin shell that
> imports a per-page JS module, which calls the matching custom
> resource (`/Feed`, `/FirmProfile/<id>`, etc.) for one
> round-trip of already-joined data. UI components are organized
> as an Atomic Design library under `web/design-system/` (tokens
> / atoms / molecules / organisms / templates) — see
> `docs/design-system.md`. `web/app.js` holds non-UI utilities
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
Edit `resources.js` at the root of `fabric-deploy` and push. After
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

`/FirmProfile/<id>` no longer inlines `currentAdvisors` / `pastAdvisors`
arrays; it emits `currentAdvisorCount` / `pastAdvisorCount` instead.
**This is a breaking shape change for `/FirmProfile`** — frontend
(`web/firm.js`) and backend (`resources.js`) must deploy together,
which is the default since they ship from the same `fabric-deploy`
branch. Symptom of a half-deploy: the firm page renders empty
"Current advisors (0)" cards even when the firm has employees.

The pagination machinery lives in the `parsePagination` /
`encodeCursor` / `decodeCursor` / `inverseDateKey` / `paginate`
helpers near the top of `resources.js`. Unit tests for cursor walks
live at `tests/pagination_test.mjs` and
`tests/resources_pagination_test.mjs` — run them locally before
pushing a change to those helpers.

### Component dependencies
Edit the root `package.json` and push. Fabric runs `npm install` on
deploy. The current package.json is intentionally minimal (no
runtime deps); avoid adding any unless absolutely necessary, and
specifically avoid `harperdb` itself since it's already on the
cluster.

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

Endpoints (all in `harper-app/resources.js`):

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
| `GET /<TableName>/` (auto-export, e.g. `/Firm/`) | ❌ 401 | Default Harper RBAC; reads of the raw tables require an authenticated user. |
| `PUT/POST/DELETE` anywhere | ❌ 401 | Same. The custom resources only define `get` + `allowRead`; mutating ops fall through to the table defaults. |

If a future change needs to lock the public routes back down, drop
the `allowRead() { return true; }` overrides — they're flagged in a
single comment block at the top of `Feed` in `resources.js`.

### Auth model (data plane vs. Fabric control plane)

Harper has two distinct auth surfaces and we use both — neither is a
hack:

| Plane | Surface | Auth |
|---|---|---|
| **Data plane** — REST routes on the cluster (`/<TableName>/`, `/Feed`, `/FirmProfile/<id>`, …) | `https://<cluster>/` (`:443`) | **Native Harper JWT bearer.** Mint with the `create_authentication_tokens` operation: returns `operation_token` (sub:`operation`, ~24h) and `refresh_token` (sub:`refresh`, ~30d). Pass the op token as `Authorization: Bearer <jwt>`. Basic auth also works but bearer is the documented convention. |
| **Control plane on Fabric** — `deploy_component`, `restart_service`, `get_components`, `list_users`, … | `https://fabric.harper.fast/Cluster/<id>/operation/` | **Studio session cookie.** `POST /Login/` with email + password → cookie. Fabric does not expose a long-lived API token (verified: `/User/tokens`, `/APIKey`, `/APIToken`, `/Token`, `/AccessToken` all 404). The cluster's own ops API at `:9925` accepts the same Bearer JWTs but is firewalled (§5); the cluster's `:443` returns 404 for ops calls. |

`scripts/_auth.mjs` exposes both: `createAuthTokens(creds)` for the
JWT pair and `StudioSession` for the cookie-backed control-plane
calls. Every other script in this repo routes through it:

| Caller | Plane | Auth |
|---|---|---|
| `scripts/deploy.mjs` | control + data | session cookie for `deploy_component`, then JWT for the post-restart `/Firm/`,`/Feed` checks |
| `scripts/get_token.mjs` | — | mints + prints a JWT for use with `curl -H "Authorization: Bearer …"` |
| `tests/web_smoke.mjs` | data | JWT in `extraHTTPHeaders` against the deployed cluster |

CI gets the same: `HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD`
are repo secrets, the workflow mints a fresh JWT per run, and the
30-day refresh token isn't stored anywhere.

### Push-deploy from anywhere (`npm run deploy` → Studio proxy)

`scripts/deploy.mjs` packages `harper-app/` into a tarball, base64-
encodes it, logs into Studio over `:443`, and POSTs `deploy_component`
through Studio's operations proxy. Same effect as the CLI below, but
works from datacenter networks where `:9925` is firewalled (this
sandbox, every cloud CI runner I've tried).

```bash
# Reads HARPER_ADMIN_USERNAME / HARPER_ADMIN_PASSWORD from
# ~/.harper-fabric-credentials or env. Tarball excludes node_modules,
# .git, .harperdb, tests/screenshots.
npm run deploy
```

Output on success — restart finishes in ~2 s and `/Feed` is back up:

```
▶ login as cody.swann@gmail.com
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
| 2026-05-02 | AdvisorBook rebrand + Atomic Design refactor (commits `11f13da`, `cd7409c`). First deploy left `/design-system/*` returning 404 because `static.files: 'web/*'` was non-recursive; changed to `web/**` and redeployed. Verified with `tests/parity_compare.mjs`: 9 pages × 18 selector counts = 215 matches, 0 mismatches against local. | OK |
| 2026-05-02 | Re-deploy of `harper-app/` at branch tip (no code delta vs. origin/main). `npm run deploy` from sandbox via Studio proxy. Package 45.7 KB → 60.9 KB base64. Replicated to `oju-us-west1-a-1`. `/Feed` back after 2 s, HTTP 200, count=2. | OK |

Under the hood (handy if you want to replay it by hand):

```js
// 1. session login → cookie jar
fetch('https://fabric.harper.fast/Login/', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email: '<USER>', password: '<PASS>'}),
});

// 2. deploy_component via Studio's cluster-ops proxy
fetch('https://fabric.harper.fast/Cluster/clu-nzeaqmqh1c5zrp9w/operation/', {
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

`.github/workflows/deploy.yml` runs `npm install` → `npm run deploy`
→ `npx playwright install --with-deps chromium` → Playwright smoke
(`tests/web_smoke.mjs`) against the live cluster URL. Required repo
secrets:

| Secret | Source |
|---|---|
| `HARPER_ADMIN_USERNAME` | `cody.swann@gmail.com` |
| `HARPER_ADMIN_PASSWORD` | from `~/.harper-fabric-credentials` |

If the smoke fails, CI uploads `tests/screenshots/` as a
build artifact. The workflow also runs on `workflow_dispatch` so
you can re-deploy without a commit.

> **Don't drop the `npm install` step — symptom: smoke fails with
> `Cannot find module '/opt/node22/lib/node_modules/playwright'`.**
> Root cause: `tests/web_smoke.mjs` `require()`s the `playwright` JS
> module, and `npx playwright install` only fetches the browser
> binary, not the JS package. The CI runner has neither
> `./node_modules/playwright` nor the sandbox's
> `/opt/node22/lib/node_modules/playwright`. Fix: run `npm install`
> before either step. Hit on 2026-05-02 — see `.github/workflows/deploy.yml`.

### From the CLI (only works on a network with :9925 access)

If you're on a residential network that can reach `:9925` directly,
the upstream Harper CLI still works:

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

### What we tried first that did not work

- **Direct `:9925` ops API** from this sandbox / GH Actions runners —
  the cluster firewall returns no response (`curl` exits with code
  000). Use `npm run deploy` (Studio proxy) or operate from a
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
  *"is not a valid symlink"*. `scripts/deploy.mjs` excludes it.

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

### BrokerCheck enrichment

`scripts/fetch_brokercheck.py` populates `Advisor.finraCrd`,
`Firm.finraCrd`, `EmploymentHistory`, `Disclosure`, `Sanction`,
`License`, and `BrokerCheckSnapshot` from the FINRA BrokerCheck JSON
endpoint. It uses the same REST PUT-by-id transport as
`seed_via_rest.py` (the `:9925` ops API is firewalled here too).

Common entry points:

```bash
export HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com

# Backfill CRDs onto every Advisor row that lacks one:
python3 scripts/fetch_brokercheck.py --enrich --max 20

# Add a firm-level Regulatory record card:
python3 scripts/fetch_brokercheck.py --firm-id 19616

# Discover net-new advisors at a known firm:
python3 scripts/fetch_brokercheck.py --firm-roster 47770 --max 50
```

Politeness: 1.5 s ± 0.5 s between requests, exponential backoff on
4xx/5xx (5 s → 15 s → 45 s), `BC_RATE_SECONDS=3` for slower runs.
Resumable via `research/brokercheck-state.json`. ToU constraints
and the full mode reference: `docs/brokercheck-spike.md` §5–§7.

### Smoke-testing the custom JS resources locally

`scripts/preview_feed.mjs` (a.k.a. `npm run preview`) renders the
`Feed` / `*Profile` resources defined in `harper-app/resources.js`
against a locally-running Harper, even when port 9926 isn't
reachable. It pulls every `@export` table out via the ops-API
Unix socket (`~/.harperdb/operations-server`), stubs
`globalThis.tables` and `globalThis.Resource`, then imports
`resources.js` and prints the JSON each resource returns.

```bash
npm run preview                        # /Feed
node scripts/preview_feed.mjs firm    <id>
node scripts/preview_feed.mjs advisor <id>
node scripts/preview_feed.mjs team    <id>
node scripts/preview_feed.mjs article <id>
```

This is purely a local dev aid; the deployed Fabric cluster serves
the same JSON over HTTPS at `/Feed`, `/FirmProfile/<id>`, etc.

### Parity-comparing the deployed cluster to a local dev server

`tests/parity_compare.mjs` (Playwright) fingerprints both bases on
the same set of pages — `/`, `/firms.html`, `/advisors.html`,
`/teams.html`, `/login.html`, plus four profile pages whose IDs
are pulled from `/Feed` — and reports any drift in `<title>`,
navbar logo, count-of-every-meaningful-selector, card title /
subtitle text, or console errors. Brand swaps (logo
`AdvisoryRankings` → `AdvisorBook`) are flagged separately as
allowed deltas; everything else is a mismatch.

```bash
BASELINE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com \
NEW_URL=http://127.0.0.1:8765 \
  node tests/parity_compare.mjs
```

Used to gate the AdvisorBook + Atomic Design refactor deploy on
2026-05-02 — pre-deploy report flagged 5 brand-rebrand deltas
across the 5 static pages and 0 other mismatches; post-deploy
report flagged 0 deltas across 9 pages (5 static + 4 profile)
and 0 mismatches.

---

## 8. Web UI (`web/`)

Plain HTML + vanilla JS + CSS, served by Harper's built-in `static:`
extension. No build step. No framework. The UI is structured as
the **AdvisorBook** Facebook-style activity feed: a centered
column of article cards, with chrome rails and entity rollups on
either side. Components are organized as an Atomic Design library
under `web/design-system/` (tokens / atoms / molecules /
organisms / templates) — see `docs/design-system.md`.

### Pages

| URL | What it shows |
|---|---|
| `/` (`index.html`) | Activity feed of every `Article` ordered by `publishedDate desc`, each card hydrated with the entities it documents. Transition articles render an inline event block (`from-firm → to-firm · AUM · T-12 · headcount · upfront % of T-12`); regulatory articles render a stacked-sanctions block (regulator + each sanction as a pill). |
| `/firm.html?id=…` | Firm profile: current advisors, past advisors with reason-for-leaving, current teams, transitions in / out, branches (market → complex → branch), disclosures filed at the firm, coverage. This is the "sticky" view the user asked for — open Wells Fargo and you get the live roster, alumni, and the two teams that came / went. |
| `/advisor.html?id=…` | Advisor profile: career timeline (each `EmploymentHistory` row, terminated-for-cause flag if any), teams, disclosures with sanction pills, OBAs, registration applications, transitions, coverage. |
| `/team.html?id=…` | Team profile: current and past members ordered by role (lead first), `TeamMetricSnapshot` history as a small table, transitions, coverage. |
| `/article.html?id=…` | Single-article view: same event blocks as the feed card + the article body + the `FieldAssertion` provenance table. |
| `/firms.html`, `/advisors.html`, `/teams.html` | Plain directory pages (alphabetical), driven by the auto-generated `/<TableName>/` REST routes. |

### How the joins happen

The richer pages would otherwise require ~10 client-side fetches
each. Instead, the browser hits **one** custom resource per page,
defined in `resources.js`:

| Browser fetches | Resource | Joins it does server-side |
|---|---|---|
| `GET /Feed` | `Feed` | Articles + per-target mention tables + `TransitionEvent` (with deal) + `Disclosure` (with sanctions) + advisor / firm / team chips. |
| `GET /ArticleView/<id>` | `ArticleView` | Same as `/Feed` for one article, plus body + `FieldAssertion` rows. |
| `GET /FirmProfile/<id>` | `FirmProfile` | Employments → advisors, current vs. past; teams; transitions in / out; branches; disclosures at firm; mention articles. |
| `GET /AdvisorProfile/<id>` | `AdvisorProfile` | Career walk + teams + disclosures + sanctions + OBAs + reg apps + transitions + mention articles. |
| `GET /TeamProfile/<id>` | `TeamProfile` | Memberships current/past, snapshots, transitions, mention articles. |

The classes in `resources.js` extend Harper's globally-injected
`Resource` and use `tables.X.search({})` for the underlying reads.
Updating any page's data shape means editing the matching method
**and** the matching `web/<page>.js` renderer in the same change.

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
`npm run preview` (a.k.a. `node scripts/preview_feed.mjs`); it
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
  works, and `scripts/verify_via_rest.py` already does this for
  the Python verifier. But re-implementing the joins in JS for
  five pages would mean two parallel implementations to keep in
  sync. Server-side custom resources collapse that to one
  implementation in one language, at the cost of making the
  resources.js file the central place to change when the schema
  changes.

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

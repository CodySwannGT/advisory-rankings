# Harper application

The advisor schema running on Harper (formerly HarperDB).

## Files

| File | Purpose |
|---|---|
| `config.yaml` | Component config — points Harper at `*.graphql` for the schema, enables REST, loads `resources.js` as a `jsResource`, and serves `web/*` as a static site. |
| `schema.graphql` | 34 entity types (`@table @export`) translated from `docs/advisor-schema.md`. PKs, indexes, timestamp directives. |
| `resources.js` | Custom JS resources that join across ~10 tables per request and back the web UI: `/Feed`, `/ArticleView/<idOrSlug>`, `/FirmProfile/<idOrSlug>`, `/AdvisorProfile/<idOrSlug>`, `/TeamProfile/<idOrSlug>` (all four accept a slug or the underlying UUID), the cursor-paginated lists `/PublicAdvisors?cursor=…&limit=…` and `/FirmAdvisors/<idOrSlug>?status=current\|past&cursor=…&limit=…`, and `/Search?q=…` for the navbar global search box. Also hosts the page-router resources (`firms`, `advisors`, `teams`, `articles`, `login`) that serve the matching HTML shell at the corresponding clean URL. |
| `web/` | AdvisorBook static SPA (vanilla JS modules — no build step). The HTML files are thin shells served by the page-router resources in `resources.js` at clean paths: `/` (home feed), `/articles/<slug>`, `/firms/<slug>`, `/advisors/<slug>`, `/teams/<slug>`, `/firms`, `/advisors`, `/teams` (directories), `/login`. URL parsing + path-builder helpers live in `web/router.js` (`firmPath` / `advisorPath` / `teamPath` / `articlePath`) — pages must use those instead of hand-rolling hrefs. UI is composed from the Atomic Design library under `web/design-system/` (tokens / atoms / molecules / organisms / templates) — see `docs/design-system.md`. `app.css` / `app.js` hold page-level styles and non-UI utilities (network, auth, formatters). |
| `seed.py` | Loads sample data from the two scraped articles (`research/articles/`) — 99 records across 23 tables. |
| `verify.py` | Cross-table SQL queries that exercise the relationships (career walks, disclosure clusters, sanction stacks, provenance log). |

## How to run (clean machine)

```bash
npm install --save harperdb
HDB_ROOT=$HOME/.harperdb \
TC_AGREEMENT=yes \
HDB_ADMIN_USERNAME=admin HDB_ADMIN_PASSWORD=admin-local \
  ./node_modules/.bin/harperdb install

ln -sfn "$PWD/harper-app" "$HOME/.harperdb/components/advisor-app"
./node_modules/.bin/harperdb start

# Talk to the operations API on port 9925:
curl -u admin:admin-local -H 'Content-Type: application/json' \
  -d '{"operation":"describe_all"}' http://127.0.0.1:9925/

python3 harper-app/seed.py
python3 harper-app/verify.py
```

Once the server is up:

- **REST** routes auto-generated for every `@export`-ed type at
  `http://127.0.0.1:9926/<TableName>/`.
- **Custom resources** at `http://127.0.0.1:9926/Feed`,
  `/ArticleView/<id>`, `/FirmProfile/<id>`, `/AdvisorProfile/<id>`,
  `/TeamProfile/<id>`, `/Search?q=…` (registered by `resources.js`).
  `/Search` is what powers the navbar search box: case-insensitive
  name match across firms / advisors / teams, returns
  `{ q, items: [{ kind, id, name, sub, score }], counts }`.
  Query strings under 2 characters short-circuit to an empty list.
- **Paginated lists**:
  - `/PublicAdvisors?cursor=…&limit=50` — directory page.
    Returns `{ items, nextCursor, total }`. `nextCursor` is null on the
    last page; round-trip the value you got.
  - `/FirmAdvisors/<firmId>?status=current|past&cursor=…&limit=50` —
    advisor lists per firm. Returns `{ items, nextCursor }`. Status
    defaults to `current`.
  Default `limit` is 50, max 100. Cursor is opaque base64url.
- **Web UI** served at `http://127.0.0.1:9926/` from `web/index.html`.

## Sandbox / container caveat

Harper uses [`node-unix-socket`](https://www.npmjs.com/package/node-unix-socket)
for `SO_REUSEPORT`-based load balancing across worker threads. Some
container kernels (this one included) reject those socket options with
`EAFNOSUPPORT`, which surfaces as `"Unable to bind to port 9925"`.

Workaround applied here:

1. **`threads.count: 1`** in `~/.harperdb/harperdb-config.yaml` — drops
   the multi-thread reuseport requirement.
2. Disabled the MQTT listeners (1883 / 8883) for the same reason — we
   don't use MQTT.
3. Talk to the operations API via the **Unix domain socket** Harper
   creates at `/home/user/.harperdb/operations-server`. It exposes the
   same JSON API as port 9925; `seed.py` and `verify.py` use
   `curl --unix-socket` for this.

The HTTP listener for REST + the static web UI (port 9926) has **no
Unix-socket fallback** in 4.7.x — the listener simply doesn't bind
on this kernel. To exercise the `Feed` / `*Profile` resources
locally without TCP, run `npm run preview` (a.k.a.
`node scripts/preview_feed.mjs`) — it pulls every `@export` table
out via the ops-API socket, stubs `globalThis.tables`, and runs
the resource methods directly. Browser preview of `web/index.html`
requires a host where TCP 9926 binds (any normal VM, or the Fabric
cluster's :443 endpoint).

On a normal host or VM the TCP ports work fine and the workaround is
unnecessary.

## What the verification confirms

- All 34 tables from the schema were created with correct PK + attribute
  shape (run `describe_all`).
- A four-firm career walk for C. James Taylor reconstructs from
  `EmploymentHistory` joined to `Firm`, ordered by start date.
- The `TeamMetricSnapshot` table holds two AUM points for the Taylor
  Group (2023 Barron's profile = $1.2B, 2026 AdvisorHub = $5.94B) — the
  snapshots-only metric model in action.
- The Wells Fargo `RecruitingDealQuote` (275% T-12 upfront) joins
  cleanly to the `TransitionEvent`.
- The Cairnes disclosure cluster reconstructs all five parallel events
  (FINRA AWC + Texas state board + arbitration award + customer dispute
  + U5 employment separation) via `cluster_id`.
- Three `Sanction` rows stack on the FINRA AWC (fine + suspension + TX
  bar).
- The `FieldAssertion` provenance log exposes the literal quote that
  asserted each fact, joined back to the source `Article`.

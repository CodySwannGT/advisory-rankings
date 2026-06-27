# Harper application

The advisor schema running on Harper (formerly HarperDB).

## Files

| File | Purpose |
|---|---|
| `config.yaml` | Component config — points Harper at `*.graphql` for the schema, enables REST, loads `resources.js` as a `jsResource`, registers root-path clean URL and favicon Fastify routes, and serves `web/**` as a static site. |
| `schema.graphql` | 35 entity types (`@table @export`) translated from `docs/advisor-schema.md`. PKs, indexes, timestamp directives. |
| `resources.js` | Generated custom JS resources compiled from `src/harper/resources.ts`. They join across ~10 tables per request and back the web UI: `/Feed`, `/ArticleView/<id>`, `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/AdvisorComparison?ids=<id>,<id>`, `/TeamProfile/<id>`, `/RecruitingMarket`, `/RecruitingDealDataGaps?firm=…&state=…&year=…&direction=…&gapType=…&unresolved=…&cursor=…&limit=…`, `/SourceArticleTriage?category=…&reason=…&cursor=…&limit=…`, `/RankingsExplorer`, `/AdvisorResearchQueue?sourceType=…&staleDays=…&status=…&missingField=…&limit=…`, `/InvestorProofPacket`, scoped correction GET/POST routes at `/AdvisorCorrectionRequest` and `/AdvisorCorrectionRequest/<id>`, the cursor-paginated lists `/PublicAdvisors?cursor=…&limit=…`, `/PublicFirms?cursor=…&limit=…`, `/PublicTeams?cursor=…&limit=…`, `/PublicBranches?cursor=…&limit=…`, and `/FirmAdvisors/<id>?status=current\|past&cursor=…&limit=…`, `/Search?q=…` for the navbar global search box, and public MCP POST `/mcp`. The `/branches` shell renders `PublicBranches` rows with URL-backed firm/location/gap/source/level/advisor-count filters and coverage-state copy. The `/recruiting/deal-gaps` shell renders public incomplete recruiting move rows from `/RecruitingDealDataGaps` with shareable filters and public follow-up links. The `/research/freshness` shell renders the public-safe `AdvisorResearchQueue` rows, syncs queue filters through the browser URL, shows returned-slice priority shortcuts, and keeps advisor rows compact for operator scans. The `/source-triage` shell renders public article extraction-gap rows from `/SourceArticleTriage` without private analyst/user state. `/InvestorProofPacket` composes public-safe coverage, freshness, feed, firm, rankings, and recruiting proof with explicit unavailable states. The four detail resources (`/ArticleView/<id>`, `/FirmProfile/<id>`, `/AdvisorProfile/<id>`, `/TeamProfile/<id>`) content-negotiate: a browser **document** navigation (HTML `Accept`) is served the matching app shell so an invalid id renders the in-app not-found UI instead of raw JSON, while the SPA's own `Accept: application/json` data fetch still receives the JSON payload (see `src/harper/detail-shell-negotiation.ts`). |
| `branches/`, `firms/`, `advisors/`, `teams/`, `articles/`, `data-coverage/`, `investor-proof/`, `recruiting/`, `recruiting-deal-gaps/`, `recruiting-shortlist/`, `research-freshness/`, `source-triage-route/`, `rankings/`, `regulatory/`, `corrections/`, `compare/`, `report-packet/`, `seo_shell.js` | Fastify route shells for SEO-friendly URLs. `/branches`, `/firms`, `/advisors`, `/teams`, `/coverage`, `/investor-proof`, `/recruiting`, `/recruiting/deal-gaps`, `/recruiting/shortlist`, `/research/freshness`, `/source-triage`, `/rankings`, `/regulatory`, `/corrections`, `/compare`, and `/report-packet` serve page HTML; `/recruiting/deal-gaps` also has `web/recruiting/deal-gaps.html` so Harper's static `.html` fallback can serve the nested route on Fabric nodes that do not honor nested Fastify routes. `/source-triage` uses the non-conflicting `source-triage-route/` module name so Harper does not treat the clean URL as a static-directory request. `/branches` renders the branch explorer shell backed by `PublicBranches`, and `/firms/<slug>-<id>`, `/advisors/<slug>-<id>`, `/teams/<slug>-<id>`, and `/articles/<slug>-<id>` serve the matching detail shell. Unknown document routes fall back to `web/404.html` so users get the app shell and recovery actions instead of plain text. |
| `web/` | AdvisorBook static SPA. HTML/CSS are tracked here; browser `.js` modules are generated from `src/web/**/*.ts` by `bun run build`, including the `not-found.js` module used by `404.html`. UI is composed from the Atomic Design library under `src/web/design-system/` and emitted to `web/design-system/` — see `docs/design-system.md`. |
| `lib/` | Generated mirror of `dist/lib/`. The harper component imports a small number of shared helpers (today: `advisor-tokens.js` for the `/PublicAdvisors?q=` + `/Search` token query) via `./lib/...` after the build rewrites the `../lib/...` imports tsc emits. Gitignored; recreated on every `bun run build`. See `docs/fabric-runbook.md` § "Shared TypeScript helpers under `harper-app/lib/`". |

## How to run (clean machine)

```bash
bun install
HDB_ROOT=$HOME/.harperdb \
TC_AGREEMENT=yes \
HDB_ADMIN_USERNAME=admin HDB_ADMIN_PASSWORD=admin-local \
  ./node_modules/.bin/harperdb install

ln -sfn "$PWD/harper-app" "$HOME/.harperdb/components/advisor-app"
bun run build
./node_modules/.bin/harperdb start

# Talk to the operations API on port 9925:
curl -u admin:admin-local -H 'Content-Type: application/json' \
  -d '{"operation":"describe_all"}' http://127.0.0.1:9925/

bun run seed
bun run verify
```

Once the server is up:

- **REST** routes auto-generated for every `@export`-ed type at
  `http://127.0.0.1:9926/<TableName>/`.
- **Custom resources** at `http://127.0.0.1:9926/Feed`,
  `/ArticleView/<id>`, `/FirmProfile/<id>`, `/AdvisorProfile/<id>`,
  `/AdvisorComparison?ids=<id>,<id>`, `/TeamProfile/<id>`,
  `/RecruitingMarket`, `/RecruitingDealDataGaps`, `/SourceArticleTriage`,
  `/DataCoverage`, `/RankingsExplorer`, `/AdvisorResearchQueue`,
  `/InvestorProofPacket`, `/AdvisorCorrectionRequest`,
  `/AdvisorCorrectionRequest/<id>`, `/Search?q=…` (registered by
  `resources.js`).
  `/DataCoverage` is the public JSON payload behind `/coverage`: it returns
  aggregate entity counts, rankings/recruiting gaps, research freshness,
  source-table context, public-resource provenance, and limitations without
  exposing private user rows or secrets.
  `/RecruitingDealDataGaps` derives public gap-bearing move rows from
  `/RecruitingMarket`, supports firm/state/year/direction/gapType/unresolved
  filters plus cursor pagination, and returns missing-field labels and public
  article/profile/recruiting links for source-backed follow-up.
  `/SourceArticleTriage` accepts `category`, `reason`, `cursor`, and `limit`,
  then returns public source articles with extraction-gap reason tokens, public
  source/ArticleView links, entity/event counts, and body/provenance state.
  Reviewer replay for the current deployed source-triage slice uses:
  `GET /SourceArticleTriage?category=unknown&reason=no-event-cards&limit=10`,
  then opens `/source-triage?category=unknown&reason=no-event-cards&limit=10`
  on desktop and mobile, and finally checks the sample ArticleView rows
  `dd893ee1-92ff-5b63-9e45-c39d63c50904` and
  `a5550239-6c67-5289-937d-6669653cc0da` for the expected missing event cards,
  missing body, and provenance/entity counts.
  `/AdvisorResearchQueue` accepts `sourceType`, `staleDays`, `status`,
  `missingField`, and `limit`, then echoes normalized filters plus summary
  counts and priority-group filter mappings. `/research/freshness` exposes the
  same filter set in the public web UI; priority shortcuts update the URL and
  reload the resource without a full-page navigation.
  `/InvestorProofPacket` composes DataCoverage, AdvisorResearchQueue, feed,
  firm, rankings, and recruiting proof into public-safe packet data. Missing
  proof remains explicit as unavailable/limitation copy rather than zero-filled
  claims.
  `/AdvisorCorrectionRequest` requires a signed-in user and stores proposed
  advisor profile corrections as review rows without mutating source-backed
  profile facts. Analyst sessions can also GET `/AdvisorCorrectionRequest` to
  list pending requests for `/corrections`; `/AdvisorCorrectionRequest/<id>`
  reads or reviews one row.
  `/Search` is what powers the navbar search box: case-insensitive
  name match across firms / advisors / teams, returns
  `{ q, items: [{ kind, id, name, sub, score }], counts }`.
  Query strings under 2 characters short-circuit to an empty list.
- **MCP transport** at `http://127.0.0.1:9926/mcp` locally and
  `https://advisory-rankings-de.cody-swann-org.harperfabric.com/mcp` on
  Fabric accepts unauthenticated Streamable HTTP JSON-RPC POST requests.
  Harper maps resource export names directly to routes, so this is
  implemented as a lowercase `mcp` JS resource class. The server is
  intentionally read-only and exposes no raw table, write, admin, or
  credential surface.

  Supported MCP methods are `initialize`, `tools/list`, `tools/call`,
  `resources/templates/list`, and `resources/read`. Curated tools are
  `search_advisorbook`, `get_feed`, `get_advisor_profile`,
  `get_firm_profile`, `get_team_profile`, and `get_article`. Resource
  templates are `advisorbook://feed`, `advisorbook://advisor/{id}`,
  `advisorbook://firm/{id}`, `advisorbook://team/{id}`, and
  `advisorbook://article/{id}`.

  Remote MCP clients can use the root `server.json` manifest or add a
  Streamable HTTP server pointing at the Fabric `/mcp` URL above; no
  headers, variables, secrets, or auth tokens are required. For Inspector
  verification, run `npx -y @modelcontextprotocol/inspector`, select
  Streamable HTTP, connect to the local or Fabric `/mcp` URL, then confirm
  the Tools and Resources tabs list the curated surfaces above. The full
  local/dev procedure and negative capability check live in
  `docs/mcp-inspector-verification.md`.
- **Paginated lists**:
  - `/PublicAdvisors?cursor=…&limit=50` — advisor directory page.
    Returns `{ items, nextCursor, total }`. Supported filters are `q`
    (advisor name substring), `firm` (current firm id or name substring),
    `careerStatus` (exact `Advisor.career_status` value), and `hasCrd`
    (`true`/`false`, also accepting `1`/`0` and `yes`/`no`).
  - `/PublicFirms?cursor=…&limit=50` — firm directory page. Returns
    `{ items, nextCursor, total }`. Supported filters are `q` (firm name
    substring), `channel` (exact `Firm.channel` value), `state` (exact
    `Firm.hq_state` value), and `active` (`true` for firms without a
    `dissolved_year`, `false` for dissolved firms). `status=active` and
    `status=dissolved|inactive` are accepted aliases for `active`.
  - `/PublicTeams?cursor=…&limit=50` — team directory page. Returns
    `{ items, nextCursor, total }`. Supported filters are `q` (team name
    substring), `firm` (current firm id or name substring), and
    `serviceModel` (exact `Team.service_model` value).
  - `/PublicBranches?cursor=…&limit=50` — branch directory page. Returns
    `{ items, nextCursor, total }` with firm name, location, public source
    labels, coverage status, gap group, and current advisor count. Raw source
    reference strings remain withheld from anonymous branch rows. Gap groups are
    `loaded`, `partial`, `unavailable`, `zero-advisor`, and `missing-source`.
    Supported filters are `q` (branch name/building/address/location
    substring), `firm` (firm id or name substring), `state` (exact state),
    `city`/`market` (location substring), `gapGroup` (exact public gap group),
    `sourceType` (exact linked employment source type), `level` (exact
    `Branch.level`), and `minAdvisorCount` (non-negative integer).
  - `/FirmAdvisors/<firmId>?status=current|past&cursor=…&limit=50` —
    advisor lists per firm. Returns `{ items, nextCursor }`. Status
    defaults to `current`.
  Default `limit` is 50, max 100. Cursor is opaque base64url; clients
  should round-trip the `nextCursor` value they received. Directory
  `total` is the filtered total, so it stays stable while walking cursor
  pages for the same filter set.
- **Web UI** served at `http://127.0.0.1:9926/` from `web/index.html`.
  Directories are also available at `/firms`, `/advisors`, and `/teams`;
  the coverage dashboard is available at `/coverage`; the recruiting explorer
  is available at `/recruiting`; the recruiting shortlist brief is available
  at `/recruiting/shortlist?firm=<name>&firm=<name>`; the rankings explorer is
  available at `/rankings`; the compliance page is available at `/regulatory`; advisor
  comparison links are available at
  `/compare?ids=<advisorId>,<advisorId>` and the report packet route
  is available at `/report-packet?ids=<advisorId>,<advisorId>`;
  profile pages use `/firms/<slug>-<id>`, `/advisors/<slug>-<id>`, and
  `/teams/<slug>-<id>`. Article detail pages use
  `/articles/<slug>-<id>`.

## Deployed coverage replay

Reviewers can verify the public data coverage dashboard from dev without
local Harper credentials:

```bash
BASE_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com

curl -fsS "$BASE_URL/DataCoverage" \
  | jq '{generatedAt, sectionIds: [.sections[].id], limitationCount: (.limitations | length), provenance}'
```

The expected section ids are `public-entity-groups`, `rankings`,
`recruiting`, `research-freshness`, and `source-context`. Source limitations
in that response describe aggregate public-source gaps; they are not private
rows and should be referenced as caveats when reviewing `/coverage`.

Capture browser evidence with Playwright:

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
   same JSON API as port 9925; `bun run seed`, `bun run verify`, and
   `bun run preview` use the TypeScript Harper client for this.

The HTTP listener for REST + the static web UI (port 9926) has **no
Unix-socket fallback** in 4.7.x — the listener simply doesn't bind
on this kernel. To exercise the `Feed` / `*Profile` resources
locally without TCP, run `bun run preview` (a.k.a.
`node dist/scripts/preview_feed.js` after `bun run build`) — it
pulls every `@export` table out via the ops-API socket, stubs
`globalThis.tables`, and runs the resource methods directly. Browser
preview of `web/index.html`
requires a host where TCP 9926 binds (any normal VM, or the Fabric
cluster's :443 endpoint).

On a normal host or VM the TCP ports work fine and the workaround is
unnecessary.

## What the verification confirms

- All 35 tables from the schema were created with correct PK + attribute
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

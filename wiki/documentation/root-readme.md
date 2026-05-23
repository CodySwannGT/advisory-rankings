# advisory-rankings

A data schema for US wealth-management financial advisors, sourced
from AdvisorHub.com coverage and running on Harper.

> **Deploying to Harper Fabric?**
> - [`docs/deploy-to-harper-fabric.md`](docs/deploy-to-harper-fabric.md)
>   — the *plan*: signup, cluster creation, push/pull deploy in theory.
> - [`docs/fabric-runbook.md`](docs/fabric-runbook.md) — the *log*:
>   what actually happened deploying `advisory-rankings-dev`,
>   including every workaround (SSH deploy keys, the `fabric-deploy`
>   branch, the `:9925` firewall escape hatch via REST PUT/GET).
>   Read this if you need to operate the running cluster.

## Quick start

Requires Bun >= 1.3.11 and Node >= 22.21.1. This repo is managed by
Lisa's `harper-fabric` project type and intentionally uses Bun.

```bash
bun run bootstrap     # install deps, install Harper, link the component, start
bun run build         # compile TypeScript and generate Harper/browser JS
bun run typecheck     # TypeScript compiler check
bun run test          # Vitest suite
bun run test:cov      # Vitest coverage report
bun run seed          # load 99 records from the two scraped articles
bun run verify        # run cross-table SQL queries
bun run scrape:morgan-stanley -- --max-advisors 25
                     # dry-run Morgan Stanley locator import
bun run scrape:morgan-stanley -- --write --max-advisors 500
                     # upsert via Fabric using env/Keychain credentials
bun run research:advisors -- due --max 5 --stale-days 30
                     # pick advisors due for public-web research
bun run media:backfill -- --target firms --max 10
                     # find missing firm logo/advisor headshot URLs
bun run firms:merge-aliases
                     # dry-run curated firm alias merges and duplicate report
bun run firms:merge-aliases -- --write
                     # rewrite canonical firm IDs and remove merged aliases
bun run preview       # render the /Feed JSON locally (sandbox-friendly)
bun run dev:server    # serve harper-app/web/ + custom resources locally
bun run smoke         # Playwright suite (BASE_URL=… for prod)

bun run stop          # stop Harper
bun run status        # check if it's running
bun run reset         # nuke ~/.harperdb and rebuild from scratch
```

`bootstrap` is idempotent — re-run anytime.

## Deploying

Push-deploy to the Fabric cluster from anywhere — uses Studio's
`:443` proxy, not the firewalled `:9925`:

```bash
bun run deploy        # tar harper-app/ → POST deploy_component → restart
```

`bun run deploy` runs `bun run build` first, so Fabric receives the
generated `harper-app/resources.js` and browser modules produced from
TypeScript rather than stale checked-in JavaScript. It reads
`HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD` from env first,
then macOS Keychain services `advisory-rankings-harper-username` and
`advisory-rankings-harper-password`, then
`~/.harper-fabric-credentials` (chmod 600). Auto-deploy on
merge to `main` runs through the Lisa-style release stage first so
`package.json` is version-bumped, then runs the same deploy script via
`.github/workflows/deploy.yml` and gates the release on the Playwright
smoke against the live cluster URL.

For ad-hoc data-plane calls, use the Harper-native JWT:

```bash
TOKEN=$(bun run --silent token)
curl -H "Authorization: Bearer $TOKEN" \
     https://advisory-rankings-de.cody-swann-org.harperfabric.com/Feed
```

`docs/fabric-runbook.md` §6 has the full auth model: native JWT
(`create_authentication_tokens`) for the data plane and Studio
session cookie for the Fabric control plane. The auth split is in
`src/scripts/_auth.ts`.

For scripts that write through the Harper operations API (`bun run ingest`,
`bun run load:extractions`, `bun run scrape:morgan-stanley -- --write`),
`HDB_TARGET_URL` is optional. When unset, the repo defaults to the Fabric
dev cluster operations URL derived from `HARPER_CLUSTER_URL` (or the
checked-in dev URL) plus `:9925`. `HDB_ADMIN_USERNAME` and
`HDB_ADMIN_PASSWORD` are also optional when the same credentials are
available as `HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD`, in the
macOS Keychain services `advisory-rankings-harper-username` and
`advisory-rankings-harper-password`, or in `~/.harper-fabric-credentials`.

## Web UI — AdvisorBook (Facebook-style activity feed)

The Harper component ships a small static web app branded
**AdvisorBook** under `harper-app/web/`, plus aggregating JS
resources generated at `harper-app/resources.js`. Together they render an
AdvisorHub activity feed where each post embeds the entities it
documents:

- Home feed (`index.html`) — every article as a Facebook-style card.
  Transition articles render an inline "from-firm → to-firm · AUM ·
  T-12 · headcount · upfront % of T-12" event block; disclosure
  articles render the regulator + stacked sanctions. Mentioned
  advisors / firms / teams appear as clickable chips.
- Firm profile (`/firms/<slug>-<id>`, with `firm.html?id=…` still
  supported) — current advisors, past advisors
  (with terminated-for-cause flag), current teams, transitions in /
  out, branches (market → complex → branch), disclosures filed
  while advisors were at the firm, and coverage. The advisor lists
  are cursor-paginated (50/page) via `/FirmAdvisors/<id>` so a firm
  with thousands of seats stays responsive.
- Advisor profile (`/advisors/<slug>-<id>`, with `advisor.html?id=…`
  still supported) — career timeline (every
  EmploymentHistory firm with start/end dates and reason for
  leaving), teams, disclosures with sanction pills, OBAs,
  registration applications, transitions, and coverage.
- Team profile (`/teams/<slug>-<id>`, with `team.html?id=…` still
  supported) — current and past members,
  metric snapshots over time, transitions, coverage.
- Article detail (`/articles/<slug>-<id>`, with `article.html?id=…`
  still supported) — full body + the same event blocks as the feed
  card + the FieldAssertion provenance table (which quotes from the
  article asserted which value).

Once Harper is running, visit `http://127.0.0.1:9926/` (or the
Fabric cluster's REST domain). On a kernel that can't bind the
9926 TCP listener (this sandbox), use `bun run preview` to see
the same JSON the UI would consume. See the runbook §6 for the
deployed-cluster URL.

The UI is built as an **Atomic Design system** (tokens -> atoms ->
molecules → organisms → templates) under
`src/web/design-system/` and emitted to
`harper-app/web/design-system/`. Every page is composed from
that library; nothing inlines markup. Read `docs/design-system.md`
before touching any UI — `AGENTS.md` / `CLAUDE.md` requires you to look up
existing components first and to add new ones to the library
rather than to a page file.

## Repo layout

```
docs/
  advisor-schema.md            conceptual entity model + field tables
  data-model-decisions.md      Postgres-flavored DDL resolutions
                               (polymorphic FKs, hierarchies, snapshots,
                               provenance log, …)
  deploy-to-harper-fabric.md   account creation, cluster setup, push/pull
                               deployment, prod checklist
  design-system.md             AdvisorBook UI design system (Atomic
                               Design — tokens, atoms, molecules,
                               organisms, templates). Read before
                               touching anything visual.
  fabric-runbook.md            ops log: cluster, schema reloads, every
                               workaround, every failed alternative
  firm-source-adapters.md      reusable contract, CLI flags, fixture
                               layout, and docs checklist for public
                               firm advisor-locator imports
  brokercheck-spike.md         feasibility study for adding FINRA
                               BrokerCheck as a regulator-of-record
                               source alongside AdvisorHub (research,
                               not yet implemented)

harper-app/
  config.yaml                Harper component config (graphqlSchema +
                             rest + jsResource + Fastify clean routes +
                             static web/)
  schema.graphql             37 entity types as GraphQL SDL with
                             @table @export directives
  resources.js               generated custom JS resources backing the UI:
                             /Feed, /ArticleView/<id>, /FirmProfile/<id>,
                             /AdvisorProfile/<id>, /TeamProfile/<id>,
                             cursor-paginated /PublicAdvisors and
                             /FirmAdvisors/<id> (?status&cursor&limit),
                             plus /Search?q=… for the navbar search box
  firms/ advisors/ teams/    Fastify route shells for /firms,
  articles/ seo_shell.js     /advisors, /teams, /articles, and slug URLs
  web/                       static AdvisorBook UI served at /.
                             HTML and CSS are tracked; .js browser
                             modules are generated from src/web/:
                               index.html / index.js   feed home
                               article.html / .js      /articles/<slug>-<id>
                               firm.html / .js         /firms/<slug>-<id>
                               advisor.html / .js      /advisors/<slug>-<id>
                               team.html / .js         /teams/<slug>-<id>
                               firms/advisors/teams.html
                                                       directories at
                                                       /firms, /advisors,
                                                       /teams
                               login.html / .js        sign-in form
                               app.css                 page styles
                               app.js                  network, auth,
                                                       formatters, +
                                                       back-compat
                                                       re-exports
                               design-system/          Atomic Design
                                 tokens.css            colors, spacing,
                                                       radius, type
                                 components.css        atom CSS (.ab-*)
                                 dom.js                el / $ / clear
                                 atoms.js              Button, Avatar,
                                                       Tag, Skeleton, …
                                 molecules.js          EntityChip,
                                                       EntityRow, KvList,
                                                       PostHeader, …
                                 organisms.js          Card, SectionCard,
                                                       Navbar, ProfileHead,
                                                       FeedPostCard,
                                                       TransitionEventCard,
                                                       DisclosureEventCard,
                                                       CareerTimeline, …
                                 templates.js          mountThreeColumnPage,
                                                       mountFullWidthPage,
                                                       mountCenteredNarrowPage
                                 index.js              barrel export —
                                                       pages import here
  README.md                  Harper-specific notes (incl. sandbox
                             SO_REUSEPORT workaround)

research/
  articles/                  the two AdvisorHub articles fetched in
                             full before Cloudflare blocked the
                             sandbox IP — used as ground truth
  extracted.jsonl            sample output of the field extractor
  brokercheck-samples/       captured FINRA BrokerCheck JSON
                             responses backing docs/brokercheck-spike.md
  README.md                  how to repopulate from a non-blocked IP

src/
  build/build.ts             copies compiled Harper/browser JS into
                             harper-app/ for deploy
  data/seed-data.json        canonical 101-record seed fixture
  harper/resources.ts        TypeScript source for Harper custom
                             resources
  lib/                       shared IDs, Harper clients, BrokerCheck
                             parser/loader/client helpers
  scripts/                   TypeScript sources for seed, verify,
                             deploy, crawlers, ingest, BrokerCheck,
                             media backfill, firm alias merges, Morgan
                             Stanley locator scraping, advisor research
                             queues, token, preview, and dev server
                             commands
  web/                       TypeScript source for AdvisorBook pages
                             and design-system modules

scripts/
  bootstrap.sh               clone-and-run installer

tests/
  *.test.ts                  Vitest unit/characterization coverage:
                             IDs, seed fixture counts, BrokerCheck
                             parser/loader, resource pagination
  web_smoke.ts               end-to-end Playwright smoke (feed,
                             firm, advisor, team, article, login,
                             mobile drawer).
  brokercheck_web_smoke.ts   targeted Playwright smoke for the
                             BrokerCheck UI (CRD badge, attribution
                             footer, ToU link, regulatory record
                             card). Runs against the deployed cluster.
  parity_compare.ts          deployed-cluster vs local-dev parity.
```

## What's in the database after `bun run seed`

99 records across 23 of the 35 tables, drawn from:

- **Article 1** (advisor team move): Taylor Group, $5.94B AUM,
  Morgan Stanley → Wells Fargo, NYC. Exercises team membership,
  metric snapshots, branch hierarchy (market → complex → branch),
  recruiting deal economics, employer concentration, transition
  events, and per-target article mentions.
- **Article 2** (FINRA disclosure): George J. Cairnes, real-estate
  OBA. Exercises the disclosure cluster (5 parallel events: FINRA
  AWC + Texas state board + arbitration award + customer dispute +
  U5 employment separation), stacked sanctions, outside business
  activity, registration application withdrawal, defunct firm
  (Stanford Financial), and field-assertion provenance.

`bun run verify` reconstructs all of the above with TypeScript checks
joins and prints them.

## Data sources

AdvisorHub article URLs are listed in `research/README.md`. The
WordPress REST API at `https://www.advisorhub.com/wp-json/wp/v2/posts`
is the preferred ingest endpoint — `bun run crawl:wpjson -- --out
research/wpjson` walks every public post type. (Run from a residential
IP; Cloudflare's WAF flags datacenter ASNs. Use `--browser` when the
plain Node fetch path is blocked, and `--since YYYY-MM-DD` for bounded
backfills.)

## License

Internal — not for redistribution.

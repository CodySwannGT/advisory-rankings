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

Requires Node ≥ 18 and Python 3.

```bash
npm run bootstrap     # install deps, install Harper, link the component, start
npm run seed          # load 99 records from the two scraped articles
npm run verify        # run cross-table SQL queries
npm run preview       # render the /Feed JSON locally (sandbox-friendly)
npm run dev:server    # serve harper-app/web/ + custom resources locally
npm run smoke         # Playwright suite (BASE_URL=… for prod)

npm run stop          # stop Harper
npm run status        # check if it's running
npm run reset         # nuke ~/.harperdb and rebuild from scratch
```

`bootstrap` is idempotent — re-run anytime.

## Deploying

Push-deploy to the Fabric cluster from anywhere — uses Studio's
`:443` proxy, not the firewalled `:9925`:

```bash
npm run deploy        # tar harper-app/ → POST deploy_component → restart
```

Reads `HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD` from
`~/.harper-fabric-credentials` (chmod 600) or env. Auto-deploy on
merge to `main` runs the same script via
`.github/workflows/deploy.yml` and gates the merge on the Playwright
smoke against the live cluster URL. See `docs/fabric-runbook.md` §6
for the full request shape and §1 for cluster IDs / URLs.

## Web UI (Facebook-style activity feed)

The Harper component now ships a small static web app under
`harper-app/web/` plus aggregating JS resources in
`harper-app/resources.js`. Together they render an AdvisorHub
activity feed where each post embeds the entities it documents:

- Home feed (`index.html`) — every article as a Facebook-style card.
  Transition articles render an inline "from-firm → to-firm · AUM ·
  T-12 · headcount · upfront % of T-12" event block; disclosure
  articles render the regulator + stacked sanctions. Mentioned
  advisors / firms / teams appear as clickable chips.
- Firm profile (`firm.html?id=…`) — current advisors, past advisors
  (with terminated-for-cause flag), current teams, transitions in /
  out, branches (market → complex → branch), disclosures filed
  while advisors were at the firm, and coverage.
- Advisor profile (`advisor.html?id=…`) — career timeline (every
  EmploymentHistory firm with start/end dates and reason for
  leaving), teams, disclosures with sanction pills, OBAs,
  registration applications, transitions, and coverage.
- Team profile (`team.html?id=…`) — current and past members,
  metric snapshots over time, transitions, coverage.
- Article detail (`article.html?id=…`) — full body + the same
  event blocks as the feed card + the FieldAssertion provenance
  table (which quotes from the article asserted which value).

Once Harper is running, visit `http://127.0.0.1:9926/` (or the
Fabric cluster's REST domain). On a kernel that can't bind the
9926 TCP listener (this sandbox), use `npm run preview` to see
the same JSON the UI would consume. See the runbook §6 for the
deployed-cluster URL.

## Repo layout

```
docs/
  advisor-schema.md            conceptual entity model + field tables
  data-model-decisions.md      Postgres-flavored DDL resolutions
                               (polymorphic FKs, hierarchies, snapshots,
                               provenance log, …)
  deploy-to-harper-fabric.md   account creation, cluster setup, push/pull
                               deployment, prod checklist

harper-app/
  config.yaml                Harper component config (graphqlSchema +
                             rest + jsResource + static web/)
  schema.graphql             34 entity types as GraphQL SDL with
                             @table @export directives
  resources.js               custom JS resources backing the UI:
                             /Feed, /ArticleView/<id>, /FirmProfile/<id>,
                             /AdvisorProfile/<id>, /TeamProfile/<id>
  seed.py                    inserts 99 records from research/articles/
  verify.py                  cross-table SQL queries that exercise
                             the relationships
  web/                       static Facebook-style web UI served at /:
                               index.html / index.js   feed home
                               article.html / .js      article detail
                               firm.html / .js         firm profile
                               advisor.html / .js      advisor profile
                               team.html / .js         team profile
                               firms/advisors/teams.html  directories
                               app.css / app.js        shared CSS + JS
  README.md                  Harper-specific notes (incl. sandbox
                             SO_REUSEPORT workaround)

research/
  articles/                  the two AdvisorHub articles fetched in
                             full before Cloudflare blocked the
                             sandbox IP — used as ground truth
  extracted.jsonl            sample output of the field extractor
  README.md                  how to repopulate from a non-blocked IP

scripts/
  bootstrap.sh               clone-and-run installer
  crawl_via_wpjson.py        polite WordPress REST crawler
                             (preferred ingest path)
  crawl_html.py              curl fallback
  crawl_playwright.py        headless-browser fallback
  extract_fields.py          regex-based field extractor
  preview_feed.mjs           offline render of /Feed et al via the
                             ops-API Unix socket (sandbox-friendly)
```

## What's in the database after `npm run seed`

99 records across 23 of the 34 tables, drawn from:

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

`npm run verify` reconstructs all of the above with cross-table SQL
joins and prints them.

## Data sources

AdvisorHub article URLs are listed in `research/README.md`. The
WordPress REST API at `https://www.advisorhub.com/wp-json/wp/v2/posts`
is the preferred ingest endpoint — `scripts/crawl_via_wpjson.py` walks
every public post type. (Run from a residential IP; Cloudflare's WAF
flags datacenter ASNs.)

## License

Internal — not for redistribution.

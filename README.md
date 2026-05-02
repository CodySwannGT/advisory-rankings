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

npm run stop          # stop Harper
npm run status        # check if it's running
npm run reset         # nuke ~/.harperdb and rebuild from scratch
```

`bootstrap` is idempotent — re-run anytime.

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
  config.yaml                Harper component config
  schema.graphql             34 entity types as GraphQL SDL with
                             @table @export directives
  seed.py                    inserts 99 records from research/articles/
  verify.py                  cross-table SQL queries that exercise
                             the relationships
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

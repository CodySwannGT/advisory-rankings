---
name: "ingest-advisorhub"
description: "Crawl AdvisorHub's WordPress REST API with the repo's Bun/TypeScript scripts and load fresh articles into Harper. Idempotent and safe to re-run; useful for scheduled refreshes, news ingestion, article backfills, recruiting moves, firms, teams, and AdvisorHub content updates."
---

# Ingest AdvisorHub -> Harper

This skill runs the cheap, repeatable AdvisorHub data path:

1. **Crawl** - `bun run crawl:wpjson -- --out research/wpjson` calls
   `src/scripts/crawl_via_wpjson.ts`, walking AdvisorHub's wp-json API
   for `posts`, `recruiting_moves`, `firm`, and `team_bio`.
2. **Ingest** - `bun run ingest` calls `src/scripts/ingest.ts`,
   reads `research/wpjson/**/post_*.json`, derives stable IDs from
   natural keys, and upserts `Article`, `Firm`, `ArticleFirmMention`,
   and candidate `FieldAssertion` rows into Harper.

Both stages are idempotent. Re-running unchanged inputs writes the same
primary keys back through Harper upserts.

## Pre-flight

This repo uses Bun. Read `package.json` first if command names may have
changed.

For local Harper:

```bash
bun run status
```

If Harper is stopped, ask before running `bun run bootstrap`; bootstrap
installs/starts local services and should not be hidden inside this skill.

For deployed Harper, set:

```bash
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com
HDB_ADMIN_USERNAME=...
HDB_ADMIN_PASSWORD=...
```

`src/lib/harper.ts` uses `HDB_TARGET_URL` when present. If it is not
set, it defaults to `HARPER_CLUSTER_URL` (or this repo's Fabric dev URL)
with `:9925` for the operations API. Credentials resolve from
`HDB_ADMIN_USERNAME` / `HDB_ADMIN_PASSWORD`, then
`HARPER_ADMIN_USERNAME` / `HARPER_ADMIN_PASSWORD`, then the macOS
Keychain services `advisory-rankings-harper-username` and
`advisory-rankings-harper-password`, then `~/.harper-fabric-credentials`.
Do not report missing REST credentials just because the `HDB_*`
environment variables are unset; check the default/Keychain path first.

## Crawl

For an interactive refresh or first corpus build:

```bash
bun run crawl:wpjson -- --out research/wpjson
```

Useful flags:

- `--max-pages N` - cap pages per post type. Use this for scheduled
  news refreshes so each run only checks recent pages.
- `--per-page N` - records per page, default `100`.
- `--sleep S` - seconds between page requests, default `6`.
- `--max-requests N` - hard cap across all post types.

For a timer/Automation, prefer a recent, polite crawl:

```bash
bun run crawl:wpjson -- --out research/wpjson --max-pages 3 --per-page 100 --sleep 6
```

Do not schedule full archive crawls unless the user explicitly asks and
the network/IP is appropriate. AdvisorHub may block datacenter egress;
if a run stops on HTTP errors, report the block and let the next run
resume normally.

## Ingest

After crawl:

```bash
bun run ingest
```

Optional smoke limit:

```bash
bun run ingest -- --limit 25
```

## Confirm

Run a non-destructive verification command:

```bash
bun run verify
```

For deployed Harper over REST, use:

```bash
bun run verify:rest
```

Report:

- crawl pages/requests fetched and whether AdvisorHub blocked the run
- ingest upsert counts per table
- final headline row counts when verification is available
- any missing Harper credentials or runtime blockers

## Idempotency

| Layer | Mechanism |
|---|---|
| Crawler files | `research/wpjson/<type>/post_<wpId>.json` is keyed by WordPress ID. |
| IDs | `src/lib/ids.ts` derives UUIDv5 IDs from article URLs, firm names, and other natural keys. |
| Harper writes | `src/lib/harper.ts` writes with `upsert`, not insert. |
| Re-runs | Same input produces same IDs and updates the same rows. |

## What this skill does not do

- Wipe or reset data. Only `bun run reset` does that, and it is
  destructive.
- Perform rich prose extraction of advisors, teams, transitions, or
  disclosures. Use `extract-advisorhub-articles` after crawling when
  richer entities are needed.
- Crawl BrokerCheck. Use `upsert-advisor` or the BrokerCheck scripts
  documented in `docs/brokercheck-spike.md`.

---
name: "ingest-advisorhub"
description: "Crawl AdvisorHub's WordPress REST API and load fresh articles into the local Harper database. Idempotent \u2014 safe to re-run anytime; cached pages skip and existing rows upsert under the same primary keys. Use when the user wants to \"ingest\", \"scrape\", \"crawl\", \"refresh\", \"update\", \"pull\", or \"load\" advisor data, articles, recruiting moves, or AdvisorHub content."
---

# Ingest AdvisorHub → Harper

This skill runs the two-stage data pipeline:

1. **Crawl** — `scripts/crawl_via_wpjson.py` walks the WordPress REST API
   (`/wp-json/wp/v2/posts`, `recruiting_moves`, `firm`, `team_bio`, …) and
   saves every record as JSON under `research/wpjson/<type>/post_<id>.json`.
   Pages already on disk are skipped, so re-runs only fetch what's new.

2. **Ingest** — `scripts/ingest.py` reads the saved JSON, derives stable
   UUIDs from natural keys (article URL, firm canonical name), and
   **upserts** into Harper. Every record's primary key is deterministic, so
   re-running an unchanged input is a no-op.

Both stages are independently idempotent. The full pipeline is too.

## Steps to follow when this skill is invoked

### 0. Pre-flight

Make sure Harper is up:

```bash
npm run status
```

If the output says `status: stopped` or the command errors, bootstrap first:

```bash
npm run bootstrap
```

Bootstrap is itself idempotent — it'll skip work that's already done.

### 1. Crawl

Default polite settings — 6s mean sleep, ±50% jitter, circuit-breaker after
3 consecutive errors:

```bash
python3 scripts/crawl_via_wpjson.py --out research/wpjson
```

Useful flags the user might ask for:
- `--max-pages N` — cap pages per post type (default 200; lower for dev)
- `--per-page N` — records per page (default 50)
- `--types posts recruiting_moves firm` — restrict which post types to crawl
- `--max-requests N` — hard cap on total HTTP requests
- `--sleep S --jitter J` — tune pacing

If the run aborts with `[stop] hit N consecutive errors`, the egress IP has
likely been WAF-flagged. **Wait at least an hour and re-run** — cached pages
will skip, so resume is free.

### 2. Ingest

```bash
python3 scripts/ingest.py
```

Reads `research/wpjson/**/post_*.json` and `research/articles/*.wpjson.json`
(the manually-saved sample articles), upserts into Harper. Optional flags:

- `--wpjson-dir PATH` — override input dir
- `--limit N` — process at most N posts (useful for smoke tests)

### 3. Confirm

Run the verification queries to spot-check that the new data joined cleanly:

```bash
npm run verify
```

Or check raw row counts:

```bash
python3 -c "
import base64, json, subprocess, os
SOCKET = os.path.expanduser('~/.harperdb') + '/operations-server'
auth = base64.b64encode(b'admin:admin-local').decode()
def sql(q):
    r = subprocess.run(['curl','-sS','--unix-socket',SOCKET,'-m','10',
        '-H','Content-Type: application/json',
        '-H',f'Authorization: Basic {auth}',
        '-d',json.dumps({'operation':'sql','sql':q}),
        'http://localhost/'], capture_output=True, text=True)
    return json.loads(r.stdout)
for t in ['Article','Firm','ArticleFirmMention','FieldAssertion']:
    print(f'  {t:25s} {sql(f\"SELECT COUNT(*) AS n FROM data.{t}\")[0][\"n\"]}')
"
```

## How idempotency works at every layer

| Layer | Idempotency mechanism |
|---|---|
| Crawler | Each `_page_NNN.json` cached on first fetch. Second run re-uses the file. |
| Crawler post files | Saved as `post_<wpId>.json` keyed on the WordPress integer ID — same post = same filename = overwrite. |
| ID derivation | `scripts/_ids.py` derives UUIDv5 from natural keys (article URL, firm canonical name). Same input → same UUID. Used by both `seed.py` and `ingest.py` so they share PKs. |
| Harper writes | Both scripts use the `upsert` operation, which inserts or replaces by primary key — never produces duplicates. |
| Resume on block | Circuit breaker aborts the crawler after 3 consecutive non-200s. Resume by simply re-running. |

## What to report back to the user

After the pipeline runs, summarize:
- How many post files the crawler fetched on this run (vs. how many cached)
- How many articles / firms / mentions / field-assertions the ingest touched
- Final row counts in the headline tables (Article, Firm, FieldAssertion)
- If a circuit-breaker tripped, mention the suggested wait-and-retry

Keep the report under 6 lines unless the user asks for detail.

## Common follow-up requests this skill should NOT do

- **Bootstrap from scratch** — the user must invoke that explicitly
  (`npm run bootstrap`). The skill assumes Harper is already installed.
- **Wipe and reseed** — only `npm run reset` does that and it's destructive.
- **Rich entity extraction** (advisor names, AUM, recruiting deals from
  prose) — the current ingest only does Article + firm-mentions +
  regex-derivable FieldAssertions. Higher-fidelity extraction belongs in a
  separate LLM-based phase, which is not this skill.

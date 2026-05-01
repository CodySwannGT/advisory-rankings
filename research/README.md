# Research artefacts

Source material for the schema in `docs/advisor-schema.md`.

## `articles/`

Two AdvisorHub articles fetched in full before Cloudflare's WAF blocked the
sandbox's egress IP. These are ground-truth for the schema design.

| File | Story shape | Key data points |
|---|---|---|
| `01-taylor-group-wells-fargo.html` | Advisor team move (Recruiting Wire) | Team name, lead w/ middle initial, 8 advisors + 10 support staff, $5.94B AUM, $18.6M revenue, branch building, branch manager, market leader, 16-year tenure, 3-firm career history with registration year per firm, "275% of T-12" recruiting deal, employer concentration (Nvidia) |
| `02-cairnes-finra-disclosure.wpjson.json` | FINRA regulatory disclosure | Full wp-json record. 5 parallel disclosure events (FINRA AWC, U5 termination, state board order, FINRA arbitration award, pending customer dispute). FINRA Rule 3270 + 2010 violations. OBA via LLC. Multi-firm career trail incl. defunct Stanford Financial. |
| `00-recent-posts-listing.json` | wp-json index sample | Demonstrates pagination format + per-post field shape |

## `wpjson/` (created by `scripts/crawl_via_wpjson.py`)

One JSON file per AdvisorHub post. Mirrors the wp-json `/wp/v2/posts` schema:

- `posts/post_<id>.json` — main news feed (advisor moves, regulatory, etc.)
- `recruiting_moves/post_<id>.json` — structured Recruiting Wire records
- `firm/post_<id>.json` — firm profile pages
- `team_bio/post_<id>.json` — bios (small set)
- `_categories.json`, `_tags.json` — taxonomy lookup tables

## `html/` (created by `scripts/crawl_html.py` or `crawl_playwright.py`)

Raw HTML for pages where wp-json is incomplete (e.g., the static rankings
landing pages, recruiting deal aggregations).

## How to repopulate from your own machine

```bash
# wp-json (preferred — full structured content, ~1 req/sec is polite)
python3 scripts/crawl_via_wpjson.py --out research/wpjson --max-pages 60

# Optional: extract field candidates from saved articles
python3 scripts/extract_fields.py --out research/extracted.jsonl
```

The Cloudflare WAF that blocked this sandbox is keyed on egress IP
reputation. From a residential / non-datacenter IP the wp-json endpoint
allows steady polling.

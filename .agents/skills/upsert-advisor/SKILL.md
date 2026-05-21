---
name: "upsert-advisor"
description: "Idempotently create or update one financial advisor in Harper using FINRA BrokerCheck, saved AdvisorHub articles, and targeted public web research. Required input is the advisor's legal name; optional disambiguators include CRD, current firm, state, career-start year, or a phrase like \"James Taylor at Wells Fargo in NYC\". Uses the repo's Bun/TypeScript scripts and deterministic upserts."
---

# Upsert One Advisor -> Harper

This skill takes one advisor and writes sourced, deterministic Harper
data: `Advisor`, employment history, disclosures, sanctions, licenses,
outside business activities, team memberships, article mentions, and
field assertions.

It composes existing repo paths:

```text
1. BrokerCheck search/fetch
   bun run brokercheck -- --search-name "<legal name>" --max 10 --dry-run
   bun run brokercheck -- --crd <CRD>

2. AdvisorHub coverage
   search research/wpjson/ and research/articles/
   write research/extractions/<wpId>.json
   bun run load:extractions

3. Targeted public web research
   add only quoted, source-backed soft fields

4. Verify
   bun run verify or bun run verify:rest
```

BrokerCheck wins on regulatory facts. AdvisorHub wins on narrative and
non-regulatory metrics. Web research fills only fields supported by a
quote or reliable source URL.

## Pre-flight

Use Bun and current scripts from `package.json`:

```bash
bun run build
bun run status
```

If local Harper is stopped, ask before `bun run bootstrap`. For
deployed Harper, set:

```bash
HDB_TARGET_URL=https://advisory-rankings-de.cody-swann-org.harperfabric.com
HDB_ADMIN_USERNAME=...
HDB_ADMIN_PASSWORD=...
```

`src/lib/harper.ts` uses `HDB_TARGET_URL` when present; otherwise it
falls back to the local Harper operations socket.

## Parse Input

Required:

- legal name exactly as it appears in regulatory/source material

Useful disambiguators:

- CRD
- current or previous firm
- state
- career-start year
- first employer

If the input is ambiguous, show the parsed target and ask before
writing regulatory data.

## Resolve CRD

Skip this if the user provided a CRD.

```bash
bun run brokercheck -- --search-name "<legal name>" --max 10 --dry-run
```

Inspect the returned `_source` blocks:

- `ind_source_id` - CRD
- `ind_firstname`, `ind_lastname`, `ind_middle_name`
- `ind_other_names[]`
- current and previous employment firm names
- `ind_bc_scope`

Choose a CRD only when one candidate clearly matches the user's
disambiguators. If zero or multiple candidates survive, stop and ask
the user with a numbered list containing name, CRD, firms, state/scope
when available. Never guess on regulatory identity.

## Pull BrokerCheck

```bash
bun run brokercheck -- --crd <CRD>
```

This calls `src/scripts/fetch_brokercheck.ts` and writes through:

- `Advisor`
- `BrokerCheckSnapshot`
- `EmploymentHistory`
- `Firm`
- `Disclosure`
- `Sanction`
- `License`

The state file `research/brokercheck-state.json` skips CRDs fetched in
the last 7 days. Use `--force` only when the user explicitly asks for a
fresh pull.

For existing rows missing CRDs, use:

```bash
bun run brokercheck -- --enrich --max 20
```

For firm/roster crawl work, use the orchestrator documented in
`docs/brokercheck-spike.md`:

```bash
bun run brokercheck:crawl -- --max-per-firm 50 --max-runtime-seconds 7200
```

Do not parallelize BrokerCheck fetches. The client rate limits requests
and the state file makes repeated runs resumable.

## Walk AdvisorHub Coverage

Search saved article JSON for the advisor's legal name, last name, and
BrokerCheck AKAs:

```bash
rg -l -i "<legal name>|<last name>|<aka>" research/wpjson research/articles
```

If `research/wpjson/` is empty or thin, run `ingest-advisorhub` first.

For each matching wpId, follow `extract-advisorhub-articles`:

```bash
bun run build
node dist/scripts/extract_helper.js show <wpId>
```

Read the article, write `research/extractions/<wpId>.json`, then load:

```bash
bun run load:extractions -- --wpid <wpId>
```

Use the same legal name as the BrokerCheck row. If loading creates a new
advisor instead of matching the BrokerCheck-backed row, fix the
extraction natural key before continuing.

## Targeted Web Research

For missing soft fields, run one or two targeted web searches:

- `"<legal name>" "<current firm>" advisor bio`
- `"<legal name>" CFP CFA designation`
- `"<legal name>" Barron's "top advisors"`
- `"<legal name>" "<current firm>" team`
- `"<legal name>" site:linkedin.com/in`

Fetch only high-signal sources such as firm bios, public ranking pages,
or press releases. Do not scrape LinkedIn pages; use snippets only for a
profile URL.

Write only facts with traceable source text. For every fact:

- keep the exact source phrase or URL-backed phrase
- write a `FieldAssertion`
- use deterministic IDs from `src/lib/ids.ts`
- upsert through Harper, never insert ad hoc

If a fact is not source-backed, leave it blank.

## Data Conventions

- `Advisor.preferredName` is the first-name form only, not the full
  display name. Example: `James` for `C. James Taylor`.
- BrokerCheck disclosures/sanctions should not be overwritten by
  AdvisorHub prose. Keep press claims as `FieldAssertion` provenance
  when they disagree with regulator data.
- Use `sourceType: "brokercheck"` for regulator facts and preserve
  BrokerCheck "as of" attribution through `BrokerCheckSnapshot`.

## Verify

Run the normal join checks:

```bash
bun run verify
```

Against deployed Harper:

```bash
bun run verify:rest
```

For a focused local SQL spot-check, build and call the shared SQL helper
from `src/lib/harper.ts` in a short Node one-liner or temporary script;
do not resurrect the old Python `_harper.py` helpers.

Report:

- name and resolved CRD
- BrokerCheck rows loaded or skipped
- AdvisorHub articles processed and mentions loaded
- soft fields added from web research
- ambiguous matches, skipped sources, or access failures

## Idempotency

| Layer | Mechanism |
|---|---|
| BrokerCheck fetch | `research/brokercheck-state.json` skips recent CRDs unless `--force` is used. |
| IDs | `src/lib/ids.ts` uses UUIDv5 natural keys. |
| Harper writes | `src/lib/harper.ts` uses upsert operations. |
| Extraction files | `extract_helper` skips files already present in `research/extractions/` or `.loaded/`. |
| Re-runs | Same source data resolves to the same IDs and updates existing rows. |

## Automation Guidance

Use this skill for targeted advisor refresh Automations, not broad
archive crawling. A safe recurring prompt should cap work, for example:

- run `bun run build`
- run `bun run brokercheck -- --enrich --max 20`
- search saved AdvisorHub articles for newly enriched advisors only if
  context allows
- load any completed extractions
- run `bun run verify` or `bun run verify:rest`
- report counts and ambiguities

For broad news ingestion, use `ingest-advisorhub`. For small batches of
article prose, use `extract-advisorhub-articles`. For multi-day roster
crawls, use `bun run brokercheck:crawl` with explicit caps and runtime
limits.

For scheduled public-web research, use the durable queue:

```bash
bun run research:advisors -- due --max 5 --stale-days 30 --json
bun run research:advisors -- record --advisor-id <id> --status no_new_data
```

Search only the due advisors, apply the `upsert-advisor` public-web
research rules, write source-backed facts with `FieldAssertion`, then
record `success`, `no_new_data`, `ambiguous`, or `failed` so the next
scheduled run can move on.

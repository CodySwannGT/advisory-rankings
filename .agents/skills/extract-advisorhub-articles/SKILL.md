---
name: "extract-advisorhub-articles"
description: "Extract structured advisor data from saved AdvisorHub wp-json articles and load it into Harper using the repo's Bun/TypeScript helper and loader scripts. Use for richer entities than regex ingest: advisors, firms, teams, transitions, disclosures, sanctions, employment histories, OBAs, and field assertions. Safe to re-run because pending detection and loader IDs are deterministic."
---

# Extract AdvisorHub Articles -> Harper

This is the rich-extraction phase that runs after
`ingest-advisorhub` has populated `research/wpjson/`.

Pipeline:

```text
research/wpjson/**/post_*.json
  -> Codex reads article prose and writes research/extractions/<wpId>.json
  -> bun run load:extractions
  -> Harper upserts Article, Advisor, Firm, Team, Disclosure, etc.
  -> loaded files move to research/extractions/.loaded/
```

Extraction JSON files are runtime artifacts and are gitignored.

## Pre-flight

Use Bun:

```bash
bun run build
bun run status
```

If Harper is stopped, ask before `bun run bootstrap`. If
`research/wpjson/` is empty, run `ingest-advisorhub` first.

For deployed Harper, set `HDB_TARGET_URL`, `HDB_ADMIN_USERNAME`, and
`HDB_ADMIN_PASSWORD`; otherwise the loader uses the local Harper socket.

## Find Pending Articles

```bash
bun run build
node dist/scripts/extract_helper.js find-pending
```

The output is tab-separated:

```text
<wpId> <source-file> research/extractions/<wpId>.json
```

For a timer/Automation, process a capped batch. A good default is 10
articles per run; use 20 only when articles are short and context is
comfortable.

## Extract Each Article

Show an article:

```bash
node dist/scripts/extract_helper.js show <wpId>
```

Before writing the first extraction in a batch, read:

- `.agents/skills/extract-advisorhub-articles/schema-guide.md`
- `.agents/skills/extract-advisorhub-articles/examples.md`

Write the result to:

```text
research/extractions/<wpId>.json
```

Rules:

- Every entity must have a `natural_key`.
- Every factual field must have a matching `field_assertions` entry.
- Every assertion quote must appear in the article text.
- Use `confidence: "asserted"` for verbatim facts, `"inferred"` for
  facts derived from prose, and `"derived"` for computed values.
- Cross-references use natural-key fields such as
  `advisor_legal_name`, `firm_canonical_name`, `team_name`, and
  `disclosure_local_key`; do not invent UUIDs in extraction JSON.
- If an article has no extractable people/firms/events, mark
  `article.has_extractable_content: false` and keep entity arrays empty.

## Load

Load all pending extraction files:

```bash
bun run load:extractions
```

Load one article:

```bash
bun run load:extractions -- --wpid <wpId>
```

Dry-run:

```bash
bun run load:extractions -- --dry-run
```

The loader resolves deterministic IDs via `src/lib/ids.ts`, upserts
through `src/lib/harper.ts`, and moves successfully loaded files to
`research/extractions/.loaded/`.

## Confirm

```bash
bun run verify
```

or, against deployed Harper:

```bash
bun run verify:rest
```

Report:

- number of pending articles found and extracted
- loader summary per table
- articles skipped as non-extractable
- validation issues, ambiguous identity matches, or Harper access failures

## Automation Guidance

For a recurring Codex Automation, use a prompt that:

- builds first with `bun run build`
- runs `node dist/scripts/extract_helper.js find-pending`
- processes at most 10 pending articles
- loads with `bun run load:extractions`
- verifies with `bun run verify` or `bun run verify:rest`
- reports concise table counts and skipped articles

Do not schedule this as an unlimited loop; rich extraction consumes
agent context and should advance in small batches.

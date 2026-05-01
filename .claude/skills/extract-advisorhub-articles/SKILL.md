---
name: extract-advisorhub-articles
description: Extract structured advisor data (advisors, firms, teams, transition events, disclosures, sanctions) from AdvisorHub article prose and load it into Harper. The Claude session does the extraction inline (no API calls); two helper Python scripts handle the file diff and the database load. Idempotent — safe to re-run; the resolver matches existing entities by name + employment overlap rather than blindly creating duplicates. Use when the user wants to "extract", "parse", "structure", "harvest", "process", or "enrich" AdvisorHub articles, or when they want richer entity data than the regex-only `ingest-advisorhub` skill produces.
---

# Extract AdvisorHub articles → Harper

This skill is the rich-extraction phase. It reads the saved WordPress
posts, asks **you** (the Claude running this session) to read each
article and produce a structured JSON document, then runs a
deterministic Python loader that resolves entities against Harper and
upserts.

`ingest-advisorhub` is the cheap regex-only path. This skill is its
upgrade.

## Pipeline

```
   Article body (prose)
        │
        │  (you read it; you produce JSON
        │   matching schema-guide.md)
        ▼
   research/extractions/<wpId>.json
        │
        │  scripts/load_extractions.py
        │  (resolver + upserts, idempotent)
        ▼
   Harper (Article, Advisor, Firm, Team, …)
        │
        ▼
   research/extractions/.loaded/<wpId>.json
```

## Steps to follow when this skill is invoked

### 0. Pre-flight

Make sure Harper is up and the wpjson corpus exists:

```bash
npm run status
```

If Harper isn't running, ask the user whether to bootstrap. (`npm run
bootstrap` will install/start it.)

If `research/wpjson/` is empty, the user probably hasn't crawled yet —
suggest the `/ingest-advisorhub` skill first to populate the corpus,
then come back here.

### 1. Find pending articles

```bash
python3 scripts/extract_helper.py find-pending
```

That lists articles with a saved wpjson record but no extraction file
yet. Output is human-readable; for scripting use
`--format tsv`.

If nothing's pending, you're done — report that and stop.

### 2. Decide a batch size

You can comfortably handle **about 20–30 articles per session** before
context gets tight (article body ≈ 2K tokens × N + the schema
overhead). Pick a number; if there are more than ~30 pending, do
a batch and tell the user to re-invoke for the rest.

### 3. For each article in the batch

For each pending wpId:

#### 3a. Read the article body

```bash
python3 scripts/extract_helper.py show <wpId>
```

That prints title, URL, publication date, and body text. Read it.

#### 3b. Extract entities into JSON

Read [`schema-guide.md`](./schema-guide.md) once at the start of the
batch — it defines the output document shape.

Read [`examples.md`](./examples.md) once — it contains worked examples
you should pattern-match against.

For each article, write the extraction to:

```
research/extractions/<wpId>.json
```

**Rules of the road**:

- Every fact you put in `fields` must be supported by an exact phrase
  from the article body. Put that phrase in a `field_assertions` entry
  with the corresponding `field`, `quote`, and `confidence`.
- If you cannot find a quote for a fact, **don't include the fact**.
- Use `confidence: "inferred"` when you've derived a value (e.g., year
  of registration → `industryStartDate`); `"derived"` for computed
  values (e.g., `yearsExperience` from start date); `"asserted"` for
  verbatim values.
- For an opinion piece or editorial with no extractable entities, set
  `article.has_extractable_content: false` and emit empty arrays for
  every entity type (or just the `article` block + that flag).

#### 3c. Quick self-check before moving on

Before writing the file, sanity-check:
- Every entity has a `natural_key` block.
- Every `field_assertions` entry's `quote` substring actually appears
  in the article body.
- Cross-references between entities use the natural-key fields
  (`advisor_legal_name`, `firm_canonical_name`, `team_name`,
  `disclosure_local_key`) — NOT UUIDs (those are assigned by the
  loader).

### 4. Load

Once all extraction files for the batch exist:

```bash
python3 scripts/load_extractions.py
```

Or for a single article:

```bash
python3 scripts/load_extractions.py --wpid <wpId>
```

The loader resolves IDs against Harper (matching existing advisors by
name + employment overlap, existing firms by canonical name, existing
disclosures by `(advisor, type, date)`), then upserts. On success it
moves the extraction file to `research/extractions/.loaded/`.

### 5. Spot-check & report

After loading, run a couple of sanity queries:

```bash
npm run verify
```

…then report to the user (≤ 6 lines):

- How many articles were extracted in this batch.
- Resolver outcomes from the loader's stats line, e.g.,
  `advisor_matched=4 advisor_minted=2 firm_matched=8 firm_minted=1`.
  A high `*_matched` ratio is good — it means the resolver is
  recognising existing entities instead of creating duplicates.
- Any articles that were skipped (no extractable content, or hit a
  validation issue).

## How idempotency works at every layer

| Layer | Mechanism |
|---|---|
| File diff | `extract_helper.py` skips any wpId that already has an extraction file or a `.loaded/` file. |
| Resolver | Always queries Harper first — `CRD > exact name + employment overlap > fuzzy > new`. New entities are minted from a deterministic natural-key UUID, so re-extracting the same article produces the same UUID. |
| Loader writes | Every Harper write is `upsert`, never `insert`. |
| File lifecycle | After successful load, the extraction file moves to `.loaded/`. To re-load, move it back. |

## What this skill does NOT do

- **Crawl new articles** — that's `/ingest-advisorhub`. Run that first
  if there's nothing in `research/wpjson/`.
- **Override existing data** beyond an `upsert` — if seed.py loaded a
  Cairnes advisor and the resolver matches him, his row gets
  overwritten with the new fields, but his ID and dependent rows stay
  intact.
- **Resolve fuzzy name matches automatically when there are multiple
  candidates.** The resolver only auto-merges on (1) an exact CRD
  match, (2) a single name candidate, or (3) a name + firm-history
  overlap. Anything else mints a new ID; the user can manually merge
  later if needed.
- **Process more than ~30 articles in one session.** Tell the user to
  re-invoke for additional batches.

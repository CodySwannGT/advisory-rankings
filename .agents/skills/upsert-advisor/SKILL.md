---
name: "upsert-advisor"
description: "Idempotently create or update one financial advisor in Harper using FINRA BrokerCheck and AdvisorHub as primary sources, then enrich with deep web research (firm bio, Barron's, ranking lists, press). Required input is the advisor's legal name; optional disambiguators (CRD, current firm, state, career-start year, \"James Taylor at Wells Fargo in NYC\") narrow the BrokerCheck match. Re-running with the same name is safe \u2014 every write is a deterministic upsert. Use when the user wants to \"add\", \"create\", \"import\", \"load\", \"research\", \"look up\", \"enrich\", \"refresh\", or \"update\" a single advisor by name."
---

# Upsert one advisor → Harper

This skill takes one advisor (a name plus optional hints) and produces
a complete, sourced Advisor row in Harper, plus every related entity
the public record supports: employment history, disclosures,
sanctions, licenses, OBAs, registration applications, team
memberships, transition events, article mentions, and field
assertions.

It composes the three existing data paths instead of duplicating them:

```
   ┌──────────────────────── name (+ optional hints) ──────────────────────┐
   │                                                                      │
   ▼                                                                      │
1. BrokerCheck name search ──► single CRD?  ──no──► ask user / pick best ─┘
   │                                  │
   │                                  yes
   ▼                                  ▼
2. fetch_brokercheck.py --crd <CRD>   → Advisor, EmploymentHistory,
   (regulator-of-record fields)         Disclosure, Sanction, License,
                                        BrokerCheckSnapshot, Firm

3. AdvisorHub coverage walk           → Article, ArticleAdvisorMention,
   (extraction skill on each hit)       Team, TransitionEvent,
                                        RecruitingDealQuote,
                                        TeamMetricSnapshot,
                                        EmployerConcentration,
                                        OutsideBusinessActivity,
                                        FieldAssertion

4. Deep web research                  → bio fields (firstName, gender,
   (firm bio, Barron's, press)          birthYear, designations,
                                        education, headshotUrl,
                                        linkedinUrl, businessEmail/phone,
                                        FieldAssertion provenance)

5. Verify + report
```

BrokerCheck wins on regulatory facts (disclosures, sanctions, U5,
exam history). AdvisorHub wins on narrative and non-regulatory
metrics (AUM, T-12, recruiting deal terms, team composition). Deep
research fills the soft fields neither structured source publishes
and *must* cite a quote in `FieldAssertion` for every fact it
contributes — otherwise it doesn't get written.

## Steps to follow when this skill is invoked

### 0. Pre-flight

Make sure Harper is up:

```bash
npm run status
```

If it's stopped, ask the user whether to bootstrap (`npm run
bootstrap`). Don't auto-bootstrap — that's a destructive-ish step
on a fresh box.

Required env for the BrokerCheck and extraction loaders:

```
HDB_TARGET_URL              e.g. https://...harperfabric.com
HDB_ADMIN_USERNAME          (or HARPER_ADMIN_USERNAME)
HDB_ADMIN_PASSWORD          (or HARPER_ADMIN_PASSWORD)
```

If the user only gave you a local dev cluster, `_harper.py` falls
back to the operations Unix socket — no env needed.

### 1. Parse the user's input

Required:

- **Legal name** — the full name as it would appear on a U4
  ("George J. Cairnes", "C. James Taylor"). Don't strip middle
  initials.

Optional disambiguators (use whichever the user provides):

- **CRD** — if given, skip step 2 entirely and jump to step 3.
- **Current or last firm** — narrows ambiguous name matches
  ("James Taylor at Wells Fargo").
- **State** — 2-letter, fed straight to BrokerCheck's
  `?state=` filter.
- **Career-start year** — used to break ties when BrokerCheck
  returns multiple same-name hits.
- **First employer** — same purpose; matches the `first_employer`
  natural-key field used by the extraction loader.

Echo what you parsed back to the user in one line, e.g.
`"upserting C. James Taylor (current firm: Wells Fargo Advisors,
state: NY) — confirm or correct"`. Wait for confirmation only if
the parse is ambiguous; otherwise proceed.

### 2. Resolve the CRD (BrokerCheck name search)

Skip if the user already gave a CRD.

```bash
python3 scripts/fetch_brokercheck.py --search-name "<legal name>" --max 10 --dry-run
```

Read stderr for the candidate list. The search returns at most
`--max` `_source` blocks; what you want from each is:

- `ind_source_id` — the CRD
- `ind_firstname`, `ind_lastname`, `ind_middle_name`
- `ind_other_names[]` — AKAs / suffixes
- `ind_current_employments_firm_name[]` and
  `ind_previous_employments_firm_name[]` — career trail
- `ind_bc_scope` — `ACTIVE` / `InActive`

Pick the single best match using the user's disambiguators, in
this order:

1. **Firm overlap** — the user's hinted firm appears in the
   candidate's current or previous employments.
2. **State** — registered state matches.
3. **Career-start year** — `daysInIndustry` (from the detail
   record) puts the start within ±1 year of the hint.
4. **First employer** — first item of
   `ind_previous_employments_firm_name[]` matches.

If exactly one candidate survives those filters, use its CRD. If
zero or more than one survives, **stop and ask the user** — print
the candidates as a numbered list with name, CRD, current firm,
state, scope. Don't guess on regulatory data. (The existing
`--enrich` mode bails on ambiguity for the same reason — see
`scripts/fetch_brokercheck.py:160-204`.)

### 3. Pull BrokerCheck (regulator-of-record)

```bash
python3 scripts/fetch_brokercheck.py --crd <CRD>
```

That single command writes:

- `Advisor` (or upserts the existing row matched by `crd:<CRD>` UUIDv5)
- `BrokerCheckSnapshot` (one row, `fetchedAt` = now, satisfies
  the FINRA ToU "as of <date>" requirement)
- `EmploymentHistory` rows, one per real tenure (BD + IA
  registrations at the same firm whose date ranges overlap or sit
  within ~90 days are folded by `_dedupe_employments` so the loader
  writes one row per job, not one row per scope — see
  `tests/brokercheck_parse_test.py::test_dedupe_employments_*`)
- `Firm` rows for any firm mentioned in employments (resolved by
  `firmId` from BrokerCheck)
- `Disclosure` rows with `sourceType: "brokercheck"` and
  `sourceRef: "brokercheck:<CRD>:<docket>"`
- `Sanction` rows under each disclosure
- `License` rows for every exam in `stateExamCategory`,
  `productExamCategory`, `principalExamCategory` plus
  state-registration rows from `registeredStates`

Skip if `--force` isn't passed and the state file says we fetched
this CRD < 7 days ago. That's the right default for repeated
runs; pass `--force` when the user explicitly asks for a fresh
pull (e.g., "I just saw a new disclosure post"). Read
`docs/brokercheck-spike.md` §7 if you need to operate the scraper
in any non-default mode.

Note: BrokerCheck is the *regulator-of-record*. Do NOT have the
extraction step in §4 overwrite a Disclosure or Sanction that
came from BrokerCheck. The loader handles this correctly — both
write through the same `(advisor, type, date, docket)` UUID, and
on collision the resolver keeps the BrokerCheck-sourced row's
provenance fields. But it's worth knowing if you see seemingly-
"missing" extraction writes downstream.

### 4. Walk AdvisorHub coverage

Find every wpjson record that mentions the advisor by name:

```bash
grep -lFi "<legal name>" research/wpjson/*/post_*.json research/articles/*.wpjson.json 2>/dev/null
```

Also try the bare last name and any AKAs (`ind_other_names[]`
from the BrokerCheck search) — articles often use a middle-name
form ("James Taylor" vs. "C. James Taylor"). De-dupe by wpId.

For each matching wpId, follow the **extract-advisorhub-articles**
skill's article loop verbatim:

1. `python3 scripts/extract_helper.py show <wpId>` — read it.
2. Read
   `.agents/skills/extract-advisorhub-articles/schema-guide.md`
   and `examples.md` once at the start of the batch (skip if you
   read them this session already).
3. Write `research/extractions/<wpId>.json` with the structured
   extraction. **Use the same `legal_name` you used in step 2** —
   the resolver matches advisors by `(legal_name, first_employer)`
   plus employment-history overlap, and your BrokerCheck-sourced
   row already has both.
4. After all extractions are written:

   ```bash
   python3 scripts/load_extractions.py
   ```

   Resolver stats with `advisor_matched=N advisor_minted=0` mean
   the loader correctly merged into the BrokerCheck-seeded row;
   any `advisor_minted>0` here is a **bug in your extraction's
   natural_key** — the legal name probably doesn't match the
   BrokerCheck row exactly. Fix and reload before moving on.

If the corpus has zero hits for the advisor's name, that's fine —
say so in the report and move on. AdvisorHub doesn't cover every
broker; absence isn't a failure.

If `research/wpjson/` is empty, suggest `/ingest-advisorhub`
first to populate the corpus, then come back. Don't crawl from
inside this skill — that's a different scope and a different
politeness budget.

### 5. Deep research (the soft fields)

BrokerCheck and AdvisorHub between them don't publish:

- First name vs. preferred name (`Anthony` vs. `Tony`)
- Gender (where self-disclosed)
- Birth year (rare in public sources; often only in regulatory
  filings we don't have access to)
- Headshot URL
- LinkedIn URL
- Public business email / phone
- Education (`institution`, `degree`, `field`, `graduationYear`)
- Designations (`CFP`, `CFA`, `CIMA`, …) with granting body and
  earned date
- **Team affiliation** — the firm's locator usually names the
  practice ("The Ibis Group", "The Smith Wealth Group"). If the
  bio reveals one, mint a `Team` (deterministic id from
  `_ids.team_id(name, current_firm)`) plus a `TeamMembership`
  (`_ids.team_membership_id(team_id, advisor_id)`) and an
  `ArticleTeamMention` so the team chip appears on the
  advisor profile and the source-bio article. Use the
  `currentFirmId` from the Advisor's open `EmploymentHistory`
  row — don't re-derive it from the firm name.
- Outside-of-AdvisorHub press coverage and ranking-list
  appearances

For each missing or thin field on the Advisor row, run **one or
two** targeted searches with the WebSearch tool. Good queries:

- `"<legal name>" "<current firm>" advisor bio`
- `"<legal name>" CFP CFA designation`
- `"<legal name>" Barron's "top advisors"`
- `"<legal name>" site:linkedin.com/in`
- `"<legal name>" "<current firm>" team`

Then WebFetch one or two of the highest-signal results — the
firm's own bio page, a Barron's profile, a verifiable press
release. **Do not fetch LinkedIn** — it's auth-walled and the
scraper will return a login page; resolve LinkedIn URLs from
search snippets only.

**`Advisor.preferredName` convention** — store the **first-name
form** only ("James" for "C. James Taylor", "Steven M." for
"Steven Manson Swann"), NOT the full display form. The UI
helper `advisorDisplayName()` concatenates `preferredName +
lastName`, so writing the full name produces "Steven M. Swann
Swann" on every chip. The renderer is now defensive (it detects
when `preferredName` already ends with `lastName` and skips the
concat), but the convention still wins — keep new data clean.

For each fact you want to write, you must:

1. Have the exact phrase you read it from. If you can't quote the
   source, **don't write the fact**.
2. Write a `FieldAssertion` row with:
   - `targetTable` ∈ `Advisor` | `Designation` | `Education` | …
   - `targetId` — the resolved UUID
   - `fieldName`
   - `assertedValue` — JSON-encoded
   - `quotePhrase` — the verbatim phrase
   - `confidence` — `asserted` / `inferred` / `derived`
   - `articleId` — leave null for non-AdvisorHub provenance, but
     prefix `quotePhrase` with the source URL so the row is still
     traceable: `"[https://example.com/bio] graduated from
     Wharton in 2003"`.

Write this through Harper REST `PUT /Advisor/<id>` (and
`/Designation/`, `/Education/`, `/FieldAssertion/`) using the
same auth `_brokercheck_load.py` uses — re-import that module's
`HarperREST` rather than rolling your own client:

```python
import sys, pathlib
sys.path.insert(0, "scripts")
from _brokercheck_load import HarperREST
from _ids import uid

rest = HarperREST(verbose=True)
rest.put("/Advisor/", {"id": advisor_id, "preferredName": "Tony", ...})
```

Use `_ids.uid("Designation", advisor_id, "CFP")` (or whatever
deterministic key the entity uses — check `scripts/_ids.py`) so
re-running this skill produces the same UUIDs and upserts cleanly.

If a field is genuinely unknown after a couple of searches,
**leave it null**. A `null` field is honest; a confabulated one
poisons every downstream join.

### 6. Verify and report

```bash
npm run verify
```

Then run a focused spot-check on the advisor you just touched:

```bash
python3 -c "
import sys, pathlib
sys.path.insert(0, 'scripts')
from _harper import sql
crd = '<CRD>'
adv = sql(f\"SELECT id, legalName, finraCrd, careerStatus FROM data.Advisor WHERE finraCrd = '{crd}'\")
if not adv: print('NOT FOUND'); sys.exit(1)
aid = adv[0]['id']
for t in ['EmploymentHistory','Disclosure','Sanction','License',
          'TeamMembership','ArticleAdvisorMention','FieldAssertion',
          'Designation','Education','OutsideBusinessActivity']:
    col = 'targetId' if t == 'FieldAssertion' else 'advisorId'
    n = sql(f\"SELECT COUNT(*) AS n FROM data.{t} WHERE {col} = '{aid}'\")[0]['n']
    print(f'  {t:30s} {n}')
"
```

Then report to the user (≤ 8 lines):

- Name + resolved CRD.
- BrokerCheck counts: employments, disclosures, sanctions, licenses.
- AdvisorHub counts: articles processed, mentions added.
- Deep-research counts: designations, education, soft-field
  FieldAssertions added.
- Anything skipped and why (no name match in articles; LinkedIn
  unfetchable; ambiguous CRD that the user resolved manually).

## Idempotency at every layer

| Layer | Mechanism |
|---|---|
| BrokerCheck CRD lookup | Skips CRDs fetched in the last 7 days. `--force` to override. |
| BrokerCheck loader | Every entity ID is `uuid5(NS, "<natural_key>")`. Re-run = same UUIDs = upserts. Verified by `tests/brokercheck_parse_test.py`. |
| AdvisorHub extraction | `extract_helper.py` skips wpIds that already have a `.json` or a `.loaded/<wpId>.json`. To re-extract, move the file out of `.loaded/`. |
| AdvisorHub loader | Resolver: CRD > exact name + employment overlap > fuzzy > new. Once the BrokerCheck row exists, the resolver matches it by name + employment overlap, so re-runs never duplicate the advisor. |
| Deep research | Use `_ids.uid(table, parent_id, key)` so the same fact writes the same UUID. |
| FieldAssertion | Append-only; same `(articleId, targetId, fieldName)` tuple writes the same UUID via `uid("FieldAssertion", articleId, targetId, fieldName)` — confirm in `scripts/_ids.py` before the first write. |

## What this skill does NOT do

- **Crawl new AdvisorHub posts.** That's `/ingest-advisorhub`.
  Run it first if `research/wpjson/` is empty for the advisor's
  name.
- **Cross a politeness budget.** BrokerCheck is rate-limited at
  ≈ 0.7 req/sec by `_brokercheck.py`. Don't add a parallel
  fetcher. WebSearch / WebFetch are similarly metered — keep deep
  research to ≤ 5 queries and ≤ 2 page fetches per advisor.
- **Bypass FINRA ToU.** The `BrokerCheckSnapshot.fetchedAt` you
  just wrote *must* surface in the UI as "Source: FINRA
  BrokerCheck (as of <date>). Terms of use." That's the
  `SourceAttribution` atom under
  `harper-app/web/design-system/atoms.js` — already wired into
  `advisor.js`. If you change advisor-page rendering, keep that
  footer.
- **Resolve ambiguous BrokerCheck hits silently.** Two CRDs with
  the same first/last name = stop and ask. Conflating them
  corrupts disclosures permanently.
- **Reconcile BrokerCheck vs. AdvisorHub disagreements.** When
  the regulator and the trade press disagree on a fact (e.g., the
  Cairnes fine — `$25,000` in AdvisorHub, `$2,500` in
  BrokerCheck), keep both: BrokerCheck as `Disclosure.fields`,
  AdvisorHub as `FieldAssertion` with the article quote.
  `docs/brokercheck-spike.md` §4 has the canonical example.
- **Write LinkedIn-scraped content.** LinkedIn's ToU prohibits
  it. Use search snippets to capture the URL only.

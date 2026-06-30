# BrokerCheck as a complementary source — feasibility spike

Status: **shipped 2026-05-02** (advisory-rankings-dev). Spike →
implementation in one day. Captured below for historical context;
operational details have moved to §7.

This started as a feasibility study; the recommendation is now
implemented end-to-end:

- `harper-app/schema.graphql` — `BrokerCheckSnapshot` table,
  `sourceType` / `sourceRef` columns on `Disclosure` and
  `EmploymentHistory`, `docketNumber` on `Disclosure`. Deployed.
- `src/scripts/fetch_brokercheck.ts` / `bun run brokercheck --` —
  polite, idempotent scraper (≤ 0.7
  req/sec, exponential backoff). Five modes: `--crd`, `--firm-id`,
  `--enrich`, `--firm-roster`, `--search-name`, plus
  `--from-fixture` for offline replay.
- `tests/brokercheck_parse.test.ts` — Vitest coverage for the
  parser, the loader's idempotency contract, and the regression
  that bit us mid-spike (case-insensitive `McGlynn` ↔ `Mcglynn`).
- `src/web/design-system/atoms.ts` — `SourceAttribution` atom
  satisfies the ToU's "identify source, link to ToU, disclose 'as
  of' date" requirements; wired into `advisor.js` and `firm.js`.
- `tests/brokercheck_web_smoke.ts` — Playwright smoke against the
  deployed cluster verifying every UI promise. 18/18 passing on
  `advisory-rankings-de.cody-swann-org.harperfabric.com`.
- Article ingestion now guarantees `Article.publishedDate` before
  writes. If AdvisorHub or extraction payloads omit it, loaders derive
  it from `modifiedDate`, crawler/load timestamps, or the ingest day;
  `bun run backfill:article-dates` repairs older Article rows missing
  the feed sort key.

Live state at ship: 13/17 advisors enriched, 14 BrokerCheckSnapshots,
6 disclosures sourced from BrokerCheck (the Cairnes set), all firms
the seed knew about now have CRDs.

We carry per-advisor / per-firm CRD numbers (`Advisor.finraCrd`,
`Firm.finraCrd`) but populate them only when an AdvisorHub article
happens to print them. The article prose is also where we get
disclosures, employment history, sanctions, and OBAs — none of which
AdvisorHub publishes in a structured form. FINRA's **BrokerCheck**
publishes exactly that data, keyed by CRD, as the regulator of record.

This doc captures the spike that confirmed which doors are open, what
shape the data takes, and how it lines up with our schema.

## 1. Doors evaluated

| Door | Status | Auth | Coverage | Suitable for us? |
|---|---|---|---|---|
| `api.brokercheck.finra.org/search/individual{,/<crd>}` | Undocumented but live; serves the BrokerCheck SPA | None | Full consumer-facing report (employment, disclosures, exams, sanctions, OBAs) | **Yes**, on-demand per CRD with caching, framed as compliance/investor-protection use. Not for bulk crawl. |
| `api.brokercheck.finra.org/search/firm{,/<firm_id>}` | Same shape | None | Full firm report (other names, disclosure counts, registrations, owners w/ CRDs) | **Yes**, on-demand. |
| FINRA Developer Center — Query API, *Public Credential* tier | Official, supported, 10 GB/mo free | API key | Firm Profile, Firm Registrations, Branch List, Industry Snapshot. Equity/fixed-income market data. | **Partial.** Useful for firm-level reference data; does not surface individual disclosures. |
| FINRA Developer Center — `Composite Individual` / `Individual Delta` | Official, supported | **Firm Credential** | Real-time U4-shape data for individuals **affiliated with the requesting firm only** | **No.** We are not a registered FINRA member firm. |
| SEC IAPD / Form ADV bulk + API | Official, supported | None | RIAs (firms + IARs), Form ADV Parts 1 / 2 / 3 | **Yes, complementary** — covers the IA side cleanly with no ToU friction. |
| FINRA commercial bulk-data licence | Per-deal | Paid | Anything, by negotiation | Out of scope until volume justifies it. |

Net: the **undocumented BrokerCheck JSON endpoint plus SEC IAPD**
covers our needs end-to-end without paying. The Developer Center
Public Credential is a backstop for firm-level reference data, not a
substitute. The Composite Individual dataset is *not* available to us.

## 2. Endpoint shapes (what we actually got back)

Probed from this sandbox, no auth, with a polite `User-Agent`:

```
GET https://api.brokercheck.finra.org/search/individual?query=George+J+Cairnes&hl=true&nrows=12&r=25&sort=score+desc&wt=json
GET https://api.brokercheck.finra.org/search/individual/4068906?wt=json
GET https://api.brokercheck.finra.org/search/firm?query=Wells+Fargo+Clearing&hl=true&nrows=5&wt=json
GET https://api.brokercheck.finra.org/search/firm/19616?wt=json
```

Raw responses are checked into `research/brokercheck-samples/` so the
next person can diff against them without re-hitting FINRA.

### Individual detail, top-level keys

```
basicInformation, currentEmployments, currentIAEmployments,
previousEmployments, previousIAEmployments,
disclosureFlag, iaDisclosureFlag, disclosures,
examsCount, stateExamCategory, principalExamCategory, productExamCategory,
registrationCount, registeredStates, registeredSROs,
brokerDetails
```

`disclosures[]` items carry `disclosureType` ∈ {`Regulatory`,
`Customer Dispute`, `Employment Separation After Allegations`,
`Civil`, `Judgment / Lien`, `Criminal`, …}, with `eventDate`,
`disclosureResolution`, and a `disclosureDetail` object whose shape
varies by type — for `Regulatory` events it includes `Initiated By`,
`Allegations`, `Resolution`, and a `SanctionDetails[]` array (fines,
suspensions with start/end dates, etc.).

### Firm detail, top-level keys

```
basicInformation (incl. firmId, bdSECNumber, iaSECNumber, otherNames[]),
firmAddressDetails, iaFirmAddressDetails,
bdDisclosureFlag, iaDisclosureFlag,
disclosures (counts by category),
registrations (states, SROs, business types, branch count),
directOwners (names + CRDs of executives),
affiliateDisclosures
```

The firm record gives us **every prior corporate name** of a firm
(Wells Fargo Clearing's `otherNames` chains back through Wachovia
Securities, First Union Securities, Kemper, Everen, …). That feeds
`FirmSuccession` directly.

## 3. Schema fit (per-field mapping)

| BrokerCheck field | Our table.column | Notes |
|---|---|---|
| `basicInformation.individualId` | `Advisor.finraCrd` | Primary key from FINRA's side. |
| `basicInformation.firstName` / `lastName` / `middleName` / `otherNames[]` | `Advisor.firstName` / `lastName` / `middleName` / (no field) | Add `Advisor.akaNames: [String]`? Track-and-decide. |
| `basicInformation.bcScope` / `iaScope` (`ACTIVE`/`InActive`) | `Advisor.careerStatus` | Map: `ACTIVE`→`active`, `InActive` w/ recent U5→`withdrawn`, etc. Bar/suspension comes from disclosures. |
| `basicInformation.daysInIndustry` (or `daysInIndustryCalculatedDate`) | `Advisor.industryStartDate` (derived) | `industryStartDate = today − days`. |
| `previousEmployments[]` + `currentEmployments[]` | `EmploymentHistory` (one row each) | Direct fit. `firmId` → resolves a `Firm` by FINRA `firmId` (note: distinct from per-individual CRD). `registrationBeginDate` / `registrationEndDate` → `startDate` / `endDate`. `city` / `state` → `Branch` resolution. |
| `disclosures[].disclosureType` | `Disclosure.disclosureType` | Direct enum mapping. |
| `disclosures[].eventDate` | `Disclosure.dateInitiated` | |
| `disclosures[].disclosureDetail.Initiated By` | `Disclosure.regulator` | `FINRA`, `Texas`, `SEC`, … |
| `disclosures[].disclosureDetail.Allegations` | `Disclosure.allegationText` | |
| `disclosures[].disclosureDetail.Resolution` | `Disclosure.status` + `Disclosure.admitDeny` | `Acceptance, Waiver & Consent(AWC)` → status `final`, admitDeny `neither`. |
| `disclosures[].disclosureDetail.SanctionDetails[]` | `Sanction` (one row each) | `Civil and Administrative Penalty` → `sanctionType=fine`. `Suspension` → `sanctionType=suspension` w/ `Duration` parsed to months. `Bar` → `bar`. |
| `disclosures[].disclosureDetail.Damage Amount Requested` | `Disclosure.damagesRequested` | |
| `disclosures[].disclosureDetail.Settlement Amount` | `Disclosure.settlementAmount` | |
| `disclosures[]` of type `Employment Separation After Allegations` | `EmploymentHistory.u5Filed` + `terminationDisclosureId` | Plus `reasonForLeaving` from `Termination Type`. |
| `stateExamCategory[]` / `productExamCategory[]` / `principalExamCategory[]` | `License` | One row per exam. `licenseType` = the exam code (`Series 7`, `Series 66`, `SIE`, `Series 31`, …). `grantedDate` = `examTakenDate`. |
| `registeredStates[]` | `License` (state-registration rows) | Distinct from product exams; `licenseType=state_<XX>`. |
| Firm `basicInformation.firmId` | `Firm.id` (or new column `firmFinraId`) | Distinct from CRD on the individual side; firms have a CRD too but BrokerCheck calls it `firmId`. We should rename / add `Firm.finraFirmId` to disambiguate. |
| Firm `basicInformation.otherNames[]` | `FirmSuccession` rows | One row per old name with type `name_change` (we may need to introduce that enum value). |
| Firm `basicInformation.bdSECNumber` / `iaSECNumber` | `Firm.secFilerId` | Today we have one column; consider splitting BD vs IA. |
| Firm `disclosures[].disclosureCount` | `Firm`-level rollup metric | We don't have a firm-level `Disclosure` table yet; today disclosures are per-advisor. Either widen `Disclosure.isFirmLevel=true` rows, or (better) snapshot the rollup counts on `Firm`. |
| Firm `directOwners[]` w/ `crdNumber` | New `FirmOfficer` link, OR resolve to `EmploymentHistory` w/ `roleTitle` | Useful signal — surfaces executive crossover between firms. |

### Schema deltas this implies (none required for v0; nice-to-have)

- `Advisor.akaNames: [String]` (or a small `AdvisorAlias` table) for
  `otherNames[]`.
- `Firm.finraFirmId: String` distinct from `finraCrd`. The two are
  not identical for firms (the firm "CRD" you see in BrokerCheck URLs
  is `firmId`).
- `Firm.bdSecNumber` / `Firm.iaSecNumber` instead of one
  `secFilerId` (or keep the single column and prefix the value).
- A `Disclosure.sourceType` / `sourceRef` pair (we already have this
  on `AdvisorMetricSnapshot` — same shape) so reconciliation can tell
  `brokercheck_2026-05-02` apart from `advisorhub_article:<wpId>`.
- A `BrokerCheckSnapshot` provenance row per CRD with `fetchedAt`,
  used for the ToU-required "compiled as of" disclosure in the UI.

## 4. Worked example — Cairnes (CRD 4068906)

The case our `research/extractions-examples/239679.cairnes.json`
fixture documents from AdvisorHub coverage. BrokerCheck returned:

- **5 employment rows.** Merrill Lynch (5/2000–11/2008) → Stanford
  Group Company (11/2008–3/2009) → Wells Fargo Investments
  (4/2009–1/2011) → Wells Fargo Clearing (1/2011–7/2023) → Chelsea
  Financial Services (7/2023–11/2023). All five appear in the
  AdvisorHub article in narrative form; only the start/end *months*
  come from BrokerCheck.
- **6 disclosure events** including the FINRA AWC, the Texas state
  regulator order, the U5 discharge from Wells Fargo, and three
  customer disputes (one settled $19,766 in 2009, one denied 2013,
  one pending 2023).
- **4 exams**: Series 7 (5/2000), Series 66 (6/2000), Series 31
  (5/2005), SIE (10/2018).

### Reconciliation note — values disagree

The AdvisorHub article reports a **\$25,000** FINRA fine. BrokerCheck's
record of the same AWC (docket `2023079356701`) shows a
**\$2,500** civil/admin penalty. AdvisorHub appears to have an
order-of-magnitude error. This is *exactly* why BrokerCheck-as-source-of-record
is worth the integration: the regulatory fact is the regulator's,
not the trade press's. Whatever path we take, the integration must
keep both values and flag the divergence rather than silently
overwriting.

## 5. Terms-of-use constraints (binding)

Source: `https://brokercheck.finra.org/terms` and
`https://www.finra.org/investors/.../about-brokercheck/permitted-uses`.

**Permitted** for our use case (investor protection / compliance /
academic): copying and compiling BrokerCheck data, *including with
data-mining tools*, provided the tools don't disrupt service.

**Required if we publish it:**

1. Identify BrokerCheck as the source.
2. Link to BrokerCheck and its Terms of Use.
3. Notify recipients that their use is subject to the ToU.
4. Maintain an error-correction process.
5. Disclose **when** the data was compiled ("as of <date>").
6. Keep it current.

**Forbidden:** altering factual content, using the data for
unsolicited marketing, bypassing rate limits, or building a
*commercial* redistribution database without a paid licence from
FINRA.

Implementation implications:

- Per-advisor / per-firm panels need a small attribution footer:
  *"Source: FINRA BrokerCheck (as of <date>). [BrokerCheck](https://brokercheck.finra.org) — [Terms of Use](https://brokercheck.finra.org/terms)."*
- The fetch path needs a `BrokerCheckSnapshot.fetchedAt` we can show.
- Reconciliation must not rewrite a regulator-of-record value with
  AdvisorHub prose; the precedence is BrokerCheck wins on facts,
  AdvisorHub wins on narrative + non-regulatory metrics (AUM, T12,
  recruiting deal terms — none of which BrokerCheck has).

## 6. What we tried that didn't work

- **FINRA Developer Center `Composite Individual` API.** Looked like
  the right official answer. It is a documented dataset that returns
  the full U4-shape blob for any CRD. But the announcement and the
  endpoint description make clear it is scoped to "individuals
  affiliated with **your organization**" and requires a *Firm
  Credential*, which is gated to FINRA member firms. We are not one,
  so this door is closed.
- **Pulling CRDs from the deployed dev backend** (`/Advisor?limit=20`
  on the Fabric REST endpoint). Returns `401 Must login` — the dev
  backend is auth-gated and the bearer in `~/.harper-fabric-credentials`
  isn't part of this sandbox. Fell back to CRDs found from the
  BrokerCheck individual search keyed on names from
  `research/extracted.jsonl`.
- **Generic SEC-API wrappers** (`sec-api.io`). Commercial third-party
  wrappers around SEC EDGAR / IAPD. Useful as inspiration but not
  necessary — the SEC publishes Form ADV bulk CSVs and a free IAPD
  endpoint directly.

## 7. As-built — operating the scraper

### Modes

| Command | Effect |
|---|---|
| `bun run brokercheck -- --crd 4068906` | One CRD. Backstop for "I have a CRD, fetch this." |
| `bun run brokercheck -- --firm-id 19616` | One firm-level snapshot (enables the firm-page Regulatory record card). |
| `bun run brokercheck -- --enrich --max 20` | Iterates every `Advisor` row in the live DB without a `finraCrd`, searches BrokerCheck by legal name, and — when exactly one (firstName, lastName) candidate matches — fetches the full report and merges into the existing row. Skips ambiguous names; they need manual disambiguation. |
| `bun run brokercheck -- --firm-roster 47770 --max 50` | Walks `/search/individual?firm=<id>&query=` (empty query, paginated) to discover advisors we don't yet know about. Polite — pages of 50, 1.5 s ± 0.5 s gap. |
| `bun run brokercheck -- --search-name 'Cody Swann' --max 5` | Plain name search. |
| `bun run brokercheck -- --from-fixture <file>` | Offline replay against a recorded JSON response under `research/brokercheck-samples/`. |

Add `--dry-run` to parse-without-write. Add `--force` to ignore the
7-day "recently fetched" skip. `BC_RATE_SECONDS=3 …` for an even
slower crawl.

The CLI entrypoint keeps mode selection in `src/scripts/fetch_brokercheck.ts`.
Shared state persistence and single individual/firm fetch handling live in
`src/scripts/fetch_brokercheck_core.ts`, so orchestrators and the CLI use the
same recent-fetch and state-update behavior.

### The wave-1 orchestrator

`src/scripts/brokercheck_crawl_all.ts` (via `bun run brokercheck:crawl --`)
chains the modes above in a
sensible order and is the recommended driver for "scrape as much
as you reasonably can without a license":

| Phase | Effect |
|---|---|
| 1. Firm CRD lookup | Searches BrokerCheck for every Firm row that lacks `finraCrd`; patches the row when there's exactly one match. |
| 2. Firm snapshots | Calls `--firm-id` for every Firm with a CRD. Enables the per-firm "Regulatory record" card. |
| 3. Roster walks | Walks rosters smallest-first (so we make progress before a wirehouse hogs the budget), capping each firm at `--max-per-firm` advisors per run. |

```bash
bun run brokercheck:crawl -- --max-per-firm 200
tail -f research/brokercheck-crawl.log
```

For scheduled Codex runs, the orchestrator resolves deployed Harper
configuration with the shared `_auth.loadCreds()` helper. Explicit
`HDB_TARGET_URL`, `HDB_ADMIN_USERNAME`, and `HDB_ADMIN_PASSWORD` still
override local credentials, but the weekly roster automation can run
from the default keychain / credentials-file setup without a shell env
wrapper.

State + log files (`research/brokercheck-state.json` and
`research/brokercheck-crawl.log`) are gitignored — they're runtime
output, not source-of-truth data. To bump the cap and continue the
walk later, just re-run with a higher `--max-per-firm`.

### BD vs IA scope dedup

BrokerCheck publishes BD and IA registrations as separate rows
under `currentEmployments` / `currentIAEmployments` (and the
`previous*` variants), even when they describe one continuous
tenure at one firm — typically the two registrations differ by a
few days while the firm files U4 amendments. Without dedup the
loader would write two `EmploymentHistory` rows whose natural-key
UUID differs only by the few-day startDate gap, producing visible
duplicates on the advisor profile (Steven M. Swann, CRD 1019847,
hit this: Wells Fargo Advisors 10/21–10/23 BD vs IA, Morgan
Stanley 8/24 BD vs 9/3 IA — both appeared twice on his Career
section before the fix).

`dedupeEmployments` in `src/lib/brokercheck-parse.ts` collapses same-firm rows
whose date ranges overlap or sit within 90 days. Merged row
keeps the earliest `startDate`, the latest `endDate` (null wins —
"still current"), and the union of underscore-prefixed scope
hints. A genuine boomerang ("left and came back years later") is
preserved because the gap exceeds 90 days. Asserted in
`tests/brokercheck_parse.test.ts`.

If a Cronk- or Swann-style fixture surfaces a new edge case,
extend the unit test before tweaking the merge window — the
current 90-day setting catches every real-world BD/IA pairing
we've seen without folding any sequential tenure.

### Idempotency

Every entity ID is a deterministic UUIDv5 derived from a stable
natural key (advisor: `crd:<crd>`; disclosure: `(advisorId, type,
date, docket)`; employment: `(advisorId, firmId, startDate)`;
sanction: `(disclosureId, type, amount, duration)`; snapshot:
`bcsnap:<kind>:<crd>`). Re-running the scraper writes the *same*
UUIDs back as upserts. Verified: a fresh `--enrich --force` run
after a clean run produced 0 row count delta and `advisor_minted=0`
in the resolver stats.

### Resumability

`research/brokercheck-state.json` records `(crd → fetchedAt, counts)`.
Ctrl-C and re-run picks up where it stopped. Skips any CRD fetched
in the last 7 days unless `--force`.

### ToU compliance

- Per-section `SourceAttribution` footer on advisor & firm profile
  pages — see `docs/design-system.md` §4.
- "Source: FINRA BrokerCheck (as of <date>). Terms of use." with a
  link to the ToU and to the specific BrokerCheck individual / firm
  page. Required by the ToU.
- We do not republish data for unsolicited marketing, do not modify
  factual content, and do not bypass rate limits. The scraper's
  `User-Agent` advertises the project so FINRA's ops team can reach
  the owner.
- We will revisit a paid licence with FINRA before any commercial
  redistribution.

### Known follow-ups

- **Ambiguous-name disambiguation.** 4 of our 12 seed advisors don't
  auto-resolve (Kyle Drumm, C. James Taylor, Cameron Irvine, Patrick
  Baumann — all return ≥ 2 BrokerCheck hits). Solve by carrying a
  `last_known_state` hint into the search, or build an admin UI for
  manual CRD-to-advisor binding.
- **SEC IAPD / Form ADV.** The complementary RIA-side feed remains
  TODO. No ToU friction; `Firm.finraCrd` already populated lets us
  cross-reference.
- **Roster crawl scale.** Defaults capped at `--max 50`. A full
  Wells Fargo roster is ~20k advisors; budget that as a multi-day
  background job (and seriously, ask FINRA for a licence first).

## 8. Open questions for the next session

- Should `Firm` get separate `bdSecNumber` and `iaSecNumber` columns,
  or do we keep one `secFilerId` and prefix the value?
- Where do firm-level disclosure rollup counts live? Today
  `Disclosure` is per-advisor. Probably a `FirmDisclosureSnapshot`
  parallel to `AdvisorMetricSnapshot`.
- Do we want `directOwners[]` from the firm endpoint? It's a clean
  signal for "who the executives are" (with CRDs that link straight
  back into our advisor graph), but it expands scope.
- Reconciliation policy: when AdvisorHub and BrokerCheck disagree on
  a fact (e.g., the Cairnes fine), do we keep both with provenance
  and let the UI show both, or pick a winner per field-class? My
  bias is *keep both*.

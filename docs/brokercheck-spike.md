# BrokerCheck as a complementary source — feasibility spike

Status: research, 2026-05-02. Not yet implemented.

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

## 7. Recommended path forward

Build it as **per-CRD on-demand enrichment**, not a crawl.

1. **One-time backfill of CRDs.** For every existing `Advisor` row
   without `finraCrd`, hit
   `/search/individual?query=<legalName>&state=<lastKnownState>` and
   match on (firstName, lastName, employer overlap with
   `EmploymentHistory`). This is the same matching shape
   `scripts/load_extractions.py` already uses — extend it.
2. **Snapshot fetcher.** A new `scripts/fetch_brokercheck.py` that
   takes a list of CRDs and writes a `BrokerCheckSnapshot` row plus
   refreshed `EmploymentHistory`, `Disclosure`, `Sanction`,
   `License`. Idempotent on `(advisorId, sourceType, sourceRef)`.
   Polite rate-limit (≤ 1 req/sec, exponential backoff on any 4xx).
3. **Refresh cadence.** Daily for any CRD with a *pending*
   disclosure or recent U5; monthly for everyone else. Track this
   on `BrokerCheckSnapshot.fetchedAt`.
4. **SEC IAPD as the IA-side complement.** Form ADV bulk CSVs feed
   `Firm` (RIA side), IAPD individual-rep records feed
   `Advisor.secIard`. Separate ingest, no ToU friction, run weekly.
5. **UI footer.** Add the BrokerCheck attribution + "compiled as of"
   line wherever a regulator-sourced fact appears (employment dates,
   disclosure rows, sanctions, exams). Per `docs/design-system.md`,
   that's an atom — `<SourceAttribution>` — to add to the
   design-system tier. Also update `docs/design-system.md` per
   `CLAUDE.md`.
6. **Don't bulk-crawl** `api.brokercheck.finra.org`. If we ever want
   to do that, get a commercial licence from FINRA first.

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

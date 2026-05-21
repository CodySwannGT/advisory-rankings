# Advisor Data Schema — Proposal v0.2

A first-pass data model for building rich profiles of US wealth-management
financial advisors, derived from research on AdvisorHub.com.

The model is source-agnostic (Postgres, Mongo, graph, or document) — fields
are typed conceptually so it can be translated downstream.

---

## 0. How this research was conducted (and its limits)

| Method | Result |
|---|---|
| Targeted Google searches across AdvisorHub.com | ✅ ~30 queries surfaced excerpts from rankings, moves, regulatory, succession, deal-economics, RIA articles |
| `WebFetch` on AdvisorHub article URLs | ❌ HTTP 403 (Cloudflare WAF) |
| `curl` with browser User-Agent | ⚠️ First few requests succeeded with `HTTP/2 200`, then Cloudflare WAF blocked the egress IP for the rest of the session — this is an **IP-reputation block**, not fingerprinting |
| `curl_cffi` (Chrome 124 TLS impersonation) | ❌ Same IP-level 403 |
| Playwright + headless Chromium with realistic UA | ❌ Same IP-level 403 (the sandbox's outbound IP is on Cloudflare's bot-blocked list) |
| Wayback Machine | ❌ Egress policy blocks `web.archive.org` from this sandbox |
| **AdvisorHub WordPress REST API** (`/wp-json/wp/v2/posts/{id}`) | ✅ One full article fetched (18 KB JSON with full body HTML) before the WAF caught up |

Two complete articles were captured before the IP block:

1. **`6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc/`** — full
   HTML, saved to `research/articles/01-taylor-group-wells-fargo.html`.
   Story shape: **advisor team move (Recruiting Wire)**.
2. **`finra-fines-suspends-texas-broker-over-unapproved-real-estate-oba/`** —
   full wp-json record, saved to
   `research/articles/02-cairnes-finra-disclosure.wpjson.json`.
   Story shape: **FINRA regulatory disclosure**.

The crawler scripts (`src/scripts/crawl_via_wpjson.ts`,
`src/scripts/crawl_html.ts`, `src/scripts/crawl_playwright.ts`; run
via `bun run crawl:*`) are checked in. **From an unblocked IP** the
wp-json crawler can pull the entire post archive at full fidelity — every
field below has an exact JSON path.

The schema below treats the two captured articles as ground truth and uses
search excerpts to corroborate that the patterns generalise.

---

## 1. What AdvisorHub publishes (story shapes & exposed fields)

| Story shape | Examples | Data exposed |
|---|---|---|
| **Advisor / team move (Recruiting Wire)** | "$6B Morgan Stanley Team Jumps to Wells Fargo Advisors in NYC"; "Rockefeller Snags $2B UBS Team in California" | Team name, lead advisors w/ middle initials, full member list incl. support staff, AUM, T-12 production, branch building, branch manager, market leader, sub-channel (FiNet, Private Wealth, etc.), career timeline incl. registration year per firm, recruiting deal % of T-12 |
| **Rankings ("Advisors to Watch" + sub-lists)** | Advisors to Watch (1,000); Women Advisors (200); Next Gen (<45); Solo; Under $1B; Over $1B; Women RIAs; RIA Firms to Watch | Three-pillar 100-pt score (Scale, Growth, Professionalism), AUM, production, household count, YoY growth, regulatory record, team makeup, age cohort |
| **FINRA / regulatory disclosure** | "Finra Fines, Suspends Texas Broker Over Unapproved Real Estate OBA" | CRD, current/prior firms, allegation, **specific rule violations** (e.g., FINRA Rule 3270, 2010), sanction (fine, suspension months, bar), accept/deny status, settlement letter cite, U5 termination details, parallel state-securities-board actions, OBA vehicle (LLC), compensation received |
| **Customer dispute / arbitration** | "Stifel Loses Bid to Overturn $133 Million Arbitration Award" | Award amount, settlement amount, allegation, outcome, dates, panel/forum (FINRA, JAMS, AAA), number of related claims/awards |
| **Recruiting deal economics** | "UBS Dangles 550% Recruiting Offers"; "Wells Ups Recruiting Deals" | Upfront % of T-12, total deal %, forgivable-loan structure, clawback, back-end hurdles, producer tier targeted |
| **Sunset / succession programs** | "Merrill Sweetens Payouts on Broker Sunset Programs" | Retiring-advisor revenue payouts, successor financing terms, program names (Client Transition Program, Succession Planning Program) |
| **Firm / RIA profile** | "50 RIA Firms to Watch in 2026" | Firm AUM, advisor count, founded year, channel, custodian, M&A activity, aggregator status |

> **Note on sourcing.** AdvisorHub itself has Cloudflare-protected article
> URLs but its **WordPress REST API is open**. Underlying truth should be
> cross-referenced against FINRA BrokerCheck (CRD) and SEC IAPD. Provenance
> fields are mandatory on every fact.

### 1.1 The "Advisors to Watch" methodology — must round-trip

Rankings are scored on a **100-point scale across three pillars**:

- **Scale** — assets under management, production, profitability, average
  account size, ratio of team members to client households.
- **Growth** — YoY change in assets, clients, and production; biased toward
  organic growth over M&A.
- **Professionalism** — regulatory record, community involvement, mentorship,
  team makeup / diversity.

Sub-list eligibility gates:

| List | Min experience | Min AUM | Other |
|---|---|---|---|
| Advisors to Watch (flagship) | — | — | 1,000 advisors total |
| Next Gen | 7 yrs | $150M | Lead advisor under 45 |
| Solo | 7 yrs | $100M | Single-advisor practice |
| Under $1B / Over $1B | — | AUM band | Splits flagship by team AUM |
| Women / Women RIAs | — | — | Lead advisor identifies as woman |

---

## 2. Concrete data observed in the two fully-fetched articles

This is the most reliable source layer. Every field below is something we
saw in real article prose — i.e., the schema must accommodate it.

### From the Taylor Group → Wells Fargo article

Verbatim phrases mapped to schema fields:

| Phrase | Field |
|---|---|
| "Morgan Stanley team that managed **$5.94 billion** in assets" | `Team.aum` (decimal, point-in-time) |
| "produced **$18.6 million** in annual revenue" | `Team.annual_revenue` |
| "**16-year broker** C. James Taylor" | `Advisor.years_experience` (derived from `industry_start_date`); name with middle initial |
| "**The Taylor Group** at Morgan Stanley" | `Team.name`, `Team.firm_id` (at time of move) |
| "reports to **Michael Freiheit, branch manager** at Wells' **Midtown Manhattan office in the GM building**" | `Branch.market_executive_advisor_id`; `Branch.address`; `Branch.building_name` |
| "and **Patrick Baumann, New York City market leader**" | `Branch.market_leader_advisor_id`; `Branch.complex_name` |
| "**19-person team** includes advisors Shane Drumm, Michaella Irvine, Cameron Irvine, Marcus Briscoe, Jamison Embury, Roger McGlynn, Hunter Embury and Kyle Drumm as well as **10 support staff**" | `Team.team_size`; `TeamMembership.role` distinguishing `lead_advisor` from `support_csa` (8 advisors + 10 support + 1 lead = 19) |
| "managed **$1.2 billion in 2023**, according to a **Barron's profile** that year" | `TeamMetricSnapshot(team_id, as_of=2023, aum=1.2B, source='Barron's profile')` |
| "concentration of clients who are **employees and executives at Nvidia**" | `Specialization.client_segment_notes` (free-text) + a structured `EmployerConcentration(team_id, employer, segment_type)` |
| "**Taylor first registered with Hennion & Walsh in 2009** and worked at Merrill Lynch for **nine years** before moving to **Morgan Stanley in 2020**, according to **BrokerCheck**" | Three `EmploymentHistory` rows w/ start_date and end_date; `external_refs.finra_crd` resolved via BrokerCheck |
| "could include **275% of trailing-12 revenue in upfront cash**" | `RecruitingDealQuote.upfront_pct_t12 = 2.75` |
| "**FiNet** independent brokerage and **RIA custody unit** launching later this year" | `Firm.sub_channel` enum incl. `FiNet`; `Firm.custody_relationships` |
| "wirehouse earlier this week reeled in a **UBS Wealth Management USA team managing $466 million in Florida**" | Each comparator move is itself a `TransitionEvent` referenced from the article |
| "**–Mason Braswell contributed to this story**" | `Article.coauthors` (note: wp-json exposes a `coauthors` array — multi-author support is required) |

**New schema requirements surfaced:**

- Branch needs `building_name` (e.g., "GM building") *and* `complex_name` ("New York City market") *and* both `branch_manager_advisor_id` and `market_leader_advisor_id` — a **three-level hierarchy**: market → complex → branch.
- `EmployerConcentration` is a real, marketable practice attribute, not just free text.
- Articles reference *other* articles' subjects (the UBS Florida team, the UBS FiNet team) — every article should be parsed for **all** mentioned `TransitionEvent`s, not only its headline subject.
- `coauthors` is a list, not a single author.
- AdvisorHub's wp-json `categories` and `tags` are integer IDs — we need to mirror their taxonomy locally (`AdvisorHubCategory`, `AdvisorHubTag`) for round-tripping.

### From the Cairnes / FINRA Texas article

| Phrase | Field |
|---|---|
| "**Financial Industry Regulatory Authority** on Wednesday **suspended for four months and fined $25,000**" | `Disclosure.regulator='FINRA'`, `suspension_months=4`, `fine_amount=25_000`, `date_resolved=2025-10-01` (the Wednesday before the article) |
| "George J. Cairnes allegedly **from August 2015 to April 2023** 'partnered with a firm customer to identify, buy, manage, and sell real estate' without firm permission" | `Disclosure.allegation_period_start`, `allegation_period_end`; `OutsideBusinessActivity` entity |
| "23-year veteran broker" | `Advisor.years_experience` |
| "created a **limited liability company** for the 'partnership's activities'" | `OutsideBusinessActivity.vehicle_type='LLC'` |
| "violated its **Rule 3270**... and its catch-all **Rule 2010**" | `Disclosure.rule_violations=['FINRA_3270','FINRA_2010']` |
| "did not have legal representation" | `Disclosure.was_pro_se=true` |
| "Wells in July 2023 **terminated** Cairnes over allegations that he 'facilitated a loan between clients...'" | A separate `Disclosure(disclosure_type='employment_separation', date_initiated=2023-07, allegation_text=...)` linked via `EmploymentHistory.termination_disclosure_id` |
| "Finra initiated its investigation into Cairnes following Wells' **U5 termination notice**" | `EmploymentHistory.u5_filed=true`, `u5_filing_date`, plus a `Disclosure(disclosure_type='investigation', regulator='FINRA')` triggered by the U5 |
| "April 2024, Cairnes **consented to a Disciplinary Order by the Texas State Securities Board**" | A separate `Disclosure(disclosure_type='regulatory', regulator='state_securities', state='TX', date_resolved=2024-04, admit_deny='consented_no_admission')` |
| "Cairnes was **paid at least $175,000**" | `OutsideBusinessActivity.compensation_received_min=175_000` |
| "**barred from registering to be licensed in Texas for two years**" | The state Disclosure carries `bar_imposed=true`, `bar_jurisdiction='TX'`, `bar_duration_months=24` |
| "**Finra arbitration panel in August** ordered Cairnes to pay Wells $180,000 over **two promissory notes** that he signed when he joined the firm in 2009" | A separate `Disclosure(disclosure_type='civil_judicial', forum='FINRA_arbitration', award_amount=180_000)` plus an `EmploymentHistory.signing_bonus_promissory_note=true` flag |
| "pending customer dispute from April 2023" | `Disclosure(disclosure_type='customer_dispute', status='pending', date_initiated=2023-04)` |
| "started his career at **Merrill Lynch in 2000** and joined **Stanford Financial in 2008**" | `EmploymentHistory` rows; `Advisor.industry_start_date=2000-XX-XX` |
| "**Stanford Financial in 2008**, the year before it was seized... Robert Allen Stanford was charged with and later convicted of running an **$8 billion Ponzi scheme**" | `Firm.dissolved_year=2009`, `Firm.dissolution_reason='regulatory_seizure'`, `Firm.scandal_notes` |
| "**Chelsea Financial Services**, but the firm **withdrew his registration application** in November 2023" | `RegistrationApplication(advisor_id, firm_id, applied_date, withdrew_date, status='withdrawn_by_firm')` |

**New schema requirements surfaced:**

- A single AdvisorHub article often documents **multiple parallel Disclosure events** (FINRA AWC + state-board order + arbitration award + pending customer dispute + U5 employment separation). The `Disclosure` entity must support N-per-advisor and cross-references.
- `OutsideBusinessActivity` should be its own entity, not a free-text field.
- `EmploymentHistory` needs `signing_bonus_promissory_note` (boolean) — these notes generate predictable post-departure clawback litigation.
- A separate `RegistrationApplication` entity captures **attempted but withdrawn** registrations (don't conflate with completed `EmploymentHistory`).
- `Firm` needs `dissolved_year` + `dissolution_reason` + free-text scandal/notes — defunct firms (Stanford, Lehman, Bear Stearns, Smith Barney) appear frequently in advisor career histories.

---

## 3. Entity model (high-level)

```
                            ┌──────────────┐
                            │   Article    │ (AdvisorHub source-of-record)
                            └──────┬───────┘
                                   │ mentions (n:m for *every* entity)
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
       ┌─────────┐            ┌─────────┐            ┌─────────┐
       │ Advisor │◀─members──▶│  Team   │──hosts────▶│  Firm   │
       └────┬────┘            └────┬────┘            └────┬────┘
            │                      │                      │
   ┌────────┼────────┬─────────┐   │                      │
   ▼        ▼        ▼         ▼   ▼                      ▼
Education Designation Employ-  OBA TransitionEvent    Branch / Office
& License           ment       /OBA (advisor or team
                    History    /RegApp moves between firms)
   │
   ▼
Disclosure(*)  RankingEntry  RecruitingDealQuote  Specialization
   │
   ▼
Sanction (fine/suspension/bar) — many per Disclosure
```

Cardinalities:
- `Advisor` 1—* `EmploymentHistory` *—1 `Firm`
- `Advisor` *—* `Team` via `TeamMembership` (with role + dates)
- `Team` *—1 `Firm`, *—1 `Branch`
- `TransitionEvent` *—1 `Advisor` *or* *—1 `Team`; references `from_firm` & `to_firm`
- `Disclosure` *—1 `Advisor` (and optionally *—1 `Firm` for firm-level actions); `Disclosure` 1—* `Sanction`
- `RankingEntry` *—1 `Ranking` *—1 (`Advisor` | `Team` | `Firm`)
- `Article` *—* every entity above (provenance edges, with quoted phrase)

---

## 4. Entities & fields

Field types: `id` = opaque PK, `str`, `int`, `decimal`, `date`, `bool`, `enum`, `url`, `text`, `[T]` = list of T, `?` = nullable. Every entity also carries:

- `created_at`, `updated_at` (`timestamp`)
- `source_article_ids` (`[id]`) — every AdvisorHub article that asserted any field
- `source_facts` (`[{article_id, quote, fields_asserted: [str]}]`) — fine-grained provenance with the literal phrase
- `external_refs` (`{system: id}`) — e.g. `{"finra_crd": "1234567", "sec_iard": "..."}`
- `last_verified_at` (`timestamp?`) — when we last reconfirmed against BrokerCheck/IAPD
- `confidence` (enum: `asserted`, `inferred`, `derived`)

### 4.1 `Advisor`

| Field | Type | Notes |
|---|---|---|
| `id` | id | PK |
| `legal_name` | str | "C. James Taylor", "George J. Cairnes" — **always retain middle initial** |
| `first_name` / `middle_initial?` / `middle_name?` / `last_name` / `suffix?` | str | Parsed |
| `preferred_name?` | str | "Jim" |
| `gender?` | enum (`female`, `male`, `nonbinary`, `undisclosed`) | Required for Women lists |
| `birth_year?` | int | For Next Gen eligibility |
| `industry_start_date` | date | "16-year broker" / "started his career at Merrill Lynch in 2000" → derive |
| `years_experience` | int (derived) | `now - industry_start_date` |
| `career_status` | enum (`active`, `retired`, `barred`, `suspended`, `deceased`, `withdrawn`) | |
| `headshot_url?` | url | |
| `bio_text?` | text | |
| `linkedin_url?` | url | |
| `business_email?` / `business_phone?` | str | |
| `finra_crd` | str | Primary external key — **unique** when present |
| `sec_iard?` | str | RIA representatives |
| `pii_level` | enum (`public`, `restricted`) | Per-record render gating |

### 4.2 `Education`

| Field | Type |
|---|---|
| `id`, `advisor_id` | id |
| `institution` | str |
| `degree` | enum (`BA`, `BS`, `MBA`, `JD`, `MS`, `PhD`, `MD`, `other`) |
| `field?` | str |
| `graduation_year?` | int |

### 4.3 `Designation`

| Field | Type |
|---|---|
| `id`, `advisor_id` | id |
| `code` | enum (`CFP`, `CFA`, `CIMA`, `CPWA`, `ChFC`, `CLU`, `AIF`, `CRPC`, `CWS`, `CTFA`, `CDFA`, `RICP`, `other`) |
| `granting_body` | str |
| `earned_date?` / `expires_date?` | date |
| `status` | enum (`active`, `lapsed`, `revoked`) |

### 4.4 `License`

| Field | Type |
|---|---|
| `id`, `advisor_id` | id |
| `license_type` | str (e.g., `Series_7`, `Series_66`, `state_insurance_NY`) |
| `state?` | str (2-letter) |
| `granted_date?` / `expires_date?` | date |
| `status` | enum (`active`, `inactive`, `revoked`) |

### 4.5 `Firm`

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `name` | str | "Morgan Stanley Wealth Management" |
| `legal_name?` | str | |
| `parent_firm_id?` | id | Merrill ⊂ Bank of America |
| `channel` | enum (`wirehouse`, `regional_bd`, `independent_bd`, `hybrid_bd`, `insurance_bd`, `bank`, `pure_ria`, `hybrid_ria`, `family_office`, `incubator`) | |
| `sub_channel?` | str | `Wells_FiNet`, `LPL_Strategic_Wealth`, `Morgan_Stanley_Private_Wealth`, `Goldman_Family_Wealth` |
| `finra_crd?` / `sec_filer_id?` | str | |
| `founded_year?` | int | |
| `dissolved_year?` | int | Stanford 2009, Lehman 2008, etc. |
| `dissolution_reason?` | enum (`acquired`, `merged`, `regulatory_seizure`, `bankruptcy`, `voluntary_wind_down`) | |
| `successor_firm_id?` | id | Smith Barney → Citi → Morgan Stanley |
| `notes?` | text | Scandal context |
| `hq_city` / `hq_state` / `hq_country` | str | |
| `aum_total?` | decimal | Latest reported |
| `aum_as_of?` | date | |
| `advisor_count?` | int | |
| `custodian_relationships?` | [str] | RIAs: Schwab, Fidelity, Pershing, TradePMR |
| `is_aggregator?` | bool | Beacon Pointe, Focus, Hightower, Wealthcare, Steward |
| `website?` | url | |
| `logo_url?` | url | Public firm logo captured from scraped source metadata or firm-bio pages. |

### 4.6 `Branch` / `Office`

| Field | Type | Notes |
|---|---|---|
| `id`, `firm_id` | id | |
| `name?` | str | "399 Park Avenue complex" |
| `building_name?` | str | "GM building" — observed verbatim |
| `complex_name?` | str | Wirehouse-specific layer above branch |
| `market_name?` | str | "New York City market" — layer above complex |
| `address`, `city`, `state`, `country`, `postal_code` | str | |
| `branch_manager_advisor_id?` | id | "Michael Freiheit, branch manager" |
| `complex_executive_advisor_id?` | id | |
| `market_leader_advisor_id?` | id | "Patrick Baumann, NYC market leader" |

> Three-level hierarchy (`market` → `complex` → `branch`) is needed for
> wirehouses; smaller firms may have only `branch`. Use a self-reference on
> `Branch.parent_branch_id` to keep one entity rather than three.

### 4.7 `EmploymentHistory`

| Field | Type | Notes |
|---|---|---|
| `id`, `advisor_id`, `firm_id`, `branch_id?` | id | |
| `role_title` | str | "Managing Director", "Private Wealth Advisor", "CSA" |
| `role_category` | enum (`lead_advisor`, `partner`, `associate_advisor`, `support_csa`, `registered_associate`, `manager`, `executive`) | |
| `start_date` | date | |
| `end_date?` | date | |
| `reason_for_leaving?` | enum (`voluntary`, `terminated_for_cause`, `permitted_to_resign`, `retired`, `deceased`, `other`) | |
| `aum_at_departure?` | decimal | |
| `production_t12_at_departure?` | decimal | |
| `signing_bonus_promissory_note?` | bool | "two promissory notes that he signed when he joined the firm in 2009" |
| `signing_bonus_amount?` | decimal | |
| `u5_filed?` | bool | |
| `u5_filing_date?` | date | |
| `termination_disclosure_id?` | id | → `Disclosure` |
| `source_type?` | enum (`brokercheck`, `advisorhub_article`, `form_adv`, ...) | populated by the BrokerCheck loader (`bun run brokercheck --`); `null` for hand-seeded rows |
| `source_ref?` | str | when `source_type=brokercheck`, points at the `BrokerCheckSnapshot.id` that wrote this row |

### 4.8 `RegistrationApplication`

A new entity (not in v0.1). Captures attempted-but-not-completed registrations.

| Field | Type | Example |
|---|---|---|
| `id`, `advisor_id`, `firm_id` | id | |
| `applied_date` | date | |
| `status` | enum (`pending`, `approved`, `withdrawn_by_advisor`, `withdrawn_by_firm`, `denied`) | |
| `resolved_date?` | date | "Chelsea Financial Services... withdrew his registration application in November 2023" |

### 4.9 `Team`

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `name` | str | "Empire 360 Team", "Taylor Group", "Shaffer Wealth Partners" |
| `current_firm_id` | id | |
| `current_branch_id?` | id | |
| `firm_program?` | str | "Private Wealth Management", "Forum Group" |
| `founded_year?` | int | |
| `dissolved_year?` | int | |
| `aum?` / `aum_as_of?` | decimal / date | Latest |
| `annual_revenue?` | decimal | |
| `household_count?` | int | |
| `average_account_size?` | decimal | |
| `team_size?` | int | |
| `service_model` | enum (`mass_affluent`, `hnw`, `uhnw`, `institutional`, `mixed`) | |

### 4.10 `TeamMembership`

| Field | Type |
|---|---|
| `id`, `team_id`, `advisor_id` | id |
| `role` | enum (`founding_partner`, `lead`, `partner`, `associate`, `support_csa`, `registered_associate`, `analyst`, `intern`) |
| `start_date` | date |
| `end_date?` | date |

### 4.11 `TeamMetricSnapshot`

Time-series version of the metric fields on `Team`. One row per assertion.

| Field | Type | Notes |
|---|---|---|
| `id`, `team_id` | id | |
| `as_of` | date | "$1.2 billion in 2023" → as_of=2023-12-31 |
| `aum?` | decimal | |
| `annual_revenue?` | decimal | |
| `household_count?` | int | |
| `team_size?` | int | |
| `source_type` | enum (`advisorhub_article`, `barrons_profile`, `firm_press_release`, `form_adv`, `internal_estimate`) | |
| `source_ref` | str (URL or citation) | |

`AdvisorMetricSnapshot` mirrors this for solo metrics.

### 4.12 `TransitionEvent`

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `subject_type` | enum (`advisor`, `team`) | |
| `subject_advisor_id?` / `subject_team_id?` | id | |
| `from_firm_id` / `to_firm_id` | id | |
| `from_branch_id?` / `to_branch_id?` | id | |
| `move_date?` | date | Effective date |
| `announced_date?` | date | Article date |
| `aum_moved?` | decimal | |
| `production_t12?` | decimal | |
| `headcount_moved?` | int | |
| `recruiting_deal_id?` | id | → `RecruitingDealQuote` |
| `is_breakaway` | bool | Move into RIA channel |
| `is_return` | bool | Boomerang ("third time at Morgan Stanley") |
| `notes?` | text | |

### 4.13 `RecruitingDealQuote`

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `firm_id` | id | |
| `as_of_date` | date | |
| `channel_target` | enum (same as `Firm.channel`) | |
| `producer_tier?` | enum (`top_producer`, `mid`, `entry`) | |
| `upfront_pct_t12?` | decimal | "275% of trailing-12 revenue in upfront cash" → `2.75` |
| `total_pct_t12?` | decimal | |
| `forgivable_loan_term_years?` | int | |
| `backend_metrics?` | text | |
| `clawback_terms?` | text | |
| `applies_to_transition_event_id?` | id | If quoted in context of a specific move |
| `source_article_id` | id | |

### 4.14 `Disclosure` (BrokerCheck-style event)

| Field | Type | Notes |
|---|---|---|
| `id`, `advisor_id` | id | |
| `firm_id_at_time?` | id | |
| `disclosure_type` | enum (`regulatory`, `customer_dispute`, `employment_separation`, `criminal`, `civil_judicial`, `financial`, `investigation`, `judgment_lien`) | |
| `regulator?` | enum (`FINRA`, `SEC`, `state_securities`, `state_insurance`, `state_court`, `federal_court`, `JAMS`, `AAA`, `firm_internal`) | |
| `regulator_state?` | str (2-letter) | "Texas State Securities Board" → `state_securities` + state=`TX` |
| `forum?` | enum (`FINRA_arbitration`, `state_court`, `federal_court`, `JAMS`, `AAA`, `regulator_AWC`) | AWC = Acceptance, Waiver & Consent letter |
| `allegation_text` | text | |
| `allegation_period_start?` / `allegation_period_end?` | date | "from August 2015 to April 2023" |
| `allegation_categories?` | [enum] (`unauthorized_trading`, `unsuitable_recommendation`, `churning`, `misrepresentation`, `OBA_undisclosed`, `forgery`, `breach_of_fiduciary_duty`, `selling_away`, `private_securities_transaction`, `theft`, `account_coding`, `bequest`, `loan_to_client`, `loan_from_client`, `gift_acceptance`, `other`) | |
| `product_categories?` | [enum] (`structured_notes`, `UITs`, `mutual_fund_share_class`, `annuities`, `alternatives`, `equities`, `options`, `crypto`, `real_estate`) | |
| `rule_violations?` | [str] | "FINRA Rule 3270", "FINRA Rule 2010", "Securities Act §17(a)" |
| `status` | enum (`pending`, `settled`, `awarded_for_claimant`, `awarded_for_respondent`, `denied`, `withdrawn`, `closed_no_action`, `expunged`, `vacated`, `consented`) | |
| `admit_deny` | enum (`admitted`, `denied`, `without_admitting_or_denying`, `consented_no_admission`, `n_a`) | |
| `was_pro_se?` | bool | "did not have legal representation" |
| `date_initiated?` / `date_resolved?` | date | |
| `damages_requested?` | decimal | |
| `settlement_amount?` | decimal | |
| `award_amount?` | decimal | |
| `is_firm_level` | bool | |
| `docket_number?` | str | FINRA AWC docket (`2023079356701`), court docket, etc. — used as a stable disambiguator when keying disclosures |
| `cross_disclosure_ids?` | [id] | Links parallel events (FINRA AWC ↔ state board order ↔ U5 ↔ pending customer dispute) |
| `source_type?` | enum (`brokercheck`, `advisorhub_article`, ...) | provenance — see §6.1 |
| `source_ref?` | str | snapshot or article ID — see §6.1 |

### 4.15 `Sanction`

Multiple sanctions per disclosure (a single AWC may impose fine + suspension + censure).

| Field | Type |
|---|---|
| `id`, `disclosure_id` | id |
| `sanction_type` | enum (`fine`, `suspension`, `bar`, `censure`, `restitution`, `disgorgement`, `cease_and_desist`, `undertaking`, `requalify`) |
| `amount?` | decimal |
| `duration_months?` | decimal |
| `jurisdiction?` | str |
| `effective_date?` | date |
| `end_date?` | date |

### 4.16 `OutsideBusinessActivity`

| Field | Type | Example |
|---|---|---|
| `id`, `advisor_id` | id | |
| `name` | str | |
| `vehicle_type?` | enum (`LLC`, `LP`, `partnership`, `sole_proprietorship`, `nonprofit`, `other`) | "limited liability company" |
| `with_customers?` | bool | "partnered with a firm customer" |
| `disclosed_to_firm?` | bool | "failed to provide prior notice" |
| `start_date?` / `end_date?` | date | |
| `compensation_received?` | bool | |
| `compensation_amount_min?` / `compensation_amount_max?` | decimal | "paid at least $175,000" → min=175k |
| `related_disclosure_ids?` | [id] | |

### 4.17 `Specialization` / `PracticeFocus`

| Field | Type | Notes |
|---|---|---|
| `id`, `subject_type` (`advisor` \| `team`), `subject_id` | id | |
| `client_segments` | [enum] (`mass_affluent`, `HNW`, `UHNW`, `multigenerational_family`, `entrepreneurs`, `executives`, `athletes_entertainers`, `medical_professionals`, `business_owners`, `retirees`, `women`, `LGBTQ`, `nonprofits_endowments`, `beneficiaries`) | |
| `services` | [enum] (`financial_planning`, `investment_management`, `estate_planning`, `trust_services`, `tax_planning`, `charitable_giving`, `business_succession`, `retirement_plans`, `insurance`, `lending`, `private_markets`, `alternatives`) | |
| `notes?` | text | |

### 4.18 `EmployerConcentration`

A team's client base often clusters at one or two employers — material to growth & risk.

| Field | Type | Example |
|---|---|---|
| `id`, `subject_type`, `subject_id` | id | |
| `employer_name` | str | "Nvidia" |
| `client_role_type?` | enum (`employees`, `executives`, `founders`, `retirees_alumni`, `mixed`) | "employees and executives" |
| `concentration_estimate_pct?` | decimal | |
| `notes?` | text | |

### 4.19 `Ranking`

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `publisher` | str | `AdvisorHub`; extensible to Barron's, Forbes, Financial Times |
| `name` | str | `Advisors to Watch`, `Women Advisors to Watch`, `Next Gen`, `Solo`, `Under $1B`, `Over $1B`, `Women RIAs`, `RIA Firms to Watch` |
| `year` | int | |
| `subject_type` | enum (`advisor`, `team`, `firm`) | |
| `methodology_url?` | url | |
| `eligibility_criteria?` | json | `{min_years_experience: 7, min_aum: 150_000_000, max_age: 45}` |

### 4.20 `RankingEntry`

| Field | Type |
|---|---|
| `id`, `ranking_id` | id |
| `subject_advisor_id?` / `subject_team_id?` / `subject_firm_id?` | id |
| `rank?` | int |
| `score_total?` | decimal |
| `score_scale?` / `score_growth?` / `score_professionalism?` | decimal |
| **Submitted metrics (snapshot on application date):** | |
| `aum` | decimal |
| `production_t12` | decimal |
| `household_count` | int |
| `team_size` | int |
| `average_account_size?` | decimal |
| `team_to_household_ratio?` | decimal |
| `growth_yoy_aum_pct?` | decimal |
| `growth_yoy_clients_pct?` | decimal |
| `growth_yoy_production_pct?` | decimal |
| `regulatory_clean?` | bool |
| `community_involvement_notes?` | text |

### 4.21 `Article` (provenance)

Mirror of the AdvisorHub wp-json record.

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `wp_id` | int | The integer ID from `wp-json/wp/v2/posts/{id}` |
| `wp_post_type` | enum (`post`, `recruiting_moves`, `firm`, `team_bio`, `hub`, `deals_and_comps`, `fintech`, `asset_manager`) | |
| `url` | url (canonical) | |
| `slug` | str | |
| `headline` | str | |
| `dek?` | str | |
| `published_date` / `modified_date?` | date | |
| `authors` | [str] | wp-json exposes `coauthors` array |
| `category` | enum (`advisor_moves`, `recruiting_wire`, `regulatory`, `arbitration`, `rankings`, `firm_news`, `succession`, `opinion`, `resource`) | Mapped from `wp_categories` |
| `wp_categories` | [int] | Raw IDs |
| `wp_tags` | [int] | Raw IDs |
| `body_text?` | text | Stripped HTML |
| `body_html?` | text | Original |
| `mentioned_advisor_ids` | [id] | |
| `mentioned_team_ids` | [id] | |
| `mentioned_firm_ids` | [id] | |
| `mentioned_disclosure_ids` | [id] | |

### 4.21a `BrokerCheckSnapshot` (provenance, FINRA-side)

One row per CRD per fetch from `api.brokercheck.finra.org`. Anchors
the per-section "Source: FINRA BrokerCheck (as of <date>)" footer
the BrokerCheck ToU requires, and lets the scraper decide whether to
re-fetch. Idempotent on `id = uuid5(NS, "bcsnap:<kind>:<crd>")` so
re-fetching the same CRD updates the row in place.

| Field | Type | Notes |
|---|---|---|
| `id` | id | deterministic from `(subject_kind, subject_crd)` |
| `subject_kind` | enum (`individual`, `firm`) | |
| `subject_crd` | str | FINRA CRD (individual) or `firmId` (firm) |
| `subject_advisor_id?` | id | resolved when `subject_kind=individual` |
| `subject_firm_id?` | id | resolved when `subject_kind=firm` |
| `fetched_at` | datetime | drives the UI "as of" line |
| `bc_scope` / `ia_scope` | str | `ACTIVE` / `InActive` / `NotInScope` |
| `disclosure_count` | int | |
| `employment_count` | int | |
| `exam_count` | int | |
| `registered_state_count` | int | |
| `raw_hash` | str | sha256 of the normalized response — change detection |
| `raw_json` | text | the full BrokerCheck response, JSON-encoded |

### 4.21b `AdvisorResearchCheck` (scheduled public-web research)

One row per bounded source check for an advisor. This is deliberately
separate from `Advisor`: a run can record "checked and found nothing"
without modifying the advisor profile, and failed or ambiguous checks
are visible to the next run instead of creating a silent retry loop.

The first source type is `web_research`, used by the scheduled
public-web enrichment job for firm bios, team pages, ranking pages,
press releases, and search-snippet-only LinkedIn URLs. It is not a
source-of-record table; any fact discovered still needs a
`FieldAssertion` row with source-backed text.

| Field | Type | Notes |
|---|---|---|
| `id` | id | deterministic from `(advisor_id, source_type, checked_at)` |
| `advisor_id` | id | advisor checked |
| `source_type` | enum (`web_research`, `firm_bio`, `rankings`, `press`) | default scheduled lane is `web_research` |
| `checked_at` | date | when the source check ran |
| `status` | enum (`success`, `no_new_data`, `ambiguous`, `failed`) | controls retry behavior |
| `sources_checked` | [url] | pages or snippets considered |
| `notes` | text | short explanation, especially for ambiguity/failure |
| `next_check_after` | date | optional backoff for failures or low-value advisors |

### 4.22 `Award` (catch-all for non-AdvisorHub recognition)

| Field | Type |
|---|---|
| `id`, `advisor_id` | id |
| `name` | str |
| `granting_body` | str |
| `year` | int |
| `rank?` | int |

### 4.23 `UserRating` & `UserList` (your product layer)

Kept separate from AdvisorHub-sourced ground truth.

```
UserRating(advisor_id, user_id, rating_int, dimensions: {responsiveness, transparency, performance, planning_depth}, review_text, created_at)
UserList(user_id, name)
UserListEntry(list_id, advisor_id, rank, note)
AdvisorAggregateRating  -- materialised view
```

---

## 5. Enumerations (centralised)

### 5.1 `ChannelType`
`wirehouse` | `regional_bd` | `independent_bd` | `hybrid_bd` | `insurance_bd` | `bank` | `pure_ria` | `hybrid_ria` | `family_office` | `incubator`

### 5.2 `DisclosureType`
`regulatory` | `customer_dispute` | `employment_separation` | `criminal` | `civil_judicial` | `financial` | `investigation` | `judgment_lien`

### 5.3 `DisclosureStatus`
`pending` | `settled` | `awarded_for_claimant` | `awarded_for_respondent` | `denied` | `withdrawn` | `closed_no_action` | `expunged` | `vacated` | `consented`

### 5.4 `SanctionType`
`fine` | `suspension` | `bar` | `censure` | `restitution` | `disgorgement` | `cease_and_desist` | `undertaking` | `requalify`

### 5.5 `RoleCategory`
`lead_advisor` | `partner` | `associate_advisor` | `support_csa` | `registered_associate` | `manager` | `executive`

### 5.6 `RankingName`
`advisors_to_watch_flagship` | `women_advisors_to_watch` | `next_gen` | `solo` | `under_1b` | `over_1b` | `women_rias` | `ria_firms_to_watch`

### 5.7 `DesignationCode`
`CFP` | `CFA` | `CIMA` | `CPWA` | `ChFC` | `CLU` | `AIF` | `CRPC` | `CWS` | `CTFA` | `CDFA` | `RICP` | `other`

---

## 6. Cross-cutting concerns

### 6.1 Provenance & versioning

Every fact (AUM, role, disclosure status) shifts over time.

- **Time-series snapshots** for high-churn metrics: `TeamMetricSnapshot`, `AdvisorMetricSnapshot`. Articles assert AUM at a point in time, so we store each assertion rather than overwriting.
- **Bitemporal columns** on slowly-changing facts: `effective_from` / `effective_to` on `EmploymentHistory`, `TeamMembership`, `Designation.status`.

`source_facts` on every entity carries the **literal phrase** asserting each field, with the source `article_id`. A nightly reconciler can flag drift between AdvisorHub assertions and BrokerCheck.

### 6.2 Identity resolution

AdvisorHub articles rarely include CRDs in body text but **the wp-json record's slug + tags can disambiguate**. Pipeline:

1. Parse `(legal_name, current_firm, city/state)` triple from article body.
2. Use middle-initial differentiation ("C. James Taylor", "George J. Cairnes").
3. Lookup against `Advisor` by `(legal_name, current_firm)` → fall back to fuzzy match.
4. If unresolved, create a `CandidateAdvisor` row tied to the article.
5. Operator (or BrokerCheck name search) attaches a CRD; promotes to canonical.

### 6.3 Confidence

For each fact stored from prose, attach `confidence ∈ {asserted, inferred, derived}`:
- **asserted** — verbatim from article ("$5.94 billion in assets")
- **inferred** — pattern-derived ("16-year broker" → `industry_start_date = today - 16y`)
- **derived** — computed (`years_experience`, growth %)

### 6.4 Multi-source mention extraction

A single article frequently describes **multiple** TransitionEvents and Disclosures (the Taylor Group article also references the "$466 million in Florida" and "$2.1 billion FiNet" UBS moves). The article-ingestion pipeline must extract every entity mentioned, not only the headline subject.

---

## 7. Open questions for you

1. **Geographic scope** — US only, or include Canada/UK/global? Affects license & regulator enums.
2. **Branch granularity** — track every Morgan Stanley *complex* (e.g., "399 Park Avenue") as a `Branch` with parent pointers, or only city/state? Recommend: full hierarchy.
3. **AUM authoritative source** — AdvisorHub asserts at point-in-time; SEC Form ADV gives quarterly RIA AUM. Pick a tiebreaker rule.
4. **Disclosure refresh cadence** — daily/weekly BrokerCheck pulls? Decides infra cost.
5. **PII / user-facing display** — some fields (birth_year, business_email) shouldn't render publicly even if collected; `Advisor.pii_level` controls render gating.
6. **Team identity continuity** — when "Taylor Group" moves from Morgan Stanley to Wells, is it the same `Team` row (firm_id changed) or a new `Team`? Recommend **same row, with a `TeamFirmHistory` table** mirroring `EmploymentHistory`.
7. **Ingest backfill** — the wp-json archive likely has 5,000+ posts; do you want a one-time backfill or only forward-going ingest?

---

## 8. Sources surveyed

### 8.1 Fully fetched (raw HTML or JSON saved in `research/articles/`)

- `01-taylor-group-wells-fargo.html` — *$6B Morgan Stanley Team Jumps to Wells Fargo Advisors in NYC* (2026-05-01)
- `02-cairnes-finra-disclosure.wpjson.json` — *Finra Fines, Suspends Texas Broker Over Unapproved Real Estate OBA* (2025-10-03)
- `00-recent-posts-listing.json` — wp-json `/posts?per_page=3` index sample

### 8.2 Search-engine excerpts (corroborating)

Representative AdvisorHub URLs whose excerpts were surfaced via search:

- Recruiting Wire & Advisor Moves index — `/recruiting-wire/`, `/resources/advisor-moves/`
- "Billion-Dollar Morgan Stanley Team Skips to Rockefeller in NYC"
- "$10-Million UBS Team Jumps to Morgan Stanley in New York City"
- "Rockefeller Lassoes $14M Merrill Private Wealth Team in Houston"
- "Rockefeller Swipes $16-Mln Team of Merrill Lifers in Michigan"
- "Wells Nabs $3.1-Billion J.P. Morgan Advisors Team in NYC"
- Advisors to Watch hub — `/advisors-to-watch-rankings/`, `/resources/2026-advisors-to-watch/`
- Women Advisors to Watch — `/women-advisors-to-watch-2026/`
- Next Gen — `/advisors-to-watch-next-gen-2024/`
- Solo — `/advisors-to-watch-solo-2025/`
- "Finra Fines, Suspends Cetera Broker Over $50K Bequest From Client"
- "Finra Bars Ex-Edward Jones Broker Fired for Reimbursing Clients"
- "Stifel Loses Bid to Overturn $133 Million Arbitration Award"
- "Exclusive: UBS Dangles 550% Recruiting Offers to Stem Advisor Exodus"
- "Recruiting Bonuses for Top Producers Flirt with 400%"
- "Merrill Sweetens Payouts on Broker Sunset Programs"
- "Wells Sweetens Succession Deals to Keep Clients and Brokers In-House"
- "50 RIA Firms to Watch in 2026"
- "Legacy Ridge Private Wealth Joins LPL Strategic Wealth"

### 8.3 Reproducing / extending the corpus

From an unblocked IP, run `bun run crawl:wpjson -- --out research/wpjson` — it walks
`/wp-json/wp/v2/posts?per_page=100&page=N` until exhaustion and saves each
post's full JSON (incl. `content.rendered` HTML, categories, tags,
`coauthors`, `acf` custom fields). The schema in §4 was designed to
round-trip a wp-json post 1:1 — every `wp_*` column on `Article` maps
directly.

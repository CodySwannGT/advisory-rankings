# Extraction document schema

This is the contract for `research/extractions/<wpId>.json` - what you
write after reading an article. The TypeScript loader
(`src/scripts/load_extractions.ts`, via `bun run load:extractions`)
consumes it.

## Top-level shape

```jsonc
{
  "article": { ... },
  "advisors": [ ... ],
  "firms": [ ... ],
  "branches": [ ... ],                       // wirehouse hierarchies only
  "teams": [ ... ],
  "team_memberships": [ ... ],
  "employment_histories": [ ... ],
  "transition_events": [ ... ],
  "recruiting_deal_quotes": [ ... ],
  "disclosures": [ ... ],
  "sanctions": [ ... ],
  "outside_business_activities": [ ... ],
  "registration_applications": [ ... ],
  "team_metric_snapshots": [ ... ],
  "employer_concentrations": [ ... ],
  "field_assertions": [ ... ]               // provenance log
}
```

Empty arrays are fine — only emit entity types the article actually
exercises. If the article has no extractable content (pure opinion,
editorial, advertorial), set
`article.has_extractable_content: false` and emit `[]` for every other
key.

## Cross-reference rules

Entities reference each other by **natural-key fields**, not UUIDs.
The loader resolves natural keys to UUIDs.

- `advisor_legal_name` — full legal name as it appears in the article
  ("C. James Taylor", "George J. Cairnes").
- `firm_canonical_name` — full firm name ("Morgan Stanley Wealth
  Management", "Wells Fargo Advisors", not "Wells").
- `team_name` — full team name ("The Taylor Group").
- `disclosure_local_key` — a string you invent within the file to link
  a sanction to its parent disclosure. Just be consistent within the
  same extraction.

## Per-entity contracts

### `article`

```jsonc
{
  "wpId": 239679,
  "url": "https://www.advisorhub.com/...",
  "slug": "finra-fines-suspends-...",
  "headline": "...",
  "publishedDate": "2025-10-03",
  "modifiedDate":  "2025-10-03",
  "authors": ["AdvisorHub Staff"],
  "category": "regulatory",                  // see Article.category enum
  "wpCategories": [79],
  "wpTags": [236, 1116],
  "has_extractable_content": true            // false ⇒ skip everything else
}
```

Copy `wpId`, `url`, `slug`, `publishedDate`, `wpCategories`, `wpTags`
verbatim from the wpjson record. `category` is your editorial
classification — use one of:

`advisor_moves` (the dominant Recruiting Wire shape) ·
`recruiting_wire` (deal-economics articles) ·
`regulatory` (FINRA/SEC/state actions on individuals) ·
`arbitration` (customer disputes / awards) ·
`rankings` (Advisors to Watch and similar lists) ·
`firm_news` (firm-level moves, M&A) ·
`succession` · `opinion` · `resource` · `extracted` (fallback)

### `advisors[]`

```jsonc
{
  "natural_key": {
    "legal_name": "George J. Cairnes",       // REQUIRED
    "finra_crd": "1234567",                  // optional but ideal — wins resolver
    "first_employer": "Merrill Lynch",       // first firm in the article's career trail
    "career_start_year": 2000                // optional disambiguator
  },
  "fields": {
    "firstName": "George",
    "middleInitial": "J.",
    "lastName": "Cairnes",
    "preferredName": null,
    "gender": null,                           // 'female'|'male'|'nonbinary'|'undisclosed'
    "industryStartDate": "2000-01-01",       // best-guess Jan 1 if only year known
    "yearsExperience": 23,
    "careerStatus": "suspended"              // 'active'|'retired'|'barred'|'suspended'|'deceased'|'withdrawn'
  }
}
```

### `firms[]`

```jsonc
{
  "natural_key": { "canonical_name": "Wells Fargo Advisors" },
  "fields": {
    "channel": "wirehouse",                   // 'wirehouse'|'regional_bd'|'independent_bd'|'hybrid_bd'|'insurance_bd'|'bank'|'pure_ria'|'hybrid_ria'|'family_office'|'incubator'
    "subChannel": "Wells_FiNet",              // optional (FiNet, LPL_Strategic_Wealth, …)
    "hqCity": "St. Louis",
    "hqState": "MO",
    "foundedYear": null,
    "dissolvedYear": null,
    "dissolutionReason": null,                // 'acquired'|'merged'|'seized'|'bankruptcy'|'voluntary_wind_down'|'rebranded'
    "isAggregator": false
  }
}
```

If a firm appears only as a passing reference (e.g., "competing firms
include Goldman, JPMorgan"), still add it — the article-firm-mention
edge is useful even if you can't fill `channel`.

### `branches[]`

Only emit when the article gives explicit hierarchy info ("the GM
Building branch", "the NYC market", "Midtown Manhattan complex"):

```jsonc
{
  "natural_key": {
    "firm_canonical_name": "Wells Fargo Advisors",
    "level": "branch",                        // 'market'|'complex'|'branch'
    "name": "Wells Fargo Advisors – GM Building"
  },
  "parent_firm_canonical_name": "Wells Fargo Advisors",
  "parent_branch": null,                      // or { "level": "complex", "name": "..." }
  "fields": {
    "buildingName": "GM building",
    "address": "767 Fifth Avenue",
    "city": "New York",
    "state": "NY"
  }
}
```

### `teams[]`

```jsonc
{
  "natural_key": {
    "name": "The Taylor Group",
    "current_firm": "Morgan Stanley Wealth Management"   // pre-move firm
  },
  "fields": {
    "currentFirmId": null,                    // loader fills this
    "firmProgram": null,                      // 'Private Wealth Management', etc.
    "foundedYear": null,
    "serviceModel": "uhnw"                    // 'mass_affluent'|'hnw'|'uhnw'|'institutional'|'mixed'
  }
}
```

### `team_memberships[]`

```jsonc
{
  "team_name": "The Taylor Group",
  "advisor_legal_name": "C. James Taylor",
  "fields": {
    "role": "lead",                           // 'founding_partner'|'lead'|'partner'|'associate'|'support_csa'|'registered_associate'|'analyst'|'intern'
    "startDate": null,                        // only emit if explicitly stated
    "endDate": null
  }
}
```

### `employment_histories[]`

One row per advisor-firm tenure. Critical for career walks.

```jsonc
{
  "advisor_legal_name": "George J. Cairnes",
  "firm_canonical_name": "Wells Fargo Advisors",
  "fields": {
    "roleTitle": null,
    "roleCategory": "lead_advisor",
    "startDate": "2009-01-01",
    "endDate": "2023-07-01",
    "reasonForLeaving": "terminated_for_cause", // 'voluntary'|'terminated_for_cause'|'permitted_to_resign'|'retired'|'deceased'|'other'
    "signingBonusPromissoryNote": true,
    "u5Filed": true,
    "u5FilingDate": "2023-07-15"
  }
}
```

### `transition_events[]`

The headline event of every Recruiting Wire article.

```jsonc
{
  "subject_team_name": "The Taylor Group",       // OR
  "subject_advisor_legal_name": null,            // exactly one of these
  "from_firm_canonical_name": "Morgan Stanley Wealth Management",
  "to_firm_canonical_name":   "Wells Fargo Advisors",
  "fields": {
    "moveDate": "2026-05-01",
    "announcedDate": "2026-05-01",
    "aumMoved": 5940000000,
    "productionT12": 18600000,
    "headcountMoved": 19,
    "isBreakaway": false,                       // moving INTO a pure RIA?
    "isReturn": false                           // boomerang back to a former firm?
  }
}
```

### `recruiting_deal_quotes[]`

Only emit when the article cites specific deal economics
("275% of T-12", "Wells offers up to 180% upfront").

```jsonc
{
  "firm_canonical_name": "Wells Fargo Advisors",
  "applies_to_subject_team_name": "The Taylor Group",   // or null
  "fields": {
    "asOfDate": "2026-05-01",
    "channelTarget": "wirehouse",
    "producerTier": "top_producer",
    "upfrontPctT12": 2.75,                     // 275% → 2.75
    "totalPctT12": null,
    "forgivableLoanTermYears": null,
    "backendMetrics": null,
    "clawbackTerms": null
  }
}
```

### `disclosures[]`

One per discrete event. Cluster siblings (FINRA AWC + state board +
arbitration award + customer dispute + U5) by sharing a
`local_key` prefix within the file (the loader uses it to attach
sanctions, but it does NOT create a `DisclosureCluster` row; the
loader-side resolver groups by `(advisor, type, date)` to find pre-
existing disclosures).

```jsonc
{
  "local_key": "cairnes:finra_awc",            // arbitrary, just be consistent in this file
  "advisor_legal_name": "George J. Cairnes",
  "natural_key": {
    "disclosure_type": "regulatory",            // see DisclosureType enum below
    "regulator": "FINRA",
    "date_resolved": "2025-10-01",              // or date_initiated, or allegation_period_start
    "date_initiated": null,
    "allegation_period_start": "2015-08-01"
  },
  "fields": {
    "firmIdAtTime": null,                       // loader fills if firm_canonical given via 'firm_canonical_name_at_time'
    "disclosureType": "regulatory",
    "regulator": "FINRA",
    "regulatorState": null,
    "forum": "regulator_AWC",
    "allegationText": "…",
    "allegationPeriodStart": "2015-08-01",
    "allegationPeriodEnd":   "2023-04-30",
    "allegationCategories": ["OBA_undisclosed"],
    "productCategories": ["real_estate"],
    "ruleViolations": ["FINRA Rule 3270", "FINRA Rule 2010"],
    "status": "settled",
    "admitDeny": "without_admitting_or_denying",
    "wasProSe": true,
    "dateInitiated": null,
    "dateResolved": "2025-10-01",
    "settlementAmount": null,
    "awardAmount": null,
    "isFirmLevel": false
  }
}
```

`disclosure_type` enum: `regulatory` · `customer_dispute` ·
`employment_separation` · `criminal` · `civil_judicial` · `financial`
· `investigation` · `judgment_lien`

`status` enum: `pending` · `settled` · `awarded_for_claimant` ·
`awarded_for_respondent` · `denied` · `withdrawn` ·
`closed_no_action` · `expunged` · `vacated` · `consented`

`admitDeny` enum: `admitted` · `denied` ·
`without_admitting_or_denying` · `consented_no_admission` · `n_a`

`forum` enum: `FINRA_arbitration` · `state_court` · `federal_court` ·
`JAMS` · `AAA` · `regulator_AWC` (Acceptance, Waiver & Consent letter)

### `sanctions[]`

Multiple sanctions per disclosure (a single AWC may stack a fine +
suspension + censure).

```jsonc
{
  "disclosure_local_key": "cairnes:finra_awc",
  "fields": {
    "sanctionType": "fine",                     // 'fine'|'suspension'|'bar'|'censure'|'restitution'|'disgorgement'|'cease_and_desist'|'undertaking'|'requalify'
    "amount": 25000,
    "durationMonths": null,
    "jurisdiction": "FINRA",
    "effectiveDate": "2025-10-01",
    "endDate": null
  }
}
```

### `outside_business_activities[]`

```jsonc
{
  "advisor_legal_name": "George J. Cairnes",
  "fields": {
    "name": "Real-estate partnership LLC with firm customer",
    "vehicleType": "LLC",                       // 'LLC'|'LP'|'partnership'|'sole_proprietorship'|'nonprofit'|'other'
    "withCustomers": true,
    "disclosedToFirm": false,
    "startDate": "2015-08-01",
    "endDate": "2023-04-30",
    "compensationReceived": true,
    "compensationAmountMin": 175000,
    "compensationAmountMax": null
  }
}
```

### `registration_applications[]`

For attempted-but-not-completed registrations (e.g., "the firm
withdrew his registration application").

```jsonc
{
  "advisor_legal_name": "George J. Cairnes",
  "firm_canonical_name": "Chelsea Financial Services",
  "fields": {
    "appliedDate": "2023-08-01",
    "status": "withdrawn_by_firm",              // 'pending'|'approved'|'withdrawn_by_advisor'|'withdrawn_by_firm'|'denied'
    "resolvedDate": "2023-11-01"
  }
}
```

### `team_metric_snapshots[]`

```jsonc
{
  "team_name": "The Taylor Group",
  "fields": {
    "asOf": "2023-12-31",
    "aum": 1200000000,
    "annualRevenue": null,
    "householdCount": null,
    "teamSize": null,
    "sourceType": "barrons_profile",            // 'advisorhub_article'|'barrons_profile'|'firm_press_release'|'form_adv'|'internal_estimate'
    "sourceRef": "Barron's profile, 2023"
  }
}
```

### `employer_concentrations[]`

```jsonc
{
  "subject_type": "team",                       // 'advisor'|'team'
  "subject_team_name": "The Taylor Group",      // OR subject_advisor_legal_name
  "subject_advisor_legal_name": null,
  "employer_name": "Nvidia",
  "fields": {
    "clientRoleType": "mixed",                  // 'employees'|'executives'|'founders'|'retirees_alumni'|'mixed'
    "concentrationEstimatePct": null,
    "notes": "Concentration of clients who are employees and executives at Nvidia."
  }
}
```

### `field_assertions[]`

Provenance log. Every meaningful fact you put into `fields` should
have a corresponding entry here citing the article phrase that
asserted it. The loader stores these in the append-only
`FieldAssertion` table so future readers can ask "where did we read
this?".

```jsonc
{
  "target_table": "Advisor",                    // 'Advisor'|'Firm'|'Team'|'Disclosure'|'Article'
  "target_ref": "George J. Cairnes",            // legal_name | canonical_name | team_name | disclosure local_key | (Article ref is implicit)
  "field": "yearsExperience",
  "value": 23,
  "quote": "23-year veteran broker",
  "confidence": "asserted"                      // 'asserted'|'inferred'|'derived'
}
```

Don't try to log every field — focus on the ones a future skeptic
would question:
- AUM, production, household count
- Years of experience, career start year
- Sanction amounts, suspension durations, bar durations
- Recruiting deal percentages
- Allegation period dates
- Specific firm names when ambiguous (e.g., "Merrill" → "Merrill Lynch")

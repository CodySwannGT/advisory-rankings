# Worked extraction examples

Two full examples — read once at the start of a batch to anchor the
output shape. Both come from articles that are already in
`research/articles/`, so you can compare your output against
`src/data/seed-data.json` and `src/scripts/seed.ts` (which load the
same content).

---

## Example 1 — Recruiting Wire (advisor team move)

**Article**: *"$6B Morgan Stanley Team Jumps to Wells Fargo Advisors in NYC"* (wpId 252451, 2026-05-01)

**Key sentences from the body**:

> A fast-growing Morgan Stanley team that managed $5.94 billion in assets jumped to Wells Fargo Advisors in New York City…
> The Taylor Group at Morgan Stanley, which is led by 16-year broker C. James Taylor, produced $18.6 million in annual revenue…
> The team reports to Michael Freiheit, branch manager at Wells' Midtown Manhattan office in the GM building, and Patrick Baumann, New York City market leader.
> The 19-person team includes advisors Shane Drumm, Michaella Irvine, Cameron Irvine, Marcus Briscoe, Jamison Embury, Roger McGlynn, Hunter Embury and Kyle Drumm as well as 10 support staff.
> Their practice had ballooned in recent years as the group managed $1.2 billion in 2023, according to a Barron's profile that year.
> A source at a competing firm called the team "high quality" and said that their growth in assets was driven in part by their concentration of clients who are employees and executives at Nvidia.
> Taylor first registered with Hennion & Walsh in 2009 and worked at Merrill Lynch for nine years before moving to Morgan Stanley in 2020, according to BrokerCheck.
> Its offers for a group like Taylor's could include 275% of trailing-12 revenue in upfront cash…

**Extraction**:

```json
{
  "article": {
    "wpId": 252451,
    "url": "https://www.advisorhub.com/6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc/",
    "slug": "6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc",
    "headline": "$6B Morgan Stanley Team Jumps to Wells Fargo Advisors in NYC",
    "publishedDate": "2026-05-01",
    "authors": ["AdvisorHub Staff", "Mason Braswell"],
    "category": "advisor_moves",
    "wpCategories": [7, 79],
    "wpTags": [1133, 272, 1477, 978],
    "has_extractable_content": true
  },

  "firms": [
    {"natural_key": {"canonical_name": "Morgan Stanley Wealth Management"},
     "fields": {"channel": "wirehouse"}},
    {"natural_key": {"canonical_name": "Wells Fargo Advisors"},
     "fields": {"channel": "wirehouse", "hqCity": "St. Louis", "hqState": "MO"}},
    {"natural_key": {"canonical_name": "Hennion & Walsh"},
     "fields": {"channel": "regional_bd"}},
    {"natural_key": {"canonical_name": "Merrill Lynch"},
     "fields": {"channel": "wirehouse"}}
  ],

  "branches": [
    {"natural_key": {"firm_canonical_name": "Wells Fargo Advisors",
                     "level": "branch",
                     "name": "Wells Fargo Advisors – GM Building"},
     "parent_firm_canonical_name": "Wells Fargo Advisors",
     "fields": {"buildingName": "GM building", "city": "New York", "state": "NY"}}
  ],

  "advisors": [
    {"natural_key": {"legal_name": "C. James Taylor",
                     "first_employer": "Hennion & Walsh",
                     "career_start_year": 2009},
     "fields": {"firstName": "C.", "lastName": "Taylor",
                "preferredName": "James",
                "industryStartDate": "2009-01-01",
                "yearsExperience": 16, "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Shane Drumm"},
     "fields": {"firstName": "Shane", "lastName": "Drumm", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Michaella Irvine"},
     "fields": {"firstName": "Michaella", "lastName": "Irvine",
                "gender": "female", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Cameron Irvine"},
     "fields": {"firstName": "Cameron", "lastName": "Irvine", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Marcus Briscoe"},
     "fields": {"firstName": "Marcus", "lastName": "Briscoe", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Jamison Embury"},
     "fields": {"firstName": "Jamison", "lastName": "Embury", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Roger McGlynn"},
     "fields": {"firstName": "Roger", "lastName": "McGlynn", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Hunter Embury"},
     "fields": {"firstName": "Hunter", "lastName": "Embury", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Kyle Drumm"},
     "fields": {"firstName": "Kyle", "lastName": "Drumm", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Michael Freiheit"},
     "fields": {"firstName": "Michael", "lastName": "Freiheit", "careerStatus": "active"}},
    {"natural_key": {"legal_name": "Patrick Baumann"},
     "fields": {"firstName": "Patrick", "lastName": "Baumann", "careerStatus": "active"}}
  ],

  "teams": [
    {"natural_key": {"name": "The Taylor Group",
                     "current_firm": "Morgan Stanley Wealth Management"},
     "fields": {"serviceModel": "uhnw"}}
  ],

  "team_memberships": [
    {"team_name": "The Taylor Group", "advisor_legal_name": "C. James Taylor",
     "fields": {"role": "lead"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Shane Drumm",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Michaella Irvine",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Cameron Irvine",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Marcus Briscoe",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Jamison Embury",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Roger McGlynn",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Hunter Embury",
     "fields": {"role": "partner"}},
    {"team_name": "The Taylor Group", "advisor_legal_name": "Kyle Drumm",
     "fields": {"role": "partner"}}
  ],

  "employment_histories": [
    {"advisor_legal_name": "C. James Taylor",
     "firm_canonical_name": "Hennion & Walsh",
     "fields": {"startDate": "2009-01-01", "endDate": "2011-01-01",
                "reasonForLeaving": "voluntary"}},
    {"advisor_legal_name": "C. James Taylor",
     "firm_canonical_name": "Merrill Lynch",
     "fields": {"startDate": "2011-01-01", "endDate": "2020-01-01",
                "reasonForLeaving": "voluntary"}},
    {"advisor_legal_name": "C. James Taylor",
     "firm_canonical_name": "Morgan Stanley Wealth Management",
     "fields": {"startDate": "2020-01-01", "endDate": "2026-05-01",
                "reasonForLeaving": "voluntary"}},
    {"advisor_legal_name": "C. James Taylor",
     "firm_canonical_name": "Wells Fargo Advisors",
     "fields": {"startDate": "2026-05-01"}}
  ],

  "transition_events": [
    {"subject_team_name": "The Taylor Group",
     "from_firm_canonical_name": "Morgan Stanley Wealth Management",
     "to_firm_canonical_name":   "Wells Fargo Advisors",
     "fields": {"moveDate": "2026-05-01", "announcedDate": "2026-05-01",
                "aumMoved": 5940000000, "productionT12": 18600000,
                "headcountMoved": 19, "isBreakaway": false, "isReturn": false}}
  ],

  "recruiting_deal_quotes": [
    {"firm_canonical_name": "Wells Fargo Advisors",
     "applies_to_subject_team_name": "The Taylor Group",
     "fields": {"asOfDate": "2026-05-01", "channelTarget": "wirehouse",
                "producerTier": "top_producer", "upfrontPctT12": 2.75}}
  ],

  "team_metric_snapshots": [
    {"team_name": "The Taylor Group",
     "fields": {"asOf": "2023-12-31", "aum": 1200000000,
                "sourceType": "barrons_profile",
                "sourceRef": "Barron's profile, 2023"}},
    {"team_name": "The Taylor Group",
     "fields": {"asOf": "2026-05-01", "aum": 5940000000,
                "annualRevenue": 18600000, "teamSize": 19,
                "sourceType": "advisorhub_article"}}
  ],

  "employer_concentrations": [
    {"subject_type": "team", "subject_team_name": "The Taylor Group",
     "employer_name": "Nvidia",
     "fields": {"clientRoleType": "mixed",
                "notes": "Concentration of clients who are employees and executives at Nvidia."}}
  ],

  "field_assertions": [
    {"target_table": "Team", "target_ref": "The Taylor Group",
     "field": "aum", "value": 5940000000,
     "quote": "Morgan Stanley team that managed $5.94 billion in assets",
     "confidence": "asserted"},
    {"target_table": "Team", "target_ref": "The Taylor Group",
     "field": "annualRevenue", "value": 18600000,
     "quote": "produced $18.6 million in annual revenue",
     "confidence": "asserted"},
    {"target_table": "Advisor", "target_ref": "C. James Taylor",
     "field": "yearsExperience", "value": 16,
     "quote": "16-year broker C. James Taylor",
     "confidence": "asserted"},
    {"target_table": "Disclosure", "target_ref": null,
     "field": null, "value": null, "quote": null, "confidence": null}
  ]
}
```

> Note: the last field-assertion entry above is a *placeholder* showing
> the shape — drop entries with `null` fields. Only emit assertions for
> facts you actually want logged.

---

## Example 2 — FINRA regulatory disclosure

**Article**: *"Finra Fines, Suspends Texas Broker Over Unapproved Real Estate OBA"* (wpId 239679, 2025-10-03)

This article exercises the disclosure-cluster pattern: one scandal
produces five parallel disclosure rows.

**Key sentences**:

> The Financial Industry Regulatory Authority on Wednesday suspended for four months and fined $25,000 a former Wells Fargo broker…
> George J. Cairnes allegedly from August 2015 to April 2023 "partnered with a firm customer to identify, buy, manage, and sell real estate" without firm permission…
> The 23-year veteran broker created a limited liability company for the "partnership's activities," and he received compensation from the venture…
> Finra said he violated its Rule 3270, which prohibits brokers from receiving compensation from an OBA without approval, and its catch-all Rule 2010 requiring "high standards" of conduct.
> Cairnes did not have legal representation in the settlement…
> Wells in July 2023 terminated Cairnes over allegations that he "facilitated a loan between clients as well as loans and other transactions between a client and individuals associated with [Cairnes]"…
> In April 2024, Cairnes consented to a Disciplinary Order by the Texas State Securities Board… he was paid at least $175,000 for helping the client set up and run a real estate business, and he was barred from registering to be licensed in Texas for two years.
> A Finra arbitration panel in August ordered Cairnes to pay Wells $180,000 over two promissory notes that he signed when he joined the firm in 2009 from the defunct Stanford Financial Group.
> Cairnes also faces a pending customer dispute from April 2023 based on allegations that the client established a line of credit to loan money to Cairnes…
> Cairnes started his career at Merrill Lynch in 2000 and joined Stanford Financial in 2008, the year before it was seized by the federal government and its owner, Robert Allen Stanford, was charged with and later convicted of running an $8 billion Ponzi scheme.
> After leaving Wells, Cairnes joined an independent broker-dealer, Chelsea Financial Services, but the firm withdrew his registration application in November 2023…

**Extraction** (abbreviated to highlight the cluster pattern):

```json
{
  "article": {
    "wpId": 239679,
    "url": "https://www.advisorhub.com/finra-fines-suspends-texas-broker-over-unapproved-real-estate-oba/",
    "slug": "finra-fines-suspends-texas-broker-over-unapproved-real-estate-oba",
    "headline": "Finra Fines, Suspends Texas Broker Over Unapproved Real Estate OBA",
    "publishedDate": "2025-10-03",
    "authors": [],
    "category": "regulatory",
    "wpCategories": [79], "wpTags": [236, 1116, 978],
    "has_extractable_content": true
  },

  "firms": [
    {"natural_key": {"canonical_name": "Wells Fargo Advisors"},
     "fields": {"channel": "wirehouse"}},
    {"natural_key": {"canonical_name": "Merrill Lynch"},
     "fields": {"channel": "wirehouse"}},
    {"natural_key": {"canonical_name": "Stanford Financial Group"},
     "fields": {"channel": "regional_bd", "dissolvedYear": 2009,
                "dissolutionReason": "seized",
                "notes": "Seized by federal regulators in 2009; founder Robert Allen Stanford convicted of running an $8 billion Ponzi scheme."}},
    {"natural_key": {"canonical_name": "Chelsea Financial Services"},
     "fields": {"channel": "independent_bd"}}
  ],

  "advisors": [
    {"natural_key": {"legal_name": "George J. Cairnes",
                     "first_employer": "Merrill Lynch",
                     "career_start_year": 2000},
     "fields": {"firstName": "George", "middleInitial": "J.",
                "lastName": "Cairnes",
                "industryStartDate": "2000-01-01",
                "yearsExperience": 23,
                "careerStatus": "suspended"}}
  ],

  "employment_histories": [
    {"advisor_legal_name": "George J. Cairnes",
     "firm_canonical_name": "Merrill Lynch",
     "fields": {"startDate": "2000-01-01", "endDate": "2008-01-01",
                "reasonForLeaving": "voluntary"}},
    {"advisor_legal_name": "George J. Cairnes",
     "firm_canonical_name": "Stanford Financial Group",
     "fields": {"startDate": "2008-01-01", "endDate": "2009-02-01",
                "reasonForLeaving": "other"}},
    {"advisor_legal_name": "George J. Cairnes",
     "firm_canonical_name": "Wells Fargo Advisors",
     "fields": {"startDate": "2009-01-01", "endDate": "2023-07-01",
                "reasonForLeaving": "terminated_for_cause",
                "signingBonusPromissoryNote": true,
                "u5Filed": true, "u5FilingDate": "2023-07-15"}}
  ],

  "registration_applications": [
    {"advisor_legal_name": "George J. Cairnes",
     "firm_canonical_name": "Chelsea Financial Services",
     "fields": {"appliedDate": "2023-08-01",
                "status": "withdrawn_by_firm",
                "resolvedDate": "2023-11-01"}}
  ],

  "disclosures": [
    {"local_key": "cairnes:finra_awc",
     "advisor_legal_name": "George J. Cairnes",
     "natural_key": {"disclosure_type": "regulatory",
                     "regulator": "FINRA",
                     "date_resolved": "2025-10-01",
                     "allegation_period_start": "2015-08-01"},
     "fields": {"disclosureType": "regulatory", "regulator": "FINRA",
                "forum": "regulator_AWC",
                "allegationText": "Partnered with a firm customer to identify, buy, manage, and sell real estate without firm permission. Created a limited liability company for the partnership's activities; received compensation; falsely attested on multiple firm compliance questionnaires.",
                "allegationPeriodStart": "2015-08-01",
                "allegationPeriodEnd": "2023-04-30",
                "allegationCategories": ["OBA_undisclosed"],
                "productCategories": ["real_estate"],
                "ruleViolations": ["FINRA Rule 3270", "FINRA Rule 2010"],
                "status": "settled",
                "admitDeny": "without_admitting_or_denying",
                "wasProSe": true,
                "dateResolved": "2025-10-01"}},

    {"local_key": "cairnes:u5",
     "advisor_legal_name": "George J. Cairnes",
     "natural_key": {"disclosure_type": "employment_separation",
                     "regulator": "firm_internal",
                     "date_initiated": "2023-07-01"},
     "fields": {"disclosureType": "employment_separation",
                "regulator": "firm_internal",
                "allegationText": "Wells Fargo terminated Cairnes after allegations he facilitated a loan between clients as well as loans and other transactions between a client and individuals associated with him.",
                "allegationCategories": ["loan_to_client", "loan_from_client"],
                "status": "closed_no_action",
                "dateInitiated": "2023-07-01"}},

    {"local_key": "cairnes:tx_state",
     "advisor_legal_name": "George J. Cairnes",
     "natural_key": {"disclosure_type": "regulatory",
                     "regulator": "state_securities",
                     "date_resolved": "2024-04-01"},
     "fields": {"disclosureType": "regulatory",
                "regulator": "state_securities", "regulatorState": "TX",
                "forum": "regulator_AWC",
                "allegationText": "Texas State Securities Board: paid at least $175,000 helping a firm customer set up and run a real estate business.",
                "allegationCategories": ["OBA_undisclosed"],
                "status": "consented",
                "admitDeny": "consented_no_admission",
                "dateResolved": "2024-04-01"}},

    {"local_key": "cairnes:promissory",
     "advisor_legal_name": "George J. Cairnes",
     "natural_key": {"disclosure_type": "civil_judicial",
                     "regulator": "FINRA",
                     "date_resolved": "2025-08-01"},
     "fields": {"disclosureType": "civil_judicial",
                "regulator": "FINRA", "forum": "FINRA_arbitration",
                "allegationText": "FINRA arbitration panel ordered Cairnes to pay Wells Fargo $180,000 over two promissory notes signed when he joined the firm in 2009 from Stanford Financial.",
                "status": "awarded_for_claimant",
                "dateResolved": "2025-08-01",
                "awardAmount": 180000}},

    {"local_key": "cairnes:cust_dispute",
     "advisor_legal_name": "George J. Cairnes",
     "natural_key": {"disclosure_type": "customer_dispute",
                     "regulator": "firm_internal",
                     "date_initiated": "2023-04-01"},
     "fields": {"disclosureType": "customer_dispute",
                "regulator": "firm_internal",
                "allegationText": "Customer alleges they established a line of credit to loan money to Cairnes as well as his family members and friends, which has not been fully repaid.",
                "allegationCategories": ["loan_from_client"],
                "status": "pending",
                "dateInitiated": "2023-04-01"}}
  ],

  "sanctions": [
    {"disclosure_local_key": "cairnes:finra_awc",
     "fields": {"sanctionType": "fine", "amount": 25000,
                "jurisdiction": "FINRA", "effectiveDate": "2025-10-01"}},
    {"disclosure_local_key": "cairnes:finra_awc",
     "fields": {"sanctionType": "suspension", "durationMonths": 4,
                "jurisdiction": "FINRA", "effectiveDate": "2025-10-01"}},
    {"disclosure_local_key": "cairnes:tx_state",
     "fields": {"sanctionType": "bar", "durationMonths": 24,
                "jurisdiction": "Texas", "effectiveDate": "2024-04-01"}}
  ],

  "outside_business_activities": [
    {"advisor_legal_name": "George J. Cairnes",
     "fields": {"name": "Real-estate partnership LLC with firm customer",
                "vehicleType": "LLC",
                "withCustomers": true, "disclosedToFirm": false,
                "startDate": "2015-08-01", "endDate": "2023-04-30",
                "compensationReceived": true,
                "compensationAmountMin": 175000}}
  ],

  "field_assertions": [
    {"target_table": "Advisor", "target_ref": "George J. Cairnes",
     "field": "yearsExperience", "value": 23,
     "quote": "23-year veteran broker", "confidence": "asserted"},
    {"target_table": "Disclosure", "target_ref": "cairnes:finra_awc",
     "field": "ruleViolations",
     "value": ["FINRA Rule 3270", "FINRA Rule 2010"],
     "quote": "violated its Rule 3270, which prohibits brokers from receiving compensation from an OBA without approval, and its catch-all Rule 2010",
     "confidence": "asserted"}
  ]
}
```

---

## Patterns to copy from these examples

- **Career trail**: walk every "started at … in YYYY", "moved to … in YYYY",
  "joined … in YYYY" sentence in the article and emit one
  `employment_histories[]` row per tenure. The first firm in the
  trail goes into `advisors[0].natural_key.first_employer` —
  that's how the resolver disambiguates same-named advisors.
- **Money parsing**: `$5.94 billion` → `5940000000` (no decimals,
  just integer dollars). `$18.6 million` → `18600000`. `275% of
  T-12` → `2.75` (decimal, not percent).
- **Date precision**: when the article gives only a year, use
  `YYYY-01-01`. When it gives a month, `YYYY-MM-01`. Avoid
  fabricating day-level precision you don't have.
- **`category` field on Article**: pick from the enum in
  schema-guide.md based on the dominant story shape — `advisor_moves`
  vs `regulatory` vs `arbitration` etc.
- **Rule violations**: keep the original phrasing verbatim ("FINRA
  Rule 3270" not "Rule 3270"). The downstream join queries depend on
  it.
- **Field assertions**: focus on the facts a future skeptic would
  question (AUM, sanctions, deal %, dates). Don't log a quote for
  every `lastName`.

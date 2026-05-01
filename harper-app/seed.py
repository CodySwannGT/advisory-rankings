#!/usr/bin/env python3
"""Seed Harper with canonical sample data from the two scraped articles.

Targets whichever Harper $HDB_TARGET_URL points at (HTTPS for Fabric),
or falls back to the local Unix domain socket. See scripts/_harper.py
for the transport rules.
"""
import pathlib
import sys

# Reuse the same UUID derivation as scripts/ingest.py so seed-loaded rows
# and ingest-loaded rows merge under the same primary keys.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
from _ids import uid, firm_id, article_id  # noqa: E402
from _harper import upsert as _upsert, describe_target  # noqa: E402

print(f"[seed] target: {describe_target()}", file=sys.stderr)


def insert(table, records):
    """Idempotent upsert. Named `insert` for backwards compatibility with
    earlier versions of this script."""
    n = _upsert(table, records)
    print(f"  upsert {table}: {len(records)} ({n} touched)")

# ─── FIRMS ───
# Firm.id is derived from the canonical name via firm_id() so seed-loaded
# rows and crawler-loaded rows merge under one primary key.
FIRM_NAMES = {
    "morgan_stanley": "Morgan Stanley Wealth Management",
    "wells_fargo":    "Wells Fargo Advisors",
    "wells_finet":    "Wells Fargo Advisors Financial Network (FiNet)",
    "merrill_lynch":  "Merrill Lynch",
    "bofa":           "Bank of America",
    "hennion_walsh":  "Hennion & Walsh",
    "ubs":            "UBS Wealth Management USA",
    "stanford_fin":   "Stanford Financial Group",
    "chelsea_fin":    "Chelsea Financial Services",
    "jpmorgan":       "J.P. Morgan Advisors",
}
def fid(short): return firm_id(FIRM_NAMES[short])

firms = [
    {"id": fid("morgan_stanley"), "name": FIRM_NAMES["morgan_stanley"],
     "channel": "wirehouse", "subChannel": "Morgan_Stanley_Private_Wealth", "hqCity": "New York", "hqState": "NY", "hqCountry": "US"},
    {"id": fid("wells_fargo"),    "name": FIRM_NAMES["wells_fargo"],
     "channel": "wirehouse", "subChannel": "Wells_Fargo_Advisors", "hqCity": "St. Louis", "hqState": "MO", "hqCountry": "US"},
    {"id": fid("wells_finet"),    "name": FIRM_NAMES["wells_finet"],
     "channel": "independent_bd", "subChannel": "Wells_FiNet", "hqCity": "St. Louis", "hqState": "MO"},
    {"id": fid("merrill_lynch"),  "name": FIRM_NAMES["merrill_lynch"],
     "channel": "wirehouse", "hqCity": "New York", "hqState": "NY", "hqCountry": "US",
     "parentFirmId": fid("bofa")},
    {"id": fid("bofa"),           "name": FIRM_NAMES["bofa"],
     "channel": "bank", "hqCity": "Charlotte", "hqState": "NC"},
    {"id": fid("hennion_walsh"),  "name": FIRM_NAMES["hennion_walsh"],
     "channel": "regional_bd", "hqCity": "Parsippany", "hqState": "NJ"},
    {"id": fid("ubs"),            "name": FIRM_NAMES["ubs"],
     "channel": "wirehouse", "hqCity": "Weehawken", "hqState": "NJ"},
    {"id": fid("stanford_fin"),   "name": FIRM_NAMES["stanford_fin"],
     "channel": "regional_bd", "foundedYear": 1986, "dissolvedYear": 2009,
     "dissolutionReason": "seized",
     "notes": "Seized by federal regulators in 2009; founder Robert Allen Stanford convicted of running an $8 billion Ponzi scheme."},
    {"id": fid("chelsea_fin"),    "name": FIRM_NAMES["chelsea_fin"],
     "channel": "independent_bd"},
    {"id": fid("jpmorgan"),       "name": FIRM_NAMES["jpmorgan"],
     "channel": "wirehouse", "hqCity": "New York", "hqState": "NY"},
]
insert("Firm", firms)

# ─── BRANCHES (3-level: market → complex → branch for Wells Fargo NYC) ───
branches = [
    {"id": uid("branch:wells_nyc_market"), "firmId": fid("wells_fargo"),
     "level": "market", "name": "Wells Fargo New York City market",
     "city": "New York", "state": "NY"},
    {"id": uid("branch:wells_nyc_complex"), "firmId": fid("wells_fargo"),
     "parentBranchId": uid("branch:wells_nyc_market"),
     "level": "complex", "name": "Midtown Manhattan complex",
     "city": "New York", "state": "NY"},
    {"id": uid("branch:wells_gm_building"), "firmId": fid("wells_fargo"),
     "parentBranchId": uid("branch:wells_nyc_complex"),
     "level": "branch", "name": "Wells Fargo Advisors – GM Building",
     "buildingName": "GM building",
     "address": "767 Fifth Avenue", "city": "New York", "state": "NY"},
]
insert("Branch", branches)

# ─── ADVISORS ───
# Lead of Taylor Group + the 8 named advisors
advisors = [
    {"id": uid("advisor:cjt"), "legalName": "C. James Taylor",
     "firstName": "C.", "lastName": "Taylor", "preferredName": "James",
     "industryStartDate": "2009-01-01", "yearsExperience": 16,
     "careerStatus": "active", "piiLevel": "public"},
    {"id": uid("advisor:shane_drumm"),    "legalName": "Shane Drumm",    "firstName": "Shane",    "lastName": "Drumm",    "careerStatus": "active"},
    {"id": uid("advisor:michaella_irvine"),"legalName": "Michaella Irvine","firstName": "Michaella","lastName": "Irvine",   "gender": "female", "careerStatus": "active"},
    {"id": uid("advisor:cameron_irvine"), "legalName": "Cameron Irvine", "firstName": "Cameron",  "lastName": "Irvine",   "careerStatus": "active"},
    {"id": uid("advisor:marcus_briscoe"), "legalName": "Marcus Briscoe", "firstName": "Marcus",   "lastName": "Briscoe",  "careerStatus": "active"},
    {"id": uid("advisor:jamison_embury"), "legalName": "Jamison Embury", "firstName": "Jamison",  "lastName": "Embury",   "careerStatus": "active"},
    {"id": uid("advisor:roger_mcglynn"),  "legalName": "Roger McGlynn",  "firstName": "Roger",    "lastName": "McGlynn",  "careerStatus": "active"},
    {"id": uid("advisor:hunter_embury"),  "legalName": "Hunter Embury",  "firstName": "Hunter",   "lastName": "Embury",   "careerStatus": "active"},
    {"id": uid("advisor:kyle_drumm"),     "legalName": "Kyle Drumm",     "firstName": "Kyle",     "lastName": "Drumm",    "careerStatus": "active"},
    # Wells Fargo branch / market managers mentioned by name
    {"id": uid("advisor:michael_freiheit"), "legalName": "Michael Freiheit",
     "firstName": "Michael", "lastName": "Freiheit", "careerStatus": "active"},
    {"id": uid("advisor:patrick_baumann"),  "legalName": "Patrick Baumann",
     "firstName": "Patrick", "lastName": "Baumann", "careerStatus": "active"},
    # FINRA disclosure article subject
    {"id": uid("advisor:george_cairnes"), "legalName": "George J. Cairnes",
     "firstName": "George", "middleInitial": "J.", "lastName": "Cairnes",
     "industryStartDate": "2000-01-01", "yearsExperience": 23,
     "careerStatus": "suspended", "piiLevel": "public"},
]
insert("Advisor", advisors)

# ─── BRANCH ASSIGNMENTS ───
insert("BranchAssignment", [
    {"id": uid("branchasst:freiheit"), "branchId": uid("branch:wells_gm_building"),
     "advisorId": uid("advisor:michael_freiheit"), "role": "branch_manager",
     "effectiveFrom": "2024-01-01"},
    {"id": uid("branchasst:baumann"), "branchId": uid("branch:wells_nyc_market"),
     "advisorId": uid("advisor:patrick_baumann"), "role": "market_leader",
     "effectiveFrom": "2024-01-01"},
])

# ─── TEAMS ───
insert("Team", [
    {"id": uid("team:taylor_group"), "name": "The Taylor Group",
     "currentFirmId": fid("wells_fargo"),
     "currentBranchId": uid("branch:wells_gm_building"),
     "serviceModel": "uhnw"},
])

# ─── TEAM MEMBERSHIPS ───
team_members = [
    ("cjt",              "lead"),
    ("shane_drumm",      "partner"),
    ("michaella_irvine", "partner"),
    ("cameron_irvine",   "partner"),
    ("marcus_briscoe",   "partner"),
    ("jamison_embury",   "partner"),
    ("roger_mcglynn",    "partner"),
    ("hunter_embury",    "partner"),
    ("kyle_drumm",       "partner"),
]
insert("TeamMembership", [
    {"id": uid(f"tm:taylor:{slug}"), "teamId": uid("team:taylor_group"),
     "advisorId": uid(f"advisor:{slug}"), "role": role,
     "startDate": "2026-05-01"}
    for slug, role in team_members
])

# ─── TEAM METRIC SNAPSHOTS (Taylor Group AUM time-series) ───
insert("TeamMetricSnapshot", [
    {"id": uid("tms:taylor:2023"), "teamId": uid("team:taylor_group"),
     "asOf": "2023-12-31", "aum": 1_200_000_000.0,
     "sourceType": "barrons_profile",
     "sourceRef": "Barron's profile, 2023"},
    {"id": uid("tms:taylor:2026-05"), "teamId": uid("team:taylor_group"),
     "asOf": "2026-05-01", "aum": 5_940_000_000.0,
     "annualRevenue": 18_600_000.0, "teamSize": 19,
     "sourceType": "advisorhub_article",
     "sourceRef": "https://www.advisorhub.com/6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc/"},
])

# ─── EMPLOYMENT HISTORY ───
insert("EmploymentHistory", [
    # Taylor's career
    {"id": uid("eh:cjt:hennion"), "advisorId": uid("advisor:cjt"),
     "firmId": fid("hennion_walsh"),
     "roleTitle": "Financial Advisor", "roleCategory": "lead_advisor",
     "startDate": "2009-01-01", "endDate": "2011-01-01",
     "reasonForLeaving": "voluntary"},
    {"id": uid("eh:cjt:merrill"), "advisorId": uid("advisor:cjt"),
     "firmId": fid("merrill_lynch"),
     "roleTitle": "Financial Advisor", "roleCategory": "lead_advisor",
     "startDate": "2011-01-01", "endDate": "2020-01-01",
     "reasonForLeaving": "voluntary"},
    {"id": uid("eh:cjt:ms"), "advisorId": uid("advisor:cjt"),
     "firmId": fid("morgan_stanley"),
     "roleTitle": "Managing Director", "roleCategory": "lead_advisor",
     "startDate": "2020-01-01", "endDate": "2026-05-01",
     "reasonForLeaving": "voluntary"},
    {"id": uid("eh:cjt:wells"), "advisorId": uid("advisor:cjt"),
     "firmId": fid("wells_fargo"),
     "branchId": uid("branch:wells_gm_building"),
     "roleTitle": "Managing Director", "roleCategory": "lead_advisor",
     "startDate": "2026-05-01"},
    # Cairnes's career
    {"id": uid("eh:cairnes:merrill"), "advisorId": uid("advisor:george_cairnes"),
     "firmId": fid("merrill_lynch"),
     "startDate": "2000-01-01", "endDate": "2008-01-01",
     "reasonForLeaving": "voluntary"},
    {"id": uid("eh:cairnes:stanford"), "advisorId": uid("advisor:george_cairnes"),
     "firmId": fid("stanford_fin"),
     "startDate": "2008-01-01", "endDate": "2009-02-01",
     "reasonForLeaving": "other"},
    {"id": uid("eh:cairnes:wells"), "advisorId": uid("advisor:george_cairnes"),
     "firmId": fid("wells_fargo"),
     "startDate": "2009-01-01", "endDate": "2023-07-01",
     "reasonForLeaving": "terminated_for_cause",
     "signingBonusPromissoryNote": True,
     "u5Filed": True, "u5FilingDate": "2023-07-15",
     "terminationDisclosureId": uid("disc:cairnes:u5")},
])

# ─── REGISTRATION APPLICATIONS (Cairnes/Chelsea — withdrawn) ───
insert("RegistrationApplication", [
    {"id": uid("regapp:cairnes:chelsea"),
     "advisorId": uid("advisor:george_cairnes"),
     "firmId": fid("chelsea_fin"),
     "appliedDate": "2023-08-01",
     "status": "withdrawn_by_firm",
     "resolvedDate": "2023-11-01"},
])

# ─── EMPLOYER CONCENTRATION ───
insert("EmployerConcentration", [
    {"id": uid("ec:taylor:nvidia"), "subjectType": "team",
     "subjectId": uid("team:taylor_group"),
     "employerName": "Nvidia", "clientRoleType": "mixed",
     "notes": "Concentration of clients who are employees and executives at Nvidia."},
])

# ─── TRANSITION EVENT ───
insert("TransitionEvent", [
    {"id": uid("te:taylor_group_2026"),
     "subjectTeamId": uid("team:taylor_group"),
     "fromFirmId":    fid("morgan_stanley"),
     "toFirmId":      fid("wells_fargo"),
     "toBranchId":    uid("branch:wells_gm_building"),
     "moveDate": "2026-05-01", "announcedDate": "2026-05-01",
     "aumMoved": 5_940_000_000.0,
     "productionT12": 18_600_000.0,
     "headcountMoved": 19,
     "isBreakaway": False, "isReturn": False,
     "recruitingDealId": uid("deal:wells:taylor")},
])

# ─── RECRUITING DEAL QUOTE ───
insert("RecruitingDealQuote", [
    {"id": uid("deal:wells:taylor"), "firmId": fid("wells_fargo"),
     "asOfDate": "2026-05-01", "channelTarget": "wirehouse",
     "producerTier": "top_producer",
     "upfrontPctT12": 2.75,
     "backendMetrics": "Plus back-end bonuses (specifics not disclosed)",
     "appliesToTransitionEventId": uid("te:taylor_group_2026")},
])

# ─── DISCLOSURE CLUSTER (Cairnes scandal) ───
insert("DisclosureCluster", [
    {"id": uid("disc_cluster:cairnes_oba"),
     "rootEventDescription": "Cairnes real-estate OBA with firm customer (2015-2023); FINRA AWC + state action + arbitration award + customer dispute + U5",
     "primaryDisclosureId": uid("disc:cairnes:finra_awc")},
])

# ─── DISCLOSURES (5 parallel events) ───
disclosures = [
    {"id": uid("disc:cairnes:finra_awc"), "advisorId": uid("advisor:george_cairnes"),
     "firmIdAtTime": fid("wells_fargo"),
     "clusterId": uid("disc_cluster:cairnes_oba"),
     "disclosureType": "regulatory",
     "regulator": "FINRA", "forum": "regulator_AWC",
     "allegationText": "Partnered with a firm customer to identify, buy, manage, and sell real estate without firm permission. Created a limited liability company for the partnership's activities; received compensation; falsely attested on multiple firm compliance questionnaires.",
     "allegationPeriodStart": "2015-08-01",
     "allegationPeriodEnd":   "2023-04-30",
     "allegationCategories": ["OBA_undisclosed"],
     "productCategories": ["real_estate"],
     "ruleViolations": ["FINRA Rule 3270", "FINRA Rule 2010"],
     "status": "settled",
     "admitDeny": "without_admitting_or_denying",
     "wasProSe": True,
     "dateResolved": "2025-10-01",
     "isFirmLevel": False},
    {"id": uid("disc:cairnes:u5"), "advisorId": uid("advisor:george_cairnes"),
     "firmIdAtTime": fid("wells_fargo"),
     "clusterId": uid("disc_cluster:cairnes_oba"),
     "disclosureType": "employment_separation",
     "regulator": "firm_internal",
     "allegationText": "Wells Fargo terminated Cairnes after allegations he facilitated a loan between clients as well as loans and other transactions between a client and individuals associated with him.",
     "allegationCategories": ["loan_to_client", "loan_from_client"],
     "status": "closed_no_action",
     "dateInitiated": "2023-07-01",
     "isFirmLevel": False},
    {"id": uid("disc:cairnes:tx_state"), "advisorId": uid("advisor:george_cairnes"),
     "clusterId": uid("disc_cluster:cairnes_oba"),
     "disclosureType": "regulatory",
     "regulator": "state_securities", "regulatorState": "TX",
     "forum": "regulator_AWC",
     "allegationText": "Texas State Securities Board: paid at least $175,000 helping a firm customer set up and run a real estate business.",
     "allegationCategories": ["OBA_undisclosed"],
     "status": "consented", "admitDeny": "consented_no_admission",
     "dateResolved": "2024-04-01"},
    {"id": uid("disc:cairnes:promissory"), "advisorId": uid("advisor:george_cairnes"),
     "firmIdAtTime": fid("wells_fargo"),
     "clusterId": uid("disc_cluster:cairnes_oba"),
     "disclosureType": "civil_judicial",
     "regulator": "FINRA", "forum": "FINRA_arbitration",
     "allegationText": "FINRA arbitration panel ordered Cairnes to pay Wells Fargo $180,000 over two promissory notes signed when he joined the firm in 2009 from Stanford Financial.",
     "status": "awarded_for_claimant",
     "dateResolved": "2025-08-01",
     "awardAmount": 180_000.0,
     "isFirmLevel": False},
    {"id": uid("disc:cairnes:cust_dispute"), "advisorId": uid("advisor:george_cairnes"),
     "firmIdAtTime": fid("wells_fargo"),
     "clusterId": uid("disc_cluster:cairnes_oba"),
     "disclosureType": "customer_dispute",
     "regulator": "firm_internal",
     "allegationText": "Customer alleges they established a line of credit to loan money to Cairnes as well as his family members and friends, which has not been fully repaid.",
     "allegationCategories": ["loan_from_client"],
     "status": "pending",
     "dateInitiated": "2023-04-01"},
]
insert("Disclosure", disclosures)

# ─── SANCTIONS ───
insert("Sanction", [
    {"id": uid("sanc:cairnes:fine"), "disclosureId": uid("disc:cairnes:finra_awc"),
     "sanctionType": "fine", "amount": 25_000.0, "jurisdiction": "FINRA",
     "effectiveDate": "2025-10-01"},
    {"id": uid("sanc:cairnes:susp"), "disclosureId": uid("disc:cairnes:finra_awc"),
     "sanctionType": "suspension", "durationMonths": 4, "jurisdiction": "FINRA",
     "effectiveDate": "2025-10-01"},
    {"id": uid("sanc:cairnes:tx_bar"), "disclosureId": uid("disc:cairnes:tx_state"),
     "sanctionType": "bar", "durationMonths": 24, "jurisdiction": "Texas",
     "effectiveDate": "2024-04-01"},
])

# ─── OUTSIDE BUSINESS ACTIVITY ───
insert("OutsideBusinessActivity", [
    {"id": uid("oba:cairnes:re_llc"),
     "advisorId": uid("advisor:george_cairnes"),
     "name": "Real-estate partnership LLC with firm customer",
     "vehicleType": "LLC",
     "withCustomers": True,
     "disclosedToFirm": False,
     "startDate": "2015-08-01",
     "endDate": "2023-04-30",
     "compensationReceived": True,
     "compensationAmountMin": 175_000.0},
])

# ─── ARTICLES ───
# Article.id is derived from the URL via article_id() so seed and ingest
# refer to the same article under one PK.
URL_TAYLOR  = "https://www.advisorhub.com/6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc/"
URL_CAIRNES = "https://www.advisorhub.com/finra-fines-suspends-texas-broker-over-unapproved-real-estate-oba/"

articles = [
    {"id": article_id(URL_TAYLOR), "wpId": 252451,
     "wpPostType": "post",
     "url": URL_TAYLOR,
     "slug": "6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc",
     "headline": "$6B Morgan Stanley Team Jumps to Wells Fargo Advisors in NYC",
     "publishedDate": "2026-05-01",
     "modifiedDate":  "2026-05-01",
     "authors": ["AdvisorHub Staff", "Mason Braswell"],
     "category": "advisor_moves",
     "wpCategories": [7, 79], "wpTags": [1133, 272, 1477, 978]},
    {"id": article_id(URL_CAIRNES), "wpId": 239679,
     "wpPostType": "post",
     "url": URL_CAIRNES,
     "slug": "finra-fines-suspends-texas-broker-over-unapproved-real-estate-oba",
     "headline": "Finra Fines, Suspends Texas Broker Over Unapproved Real Estate OBA",
     "publishedDate": "2025-10-03",
     "modifiedDate":  "2025-10-03",
     "category": "regulatory",
     "wpCategories": [79], "wpTags": [236, 1116, 978]},
]
insert("Article", articles)

# ─── ARTICLE MENTIONS (per-target tables) ───
A_TAYLOR  = article_id(URL_TAYLOR)
A_CAIRNES = article_id(URL_CAIRNES)

insert("ArticleAdvisorMention", [
    {"id": uid(f"aam:{A_TAYLOR}:{slug}"), "articleId": A_TAYLOR,
     "advisorId": uid(f"advisor:{slug}")}
    for slug in [s for s, _ in team_members] + ["michael_freiheit", "patrick_baumann"]
] + [
    {"id": uid(f"aam:{A_CAIRNES}:george_cairnes"),
     "articleId": A_CAIRNES, "advisorId": uid("advisor:george_cairnes")},
])

insert("ArticleFirmMention", [
    {"id": uid(f"afm:{A_TAYLOR}:{fid(f)}"),
     "articleId": A_TAYLOR, "firmId": fid(f)}
    for f in ["morgan_stanley", "wells_fargo", "wells_finet", "merrill_lynch",
              "hennion_walsh", "ubs", "jpmorgan"]
] + [
    {"id": uid(f"afm:{A_CAIRNES}:{fid(f)}"),
     "articleId": A_CAIRNES, "firmId": fid(f)}
    for f in ["wells_fargo", "stanford_fin", "merrill_lynch", "chelsea_fin"]
])

insert("ArticleTeamMention", [
    {"id": uid(f"atm:{A_TAYLOR}:taylor_group"),
     "articleId": A_TAYLOR, "teamId": uid("team:taylor_group")},
])

insert("ArticleTransitionEventMention", [
    {"id": uid(f"atem:{A_TAYLOR}:taylor"),
     "articleId": A_TAYLOR,
     "transitionEventId": uid("te:taylor_group_2026")},
])

insert("ArticleDisclosureMention", [
    {"id": uid(f"adm:{A_CAIRNES}:{d}"),
     "articleId": A_CAIRNES,
     "disclosureId": uid(f"disc:cairnes:{d}")}
    for d in ["finra_awc", "u5", "tx_state", "promissory", "cust_dispute"]
])

# ─── FIELD ASSERTIONS (provenance log: a few illustrative facts) ───
insert("FieldAssertion", [
    {"id": uid("fa:1"), "articleId": A_TAYLOR, "targetTable": "Team",
     "targetId": uid("team:taylor_group"),
     "fieldName": "aum", "assertedValue": "5940000000",
     "quotePhrase": "Morgan Stanley team that managed $5.94 billion in assets",
     "confidence": "asserted"},
    {"id": uid("fa:2"), "articleId": A_TAYLOR, "targetTable": "Team",
     "targetId": uid("team:taylor_group"),
     "fieldName": "annualRevenue", "assertedValue": "18600000",
     "quotePhrase": "produced $18.6 million in annual revenue",
     "confidence": "asserted"},
    {"id": uid("fa:3"), "articleId": A_TAYLOR, "targetTable": "Advisor",
     "targetId": uid("advisor:cjt"),
     "fieldName": "yearsExperience", "assertedValue": "16",
     "quotePhrase": "16-year broker C. James Taylor",
     "confidence": "asserted"},
    {"id": uid("fa:4"), "articleId": A_TAYLOR, "targetTable": "RecruitingDealQuote",
     "targetId": uid("deal:wells:taylor"),
     "fieldName": "upfrontPctT12", "assertedValue": "2.75",
     "quotePhrase": "could include 275% of trailing-12 revenue in upfront cash",
     "confidence": "asserted"},
    {"id": uid("fa:5"), "articleId": A_CAIRNES, "targetTable": "Sanction",
     "targetId": uid("sanc:cairnes:fine"),
     "fieldName": "amount", "assertedValue": "25000",
     "quotePhrase": "suspended for four months and fined $25,000",
     "confidence": "asserted"},
    {"id": uid("fa:6"), "articleId": A_CAIRNES, "targetTable": "Sanction",
     "targetId": uid("sanc:cairnes:susp"),
     "fieldName": "durationMonths", "assertedValue": "4",
     "quotePhrase": "suspended for four months",
     "confidence": "asserted"},
    {"id": uid("fa:7"), "articleId": A_CAIRNES, "targetTable": "OutsideBusinessActivity",
     "targetId": uid("oba:cairnes:re_llc"),
     "fieldName": "vehicleType", "assertedValue": "\"LLC\"",
     "quotePhrase": "created a limited liability company for the partnership's activities",
     "confidence": "asserted"},
])

print("\nseed complete")

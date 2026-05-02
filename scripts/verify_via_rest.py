#!/usr/bin/env python3
"""Verify Harper via REST GET only (sandbox-friendly equivalent of verify.py).

The original verify.py uses SQL via the operations API on :9925; this
re-implements the eight spot-check sections using GET /<TableName>/
list endpoints and client-side joins, so it works anywhere the auto-
generated REST routes are reachable.

See docs/fabric-runbook.md §5 for why you'd want this and §7 for
limitations. If you can reach :9925 (residential network, etc.),
prefer `npm run verify` — it's simpler and runs server-side SQL.

Required env (same as verify.py):
  HDB_TARGET_URL         e.g. https://<cluster>.harperfabric.com
  HDB_ADMIN_USERNAME
  HDB_ADMIN_PASSWORD
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys

BASE = os.environ["HDB_TARGET_URL"].rstrip("/")
USER = os.environ["HDB_ADMIN_USERNAME"]
PW = os.environ["HDB_ADMIN_PASSWORD"]
AUTH_HEADER = "Basic " + base64.b64encode(f"{USER}:{PW}".encode()).decode()


def fetch(table: str) -> list[dict]:
    """GET /<table>/ → list of records, or [] on 404 / non-JSON."""
    res = subprocess.run(
        [
            "curl", "-sk", "-m", "30",
            "-H", "Accept: application/json",
            "-H", f"Authorization: {AUTH_HEADER}",
            f"{BASE}/{table}/",
        ],
        capture_output=True, text=True,
    )
    if not res.stdout.strip():
        return []
    try:
        body = json.loads(res.stdout)
        return body if isinstance(body, list) else []
    except json.JSONDecodeError:
        print(f"  ! GET /{table}/ returned non-JSON: {res.stdout[:200]}", file=sys.stderr)
        return []


def section(title):
    print(f"\n══ {title} " + "═" * (60 - len(title)))


# Every @export table in schema.graphql.
TABLES = [
    "Firm", "FirmSuccession", "Branch", "BranchAssignment", "Advisor",
    "Education", "Designation", "License", "EmploymentHistory",
    "RegistrationApplication", "Team", "TeamMembership",
    "TeamMetricSnapshot", "AdvisorMetricSnapshot", "TransitionEvent",
    "RecruitingDealQuote", "Disclosure", "DisclosureCluster", "Sanction",
    "OutsideBusinessActivity", "EmployerConcentration", "Ranking",
    "RankingEntry", "Article", "ArticleAdvisorMention",
    "ArticleFirmMention", "ArticleTeamMention",
    "ArticleTransitionEventMention", "ArticleDisclosureMention",
    "FieldAssertion", "User", "UserRating", "UserList", "UserListEntry",
]


print(f"[verify_via_rest] target: REST {BASE}", file=sys.stderr)


# 1. Row counts per table — purely additive, doesn't depend on schema knowledge.
section("Row counts per table")
data = {}
total = 0
for t in sorted(TABLES):
    rows = fetch(t)
    data[t] = rows
    if rows:
        print(f"  {t:35s} {len(rows):>4d}")
    total += len(rows)
print(f"  {'TOTAL':35s} {total:>4d}")


def by_id(rows): return {r["id"]: r for r in rows}


firms = by_id(data["Firm"])
articles = by_id(data["Article"])

# 2. C. James Taylor — career walk
section("C. James Taylor — career walk")
taylors = [a for a in data["Advisor"] if a.get("legalName") == "C. James Taylor"]
if taylors:
    taylor = taylors[0]
    walks = [eh for eh in data["EmploymentHistory"] if eh.get("advisorId") == taylor["id"]]
    walks.sort(key=lambda r: r.get("startDate") or "")
    for r in walks:
        end = r.get("endDate") or "present"
        firm = firms.get(r.get("firmId"), {}).get("name", "?")
        print(f"  {r.get('startDate','?')} → {end:25s}  {firm:30s}  {r.get('roleTitle','')}")

# 3. Taylor Group AUM time-series
section("Taylor Group AUM time-series (snapshots-only model)")
teams = [t for t in data["Team"] if t.get("name") == "The Taylor Group"]
team = teams[0] if teams else None
if team:
    snaps = [s for s in data["TeamMetricSnapshot"] if s.get("teamId") == team["id"]]
    snaps.sort(key=lambda r: r.get("asOf") or "")
    for r in snaps:
        aum = r.get("aum") or 0
        rev = r.get("annualRevenue") or 0
        print(f"  {r['asOf']}  AUM ${aum:>15,.0f}  Rev ${rev:>14,.0f}  src={r.get('sourceType','?')}")

# 4. Recruiting deal that financed the Taylor move
section("Wells Fargo recruiting deal for the Taylor move")
deals = by_id(data["RecruitingDealQuote"])
if team:
    for te in data["TransitionEvent"]:
        if te.get("subjectTeamId") == team["id"]:
            d = deals.get(te.get("recruitingDealId"))
            print(f"  Move date:   {te.get('moveDate','?')}")
            print(f"  AUM moved:   ${te.get('aumMoved',0):,.0f}")
            print(f"  T-12 prod:   ${te.get('productionT12',0):,.0f}")
            if d:
                print(f"  Upfront:     {d.get('upfrontPctT12',0)*100:.0f}% of T-12")
                print(f"  Tier:        {d.get('producerTier','?')}")

# 5. Cairnes disclosure cluster — five parallel events
section("George J. Cairnes — disclosure cluster (5 parallel events)")
cairneses = [a for a in data["Advisor"] if a.get("legalName") == "George J. Cairnes"]
disc_ids: set[str] = set()
if cairneses:
    cairnes = cairneses[0]
    discs = [d for d in data["Disclosure"] if d.get("advisorId") == cairnes["id"]]
    discs.sort(key=lambda r: (r.get("dateInitiated") or "", r.get("dateResolved") or ""))
    for r in discs:
        disc_ids.add(r["id"])
        reg = r.get("regulator") or ""
        if r.get("regulatorState"):
            reg += f" ({r['regulatorState']})"
        when = r.get("dateResolved") or r.get("dateInitiated") or "—"
        aw = f"  award=${r['awardAmount']:,.0f}" if r.get("awardAmount") else ""
        print(f"  {r.get('disclosureType','?'):22s} reg={reg:20s} status={r.get('status','?'):18s} {when}{aw}")
        if r.get("allegationText"):
            print(f"      └ {r['allegationText'][:90]}…")

# 6. Sanctions stacked on the Cairnes disclosures
section("Sanctions stacked on the Cairnes disclosures")
sancs = [s for s in data["Sanction"] if s.get("disclosureId") in disc_ids]
for r in sancs:
    bits = [r.get("sanctionType", "?")]
    if r.get("amount"):         bits.append(f"${r['amount']:,.0f}")
    if r.get("durationMonths"): bits.append(f"{r['durationMonths']} months")
    if r.get("jurisdiction"):   bits.append(f"({r['jurisdiction']})")
    print("  " + "  ".join(bits))

# 7. Field-assertion provenance
section("Field-assertion provenance (audit trail)")
fas = sorted(
    data["FieldAssertion"],
    key=lambda r: (r.get("targetTable", ""), r.get("fieldName", "")),
)
for r in fas:
    print(f"  {r.get('targetTable','?')}.{r.get('fieldName','?')} = {r.get('assertedValue','')}")
    if r.get("quotePhrase"):
        print(f"    ← \"{r['quotePhrase']}\"")
    art = articles.get(r.get("articleId"), {})
    print(f"    src: {art.get('headline', '?')[:70]}")

# 8. Mention counts per article
section("Article ↔ advisor mentions (per-target join table)")
counts: dict[str, int] = {}
for m in data["ArticleAdvisorMention"]:
    aid = m.get("articleId")
    if aid:
        counts[aid] = counts.get(aid, 0) + 1
for aid, n in sorted(counts.items(), key=lambda kv: -kv[1]):
    art = articles.get(aid, {})
    print(f"  {n:3d}  {art.get('headline','?')[:80]}")

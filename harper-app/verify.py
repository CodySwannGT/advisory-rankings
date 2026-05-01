#!/usr/bin/env python3
"""Verify the seeded data with cross-table SQL queries."""
import base64, json, subprocess, sys

SOCKET = "/home/user/.harperdb/operations-server"
AUTH   = base64.b64encode(b"admin:admin-local").decode()

def op(payload):
    res = subprocess.run(
        ["curl", "-sS", "--unix-socket", SOCKET, "-m", "10",
         "-H", "Content-Type: application/json",
         "-H", f"Authorization: Basic {AUTH}",
         "-d", json.dumps(payload),
         "-w", "\n--HTTP=%{http_code}",
         "http://localhost/"],
        capture_output=True, text=True,
    )
    body, _, status = res.stdout.rpartition("\n--HTTP=")
    code = int(status.strip() or 0)
    if code != 200:
        print(f"HTTP {code}: {body}", file=sys.stderr)
        return None
    return json.loads(body)

def sql(q):
    return op({"operation": "sql", "sql": q})

def section(title):
    print(f"\n══ {title} " + "═" * (60 - len(title)))

# 1. Row counts per table
section("Row counts per table")
all_tables = op({"operation": "describe_all"})["data"]
total = 0
for t in sorted(all_tables.keys()):
    rows = sql(f"SELECT COUNT(*) AS n FROM data.{t}")
    n = rows[0]["n"] if rows else 0
    if n:
        print(f"  {t:35s} {n:>4d}")
    total += n
print(f"  {'TOTAL':35s} {total:>4d}")

# 2. C. James Taylor's career walk
section("C. James Taylor — career walk")
taylor_id = sql("SELECT id FROM data.Advisor WHERE legalName = 'C. James Taylor'")[0]["id"]
rows = sql(f"""
  SELECT eh.startDate, eh.endDate, f.name AS firm, eh.roleTitle, eh.reasonForLeaving
  FROM data.EmploymentHistory eh
  JOIN data.Firm f ON f.id = eh.firmId
  WHERE eh.advisorId = '{taylor_id}'
  ORDER BY eh.startDate
""")
for r in rows:
    end = r.get("endDate") or "present"
    print(f"  {r['startDate']} → {end:10s}  {r['firm']:30s}  {r.get('roleTitle','')}")

# 3. Taylor Group AUM time-series
section("Taylor Group AUM time-series (snapshots-only model)")
team_id = sql("SELECT id FROM data.Team WHERE name = 'The Taylor Group'")[0]["id"]
rows = sql(f"""
  SELECT asOf, aum, annualRevenue, sourceType
  FROM data.TeamMetricSnapshot
  WHERE teamId = '{team_id}'
  ORDER BY asOf
""")
for r in rows:
    aum = r.get("aum") or 0
    rev = r.get("annualRevenue") or 0
    print(f"  {r['asOf']}  AUM ${aum:>15,.0f}  Rev ${rev:>14,.0f}  src={r['sourceType']}")

# 4. The recruiting deal that financed the move
section("Wells Fargo recruiting deal for the Taylor move")
rows = sql(f"""
  SELECT te.moveDate, te.aumMoved, te.productionT12,
         d.upfrontPctT12, d.producerTier
  FROM data.TransitionEvent te
  JOIN data.RecruitingDealQuote d ON d.id = te.recruitingDealId
  WHERE te.subjectTeamId = '{team_id}'
""")
for r in rows:
    print(f"  Move date:   {r['moveDate']}")
    print(f"  AUM moved:   ${r['aumMoved']:,.0f}")
    print(f"  T-12 prod:   ${r['productionT12']:,.0f}")
    print(f"  Upfront:     {r['upfrontPctT12']*100:.0f}% of T-12")
    print(f"  Tier:        {r['producerTier']}")

# 5. Cairnes disclosure cluster — five parallel events
section("George J. Cairnes — disclosure cluster (5 parallel events)")
cairnes_id = sql("SELECT id FROM data.Advisor WHERE legalName = 'George J. Cairnes'")[0]["id"]
rows = sql(f"""
  SELECT disclosureType, regulator, regulatorState, status,
         dateInitiated, dateResolved, awardAmount, allegationText
  FROM data.Disclosure
  WHERE advisorId = '{cairnes_id}'
  ORDER BY dateInitiated, dateResolved
""")
for r in rows:
    reg = r.get("regulator") or ""
    if r.get("regulatorState"): reg += f" ({r['regulatorState']})"
    when = r.get("dateResolved") or r.get("dateInitiated") or "—"
    aw = f"  award=${r['awardAmount']:,.0f}" if r.get("awardAmount") else ""
    print(f"  {r['disclosureType']:22s} reg={reg:20s} status={r['status']:18s} {when}{aw}")
    if r.get("allegationText"):
        snippet = r['allegationText'][:90]
        print(f"      └ {snippet}…")

# 6. Sanctions on the FINRA AWC
section("Sanctions stacked on the FINRA AWC")
rows = sql(f"""
  SELECT s.sanctionType, s.amount, s.durationMonths, s.jurisdiction
  FROM data.Sanction s
  JOIN data.Disclosure d ON d.id = s.disclosureId
  WHERE d.advisorId = '{cairnes_id}'
""")
for r in rows:
    bits = [r['sanctionType']]
    if r.get('amount'):           bits.append(f"${r['amount']:,.0f}")
    if r.get('durationMonths'):   bits.append(f"{r['durationMonths']} months")
    if r.get('jurisdiction'):     bits.append(f"({r['jurisdiction']})")
    print("  " + "  ".join(bits))

# 7. Field assertions: where each fact came from
section("Field-assertion provenance (audit trail)")
rows = sql("""
  SELECT fa.targetTable, fa.fieldName, fa.assertedValue, fa.quotePhrase, a.headline
  FROM data.FieldAssertion fa
  JOIN data.Article a ON a.id = fa.articleId
  ORDER BY fa.targetTable, fa.fieldName
""")
for r in rows:
    print(f"  {r['targetTable']}.{r['fieldName']} = {r['assertedValue']}")
    print(f"    ← \"{r['quotePhrase']}\"")
    print(f"    src: {r['headline'][:70]}")

# 8. Mentions: which advisors appear in which articles
section("Article ↔ advisor mentions (per-target join table)")
rows = sql("""
  SELECT a.headline, COUNT(*) AS advisor_count
  FROM data.ArticleAdvisorMention m
  JOIN data.Article a ON a.id = m.articleId
  GROUP BY a.headline
  ORDER BY advisor_count DESC
""")
for r in rows:
    print(f"  {r['advisor_count']:3d}  {r['headline'][:80]}")

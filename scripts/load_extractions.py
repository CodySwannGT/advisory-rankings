#!/usr/bin/env python3
"""Load LLM-produced extraction JSON files into Harper.

Reads `research/extractions/<wpId>.json` files (shape defined in
.claude/skills/extract-advisorhub-articles/schema-guide.md), runs the
entity resolver against Harper's current state, upserts every entity by
deterministic UUID, and on success moves the file to
`research/extractions/.loaded/<wpId>.json`.

Idempotency:
  - Resolver always queries Harper first; only mints a new UUID when
    no existing match is found (and even then the mint is deterministic
    from the natural key, so re-extracting the same article produces
    the same UUID).
  - Every Harper write is an `upsert`, never an `insert`.
  - Re-running with the same input produces no row-count delta.

Usage:
    python3 scripts/load_extractions.py                   # load all
    python3 scripts/load_extractions.py --wpid 239679     # load one
    python3 scripts/load_extractions.py --dry-run         # resolve, don't write
"""
from __future__ import annotations
import argparse
import json
import pathlib
import shutil
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _ids import (  # noqa: E402
    uid, slugify, firm_id, article_id, advisor_id,
    team_id, branch_id, transition_event_id, disclosure_id,
    employment_history_id, team_membership_id, metric_snapshot_id,
    sanction_id,
)
# Shared transport: HDB_TARGET_URL → Fabric, else local Unix socket.
from _harper import (  # noqa: E402
    op as harper_op,
    sql as harper_sql,
    upsert as harper_upsert,
    describe_target,
)

REPO         = pathlib.Path(__file__).resolve().parent.parent
EXTRACT_DIR  = REPO / "research" / "extractions"
LOADED_DIR   = EXTRACT_DIR / ".loaded"


def sql_str(s: str) -> str:
    """Quote a string literal for inline use in SQL."""
    return "'" + s.replace("'", "''") + "'"


def date_prefix(value) -> str:
    """Strip a date value to its YYYY-MM-DD prefix.  Harper stores dates
    as ISO timestamps internally; SQL `=`, `LIKE` and range comparisons
    don't reliably match on Date-typed columns (verified empirically).
    The resolvers therefore fetch candidates without date constraints
    and compare prefixes here in Python."""
    return str(value or "")[:10]


# ── Resolver ──────────────────────────────────────────────────────

class Resolver:
    """Query-first, derive-as-fallback ID resolution for the entities the
    LLM extractor emits. Caches lookups within a single load run to
    avoid hammering Harper with duplicate queries."""

    def __init__(self):
        self.cache: dict[tuple, str] = {}
        self.stats = {
            "advisor_matched":   0, "advisor_minted":   0,
            "firm_matched":      0, "firm_minted":      0,
            "team_matched":      0, "team_minted":      0,
            "disclosure_matched":0, "disclosure_minted":0,
        }

    # firms: pure derivation from canonical name (already a stable rule)
    def firm(self, canonical_name: str) -> str:
        if not canonical_name:
            return ""
        key = ("firm", canonical_name)
        if key in self.cache:
            return self.cache[key]
        fid = firm_id(canonical_name)
        # Track whether it already exists, just for stats
        existing = harper_sql(f"SELECT id FROM data.Firm WHERE id = {sql_str(fid)}")
        self.stats["firm_matched" if existing else "firm_minted"] += 1
        self.cache[key] = fid
        return fid

    # advisors: CRD > exact name + employment-history overlap > fuzzy > new
    def advisor(self, nk: dict) -> str:
        legal_name = nk.get("legal_name") or ""
        crd        = nk.get("finra_crd")
        first_emp  = nk.get("first_employer") or ""
        career_yr  = nk.get("career_start_year")
        if not legal_name:
            raise ValueError("advisor natural_key missing legal_name")

        cache_key = ("advisor", legal_name, crd, first_emp)
        if cache_key in self.cache:
            return self.cache[cache_key]

        # 1. CRD wins
        if crd:
            hit = harper_sql(
                f"SELECT id FROM data.Advisor WHERE finraCrd = {sql_str(crd)}"
            )
            if hit:
                self.stats["advisor_matched"] += 1
                self.cache[cache_key] = hit[0]["id"]
                return hit[0]["id"]

        # 2. Exact legal_name match
        candidates = harper_sql(
            f"SELECT id FROM data.Advisor WHERE legalName = {sql_str(legal_name)}"
        )

        # 2a. If exactly one candidate, accept
        if len(candidates) == 1:
            self.stats["advisor_matched"] += 1
            self.cache[cache_key] = candidates[0]["id"]
            return candidates[0]["id"]

        # 2b. Multiple candidates — disambiguate by employment-history overlap
        if candidates and first_emp:
            target_firm = firm_id(first_emp)
            for c in candidates:
                emp = harper_sql(
                    f"SELECT id FROM data.EmploymentHistory "
                    f"WHERE advisorId = {sql_str(c['id'])} "
                    f"AND firmId = {sql_str(target_firm)}"
                )
                if emp:
                    self.stats["advisor_matched"] += 1
                    self.cache[cache_key] = c["id"]
                    return c["id"]

        # 3. Mint new — deterministic from natural key
        hint = first_emp or (str(career_yr) if career_yr else "")
        new_id = advisor_id(legal_name, hint)
        self.stats["advisor_minted"] += 1
        self.cache[cache_key] = new_id
        return new_id

    def team(self, nk: dict) -> str:
        name = nk.get("name") or ""
        firm_canon = nk.get("current_firm") or ""
        if not name:
            raise ValueError("team natural_key missing name")
        cache_key = ("team", name, firm_canon)
        if cache_key in self.cache:
            return self.cache[cache_key]

        # exact name match (teams are uniquely named in practice)
        hits = harper_sql(
            f"SELECT id FROM data.Team WHERE name = {sql_str(name)}"
        )
        if len(hits) == 1:
            self.stats["team_matched"] += 1
            self.cache[cache_key] = hits[0]["id"]
            return hits[0]["id"]
        if hits and firm_canon:
            target_firm = firm_id(firm_canon)
            for h in hits:
                check = harper_sql(
                    f"SELECT id FROM data.Team WHERE id = {sql_str(h['id'])} "
                    f"AND currentFirmId = {sql_str(target_firm)}"
                )
                if check:
                    self.stats["team_matched"] += 1
                    self.cache[cache_key] = h["id"]
                    return h["id"]
        new_id = team_id(name, firm_canon)
        self.stats["team_minted"] += 1
        self.cache[cache_key] = new_id
        return new_id

    def disclosure(self, nk: dict, advisor_id_val: str) -> str:
        dtype     = nk.get("disclosure_type") or ""
        regulator = nk.get("regulator") or ""
        date_key  = date_prefix(
            nk.get("date_resolved") or nk.get("date_initiated") or
            nk.get("allegation_period_start") or ""
        )
        cache_key = ("disclosure", advisor_id_val, dtype, date_key, regulator)
        if cache_key in self.cache:
            return self.cache[cache_key]

        # Fetch candidates by non-date columns; filter by date in Python.
        clauses = [
            f"advisorId = {sql_str(advisor_id_val)}",
            f"disclosureType = {sql_str(dtype)}",
        ]
        if regulator:
            clauses.append(f"regulator = {sql_str(regulator)}")
        candidates = harper_sql(
            "SELECT id, dateResolved, dateInitiated, allegationPeriodStart "
            "FROM data.Disclosure WHERE " + " AND ".join(clauses)
        )
        if date_key:
            for c in candidates:
                if (date_prefix(c.get("dateResolved"))           == date_key or
                    date_prefix(c.get("dateInitiated"))          == date_key or
                    date_prefix(c.get("allegationPeriodStart"))  == date_key):
                    self.stats["disclosure_matched"] += 1
                    self.cache[cache_key] = c["id"]
                    return c["id"]
        elif len(candidates) == 1:
            # No date hint at all but only one candidate of this (advisor, type, regulator)
            self.stats["disclosure_matched"] += 1
            self.cache[cache_key] = candidates[0]["id"]
            return candidates[0]["id"]

        new_id = disclosure_id(advisor_id_val, dtype, date_key, regulator)
        self.stats["disclosure_minted"] += 1
        self.cache[cache_key] = new_id
        return new_id

    # ── Resolvers for dependent entities (query-first, mint-as-fallback) ──

    def employment_history(self, advisor_id_val: str, firm_id_val: str,
                           start_date: str) -> str:
        sd = date_prefix(start_date)
        cache_key = ("eh", advisor_id_val, firm_id_val, sd)
        if cache_key in self.cache:
            return self.cache[cache_key]
        candidates = harper_sql(
            f"SELECT id, startDate FROM data.EmploymentHistory "
            f"WHERE advisorId = {sql_str(advisor_id_val)} "
            f"AND firmId = {sql_str(firm_id_val)}"
        )
        if sd:
            for c in candidates:
                if date_prefix(c.get("startDate")) == sd:
                    self.cache[cache_key] = c["id"]
                    return c["id"]
        elif len(candidates) == 1:
            self.cache[cache_key] = candidates[0]["id"]
            return candidates[0]["id"]
        new_id = employment_history_id(advisor_id_val, firm_id_val, sd)
        self.cache[cache_key] = new_id
        return new_id

    def sanction(self, disclosure_id_val: str, fields: dict) -> str:
        sanction_type = fields.get("sanctionType", "")
        amount        = fields.get("amount")
        duration      = fields.get("durationMonths")
        cache_key = ("sanction", disclosure_id_val, sanction_type,
                     str(amount), str(duration))
        if cache_key in self.cache:
            return self.cache[cache_key]
        clauses = [
            f"disclosureId = {sql_str(disclosure_id_val)}",
            f"sanctionType = {sql_str(sanction_type)}",
        ]
        if amount is not None:
            clauses.append(f"amount = {amount}")
        if duration is not None:
            clauses.append(f"durationMonths = {duration}")
        hits = harper_sql(
            "SELECT id FROM data.Sanction WHERE " + " AND ".join(clauses)
        )
        if hits:
            self.cache[cache_key] = hits[0]["id"]
            return hits[0]["id"]
        new_id = sanction_id(disclosure_id_val, sanction_type,
                             str(amount or ""), str(duration or ""))
        self.cache[cache_key] = new_id
        return new_id

    def oba(self, advisor_id_val: str, fields: dict) -> str:
        sd = date_prefix(fields.get("startDate", ""))
        cache_key = ("oba", advisor_id_val, sd)
        if cache_key in self.cache:
            return self.cache[cache_key]
        candidates = harper_sql(
            f"SELECT id, startDate FROM data.OutsideBusinessActivity "
            f"WHERE advisorId = {sql_str(advisor_id_val)}"
        )
        if sd:
            for c in candidates:
                if date_prefix(c.get("startDate")) == sd:
                    self.cache[cache_key] = c["id"]
                    return c["id"]
        elif len(candidates) == 1:
            self.cache[cache_key] = candidates[0]["id"]
            return candidates[0]["id"]
        new_id = uid(f"oba:{advisor_id_val}:{slugify(fields.get('name',''))}:"
                     f"{sd}")
        self.cache[cache_key] = new_id
        return new_id

    def registration_application(self, advisor_id_val: str,
                                 firm_id_val: str, applied_date: str) -> str:
        ad = date_prefix(applied_date)
        cache_key = ("regapp", advisor_id_val, firm_id_val, ad)
        if cache_key in self.cache:
            return self.cache[cache_key]
        candidates = harper_sql(
            f"SELECT id, appliedDate FROM data.RegistrationApplication "
            f"WHERE advisorId = {sql_str(advisor_id_val)} "
            f"AND firmId = {sql_str(firm_id_val)}"
        )
        if ad:
            for c in candidates:
                if date_prefix(c.get("appliedDate")) == ad:
                    self.cache[cache_key] = c["id"]
                    return c["id"]
        elif len(candidates) == 1:
            self.cache[cache_key] = candidates[0]["id"]
            return candidates[0]["id"]
        new_id = uid(f"regapp:{advisor_id_val}:{firm_id_val}:{ad}")
        self.cache[cache_key] = new_id
        return new_id


# ── Loader ────────────────────────────────────────────────────────

def load_extraction_file(path: pathlib.Path, resolver: Resolver,
                          dry_run: bool) -> dict:
    doc = json.loads(path.read_text())
    article_meta = doc.get("article", {})
    a_id = article_id(article_meta.get("url") or
                      f"wp:{article_meta.get('wpId')}")

    # Per-table accumulators
    rows: dict[str, list[dict]] = {
        "Article": [], "Firm": [], "Branch": [], "Advisor": [], "Team": [],
        "TeamMembership": [], "EmploymentHistory": [], "TransitionEvent": [],
        "RecruitingDealQuote": [], "Disclosure": [], "Sanction": [],
        "OutsideBusinessActivity": [], "RegistrationApplication": [],
        "EmployerConcentration": [], "TeamMetricSnapshot": [],
        "AdvisorMetricSnapshot": [], "DisclosureCluster": [],
        "BranchAssignment": [],
        "ArticleAdvisorMention": [], "ArticleFirmMention": [],
        "ArticleTeamMention": [], "ArticleTransitionEventMention": [],
        "ArticleDisclosureMention": [],
        "FieldAssertion": [],
    }

    # 1. Article record itself
    rows["Article"].append({
        "id": a_id,
        "wpId": article_meta.get("wpId"),
        "wpPostType": article_meta.get("wpPostType") or "post",
        "url": article_meta.get("url"),
        "slug": article_meta.get("slug"),
        "headline": article_meta.get("headline"),
        "publishedDate": article_meta.get("publishedDate"),
        "modifiedDate": article_meta.get("modifiedDate"),
        "authors": article_meta.get("authors") or [],
        "category": article_meta.get("category") or "extracted",
        "wpCategories": article_meta.get("wpCategories") or [],
        "wpTags": article_meta.get("wpTags") or [],
    })

    # 2. Firms — must resolve before advisors so we can map first_employer
    firm_id_by_canon: dict[str, str] = {}
    for f in doc.get("firms", []):
        nk = f.get("natural_key", {})
        canon = nk.get("canonical_name") or f.get("fields", {}).get("name")
        if not canon:
            continue
        fid = resolver.firm(canon)
        firm_id_by_canon[canon] = fid
        record = {"id": fid, "name": canon, **(f.get("fields") or {})}
        record["id"] = fid
        record["name"] = canon
        rows["Firm"].append(record)
        rows["ArticleFirmMention"].append({
            "id": uid(f"afm:{a_id}:{fid}"),
            "articleId": a_id, "firmId": fid,
        })

    # 3. Advisors
    advisor_id_by_nk: dict[str, str] = {}   # name → id, for cross-refs
    for a in doc.get("advisors", []):
        nk = a.get("natural_key", {})
        adv_id = resolver.advisor(nk)
        advisor_id_by_nk[nk.get("legal_name", "")] = adv_id
        record = {"id": adv_id, **(a.get("fields") or {})}
        record["id"] = adv_id
        if "legalName" not in record:
            record["legalName"] = nk.get("legal_name")
        rows["Advisor"].append(record)
        rows["ArticleAdvisorMention"].append({
            "id": uid(f"aam:{a_id}:{adv_id}"),
            "articleId": a_id, "advisorId": adv_id,
        })

    # 4. Teams
    team_id_by_name: dict[str, str] = {}
    for t in doc.get("teams", []):
        nk = t.get("natural_key", {})
        tid = resolver.team(nk)
        team_id_by_name[nk.get("name", "")] = tid
        fields = t.get("fields") or {}
        if (cf := nk.get("current_firm")):
            fields["currentFirmId"] = resolver.firm(cf)
        rows["Team"].append({"id": tid, "name": nk.get("name"), **fields})
        rows["ArticleTeamMention"].append({
            "id": uid(f"atm:{a_id}:{tid}"),
            "articleId": a_id, "teamId": tid,
        })

    # 5. Team memberships — reference advisors + teams already resolved
    for m in doc.get("team_memberships", []):
        team_name = m.get("team_name")
        adv_name  = m.get("advisor_legal_name")
        tid = team_id_by_name.get(team_name)
        adv = advisor_id_by_nk.get(adv_name)
        if not (tid and adv):
            continue
        rows["TeamMembership"].append({
            "id": team_membership_id(tid, adv),
            "teamId": tid, "advisorId": adv,
            **(m.get("fields") or {}),
        })

    # 6. Employment histories
    for eh in doc.get("employment_histories", []):
        adv_name  = eh.get("advisor_legal_name")
        firm_canon = eh.get("firm_canonical_name")
        adv = advisor_id_by_nk.get(adv_name)
        if not (adv and firm_canon):
            continue
        fid = firm_id_by_canon.get(firm_canon) or resolver.firm(firm_canon)
        firm_id_by_canon[firm_canon] = fid
        f = eh.get("fields") or {}
        rows["EmploymentHistory"].append({
            "id": resolver.employment_history(adv, fid, f.get("startDate", "")),
            "advisorId": adv, "firmId": fid, **f,
        })

    # 7. Transition events
    for te in doc.get("transition_events", []):
        from_canon = te.get("from_firm_canonical_name")
        to_canon   = te.get("to_firm_canonical_name")
        if not (from_canon and to_canon):
            continue
        from_fid = firm_id_by_canon.get(from_canon) or resolver.firm(from_canon)
        to_fid   = firm_id_by_canon.get(to_canon)   or resolver.firm(to_canon)
        firm_id_by_canon[from_canon] = from_fid
        firm_id_by_canon[to_canon]   = to_fid
        subj_id = ""
        f = te.get("fields") or {}
        if (subj_team := te.get("subject_team_name")):
            tid = team_id_by_name.get(subj_team)
            if tid:
                subj_id = tid
                f["subjectTeamId"] = tid
        if (subj_adv := te.get("subject_advisor_legal_name")):
            adv = advisor_id_by_nk.get(subj_adv)
            if adv:
                subj_id = adv
                f["subjectAdvisorId"] = adv
        if not subj_id:
            continue
        f["fromFirmId"] = from_fid
        f["toFirmId"]   = to_fid
        te_id = transition_event_id(subj_id, from_fid, to_fid,
                                    f.get("moveDate", ""))
        rows["TransitionEvent"].append({"id": te_id, **f})
        rows["ArticleTransitionEventMention"].append({
            "id": uid(f"atem:{a_id}:{te_id}"),
            "articleId": a_id, "transitionEventId": te_id,
        })

    # 8. Disclosures + sanctions + OBA + registration applications
    disc_id_by_local_key: dict[str, str] = {}
    for d in doc.get("disclosures", []):
        adv_name = d.get("advisor_legal_name")
        adv = advisor_id_by_nk.get(adv_name)
        if not adv:
            continue
        nk = d.get("natural_key", {})
        d_id = resolver.disclosure(nk, adv)
        local_key = d.get("local_key") or json.dumps(nk, sort_keys=True)
        disc_id_by_local_key[local_key] = d_id
        f = d.get("fields") or {}
        f["advisorId"] = adv
        rows["Disclosure"].append({"id": d_id, **f})
        rows["ArticleDisclosureMention"].append({
            "id": uid(f"adm:{a_id}:{d_id}"),
            "articleId": a_id, "disclosureId": d_id,
        })

    for s in doc.get("sanctions", []):
        local_key = s.get("disclosure_local_key")
        d_id = disc_id_by_local_key.get(local_key)
        if not d_id:
            continue
        f = s.get("fields") or {}
        rows["Sanction"].append({
            "id": resolver.sanction(d_id, f),
            "disclosureId": d_id, **f,
        })

    for oba in doc.get("outside_business_activities", []):
        adv = advisor_id_by_nk.get(oba.get("advisor_legal_name"))
        if not adv:
            continue
        f = oba.get("fields") or {}
        rows["OutsideBusinessActivity"].append({
            "id": resolver.oba(adv, f),
            "advisorId": adv, **f,
        })

    for ra in doc.get("registration_applications", []):
        adv = advisor_id_by_nk.get(ra.get("advisor_legal_name"))
        firm_canon = ra.get("firm_canonical_name")
        if not (adv and firm_canon):
            continue
        fid = firm_id_by_canon.get(firm_canon) or resolver.firm(firm_canon)
        firm_id_by_canon[firm_canon] = fid
        f = ra.get("fields") or {}
        rows["RegistrationApplication"].append({
            "id": resolver.registration_application(adv, fid, f.get("appliedDate", "")),
            "advisorId": adv, "firmId": fid, **f,
        })

    # 9. Field assertions — provenance log, append-only
    for fa in doc.get("field_assertions", []):
        target_id = ""
        target_table = fa.get("target_table") or ""
        target_ref   = fa.get("target_ref")
        if target_table == "Advisor":
            target_id = advisor_id_by_nk.get(target_ref, "")
        elif target_table == "Firm":
            target_id = firm_id_by_canon.get(target_ref, "")
        elif target_table == "Team":
            target_id = team_id_by_name.get(target_ref, "")
        elif target_table == "Disclosure":
            target_id = disc_id_by_local_key.get(target_ref, "")
        elif target_table == "Article":
            target_id = a_id
        if not target_id:
            continue
        field    = fa.get("field", "")
        value    = fa.get("value")
        quote    = fa.get("quote", "")
        confidence = fa.get("confidence", "asserted")
        rows["FieldAssertion"].append({
            "id": uid(f"fa:{a_id}:{target_table}:{target_id}:{field}"),
            "articleId": a_id, "targetTable": target_table,
            "targetId": target_id, "fieldName": field,
            "assertedValue": json.dumps(value),
            "quotePhrase": quote[:500],
            "confidence": confidence,
        })

    # ── Upsert in dependency-friendly order ──
    if dry_run:
        return {tbl: len(records) for tbl, records in rows.items() if records}

    order = ["Firm", "Branch", "Advisor", "Team", "TeamMembership",
             "EmploymentHistory", "RegistrationApplication",
             "DisclosureCluster", "Disclosure", "Sanction",
             "OutsideBusinessActivity", "EmployerConcentration",
             "TeamMetricSnapshot", "AdvisorMetricSnapshot",
             "RecruitingDealQuote", "TransitionEvent", "BranchAssignment",
             "Article",
             "ArticleAdvisorMention", "ArticleFirmMention",
             "ArticleTeamMention", "ArticleTransitionEventMention",
             "ArticleDisclosureMention", "FieldAssertion"]
    summary: dict[str, int] = {}
    for tbl in order:
        if rows[tbl]:
            summary[tbl] = harper_upsert(tbl, rows[tbl])
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wpid", help="Load only one extraction by wpId")
    ap.add_argument("--dry-run", action="store_true",
                    help="Resolve and count records, but don't write to Harper")
    args = ap.parse_args()

    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    LOADED_DIR.mkdir(parents=True, exist_ok=True)

    if args.wpid:
        files = [EXTRACT_DIR / f"{args.wpid}.json"]
    else:
        files = sorted(EXTRACT_DIR.glob("*.json"))
    files = [f for f in files if f.exists() and f.is_file()]

    if not files:
        print("No extraction files to load. Run the extract phase first.",
              file=sys.stderr)
        return 0

    resolver = Resolver()
    print(f"[load] target: {describe_target()}", file=sys.stderr)
    print(f"[load] {len(files)} extraction file(s)")
    for f in files:
        try:
            summary = load_extraction_file(f, resolver, args.dry_run)
        except Exception as e:
            print(f"  FAIL {f.name}: {e}", file=sys.stderr)
            continue
        verb = "would write" if args.dry_run else "wrote"
        print(f"  {f.name}: {verb} {sum(summary.values())} rows  "
              f"{dict(sorted(summary.items()))}")
        if not args.dry_run:
            shutil.move(str(f), str(LOADED_DIR / f.name))

    print(f"[load] resolver stats: {resolver.stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

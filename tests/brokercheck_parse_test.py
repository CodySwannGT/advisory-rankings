#!/usr/bin/env python3
"""Unit tests for `_brokercheck_parse.py` and the loader's idempotency
contract. Runs against the recorded JSON fixtures in
`research/brokercheck-samples/` so it never hits FINRA.

Run:
    python3 tests/brokercheck_parse_test.py

Exit 0 = pass, exit 1 = fail (with a per-assertion log).
"""
from __future__ import annotations

import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from _brokercheck import unwrap_individual, unwrap_firm  # noqa: E402
from _brokercheck_parse import parse_individual, parse_firm  # noqa: E402
from _brokercheck_load import (  # noqa: E402
    Resolver, HarperREST, load_individual, load_firm, hash_content,
)

SAMPLES = REPO / "research" / "brokercheck-samples"


# ── Tiny test harness ──────────────────────────────────────────────

class _T:
    def __init__(self):
        self.passed = 0
        self.failed: list[str] = []

    def check(self, label: str, cond: bool, detail: str = "") -> None:
        if cond:
            self.passed += 1
            print(f"  ✓ {label}")
        else:
            self.failed.append(f"{label}{(' — ' + detail) if detail else ''}")
            print(f"  ✗ {label}{(' — ' + detail) if detail else ''}")

    def report(self) -> int:
        print()
        total = self.passed + len(self.failed)
        print(f"──────── {len(self.failed)} failed / {total} run ────────")
        for f in self.failed:
            print(f"   ✗ {f}")
        return 1 if self.failed else 0


# ── Stub REST ──────────────────────────────────────────────────────

class _StubREST:
    """REST stub: every read returns []; every write succeeds and is
    recorded. Keeps the resolver in mint-as-fallback mode every time
    so the test confirms ID determinism per re-run."""

    def __init__(self):
        self.writes: list[tuple[str, dict]] = []
        self.read_count = 0
        self.write_count = 0

    def get(self, path: str, params=None):
        self.read_count += 1
        return []

    def put(self, table: str, record: dict) -> bool:
        self.write_count += 1
        self.writes.append((table, dict(record)))
        return True


# ── parse_individual: shape + values ───────────────────────────────

def test_parse_individual_cairnes(t: _T) -> None:
    print("\n[parse_individual: Cairnes — disclosure-rich case]")
    raw = json.loads((SAMPLES / "cairnes-detail.json").read_text())
    parsed = parse_individual(unwrap_individual(raw))
    a = parsed["advisor"]
    t.check("CRD parsed", a["finraCrd"] == "4068906")
    t.check("legalName composed", a["legalName"] == "George John Cairnes")
    t.check("careerStatus inferred withdrawn",
            a["careerStatus"] == "withdrawn",
            f"got {a['careerStatus']!r}")
    t.check("industryStartDate populated", bool(a.get("industryStartDate")))

    t.check("5 employments parsed", len(parsed["employments"]) == 5,
            f"got {len(parsed['employments'])}")
    firms = {e["_firmName"] for e in parsed["employments"]}
    t.check("Merrill in employment chain",
            any("MERRILL" in f for f in firms))
    t.check("Stanford in employment chain",
            any("STANFORD" in f for f in firms))

    t.check("6 disclosures parsed", len(parsed["disclosures"]) == 6,
            f"got {len(parsed['disclosures'])}")

    finra_disc = next(
        (d for d in parsed["disclosures"]
         if d["disclosure"]["regulator"] == "FINRA"), None,
    )
    t.check("FINRA disclosure found", finra_disc is not None)
    if finra_disc:
        sanc = finra_disc["sanctions"]
        fines = [s for s in sanc if s["sanctionType"] == "fine"]
        susps = [s for s in sanc if s["sanctionType"] == "suspension"]
        t.check("FINRA fine = $2,500.00 (regulator-of-record)",
                bool(fines) and fines[0]["amount"] == 2500.0,
                f"got {fines and fines[0]['amount']}")
        t.check("FINRA suspension = 4 months",
                bool(susps) and susps[0]["durationMonths"] == 4.0,
                f"got {susps and susps[0]['durationMonths']}")

    tx_disc = next(
        (d for d in parsed["disclosures"]
         if d["disclosure"]["regulatorState"] == "TX"), None,
    )
    t.check("Texas state regulator → state code TX",
            tx_disc is not None
            and tx_disc["disclosure"]["regulator"] == "state_securities")

    t.check("4 license rows", len(parsed["licenses"]) == 4)
    license_codes = {L["licenseType"] for L in parsed["licenses"]}
    t.check("Series 7 license parsed", "Series_7" in license_codes)
    t.check("SIE license parsed", "SIE" in license_codes)


def test_parse_individual_cronk(t: _T) -> None:
    print("\n[parse_individual: Cronk — clean record]")
    raw = json.loads((SAMPLES / "cronk-detail.json").read_text())
    parsed = parse_individual(unwrap_individual(raw))
    t.check("0 disclosures", len(parsed["disclosures"]) == 0)
    t.check("careerStatus active", parsed["advisor"]["careerStatus"] == "active")
    t.check(">= 4 employments", len(parsed["employments"]) >= 4)
    t.check("legalName Darrell Cronk", parsed["advisor"]["legalName"] == "Darrell Cronk")


def test_dedupe_employments_bd_ia_overlap(t: _T) -> None:
    """BrokerCheck publishes BD and IA registrations as separate rows
    even when they describe the same continuous tenure (typical: a few
    days apart while the firm files U4 amendments). The parser must
    fold them into a single EmploymentHistory or the loader writes two
    rows whose natural-key UUID differs only by startDate.

    Real case: Steven M. Swann (CRD 1019847) at Wells Fargo Advisors
    (10/21/2002 BD, 10/23/2002 IA → 8/25/2009) and Morgan Stanley
    (8/24/2009 BD → present, 9/3/2009 IA → present).
    """
    from _brokercheck_parse import _dedupe_employments
    rows = [
        # BD Wells Fargo + IA Wells Fargo (2-day gap, same firmId, both end same day)
        {"_firmFinraId": "19616", "_firmName": "WELLS FARGO ADVISORS, LLC",
         "_iaOnly": False, "startDate": "2002-10-21", "endDate": "2009-08-25"},
        {"_firmFinraId": "19616", "_firmName": "WELLS FARGO ADVISORS, LLC",
         "_iaOnly": True,  "startDate": "2002-10-23", "endDate": "2009-08-25"},
        # BD Morgan Stanley + IA Morgan Stanley (10-day gap, both still current)
        {"_firmFinraId": "149777", "_firmName": "MORGAN STANLEY",
         "_iaOnly": False, "startDate": "2009-08-24", "endDate": None},
        {"_firmFinraId": "149777", "_firmName": "MORGAN STANLEY",
         "_iaOnly": True,  "startDate": "2009-09-03", "endDate": None},
    ]
    out = _dedupe_employments(rows)
    t.check("4 input rows fold to 2", len(out) == 2, f"got {len(out)} rows: {out}")

    by_firm = {r["_firmFinraId"]: r for r in out}
    wf = by_firm["19616"]
    t.check("Wells Fargo: earliest startDate wins",
            wf["startDate"] == "2002-10-21", f"got {wf['startDate']}")
    t.check("Wells Fargo: endDate preserved",
            wf["endDate"] == "2009-08-25", f"got {wf['endDate']}")

    ms = by_firm["149777"]
    t.check("Morgan Stanley: earliest startDate wins",
            ms["startDate"] == "2009-08-24", f"got {ms['startDate']}")
    t.check("Morgan Stanley: still-current endDate stays null",
            ms["endDate"] is None, f"got {ms['endDate']}")


def test_dedupe_employments_keeps_real_boomerang(t: _T) -> None:
    """If an advisor leaves a firm and returns years later, that's two
    distinct tenures and must NOT be folded. Multi-year gap >> 90-day
    merge window."""
    from _brokercheck_parse import _dedupe_employments
    rows = [
        {"_firmFinraId": "16100", "_firmName": "WELLS FARGO BROKERAGE SERVICES",
         "_iaOnly": False, "startDate": "2010-01-01", "endDate": "2012-06-30"},
        {"_firmFinraId": "16100", "_firmName": "WELLS FARGO BROKERAGE SERVICES",
         "_iaOnly": False, "startDate": "2018-03-15", "endDate": None},
    ]
    out = _dedupe_employments(rows)
    t.check("boomerang stays as 2 rows", len(out) == 2, f"got {len(out)}")


def test_parse_firm_wells(t: _T) -> None:
    print("\n[parse_firm: Wells Fargo Clearing]")
    raw = json.loads((SAMPLES / "wf-firm-detail.json").read_text())
    parsed = parse_firm(unwrap_firm(raw))
    f = parsed["firm"]
    t.check("CRD = 19616", f["finraCrd"] == "19616")
    t.check("HQ MO", f["hqState"] == "MO")
    t.check("HQ city St. Louis", f["hqCity"] == "St. Louis",
            f"got {f['hqCity']!r}")
    t.check(">= 9 prior names", len(parsed["other_names"]) >= 9)
    t.check("regulatory disclosures = 184",
            parsed["summary"]["regulatoryDisclosureCount"] == 184)
    t.check("arbitration count = 303",
            parsed["summary"]["arbitrationCount"] == 303)


# ── load_individual: idempotency at the row level ──────────────────

def test_loader_idempotent(t: _T) -> None:
    print("\n[loader: idempotency — same input yields same IDs]")
    raw = json.loads((SAMPLES / "cairnes-detail.json").read_text())
    content = unwrap_individual(raw)
    parsed = parse_individual(content)

    # Run 1
    rest1 = _StubREST()
    resolver1 = Resolver(rest1)  # type: ignore[arg-type]
    counts1 = load_individual(parsed, content,
                              rest=rest1, resolver=resolver1, write=True)
    ids1 = {(tbl, rec["id"]) for tbl, rec in rest1.writes}

    # Run 2 (fresh resolver, same input) — IDs must match
    rest2 = _StubREST()
    resolver2 = Resolver(rest2)  # type: ignore[arg-type]
    counts2 = load_individual(parsed, content,
                              rest=rest2, resolver=resolver2, write=True)
    ids2 = {(tbl, rec["id"]) for tbl, rec in rest2.writes}

    t.check("write counts match across runs", counts1 == counts2,
            f"{counts1} vs {counts2}")
    t.check("emitted IDs match across runs (idempotency contract)",
            ids1 == ids2,
            f"diff (run1 only): {ids1 - ids2}; (run2 only): {ids2 - ids1}")
    # Also: every BrokerCheckSnapshot row keyed on subjectCrd
    snaps = [r for tbl, r in rest1.writes if tbl == "BrokerCheckSnapshot"]
    t.check("exactly one BrokerCheckSnapshot emitted", len(snaps) == 1)
    if snaps:
        s = snaps[0]
        t.check("snapshot has subjectCrd", s.get("subjectCrd") == "4068906")
        t.check("snapshot has rawHash", bool(s.get("rawHash")))
        t.check("snapshot subjectKind=individual",
                s.get("subjectKind") == "individual")


def test_loader_disclosure_provenance(t: _T) -> None:
    print("\n[loader: every disclosure carries sourceType=brokercheck]")
    raw = json.loads((SAMPLES / "cairnes-detail.json").read_text())
    content = unwrap_individual(raw)
    parsed = parse_individual(content)
    rest = _StubREST()
    resolver = Resolver(rest)  # type: ignore[arg-type]
    load_individual(parsed, content, rest=rest, resolver=resolver, write=True)
    discs = [r for tbl, r in rest.writes if tbl == "Disclosure"]
    t.check("6 disclosure writes", len(discs) == 6,
            f"got {len(discs)}")
    t.check("every disclosure has sourceType=brokercheck",
            all(d.get("sourceType") == "brokercheck" for d in discs))
    t.check("every disclosure has sourceRef pointing at the snapshot",
            all(d.get("sourceRef") for d in discs))


def test_client_blocks_after_consecutive_rate_limits(t: _T) -> None:
    """Hardening: when FINRA serves sustained 429/403 we must stop the
    crawl rather than keep poking. After
    RATE_LIMIT_STOP_AFTER_CONSECUTIVE consecutive throttle responses,
    the client raises BrokerCheckBlocked. Otherwise the orchestrator
    has no signal to stop, and we'd cheerfully wear out the host's
    patience for hours."""
    print("\n[client: stop-the-crawl on sustained 429/403]")
    import urllib.error, urllib.request
    from io import BytesIO
    from _brokercheck import (
        BrokerCheckClient, BrokerCheckBlocked,
        RATE_LIMIT_STOP_AFTER_CONSECUTIVE,
    )
    import _brokercheck as bc_mod

    # Patch sleeps so the test runs in milliseconds, not minutes.
    orig_time_sleep = bc_mod.time.sleep
    bc_mod.time.sleep = lambda *_a, **_kw: None
    orig_wait = bc_mod._wait_for_quota
    bc_mod._wait_for_quota = lambda *_a, **_kw: None

    # Always-429 fake transport
    def fake_urlopen(req, timeout=None):
        raise urllib.error.HTTPError(
            req.full_url, 429, "Too Many Requests", {}, BytesIO(b"")
        )
    orig_urlopen = urllib.request.urlopen
    urllib.request.urlopen = fake_urlopen

    try:
        client = BrokerCheckClient(verbose=False)
        raised: Optional[Exception] = None
        for _ in range(RATE_LIMIT_STOP_AFTER_CONSECUTIVE + 2):
            try:
                client.get_individual("9999999")
            except BrokerCheckBlocked as e:
                raised = e
                break
            except Exception:
                pass  # other errors: keep going
        t.check(
            f"BrokerCheckBlocked raised after ≤ {RATE_LIMIT_STOP_AFTER_CONSECUTIVE} attempts",
            raised is not None,
        )
        t.check(
            f"consecutive_rate_limits counter ≥ {RATE_LIMIT_STOP_AFTER_CONSECUTIVE}",
            client.consecutive_rate_limits >= RATE_LIMIT_STOP_AFTER_CONSECUTIVE,
        )
    finally:
        urllib.request.urlopen = orig_urlopen
        bc_mod.time.sleep = orig_time_sleep
        bc_mod._wait_for_quota = orig_wait


# Optional Python 3.10+ for parameterised type alias used in stub
from typing import Optional  # noqa: E402

def test_resolver_advisor_case_insensitive(t: _T) -> None:
    """Regression: the live cluster had `Roger McGlynn` with capital G,
    BrokerCheck returned `MCGLYNN` which our parser title-cased to
    `Mcglynn`. The original resolver used Harper's case-sensitive
    `?lastName=` filter and therefore minted a duplicate. Verify that
    a cached-listing, case-insensitive match merges them correctly."""
    print("\n[resolver: case-insensitive name match (McGlynn regression)]")
    existing_id = "existing-uuid-roger-mcglynn"

    class _SeededREST(_StubREST):
        def get(self, path, params=None):
            self.read_count += 1
            if path == "/Advisor/" and not params:
                return [
                    {"id": existing_id, "legalName": "Roger McGlynn",
                     "firstName": "Roger", "lastName": "McGlynn"},
                ]
            return []

    rest = _SeededREST()
    resolver = Resolver(rest)  # type: ignore[arg-type]
    resolved = resolver.advisor(
        finra_crd="6260648",
        legal_name="Roger Hulett Mcglynn",
        first_name="Roger",
        last_name="Mcglynn",  # note lowercase 'g'
    )
    t.check("resolver merges case-variant lastName onto existing row",
            resolved == existing_id,
            f"got {resolved!r}, expected {existing_id!r}")
    t.check("matched_name stat incremented",
            resolver.stats.get("advisor_matched_name") == 1)
    t.check("no duplicate minted", resolver.stats.get("advisor_minted") == 0)


def test_loader_firm(t: _T) -> None:
    print("\n[loader: firm payload]")
    raw = json.loads((SAMPLES / "wf-firm-detail.json").read_text())
    content = unwrap_firm(raw)
    parsed = parse_firm(content)
    rest = _StubREST()
    resolver = Resolver(rest)  # type: ignore[arg-type]
    load_firm(parsed, content, rest=rest, resolver=resolver, write=True)
    firm_writes = [r for tbl, r in rest.writes if tbl == "Firm"]
    snap_writes = [r for tbl, r in rest.writes if tbl == "BrokerCheckSnapshot"]
    t.check("1 Firm write", len(firm_writes) == 1)
    t.check("1 BrokerCheckSnapshot write", len(snap_writes) == 1)
    if snap_writes:
        s = snap_writes[0]
        t.check("snapshot subjectKind=firm",
                s.get("subjectKind") == "firm")
        t.check("snapshot disclosureCount aggregates to 489 (184+303+2)",
                s.get("disclosureCount") == 184 + 303 + 2,
                f"got {s.get('disclosureCount')}")


# ── parse helpers — small but bug-prone, worth pinning ─────────────

def test_helpers(t: _T) -> None:
    print("\n[helpers: dates, money, durations]")
    from _brokercheck_parse import (
        _to_iso_date, _parse_money, _parse_duration_months,
        _normalize_resolution, _normalize_sanction_type,
        _normalize_regulator,
    )
    t.check("M/D/YYYY → ISO", _to_iso_date("10/1/2025") == "2025-10-01")
    t.check("MM/DD/YYYY → ISO", _to_iso_date("10/01/2025") == "2025-10-01")
    t.check("ISO passthrough", _to_iso_date("2025-10-01") == "2025-10-01")
    t.check("None → None", _to_iso_date(None) is None)
    t.check("$2,500.00 → 2500.0", _parse_money("$2,500.00") == 2500.0)
    t.check("$25,000.00 → 25000.0",
            _parse_money("$25,000.00") == 25000.0)
    t.check("Four months → 4", _parse_duration_months("Four months") == 4.0)
    t.check("2 years → 24", _parse_duration_months("2 years") == 24.0)
    t.check("AWC → final/neither",
            _normalize_resolution("Acceptance, Waiver & Consent(AWC)") == ("final", "neither"))
    t.check("Civil and Administrative Penalty(ies)/Fine(s) → fine",
            _normalize_sanction_type("Civil and Administrative Penalty(ies)/Fine(s)") == "fine")
    t.check("FINRA → (FINRA, None)",
            _normalize_regulator("FINRA") == ("FINRA", None))
    t.check("Texas → (state_securities, TX)",
            _normalize_regulator("Texas") == ("state_securities", "TX"))


def main() -> int:
    t = _T()
    test_helpers(t)
    test_parse_individual_cairnes(t)
    test_parse_individual_cronk(t)
    test_dedupe_employments_bd_ia_overlap(t)
    test_dedupe_employments_keeps_real_boomerang(t)
    test_parse_firm_wells(t)
    test_loader_idempotent(t)
    test_loader_disclosure_provenance(t)
    test_client_blocks_after_consecutive_rate_limits(t)
    test_resolver_advisor_case_insensitive(t)
    test_loader_firm(t)
    return t.report()


if __name__ == "__main__":
    sys.exit(main())

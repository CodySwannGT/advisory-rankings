#!/usr/bin/env python3
"""Wave-1 orchestrator for the BrokerCheck integration.

Runs three phases in order, all reusing the per-CRD `fetch_brokercheck.py`
machinery (so politeness, idempotency, and resumability still apply):

  1. Firm CRD lookup. For every Firm row that lacks a `finraCrd`,
     run a BrokerCheck firm search for its name and — when there is
     exactly one obvious match — patch the row.
  2. Firm-level snapshots. For every Firm with a CRD, fetch the
     firm BrokerCheck record. This populates the "Regulatory record"
     right-rail card on the firm profile page.
  3. Roster walks. For every Firm with a CRD, paginate through
     /search/individual?firm=<crd>&query= and load each individual,
     smallest firms first so we make progress before a wirehouse
     hogs the budget. Each firm is capped at --max-per-firm
     advisors per run; re-running with a higher cap or after
     resetting state continues the walk.

Politeness: defers entirely to `_brokercheck.BrokerCheckClient`
(default ~0.5 req/sec, exp. backoff, jitter). Override with
$BC_RATE_SECONDS.

State file: research/brokercheck-state.json — same one
fetch_brokercheck.py uses, so a CRD already fetched in the last
7 days is skipped on subsequent runs unless --force.

Crawl progress log: research/brokercheck-crawl.log (tail this).

Usage:
    python3 scripts/brokercheck_crawl_all.py
    python3 scripts/brokercheck_crawl_all.py --max-per-firm 100
    python3 scripts/brokercheck_crawl_all.py --skip-rosters
    python3 scripts/brokercheck_crawl_all.py --only-firm-id 47770

Required env (writes):
    HDB_TARGET_URL              https://...harperfabric.com
    HDB_ADMIN_USERNAME (or HARPER_ADMIN_USERNAME)
    HDB_ADMIN_PASSWORD (or HARPER_ADMIN_PASSWORD)
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import pathlib
import sys
import time
from typing import Optional

REPO = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from _brokercheck import BrokerCheckClient, BrokerCheckError  # noqa: E402
from _brokercheck_load import HarperREST, Resolver  # noqa: E402
from fetch_brokercheck import (  # noqa: E402
    fetch_one_crd, fetch_one_firm, load_state, save_state,
    crawl_firm_roster,
)


LOG_FILE = REPO / "research" / "brokercheck-crawl.log"


def _ts() -> str:
    return _dt.datetime.now(tz=_dt.timezone.utc).isoformat(timespec="seconds")


class TeeLog:
    """Mirror every log line to both stderr and a file. Lets the user
    `tail -f research/brokercheck-crawl.log` while the crawl is
    running in the background."""

    def __init__(self, path: pathlib.Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = path.open("a", buffering=1)  # line-buffered

    def __call__(self, *a, **kw):
        msg = " ".join(str(x) for x in a)
        line = f"[{_ts()}] {msg}\n"
        self.fh.write(line)
        sys.stderr.write(line)


# ── Phase 1: firm CRD lookup ───────────────────────────────────────

def _firm_name_match(needle: str, hay: str) -> bool:
    """Loose-but-not-sloppy firm name match — case insensitive,
    ignores trailing legal-suffix tokens. `Wells Fargo Advisors`
    must NOT match `Wells Fargo Clearing Services LLC` (different
    legal entity)."""
    def norm(s: str) -> str:
        s = (s or "").lower().strip().replace(",", " ").replace(".", " ")
        for suffix in (" llc", " inc", " l.l.c", " lp", " l.p.",
                       " corporation", " corp", " incorporated"):
            if s.endswith(suffix):
                s = s[: -len(suffix)]
        return " ".join(s.split())
    return norm(needle) == norm(hay)


def lookup_firm_crds(rest: HarperREST, client: BrokerCheckClient,
                     log) -> dict:
    log("phase 1: firm CRD lookup")
    firms = rest.get("/Firm/") or []
    targets = [f for f in firms if not f.get("finraCrd")]
    log(f"  {len(targets)}/{len(firms)} firms missing finraCrd")
    summary = {"matched": 0, "ambiguous": 0, "no_match": 0}
    for f in targets:
        name = (f.get("name") or "").strip()
        if not name:
            continue
        log(f"  · search {name!r}")
        try:
            res = client.search_firm(name, rows=10)
        except BrokerCheckError as e:
            log(f"    ! search failed: {e}")
            summary["no_match"] += 1
            continue
        hits = res.get("hits", {}).get("hits") or []
        candidates = []
        for h in hits:
            src = h.get("_source", {})
            for candidate_name in [src.get("firm_name"), src.get("ia_firm_name")] + (src.get("firm_other_names") or []):
                if _firm_name_match(name, candidate_name or ""):
                    candidates.append(src)
                    break
        if len(candidates) != 1:
            log(f"    {'ambiguous' if candidates else 'no exact'} ({len(hits)} hits)")
            summary["ambiguous" if candidates else "no_match"] += 1
            continue
        crd = str(candidates[0].get("firm_source_id"))
        log(f"    ✓ matched firmId {crd}")
        # Merge the existing row + finraCrd; PUT replaces the record so
        # we must include every NOT NULL field the existing row had.
        merged = {**f, "finraCrd": crd}
        if rest.put("Firm", merged):
            summary["matched"] += 1
        else:
            log(f"    ! PUT failed for {f.get('id')}")
    log(f"  phase 1 summary: {summary}")
    return summary


# ── Phase 2: firm snapshots ────────────────────────────────────────

def fetch_firm_snapshots(rest: HarperREST, client: BrokerCheckClient,
                         resolver: Resolver, state: dict, *,
                         force: bool, log) -> dict:
    log("phase 2: firm snapshots")
    firms = rest.get("/Firm/") or []
    with_crd = [f for f in firms if f.get("finraCrd")]
    log(f"  {len(with_crd)} firms with CRDs")
    # Refresh resolver firm cache so it sees the new CRDs.
    resolver.firm_listing = None
    summary = {"fetched": 0, "skipped": 0, "errors": 0}
    for f in with_crd:
        crd = str(f["finraCrd"])
        try:
            counts = fetch_one_firm(client, rest, resolver, state, crd,
                                    dry_run=False, force=force, log=log)
        except Exception as e:
            log(f"  ! firm {crd} crashed: {e}")
            summary["errors"] += 1
            continue
        if counts is None:
            summary["skipped"] += 1
        else:
            summary["fetched"] += 1
        save_state(state)
    log(f"  phase 2 summary: {summary}")
    return summary


# ── Phase 3: roster walks (size-ordered) ──────────────────────────

def walk_firm_rosters(rest: HarperREST, client: BrokerCheckClient,
                      resolver: Resolver, state: dict, *,
                      max_per_firm: int, force: bool, log,
                      only_firm_id: Optional[str] = None) -> dict:
    log("phase 3: roster walks")
    firms = rest.get("/Firm/") or []
    with_crd = [f for f in firms if f.get("finraCrd")]
    if only_firm_id:
        with_crd = [f for f in with_crd if str(f.get("finraCrd")) == only_firm_id]

    # Order by approximate size from each firm's BrokerCheckSnapshot —
    # more disclosures usually correlates with more brokers, but we'd
    # rather use a real branch_count. Fall back to alphabetical if
    # snapshots aren't loaded yet.
    snaps = rest.get("/BrokerCheckSnapshot/") or []
    snap_by_crd = {s.get("subjectCrd"): s for s in snaps if s.get("subjectKind") == "firm"}

    def order_key(f):
        s = snap_by_crd.get(str(f.get("finraCrd"))) or {}
        return (s.get("disclosureCount") or 0, f.get("name") or "")

    with_crd.sort(key=order_key)

    log(f"  walking {len(with_crd)} firms (smallest first), cap {max_per_firm} advisors/firm")
    grand_total = {"fetched": 0, "skipped": 0, "errors": 0}
    for f in with_crd:
        crd = str(f["finraCrd"])
        log(f"\n  ─── firm {crd} ({f.get('name')}) ───")
        try:
            s = crawl_firm_roster(client, rest, resolver, state, crd,
                                  dry_run=False, max_advisors=max_per_firm,
                                  force=force, log=log)
        except Exception as e:
            log(f"  ! firm {crd} crashed: {e}")
            grand_total["errors"] += 1
            continue
        for k in ("fetched", "skipped", "errors"):
            grand_total[k] += s.get(k, 0)
        save_state(state)
        log(f"  · firm {crd} done: {s}")
        log(f"  · running totals: {grand_total}")
    log(f"  phase 3 summary: {grand_total}")
    return grand_total


# ── main ───────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-per-firm", type=int, default=200,
                    help="Cap on advisors loaded from each firm roster (default 200)")
    ap.add_argument("--skip-firm-lookup", action="store_true")
    ap.add_argument("--skip-firm-snapshots", action="store_true")
    ap.add_argument("--skip-rosters", action="store_true")
    ap.add_argument("--only-firm-id",
                    help="Limit rosters to this firmId (debugging)")
    ap.add_argument("--rate-seconds", type=float, default=None)
    ap.add_argument("--force", action="store_true",
                    help="Refetch CRDs even if last-fetched < 7 days ago")
    args = ap.parse_args()

    log = TeeLog(LOG_FILE)
    log(f"==== brokercheck_crawl_all START "
        f"(max-per-firm={args.max_per_firm}, force={args.force}) ====")
    start = time.monotonic()

    rest = HarperREST(verbose=False)
    resolver = Resolver(rest)
    client = BrokerCheckClient(rate_seconds=args.rate_seconds, verbose=False)
    state = load_state()

    summaries = {}
    if not args.skip_firm_lookup:
        summaries["firm_lookup"] = lookup_firm_crds(rest, client, log)

    if not args.skip_firm_snapshots:
        summaries["firm_snapshots"] = fetch_firm_snapshots(
            rest, client, resolver, state, force=args.force, log=log)

    if not args.skip_rosters:
        summaries["rosters"] = walk_firm_rosters(
            rest, client, resolver, state,
            max_per_firm=args.max_per_firm, force=args.force, log=log,
            only_firm_id=args.only_firm_id,
        )

    save_state(state)
    elapsed = time.monotonic() - start
    log(f"\n==== DONE in {elapsed:.0f}s "
        f"({client.request_count} HTTP, "
        f"{rest.read_count} REST reads, "
        f"{rest.write_count} REST writes) ====")
    log(f"summaries: {json.dumps(summaries)}")
    log(f"resolver stats: {resolver.stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

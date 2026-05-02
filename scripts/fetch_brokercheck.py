#!/usr/bin/env python3
"""Polite, idempotent BrokerCheck scraper.

Fetches FINRA BrokerCheck records for individuals and firms, parses
them into our schema, and upserts the result via Harper REST PUT-by-id.
Idempotent at the row level — re-running over the same input produces
no row-count delta.

Modes (one required):
  --crd CRD                   fetch one individual by CRD
  --firm-id FIRMID            fetch one firm by FINRA firmId
  --enrich                    walk every Advisor in DB lacking
                              finraCrd, search by legalName, match, and
                              load the full report
  --firm-roster FIRMID        paginate every individual currently
                              registered with FIRMID and load each
  --search-name NAME          run a plain name search and load each
                              hit (≤ N hits)
  --from-fixture FILE.json    load a recorded JSON response from disk
                              (no HTTP). Use the 'detail' fixtures.

Behavior:
  - Defaults to politeness: 1.5 s ± 0.5 s between requests
    (BC_RATE_SECONDS overrides). Exponential backoff on 4xx/5xx.
  - State file at research/brokercheck-state.json tracks per-CRD
    'last fetched at'; --skip-recent omits CRDs fetched in the last
    7 days. Resumable: Ctrl-C and re-run picks up where it stopped.
  - --dry-run parses but doesn't write to Harper.

Required env (writes):
  HDB_TARGET_URL              e.g. https://...harperfabric.com
  HDB_ADMIN_USERNAME (or HARPER_ADMIN_USERNAME)
  HDB_ADMIN_PASSWORD (or HARPER_ADMIN_PASSWORD)

Examples:
  python3 scripts/fetch_brokercheck.py --crd 4068906
  python3 scripts/fetch_brokercheck.py --enrich --max 10
  python3 scripts/fetch_brokercheck.py --firm-roster 19616 --max 50
  python3 scripts/fetch_brokercheck.py --from-fixture \\
      research/brokercheck-samples/cairnes-detail.json
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import pathlib
import sys
from typing import Optional

REPO = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from _brokercheck import (  # noqa: E402
    BrokerCheckClient, BrokerCheckError,
    unwrap_individual, unwrap_firm,
)
from _brokercheck_parse import parse_individual, parse_firm  # noqa: E402
from _brokercheck_load import (  # noqa: E402
    HarperREST, Resolver, load_individual, load_firm,
)


STATE_FILE = REPO / "research" / "brokercheck-state.json"
SKIP_RECENT_DAYS = 7


# ── State tracking (resumability) ──────────────────────────────────

def load_state() -> dict:
    if not STATE_FILE.exists():
        return {"individuals": {}, "firms": {}}
    try:
        return json.loads(STATE_FILE.read_text())
    except json.JSONDecodeError:
        return {"individuals": {}, "firms": {}}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, sort_keys=True))


def is_recent(iso_str: str, max_age_days: int = SKIP_RECENT_DAYS) -> bool:
    if not iso_str:
        return False
    try:
        when = _dt.datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except ValueError:
        return False
    age = _dt.datetime.now(tz=_dt.timezone.utc) - when
    return age.total_seconds() < max_age_days * 86400


# ── Mode: one CRD ──────────────────────────────────────────────────

def fetch_one_crd(client: BrokerCheckClient, rest: HarperREST,
                  resolver: Resolver, state: dict, crd: str, *,
                  dry_run: bool, force: bool, log) -> Optional[dict]:
    last = state["individuals"].get(crd, {}).get("fetchedAt", "")
    if not force and is_recent(last):
        log(f"  ↷ skip CRD {crd} (last fetched {last})")
        return None
    log(f"  ▶ fetch CRD {crd}")
    try:
        raw = client.get_individual(crd)
    except BrokerCheckError as e:
        log(f"  ! CRD {crd}: {e}")
        return None
    content = unwrap_individual(raw)
    if not content:
        log(f"  ! CRD {crd}: no hits")
        return None
    parsed = parse_individual(content)
    counts = load_individual(parsed, content,
                             rest=rest, resolver=resolver, write=not dry_run)
    state["individuals"][crd] = {
        "fetchedAt": _dt.datetime.now(tz=_dt.timezone.utc).isoformat(),
        "legalName": parsed["advisor"].get("legalName") or "",
        "counts": counts,
    }
    log(f"    → {sum(counts.values())} rows  {dict(counts)}")
    return counts


# ── Mode: one Firm ─────────────────────────────────────────────────

def fetch_one_firm(client: BrokerCheckClient, rest: HarperREST,
                   resolver: Resolver, state: dict, firm_id: str, *,
                   dry_run: bool, force: bool, log) -> Optional[dict]:
    last = state["firms"].get(firm_id, {}).get("fetchedAt", "")
    if not force and is_recent(last):
        log(f"  ↷ skip firm {firm_id} (last fetched {last})")
        return None
    log(f"  ▶ fetch firm {firm_id}")
    try:
        raw = client.get_firm(firm_id)
    except BrokerCheckError as e:
        log(f"  ! firm {firm_id}: {e}")
        return None
    content = unwrap_firm(raw)
    if not content:
        log(f"  ! firm {firm_id}: no hits")
        return None
    parsed = parse_firm(content)
    counts = load_firm(parsed, content,
                       rest=rest, resolver=resolver, write=not dry_run)
    state["firms"][firm_id] = {
        "fetchedAt": _dt.datetime.now(tz=_dt.timezone.utc).isoformat(),
        "name": parsed["firm"].get("name") or "",
        "counts": counts,
    }
    log(f"    → {sum(counts.values())} rows  {dict(counts)}")
    return counts


# ── Mode: enrich existing advisors lacking finraCrd ────────────────

def enrich_existing_advisors(client: BrokerCheckClient, rest: HarperREST,
                             resolver: Resolver, state: dict, *,
                             dry_run: bool, max_advisors: int, force: bool,
                             log) -> dict:
    log("▶ enrich: scanning Advisor rows lacking finraCrd")
    advisors = rest.get("/Advisor/") or []
    targets = [a for a in advisors if not a.get("finraCrd")]
    log(f"  {len(targets)}/{len(advisors)} advisors need CRD enrichment")
    if max_advisors:
        targets = targets[:max_advisors]
    summary = {"matched": 0, "no_match": 0, "ambiguous": 0, "loaded": 0}
    for adv in targets:
        legal_name = (adv.get("legalName") or "").strip()
        if not legal_name:
            continue
        log(f"  · search {legal_name!r}")
        try:
            res = client.search_individual(legal_name, rows=5)
        except BrokerCheckError as e:
            log(f"    ! search failed: {e}")
            continue
        hits = res.get("hits", {}).get("hits") or []
        if not hits:
            summary["no_match"] += 1
            log("    no hits")
            continue
        # Match heuristic: only auto-resolve when first/last names match
        # and there is exactly one such hit. Anything else needs a human.
        candidates = []
        for h in hits:
            src = h.get("_source", {})
            if _name_matches(adv, src):
                candidates.append(src)
        if len(candidates) != 1:
            summary["ambiguous" if candidates else "no_match"] += 1
            log(f"    {'ambiguous' if candidates else 'no exact'} ({len(hits)} hits)")
            continue
        crd = str(candidates[0].get("ind_source_id"))
        summary["matched"] += 1
        log(f"    ✓ matched CRD {crd}")
        if fetch_one_crd(client, rest, resolver, state, crd,
                         dry_run=dry_run, force=force, log=log):
            summary["loaded"] += 1
        save_state(state)  # persist after every advisor
    return summary


def _name_matches(advisor_row: dict, search_hit: dict) -> bool:
    a_first = (advisor_row.get("firstName") or "").lower()
    a_last = (advisor_row.get("lastName") or "").lower()
    s_first = (search_hit.get("ind_firstname") or "").lower()
    s_last = (search_hit.get("ind_lastname") or "").lower()
    if a_first and a_last:
        return a_first == s_first and a_last == s_last
    legal = (advisor_row.get("legalName") or "").lower()
    return s_first in legal and s_last in legal


# ── Mode: firm roster ──────────────────────────────────────────────

def crawl_firm_roster(client: BrokerCheckClient, rest: HarperREST,
                      resolver: Resolver, state: dict, firm_id: str, *,
                      dry_run: bool, max_advisors: int, force: bool,
                      log) -> dict:
    log(f"▶ firm-roster: {firm_id}")
    page = 0
    rows = 50
    seen = 0
    summary = {"fetched": 0, "skipped": 0, "errors": 0}
    while True:
        try:
            res = client.firm_roster(firm_id, page=page, rows=rows)
        except BrokerCheckError as e:
            log(f"  ! roster page {page} failed: {e}")
            summary["errors"] += 1
            break
        hits = res.get("hits", {}).get("hits") or []
        if not hits:
            break
        log(f"  page {page}: {len(hits)} hits (running total {seen + len(hits)})")
        for h in hits:
            src = h.get("_source", {})
            crd = str(src.get("ind_source_id") or "")
            if not crd:
                continue
            seen += 1
            if max_advisors and seen > max_advisors:
                log(f"  reached --max {max_advisors}, stopping")
                save_state(state)
                return summary
            counts = fetch_one_crd(
                client, rest, resolver, state, crd,
                dry_run=dry_run, force=force, log=log,
            )
            if counts is None:
                summary["skipped"] += 1
            else:
                summary["fetched"] += 1
            save_state(state)
        if len(hits) < rows:
            break
        page += 1
    return summary


# ── Mode: name search → load all matching ──────────────────────────

def crawl_name_search(client: BrokerCheckClient, rest: HarperREST,
                      resolver: Resolver, state: dict, query: str, *,
                      dry_run: bool, max_advisors: int, force: bool,
                      log) -> dict:
    log(f"▶ name-search: {query!r}")
    try:
        res = client.search_individual(query, rows=max_advisors or 25)
    except BrokerCheckError as e:
        log(f"  ! search failed: {e}")
        return {"errors": 1}
    hits = res.get("hits", {}).get("hits") or []
    summary = {"fetched": 0, "skipped": 0, "errors": 0}
    for h in hits[: max_advisors or len(hits)]:
        src = h.get("_source", {})
        crd = str(src.get("ind_source_id") or "")
        if not crd:
            continue
        counts = fetch_one_crd(
            client, rest, resolver, state, crd,
            dry_run=dry_run, force=force, log=log,
        )
        if counts is None:
            summary["skipped"] += 1
        else:
            summary["fetched"] += 1
        save_state(state)
    return summary


# ── Mode: from-fixture ─────────────────────────────────────────────

def load_from_fixture(rest: HarperREST, resolver: Resolver, state: dict,
                      path: pathlib.Path, *, dry_run: bool, log) -> dict:
    log(f"▶ from-fixture: {path}")
    raw = json.loads(path.read_text())
    # Decide individual vs firm by inspecting the inner content blob.
    content = unwrap_individual(raw)
    if content and "basicInformation" in content and "individualId" in (
        content.get("basicInformation") or {}
    ):
        parsed = parse_individual(content)
        return load_individual(parsed, content,
                               rest=rest, resolver=resolver, write=not dry_run)
    content = unwrap_firm(raw)
    if content and "firmId" in (content.get("basicInformation") or {}):
        parsed = parse_firm(content)
        return load_firm(parsed, content,
                         rest=rest, resolver=resolver, write=not dry_run)
    log(f"  ! could not classify fixture as individual or firm")
    return {}


# ── main ───────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--crd")
    g.add_argument("--firm-id")
    g.add_argument("--enrich", action="store_true")
    g.add_argument("--firm-roster")
    g.add_argument("--search-name")
    g.add_argument("--from-fixture", type=pathlib.Path)

    ap.add_argument("--max", type=int, default=0,
                    help="Cap on advisors processed (0 = unlimited)")
    ap.add_argument("--rate-seconds", type=float, default=None,
                    help="Override request gap (default 1.5; floor 0.5)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse but don't write to Harper")
    ap.add_argument("--force", action="store_true",
                    help="Refetch even if last-fetched < 7 days ago")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    def log(*a, **kw):
        if not args.quiet:
            print(*a, file=sys.stderr, **kw)

    state = load_state()

    rest = None
    resolver = None
    if not (args.dry_run and not args.from_fixture):
        # We need REST writes unless dry-running a fixture
        try:
            rest = HarperREST(verbose=not args.quiet)
        except SystemExit as e:
            if not args.dry_run:
                raise
            print(f"  (dry-run, skipping Harper auth: {e})", file=sys.stderr)
            rest = None
    if rest is not None:
        resolver = Resolver(rest)

    client = BrokerCheckClient(
        rate_seconds=args.rate_seconds, verbose=not args.quiet,
    )

    if args.from_fixture:
        if rest is None:
            class _NoOpREST:
                write_count = 0
                read_count = 0

                def get(self, *a, **kw): return None

                def put(self, *a, **kw): return False

            rest = _NoOpREST()
            resolver = Resolver(rest)  # type: ignore[arg-type]
        counts = load_from_fixture(
            rest, resolver, state, args.from_fixture,
            dry_run=args.dry_run, log=log,
        )
        log(f"\nfixture loaded: {dict(counts)}")
        save_state(state)
        return 0

    if args.crd:
        fetch_one_crd(client, rest, resolver, state, args.crd,
                      dry_run=args.dry_run, force=args.force, log=log)
    elif args.firm_id:
        fetch_one_firm(client, rest, resolver, state, args.firm_id,
                       dry_run=args.dry_run, force=args.force, log=log)
    elif args.enrich:
        s = enrich_existing_advisors(
            client, rest, resolver, state,
            dry_run=args.dry_run, max_advisors=args.max,
            force=args.force, log=log,
        )
        log(f"\nenrich summary: {s}")
    elif args.firm_roster:
        s = crawl_firm_roster(
            client, rest, resolver, state, args.firm_roster,
            dry_run=args.dry_run, max_advisors=args.max,
            force=args.force, log=log,
        )
        log(f"\nroster summary: {s}")
    elif args.search_name:
        s = crawl_name_search(
            client, rest, resolver, state, args.search_name,
            dry_run=args.dry_run, max_advisors=args.max,
            force=args.force, log=log,
        )
        log(f"\nsearch summary: {s}")

    save_state(state)
    log(
        f"\n[done] {client.request_count} HTTP requests, "
        f"{rest.read_count if rest else 0} REST reads, "
        f"{rest.write_count if rest else 0} REST writes"
    )
    if resolver:
        log(f"resolver stats: {resolver.stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

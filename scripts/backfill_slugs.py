#!/usr/bin/env python3
"""Backfill SEO-friendly `slug` columns on Firm / Advisor / Team rows.

Re-runnable. Reads every row, computes a unique slug per the rules in
`scripts/_slugs.py`, and upserts only when the row's current slug
differs.

Article slugs come from WordPress and are already populated at ingest
time — this script does not touch the Article table.

Usage:
    python3 scripts/backfill_slugs.py            # against whatever
                                                  # _harper.py resolves
    HDB_TARGET_URL=https://… python3 scripts/backfill_slugs.py

Two-pass per entity:
    1. seed `taken` with every existing slug,
    2. mint a new slug for any row with `slug` missing or stale,
       reserving it in `taken` so subsequent rows in the same pass
       don't collide.
"""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from _harper import sql, upsert  # type: ignore  # noqa: E402
from _slugs import (             # type: ignore  # noqa: E402
    advisor_slug, firm_slug, team_slug,
)


def _rows(table: str) -> list[dict]:
    return sql(f"SELECT * FROM data.{table}") or []


def _has_changed(existing, fresh) -> bool:
    return (existing or "") != (fresh or "")


def _backfill(name: str, rows: list[dict], slug_for) -> int:
    taken: set[str] = set()
    for r in rows:
        s = r.get("slug")
        if s:
            taken.add(s)

    updates: list[dict] = []
    for r in rows:
        current = r.get("slug") or ""
        # Don't let `current` block its own re-mint — but every OTHER
        # row's slug is off-limits.
        def exists(candidate, _own=current):
            return candidate != _own and candidate in taken
        fresh = slug_for(r, exists)
        if not fresh:
            continue
        if _has_changed(current, fresh):
            taken.discard(current)
            taken.add(fresh)
            updates.append({"id": r["id"], "slug": fresh})
        else:
            taken.add(current)

    if updates:
        upsert(name, updates)
    print(f"  {name}: {len(rows)} rows · {len(updates)} updated")
    return len(updates)


def main() -> int:
    firms = _rows("Firm")
    advisors = _rows("Advisor")
    teams = _rows("Team")
    firm_name_by_id = {f["id"]: (f.get("name") or "") for f in firms}

    print("Backfilling slugs:")
    total = 0
    total += _backfill("Firm", firms, firm_slug)
    total += _backfill("Advisor", advisors, advisor_slug)
    total += _backfill(
        "Team", teams,
        lambda row, exists: team_slug(row, firm_name_by_id, exists),
    )
    print(f"Done. {total} rows updated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Backfill SEO-friendly `slug` columns via the REST data plane.

Use this against Fabric (`HDB_TARGET_URL=https://<cluster>.harperfabric.com`),
where the cluster's operations API on :9925 is firewalled but the
auto-exported REST routes on :443 work with basic auth.

Mechanism:
  - GET  /<TableName>/        → list every row
  - PUT  /<TableName>/<id>    → upsert (sends only `id` + `slug`,
                                 which Harper merges into the
                                 existing record)

Required env:
  HDB_TARGET_URL         e.g. https://<cluster>.harperfabric.com
  HDB_ADMIN_USERNAME
  HDB_ADMIN_PASSWORD
"""
from __future__ import annotations

import base64
import json
import os
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from _slugs import advisor_slug, firm_slug, team_slug  # noqa: E402

BASE = os.environ["HDB_TARGET_URL"].rstrip("/")
USER = os.environ["HDB_ADMIN_USERNAME"]
PW = os.environ["HDB_ADMIN_PASSWORD"]
AUTH_HEADER = "Basic " + base64.b64encode(f"{USER}:{PW}".encode()).decode()


def _curl(args: list[str]) -> tuple[int, str]:
    res = subprocess.run(
        ["curl", "-sk", "-m", "60",
         "-H", f"Authorization: {AUTH_HEADER}",
         "-H", "Accept: application/json",
         "-w", "\n--HTTP=%{http_code}", *args],
        capture_output=True, text=True,
    )
    body, _, status = res.stdout.rpartition("\n--HTTP=")
    code = int(status.strip() or 0)
    return code, body


def list_rows(table: str) -> list[dict]:
    code, body = _curl([f"{BASE}/{table}/"])
    if code != 200:
        raise SystemExit(f"GET /{table}/ → HTTP {code}: {body[:200]}")
    rows = json.loads(body) if body else []
    return rows


def put_slug(table: str, row: dict, slug: str) -> bool:
    """Replace the row with the same fields plus the new slug.

    Harper's PUT is a full replace — sending only `{id, slug}`
    nulls every other field and trips the schema's NOT NULL
    constraints (legalName on Advisor, name on Firm/Team). So we
    keep the existing row intact and just stamp the slug on top.
    """
    rid = row["id"]
    body = {**row, "slug": slug}
    code, resp = _curl([
        "-H", "Content-Type: application/json",
        "-X", "PUT",
        "-d", json.dumps(body),
        f"{BASE}/{table}/{rid}",
    ])
    if code not in (200, 201, 204):
        print(f"  ! PUT /{table}/{rid} → {code}: {resp[:200]}", file=sys.stderr)
        return False
    return True


def _backfill(table: str, rows: list[dict], slug_for) -> int:
    taken: set[str] = {r["slug"] for r in rows if r.get("slug")}

    n_updated = 0
    for r in rows:
        current = r.get("slug") or ""

        def exists(candidate, _own=current):
            return candidate != _own and candidate in taken
        fresh = slug_for(r, exists)
        if not fresh:
            continue
        if (current or "") == fresh:
            continue
        if put_slug(table, r, fresh):
            taken.discard(current)
            taken.add(fresh)
            n_updated += 1
    print(f"  {table}: {len(rows)} rows · {n_updated} updated")
    return n_updated


def main() -> int:
    print(f"[backfill_slugs_via_rest] target: {BASE}", file=sys.stderr)
    firms = list_rows("Firm")
    advisors = list_rows("Advisor")
    teams = list_rows("Team")
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

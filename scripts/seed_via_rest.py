#!/usr/bin/env python3
"""Seed Harper via the REST PUT endpoints on :443.

Use this when the cluster's operations API on :9925 is unreachable —
typically when running from a datacenter network whose egress firewall
blocks high ports. See docs/fabric-runbook.md §5 for the full context
and §7 for usage.

Mechanism: monkey-patch _harper.upsert with a PUT-based implementation,
then exec harper-app/seed.py unchanged. The seed script's records all
carry their `id`, which is what PUT /<TableName>/<id> needs.

Required env (same as seed.py):
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
sys.path.insert(0, str(REPO / "harper-app"))

import _harper  # noqa: E402

BASE = os.environ["HDB_TARGET_URL"].rstrip("/")
USER = os.environ["HDB_ADMIN_USERNAME"]
PW = os.environ["HDB_ADMIN_PASSWORD"]
AUTH_HEADER = "Basic " + base64.b64encode(f"{USER}:{PW}".encode()).decode()


def put_one(table: str, record: dict) -> bool:
    rid = record.get("id")
    if not rid:
        raise SystemExit(f"record missing id: {record!r}")
    res = subprocess.run(
        [
            "curl", "-sk", "-m", "30",
            "-H", "Content-Type: application/json",
            "-H", f"Authorization: {AUTH_HEADER}",
            "-X", "PUT",
            "-d", json.dumps(record),
            "-w", "\n--HTTP=%{http_code}",
            f"{BASE}/{table}/{rid}",
        ],
        capture_output=True, text=True,
    )
    body, _, status = res.stdout.rpartition("\n--HTTP=")
    code = int(status.strip() or 0)
    if code not in (200, 201, 204):
        print(f"  ! PUT /{table}/{rid} -> {code}: {body[:200]}", file=sys.stderr)
        return False
    return True


def upsert_via_rest(table, records, database="data"):
    n = 0
    for r in records:
        if put_one(table, r):
            n += 1
    return n


_harper.upsert = upsert_via_rest
_harper.insert_idempotent = upsert_via_rest


def describe_target_rest():
    return f"REST {BASE}"


_harper.describe_target = describe_target_rest


seed_path = REPO / "harper-app" / "seed.py"
print(f"[seed_via_rest] running {seed_path} via PUT against {BASE}", file=sys.stderr)
exec(
    compile(seed_path.read_text(), str(seed_path), "exec"),
    {"__name__": "__main__", "__file__": str(seed_path)},
)

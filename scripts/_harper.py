"""Shared Harper-API client used by every script in this repo.

Picks a transport in this order:
  1. $HDB_TARGET_URL (HTTPS or HTTP) — for Fabric or any remote cluster
  2. Unix domain socket at $HDB_ROOT/operations-server (or
     ~/.harperdb/operations-server) — for local Harper

Auth always goes via HTTP basic, reading $HDB_ADMIN_USERNAME and
$HDB_ADMIN_PASSWORD (defaults: admin / admin-local — only safe locally).

All scripts call `op(payload)` for raw operations and `sql(query)` for
SQL queries; the transport details are internal here so each script
doesn't have to repeat them.
"""
from __future__ import annotations
import base64
import json
import os
import subprocess
from typing import Any


def _config():
    target = os.environ.get("HDB_TARGET_URL", "").rstrip("/")
    hdb_root = os.environ.get("HDB_ROOT") or os.path.expanduser("~/.harperdb")
    socket = f"{hdb_root}/operations-server"
    user = os.environ.get("HDB_ADMIN_USERNAME", "admin")
    pw   = os.environ.get("HDB_ADMIN_PASSWORD", "admin-local")
    auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
    return target, socket, auth


def describe_target() -> str:
    target, socket, _ = _config()
    if target:
        return f"HTTPS {target}"
    return f"unix-socket {socket}"


def op(payload: dict, timeout: int = 20) -> Any:
    """POST to the Harper operations API. Returns parsed JSON or None."""
    target, socket, auth = _config()

    if target:
        transport = []
        url = target + "/"
    elif os.path.exists(socket):
        transport = ["--unix-socket", socket]
        url = "http://localhost/"
    else:
        raise SystemExit(
            "No Harper target available. Either set HDB_TARGET_URL "
            f"or run a local Harper (no socket at {socket})."
        )

    res = subprocess.run(
        ["curl", "-sS", "-m", str(timeout), *transport,
         "-H", "Content-Type: application/json",
         "-H", f"Authorization: Basic {auth}",
         "-d", json.dumps(payload),
         "-w", "\n--HTTP=%{http_code}",
         url],
        capture_output=True, text=True,
    )
    body, _, status = res.stdout.rpartition("\n--HTTP=")
    code = int(status.strip() or 0)
    if code != 200:
        raise SystemExit(
            f"Harper {payload.get('operation')} → HTTP {code}\n{body[:600]}"
        )
    return json.loads(body) if body.strip() else None


def sql(query: str) -> list[dict]:
    return op({"operation": "sql", "sql": query}) or []


def upsert(table: str, records: list[dict], database: str = "data") -> int:
    if not records:
        return 0
    res = op({"operation": "upsert", "database": database,
              "table": table, "records": records})
    return len(res.get("upserted_hashes", [])) if isinstance(res, dict) else 0


def insert_idempotent(table: str, records: list[dict],
                      database: str = "data") -> int:
    """Alias used by seed.py — same as upsert, named for clarity."""
    return upsert(table, records, database)

"""Shared deterministic ID helpers — used by both seed.py and ingest.py
so they don't insert the same logical entity under two different UUIDs.
"""
import re
import uuid

# Stable namespace. NEVER change once data has been written.
NS = uuid.UUID("8c4e2f1d-3b9a-4f87-9e62-2bf7b1a0c5d3")

def uid(label: str) -> str:
    """Deterministic UUIDv5 from a string label."""
    return str(uuid.uuid5(NS, label))

def slugify(s: str) -> str:
    """Stable, lowercase, snake-case slug from a name."""
    s = s.lower()
    s = re.sub(r"&", " and ", s)
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")

def firm_id(canonical_name: str) -> str:
    """Single source of truth for Firm.id. Both seed.py and ingest.py
    must derive Firm IDs through this function."""
    return uid(f"firm:{slugify(canonical_name)}")

def article_id(url_or_wpid: str) -> str:
    return uid(f"article:{url_or_wpid}")

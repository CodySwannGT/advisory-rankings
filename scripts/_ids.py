"""Shared deterministic ID helpers — used by every script that writes to
Harper so they don't insert the same logical entity under two different
UUIDs."""
import re
import uuid

# Stable namespace. NEVER change once data has been written.
NS = uuid.UUID("8c4e2f1d-3b9a-4f87-9e62-2bf7b1a0c5d3")

def uid(label: str) -> str:
    """Deterministic UUIDv5 from a string label."""
    return str(uuid.uuid5(NS, label))

def slugify(s: str) -> str:
    """Stable, lowercase, snake-case slug from a name."""
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"&", " and ", s)
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")

def firm_id(canonical_name: str) -> str:
    """Single source of truth for Firm.id. Any script that writes Firm
    rows must derive IDs through this function."""
    return uid(f"firm:{slugify(canonical_name)}")

def article_id(url_or_wpid: str) -> str:
    return uid(f"article:{url_or_wpid}")

# ── Natural-key derivations for entities the LLM extractor mints ──
#
# These are the *fallback* — the resolver should always query Harper
# first and only fall back to derivation when no match exists. But the
# derivations themselves must be stable across re-extractions of the
# same article so a re-run produces the same UUID.

def advisor_id(legal_name: str, hint: str = "") -> str:
    """advisor_id derived from legal_name + an optional disambiguator
    (typically the first known firm or career start year)."""
    parts = [slugify(legal_name)]
    if hint:
        parts.append(slugify(hint))
    return uid("advisor:" + ":".join(parts))

def team_id(name: str, firm_canonical: str = "") -> str:
    parts = [slugify(name)]
    if firm_canonical:
        parts.append(slugify(firm_canonical))
    return uid("team:" + ":".join(parts))

def branch_id(firm_canonical: str, level: str, name: str) -> str:
    return uid(f"branch:{slugify(firm_canonical)}:{level}:{slugify(name)}")

def transition_event_id(subject_id: str, from_firm_id: str,
                        to_firm_id: str, move_date: str) -> str:
    return uid(f"te:{subject_id}:{from_firm_id}:{to_firm_id}:{move_date or ''}")

def disclosure_id(advisor_id_val: str, disclosure_type: str,
                  date_key: str, regulator: str = "") -> str:
    return uid(f"disc:{advisor_id_val}:{disclosure_type}:{date_key or ''}:{regulator or ''}")

def employment_history_id(advisor_id_val: str, firm_id_val: str,
                          start_date: str) -> str:
    return uid(f"eh:{advisor_id_val}:{firm_id_val}:{start_date or ''}")

def team_membership_id(team_id_val: str, advisor_id_val: str) -> str:
    return uid(f"tm:{team_id_val}:{advisor_id_val}")

def metric_snapshot_id(subject_id: str, as_of: str, source_type: str = "") -> str:
    return uid(f"snap:{subject_id}:{as_of}:{source_type}")

def sanction_id(disclosure_id_val: str, sanction_type: str,
                amount: str = "", duration: str = "") -> str:
    return uid(f"sanc:{disclosure_id_val}:{sanction_type}:{amount}:{duration}")

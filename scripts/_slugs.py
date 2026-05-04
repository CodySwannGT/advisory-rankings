"""SEO-friendly slug helpers for entity URLs.

Distinct from `_ids.py:slugify`, which produces underscore-separated
snake_case used as input to deterministic UUID hashing — that one
must never change. These slugs are user-facing path segments
(`/firms/morgan-stanley`) and use hyphens instead.
"""
import re
import unicodedata


def slugify(s: str) -> str:
    """Hyphen-separated lowercase ASCII slug suitable for URLs.

    "Morgan Stanley & Co." → "morgan-stanley-and-co"
    "C. James Taylor"      → "c-james-taylor"
    """
    if not s:
        return ""
    # Strip accents so "André" → "Andre" rather than dropping the e.
    norm = unicodedata.normalize("NFKD", s)
    norm = "".join(ch for ch in norm if not unicodedata.combining(ch))
    norm = norm.lower()
    norm = re.sub(r"&", " and ", norm)
    norm = re.sub(r"[^a-z0-9]+", "-", norm)
    return norm.strip("-")


def unique_slug(base: str, exists, *, suffixes=()) -> str:
    """Find a slug derived from `base` that `exists(slug)` returns False for.

    `exists(slug)` is called with each candidate and must return True
    if the slug is already taken. Tries the bare base first, then each
    string in `suffixes` appended as `<base>-<suffix>`, then numeric
    fallbacks `<base>-2`, `<base>-3`, … until it finds an unused one.

    Returns the empty string if `base` slugifies to empty.
    """
    if not base:
        return ""
    if not exists(base):
        return base
    for suf in suffixes:
        if not suf:
            continue
        candidate = f"{base}-{slugify(str(suf))}"
        if not exists(candidate):
            return candidate
    n = 2
    while True:
        candidate = f"{base}-{n}"
        if not exists(candidate):
            return candidate
        n += 1


def firm_slug(firm: dict, exists) -> str:
    base = slugify(firm.get("name") or firm.get("legalName") or "")
    return unique_slug(base, exists, suffixes=(firm.get("finraCrd"),))


def advisor_slug(advisor: dict, exists) -> str:
    """Advisor slug from preferred-or-first-name + lastName.

    Collisions append the FINRA CRD (globally unique in the FINRA
    universe) — `john-smith` → `john-smith-2891234`. Per the
    refactor decision in docs/the-urls-for-the-pure-origami plan.
    """
    pref = advisor.get("preferredName")
    first = advisor.get("firstName")
    last = advisor.get("lastName")
    legal = advisor.get("legalName")
    name_source = " ".join(p for p in (pref or first, last) if p) or legal or ""
    base = slugify(name_source)
    return unique_slug(base, exists, suffixes=(advisor.get("finraCrd"),))


def team_slug(team: dict, firm_name_by_id, exists) -> str:
    """Team slug from team name; collisions append the firm slug."""
    base = slugify(team.get("name") or "")
    firm_name = firm_name_by_id.get(team.get("currentFirmId"))
    return unique_slug(base, exists, suffixes=(firm_name,))

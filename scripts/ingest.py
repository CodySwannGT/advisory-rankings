#!/usr/bin/env python3
"""Idempotent ingest: crawl wpjson archive → upsert into Harper.

Safe to re-run. Every record uses a deterministic UUID derived from a
natural key (article URL, firm name, etc.), so re-inserting an existing
record just touches the same primary key.

Pipeline:
  1. Walk research/wpjson/{posts,recruiting_moves,firm,team_bio,...}/post_*.json
  2. For each post: upsert Article + extract firm mentions + extract a
     handful of regex-derivable FieldAssertion rows.
  3. Upsert any Firms newly seen.
  4. Print a one-line summary per table.

The crawler (scripts/crawl_via_wpjson.py) is the upstream half of the
pipeline; this script is the downstream half. Run them in sequence.

Usage:
    python3 scripts/ingest.py [--wpjson-dir research/wpjson] [--limit N]

Env (optional):
    HDB_ROOT, HDB_ADMIN_USERNAME, HDB_ADMIN_PASSWORD
"""
from __future__ import annotations
import argparse
import base64
import json
import os
import pathlib
import re
import subprocess
import sys
import uuid
from typing import Any, Iterable

from bs4 import BeautifulSoup  # already a dep via the extractor

# Local imports — ID derivation is shared with harper-app/seed.py
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _ids import uid, firm_id, article_id  # noqa: E402

HDB_ROOT = os.environ.get("HDB_ROOT") or os.path.expanduser("~/.harperdb")
SOCKET   = f"{HDB_ROOT}/operations-server"
TCP_URL  = "http://127.0.0.1:9925/"
AUTH = base64.b64encode(
    f"{os.environ.get('HDB_ADMIN_USERNAME','admin')}:"
    f"{os.environ.get('HDB_ADMIN_PASSWORD','admin-local')}".encode()
).decode()

# Known firm aliases for cheap firm-mention extraction.
# (alias -> canonical_name). Add to this list as new firms appear.
FIRM_ALIASES: list[tuple[str, str]] = [
    ("Morgan Stanley Wealth Management", "Morgan Stanley Wealth Management"),
    ("Morgan Stanley",          "Morgan Stanley Wealth Management"),
    ("Wells Fargo Advisors",    "Wells Fargo Advisors"),
    ("Wells Fargo",             "Wells Fargo Advisors"),
    ("Wells Financial Network", "Wells Fargo Advisors Financial Network (FiNet)"),
    ("FiNet",                   "Wells Fargo Advisors Financial Network (FiNet)"),
    ("Merrill Lynch",           "Merrill Lynch"),
    ("Merrill",                 "Merrill Lynch"),
    ("Bank of America",         "Bank of America"),
    ("UBS Wealth Management",   "UBS Wealth Management USA"),
    ("UBS",                     "UBS Wealth Management USA"),
    ("Rockefeller Capital Management", "Rockefeller Capital Management"),
    ("Rockefeller",             "Rockefeller Capital Management"),
    ("J.P. Morgan Advisors",    "J.P. Morgan Advisors"),
    ("JPMorgan",                "J.P. Morgan Advisors"),
    ("J.P. Morgan",             "J.P. Morgan Advisors"),
    ("Goldman Sachs",           "Goldman Sachs"),
    ("Stifel",                  "Stifel"),
    ("Raymond James",           "Raymond James"),
    ("RayJay",                  "Raymond James"),
    ("LPL Financial",           "LPL Financial"),
    ("LPL",                     "LPL Financial"),
    ("Ameriprise",              "Ameriprise Financial"),
    ("Edward Jones",            "Edward Jones"),
    ("Cetera",                  "Cetera"),
    ("RBC Wealth Management",   "RBC Wealth Management"),
    ("RBC",                     "RBC Wealth Management"),
    ("First Republic",          "First Republic"),
    ("Janney",                  "Janney Montgomery Scott"),
    ("Hightower",               "Hightower"),
    ("Beacon Pointe",           "Beacon Pointe Advisors"),
    ("Focus Financial",         "Focus Financial Partners"),
    ("Steward Partners",        "Steward Partners"),
    ("Wealthcare",              "Wealthcare"),
    ("Hennion & Walsh",         "Hennion & Walsh"),
    ("Stanford Financial",      "Stanford Financial Group"),
    ("Chelsea Financial",       "Chelsea Financial Services"),
    ("Smith Barney",            "Smith Barney"),
    ("Lehman",                  "Lehman Brothers"),
    ("PaineWebber",             "PaineWebber"),
]

# ── Harper API helpers ────────────────────────────────────────────

def op(payload: dict) -> Any:
    """Talk to Harper. Tries Unix socket first, falls back to TCP."""
    transport = (["--unix-socket", SOCKET] if os.path.exists(SOCKET)
                 else [])
    res = subprocess.run(
        ["curl", "-sS", "-m", "15", *transport,
         "-H", "Content-Type: application/json",
         "-H", f"Authorization: Basic {AUTH}",
         "-d", json.dumps(payload),
         "-w", "\n--HTTP=%{http_code}",
         "http://localhost/" if transport else TCP_URL],
        capture_output=True, text=True,
    )
    body, _, status = res.stdout.rpartition("\n--HTTP=")
    code = int(status.strip() or 0)
    if code != 200:
        raise SystemExit(f"Harper {payload.get('operation')} -> HTTP {code}\n{body[:500]}")
    return json.loads(body) if body.strip() else None

def upsert(table: str, records: list[dict]) -> dict:
    """Idempotent insert. Harper's upsert by primary key."""
    if not records:
        return {"new": 0, "updated": 0}
    res = op({"operation": "upsert", "database": "data",
              "table": table, "records": records})
    upserted = res.get("upserted_hashes", []) if isinstance(res, dict) else []
    return {"upserted": len(upserted), "total": len(records)}

# ── parsing ───────────────────────────────────────────────────────

def strip_html(html: str) -> str:
    soup = BeautifulSoup(html or "", "lxml")
    for s in soup.select("script,style,figure,iframe,aside"):
        s.decompose()
    return soup.get_text("\n", strip=True)

def find_firms(text: str) -> list[str]:
    """Return canonical firm names mentioned. Longest-alias-first."""
    seen: set[str] = set()
    sorted_aliases = sorted(FIRM_ALIASES, key=lambda x: -len(x[0]))
    for alias, canon in sorted_aliases:
        if re.search(r"\b" + re.escape(alias) + r"\b", text):
            seen.add(canon)
    return sorted(seen)

MONEY_RE = re.compile(r"\$([\d,.]+)\s*(billion|bln|million|mln|m|b|k)?", re.I)
TENURE_RE = re.compile(r"(\d{1,2})-year (?:broker|veteran|advisor)", re.I)
DEAL_RE   = re.compile(r"(\d{2,4})\s*%\s*(?:of\s+)?(?:trailing[- ]?(?:twelve|12)|T[- ]?12)", re.I)
RULE_RE   = re.compile(r"(?:FINRA |Finra )?Rule\s+(\d{3,5})", re.I)
FINE_RE   = re.compile(r"fined?\s+\$?([\d,]+)", re.I)
SUSP_RE   = re.compile(r"suspend(?:ed)?\s+(?:for\s+)?(\w+|\d+)\s+(month|months|year|years)", re.I)

def first_match(rx: re.Pattern, text: str):
    m = rx.search(text)
    return m.group(0) if m else None

def field_assertions_for_article(a_id: str, article_pk_url: str, text: str) -> list[dict]:
    """Tiny demonstration of the FieldAssertion log: capture a few facts that
    a regex can confidently identify, attach to the Article itself."""
    out = []
    def fa(field, value, quote, conf="inferred"):
        # Deterministic FA id so re-ingest is a no-op
        out.append({
            "id": uid(f"fa:{article_pk_url}:{field}:{value}"),
            "articleId": a_id,
            "targetTable": "Article",
            "targetId": a_id,
            "fieldName": field,
            "assertedValue": json.dumps(value),
            "quotePhrase": quote[:500],
            "confidence": conf,
        })
    if (m := TENURE_RE.search(text)):
        fa("subjectTenureYears", int(m.group(1)), m.group(0))
    if (m := DEAL_RE.search(text)):
        fa("recruitingDealUpfrontPctT12", float(m.group(1))/100, m.group(0))
    if (m := FINE_RE.search(text)):
        fa("fineAmount",  m.group(1).replace(",", ""), m.group(0))
    if (m := SUSP_RE.search(text)):
        fa("suspensionDuration", m.group(0), m.group(0))
    rules = sorted({m.group(0) for m in RULE_RE.finditer(text)})
    if rules:
        fa("ruleViolations", rules, "; ".join(rules))
    moneys = [m.group(0) for m in MONEY_RE.finditer(text)][:6]
    if moneys:
        fa("moneyMentions", moneys, " | ".join(moneys))
    return out

# ── ingest ────────────────────────────────────────────────────────

def iter_post_files(wpjson_dir: pathlib.Path) -> Iterable[pathlib.Path]:
    for sub in sorted(wpjson_dir.iterdir()):
        if not sub.is_dir():
            continue
        for p in sorted(sub.glob("post_*.json")):
            yield p

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--wpjson-dir", default="research/wpjson")
    ap.add_argument("--limit", type=int, default=0,
                    help="cap total posts processed (0 = no cap)")
    args = ap.parse_args()

    wp = pathlib.Path(args.wpjson_dir)
    sample_dir = pathlib.Path("research/articles")

    sources: list[pathlib.Path] = []
    if wp.exists():
        sources.extend(iter_post_files(wp))
    if sample_dir.exists():
        sources.extend(sorted(sample_dir.glob("*.wpjson.json")))

    if not sources:
        print(f"[ingest] nothing to ingest: neither {wp}/ nor "
              f"{sample_dir}/ contain post records. Run the crawler "
              f"first (`python3 scripts/crawl_via_wpjson.py`).",
              file=sys.stderr)
        return 0

    articles: list[dict] = []
    firms: dict[str, dict] = {}    # name -> record
    afm: list[dict] = []           # ArticleFirmMention rows
    fas: list[dict] = []           # FieldAssertion rows

    seen = 0

    for path in sources:
        if args.limit and seen >= args.limit:
            break
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  skip {path}: {e}", file=sys.stderr)
            continue
        if not isinstance(d, dict) or "id" not in d:
            continue
        wp_id    = d.get("id")
        link     = d.get("link") or ""
        slug     = d.get("slug")
        title    = (d.get("title") or {}).get("rendered") or ""
        body_html = (d.get("content") or {}).get("rendered") or ""
        body_text = strip_html(body_html)
        wp_post_type = d.get("type") or "post"
        natural_key = link or f"wp:{wp_id}"
        a_id = article_id(natural_key)

        # `coauthors` may be strings, dicts, or integers depending on the
        # WordPress plugin. Coerce to a list of display-name strings.
        raw_authors = d.get("coauthors") or d.get("_co_authors") or []
        authors: list[str] = []
        for a in raw_authors:
            if isinstance(a, str):
                authors.append(a)
            elif isinstance(a, dict):
                name = a.get("display_name") or a.get("name") or a.get("user_nicename")
                if name:
                    authors.append(str(name))
            else:
                authors.append(str(a))

        articles.append({
            "id": a_id,
            "wpId": wp_id,
            "wpPostType": wp_post_type,
            "url": link,
            "slug": slug,
            "headline": title,
            "publishedDate": d.get("date"),
            "modifiedDate": d.get("modified"),
            "authors": authors,
            "category": "ingested",
            "wpCategories": d.get("categories") or [],
            "wpTags": d.get("tags") or [],
            "bodyText": body_text[:50_000],
            "bodyHtml": body_html[:50_000],
        })

        for canon_firm in find_firms(title + "\n" + body_text):
            f_id = firm_id(canon_firm)
            firms.setdefault(canon_firm, {
                "id": f_id,
                "name": canon_firm,
                "channel": "unknown",   # operator can refine later
            })
            afm.append({
                "id": uid(f"afm:{a_id}:{f_id}"),
                "articleId": a_id,
                "firmId": f_id,
            })
        fas.extend(field_assertions_for_article(a_id, natural_key, body_text))
        seen += 1

    print(f"[ingest] {seen} source files → "
          f"{len(articles)} articles / {len(firms)} firms / "
          f"{len(afm)} firm-mentions / {len(fas)} field-assertions")

    if not articles:
        return 0

    # Upsert in dependency order. Each table has a deterministic PK so this
    # is idempotent — re-running with the same input produces the same DB.
    print("  Firm:                ", upsert("Firm", list(firms.values())))
    print("  Article:             ", upsert("Article", articles))
    print("  ArticleFirmMention:  ", upsert("ArticleFirmMention", afm))
    print("  FieldAssertion:      ", upsert("FieldAssertion", fas))
    print("[ingest] done")
    return 0

if __name__ == "__main__":
    sys.exit(main())

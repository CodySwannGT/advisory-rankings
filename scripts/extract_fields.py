#!/usr/bin/env python3
"""Extract schema-relevant fields from AdvisorHub article bodies.

Reads either wp-json post records (`research/wpjson/.../post_*.json`) or
raw HTML (`research/html/*.html`) and emits one JSONL row per article with
the fields surfaced by the regex/heuristic extractors below.

This is a starting point — production-grade extraction will need an LLM
pass for nuanced fields (named-entity disambiguation, allegation
categorization, etc.).
"""
import argparse
import json
import pathlib
import re
import sys
from bs4 import BeautifulSoup

MONEY_RE = re.compile(
    r"\$([\d,.]+)\s*(billion|bln|million|mln|m|b|k)?",
    re.I,
)
PCT_RE = re.compile(r"(\d{1,4}(?:\.\d+)?)\s*%")
YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
TENURE_RE = re.compile(r"(\d{1,2})-year (?:broker|veteran|advisor)", re.I)


def parse_money(s, unit):
    s = s.replace(",", "")
    if not s:
        return None
    v = float(s)
    if unit:
        u = unit.lower()
        if u.startswith("b"):
            v *= 1_000_000_000
        elif u.startswith("m"):
            v *= 1_000_000
        elif u == "k":
            v *= 1_000
    return v


def extract(text):
    out = {}
    moneys = [(parse_money(m.group(1), m.group(2)), m.group(0))
              for m in MONEY_RE.finditer(text)]
    out["money_mentions"] = [{"value": v, "phrase": p} for v, p in moneys if v]
    out["pct_mentions"] = [m.group(0) for m in PCT_RE.finditer(text)]
    out["years_mentioned"] = sorted(set(m.group(0) for m in YEAR_RE.finditer(text)))
    out["tenure_phrases"] = [m.group(0) for m in TENURE_RE.finditer(text)]

    # Crude advisor name capture: "First [M.] Last" near "advisor", "broker", "team"
    NAME_NEAR = re.compile(
        r"([A-Z][a-z]+(?:\s+[A-Z]\.)?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"
        r"(?=[^.]*?\b(?:advisor|broker|registered|managing director|vice president)\b)",
        re.I,
    )
    out["candidate_names"] = sorted(set(m.group(1) for m in NAME_NEAR.finditer(text)))

    # Firm mentions (small known set; expand iteratively)
    FIRMS = [
        "Morgan Stanley", "Merrill Lynch", "Merrill", "UBS", "Wells Fargo",
        "Rockefeller", "J.P. Morgan", "JPMorgan", "Goldman Sachs", "Stifel",
        "Raymond James", "RayJay", "LPL", "Ameriprise", "Edward Jones",
        "Cetera", "RBC", "First Republic", "Janney", "Hightower",
        "Beacon Pointe", "Focus Financial", "Steward Partners",
        "Wealthcare", "Hennion & Walsh", "Stanford Financial",
        "Chelsea Financial", "Smith Barney", "Lehman", "PaineWebber",
    ]
    out["firms_mentioned"] = sorted({f for f in FIRMS if f in text})

    # Sanctions
    fine_re = re.compile(r"fined\s+\$?([\d,]+)", re.I)
    susp_re = re.compile(r"suspend(?:ed)?\s+(?:for\s+)?(\w+|\d+)\s+(month|months|year|years)", re.I)
    bar_re = re.compile(r"\bbar(?:red)?\b.*?(?:from|by)?\s*([A-Z][a-zA-Z ]+)?", re.I)
    out["fines"] = [m.group(0) for m in fine_re.finditer(text)]
    out["suspensions"] = [m.group(0) for m in susp_re.finditer(text)]

    # Rule violations
    rule_re = re.compile(r"(?:FINRA |Finra )?Rule\s+(\d{3,5})", re.I)
    out["rule_violations"] = sorted(set(m.group(0) for m in rule_re.finditer(text)))

    # T-12 / recruiting deal %
    deal_re = re.compile(
        r"(\d{2,4})\s*%\s*(?:of\s+)?(?:trailing[- ]?(?:twelve|12)|T[- ]?12)",
        re.I,
    )
    out["recruiting_deal_pcts"] = [m.group(0) for m in deal_re.finditer(text)]

    return out


def from_wpjson(path):
    d = json.loads(pathlib.Path(path).read_text())
    html = d.get("content", {}).get("rendered", "")
    text = BeautifulSoup(html, "lxml").get_text("\n", strip=True)
    rec = {
        "source": "wpjson",
        "id": d.get("id"),
        "slug": d.get("slug"),
        "url": d.get("link"),
        "title": (d.get("title") or {}).get("rendered"),
        "date": d.get("date"),
        "modified": d.get("modified"),
        "categories": d.get("categories"),
        "tags": d.get("tags"),
        "coauthors": d.get("coauthors"),
    }
    rec["extracted"] = extract(text)
    rec["body_text"] = text
    return rec


def from_html(path):
    html = pathlib.Path(path).read_text()
    soup = BeautifulSoup(html, "lxml")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    pub = (soup.find("meta", {"property": "article:published_time"}) or {}).get("content", "") if soup.find("meta", {"property": "article:published_time"}) else ""
    paras = [p.get_text(" ", strip=True) for p in soup.find_all("p") if len(p.get_text(strip=True)) > 30]
    text = "\n".join(paras)
    rec = {
        "source": "html",
        "path": str(path),
        "title": title,
        "date": pub,
    }
    rec["extracted"] = extract(text)
    rec["body_text"] = text
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wpjson-dir", default="research/wpjson")
    ap.add_argument("--html-dir", default="research/html")
    ap.add_argument("--out", default="research/extracted.jsonl")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with out.open("w", encoding="utf-8") as f:
        wp_dir = pathlib.Path(args.wpjson_dir)
        if wp_dir.exists():
            for p in list(wp_dir.rglob("post_*.json")) + list(wp_dir.rglob("*.wpjson.json")):
                rec = from_wpjson(p)
                f.write(json.dumps(rec, default=str) + "\n")
                n += 1
        html_dir = pathlib.Path(args.html_dir)
        if html_dir.exists():
            for p in html_dir.rglob("*.html"):
                rec = from_html(p)
                f.write(json.dumps(rec, default=str) + "\n")
                n += 1
    print(f"wrote {n} records to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()

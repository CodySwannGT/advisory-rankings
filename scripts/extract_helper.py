#!/usr/bin/env python3
"""Helper for the extract-advisorhub-articles skill.

Subcommands:
  find-pending        List articles with a saved wpjson record but no
                      extraction file yet. Output is one path per line:
                      <wpjson_path>\\t<expected_extraction_path>

  show <wpid>         Print one article's headline + body text so the
                      caller (Claude in a skill session) can read it.

  list-loaded         Print extraction files that have been moved to
                      .loaded/ (i.e., already in Harper).

This file does NO LLM work. The skill instructs Claude to do that step
inline.
"""
import argparse
import json
import pathlib
import sys
from bs4 import BeautifulSoup

REPO = pathlib.Path(__file__).resolve().parent.parent
WPJSON_DIR    = REPO / "research" / "wpjson"
SAMPLES_DIR   = REPO / "research" / "articles"   # the manually-saved samples
EXTRACT_DIR   = REPO / "research" / "extractions"
LOADED_DIR    = EXTRACT_DIR / ".loaded"


def all_wpjson_records():
    """Yield (wpId:int, path:Path) for every saved post record."""
    if WPJSON_DIR.exists():
        for sub in sorted(WPJSON_DIR.iterdir()):
            if not sub.is_dir():
                continue
            for p in sorted(sub.glob("post_*.json")):
                wp_id = p.stem.replace("post_", "")
                if wp_id.isdigit():
                    yield int(wp_id), p
    if SAMPLES_DIR.exists():
        for p in sorted(SAMPLES_DIR.glob("*.wpjson.json")):
            try:
                d = json.loads(p.read_text())
                if isinstance(d, dict) and "id" in d:
                    yield int(d["id"]), p
            except Exception:
                continue


def extraction_path_for(wp_id: int) -> pathlib.Path:
    return EXTRACT_DIR / f"{wp_id}.json"


def already_extracted(wp_id: int) -> bool:
    return (extraction_path_for(wp_id).exists() or
            (LOADED_DIR / f"{wp_id}.json").exists())


def cmd_find_pending(args):
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    pending = []
    for wp_id, src in all_wpjson_records():
        if already_extracted(wp_id):
            continue
        pending.append((wp_id, src, extraction_path_for(wp_id)))

    if args.format == "tsv":
        for wp_id, src, dst in pending:
            print(f"{wp_id}\t{src}\t{dst}")
    else:  # human
        if not pending:
            print("No pending articles. Run the crawler first if you "
                  "want fresh ones, or delete files in research/"
                  "extractions/.loaded/ to re-extract.")
        else:
            print(f"{len(pending)} article(s) pending extraction:\n")
            for wp_id, src, dst in pending:
                # Read headline for friendliness
                try:
                    d = json.loads(src.read_text())
                    headline = (d.get("title") or {}).get("rendered", "")[:80]
                except Exception:
                    headline = ""
                print(f"  wpId={wp_id}")
                print(f"    headline:  {headline}")
                print(f"    source:    {src.relative_to(REPO)}")
                print(f"    write to:  {dst.relative_to(REPO)}\n")


def cmd_show(args):
    wp_id = int(args.wpid)
    for found_id, path in all_wpjson_records():
        if found_id == wp_id:
            d = json.loads(path.read_text())
            html = (d.get("content") or {}).get("rendered", "")
            soup = BeautifulSoup(html or "", "lxml")
            for s in soup.select("script,style,figure,iframe,aside"):
                s.decompose()
            text = soup.get_text("\n", strip=True)
            print(f"WP_ID:     {wp_id}")
            print(f"URL:       {d.get('link','')}")
            print(f"PUBLISHED: {d.get('date','')}")
            print(f"TITLE:     {(d.get('title') or {}).get('rendered','')}")
            print(f"COAUTHORS: {d.get('coauthors') or []}")
            print(f"CATEGORIES (wp): {d.get('categories') or []}")
            print(f"TAGS (wp):       {d.get('tags') or []}")
            print()
            print("BODY:")
            print(text)
            return
    print(f"wp_id {wp_id} not found in {WPJSON_DIR} or {SAMPLES_DIR}",
          file=sys.stderr)
    sys.exit(1)


def cmd_list_loaded(args):
    LOADED_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(LOADED_DIR.glob("*.json"))
    print(f"{len(files)} extraction(s) loaded into Harper:")
    for f in files:
        print(f"  {f.relative_to(REPO)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("find-pending")
    p1.add_argument("--format", choices=["human", "tsv"], default="human")
    p1.set_defaults(func=cmd_find_pending)
    p2 = sub.add_parser("show")
    p2.add_argument("wpid")
    p2.set_defaults(func=cmd_show)
    p3 = sub.add_parser("list-loaded")
    p3.set_defaults(func=cmd_list_loaded)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

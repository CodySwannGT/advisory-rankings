#!/usr/bin/env python3
"""Walk AdvisorHub's WordPress REST API and save every post's full record.

Usage:
    python3 scripts/crawl_via_wpjson.py --out research/wpjson --max-pages 50

The wp-json endpoint returns one JSON record per post including:
    - id, slug, link, title, date, modified
    - content.rendered (full HTML body)
    - excerpt.rendered
    - categories[], tags[]  (integer IDs — also crawl /categories and /tags)
    - coauthors[]            (multi-author support — single-author site reduces to len 1)
    - acf                    (Advanced Custom Fields — varies per post type)
    - yoast_head_json        (SEO metadata)

Polite defaults: 1.5s between requests; resumes from the last saved page.

Run from a non-datacenter IP — Cloudflare blocks bulk requests from
flagged ASNs even though the underlying API is unauthenticated.
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.parse as up
import subprocess

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
BASE = "https://www.advisorhub.com/wp-json/wp/v2"

# wp-json post types worth crawling — observed in sitemap_index.xml
POST_TYPES = [
    "posts",            # the main news feed
    "recruiting_moves", # Recruiting Wire structured records
    "firm",             # firm profile pages
    "team_bio",         # AdvisorHub's own team bios (small)
    "deals_and_comps",  # compensation grid pages
    "fintech",
    "asset_manager",
    "hub",              # "resources" hub pages
]


def curl_get(url, accept="application/json"):
    r = subprocess.run(
        ["curl", "-sS", "-m", "30", "-A", UA,
         "-H", f"Accept: {accept}",
         "-H", "Accept-Language: en-US,en;q=0.5",
         "-w", "\n--HTTP=%{http_code}",
         url],
        capture_output=True, text=True,
    )
    body, _, status_line = r.stdout.rpartition("\n--HTTP=")
    return int(status_line.strip() or 0), body


def crawl_type(post_type, out_dir, max_pages=50, per_page=100, sleep=1.5):
    type_dir = out_dir / post_type
    type_dir.mkdir(parents=True, exist_ok=True)
    for page in range(1, max_pages + 1):
        manifest_path = type_dir / f"_page_{page:03d}.json"
        if manifest_path.exists() and manifest_path.stat().st_size > 200:
            print(f"  page {page} cached", file=sys.stderr)
            continue
        url = f"{BASE}/{post_type}?per_page={per_page}&page={page}&_embed=false"
        status, body = curl_get(url)
        if status == 400 or status == 404:
            print(f"  page {page} -> {status} (end of pagination)", file=sys.stderr)
            break
        if status != 200:
            print(f"  page {page} -> HTTP {status}, stopping", file=sys.stderr)
            break
        try:
            posts = json.loads(body)
        except Exception as e:
            print(f"  page {page} JSON error: {e}", file=sys.stderr)
            break
        if not isinstance(posts, list) or not posts:
            print(f"  page {page} empty, stopping", file=sys.stderr)
            break
        manifest_path.write_text(body, encoding="utf-8")
        for post in posts:
            pid = post.get("id")
            if pid:
                (type_dir / f"post_{pid}.json").write_text(
                    json.dumps(post, indent=2, default=str), encoding="utf-8"
                )
        print(f"  page {page}: {len(posts)} {post_type}", file=sys.stderr)
        time.sleep(sleep)


def crawl_taxonomy(name, out_dir, sleep=1.5):
    """Pull /categories and /tags so we can resolve integer IDs to labels."""
    out = out_dir / f"_{name}.json"
    if out.exists() and out.stat().st_size > 100:
        return
    all_items = []
    for page in range(1, 50):
        status, body = curl_get(f"{BASE}/{name}?per_page=100&page={page}")
        if status != 200:
            break
        items = json.loads(body)
        if not items:
            break
        all_items.extend(items)
        time.sleep(sleep)
    out.write_text(json.dumps(all_items, indent=2, default=str), encoding="utf-8")
    print(f"taxonomy {name}: {len(all_items)}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="research/wpjson")
    ap.add_argument("--max-pages", type=int, default=50)
    ap.add_argument("--per-page", type=int, default=100)
    ap.add_argument("--sleep", type=float, default=1.5)
    ap.add_argument("--types", nargs="+", default=POST_TYPES)
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    for tax in ("categories", "tags"):
        crawl_taxonomy(tax, out, sleep=args.sleep)

    for pt in args.types:
        print(f"\n=== {pt} ===", file=sys.stderr)
        crawl_type(pt, out, max_pages=args.max_pages,
                   per_page=args.per_page, sleep=args.sleep)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Walk AdvisorHub's WordPress REST API and save every post's full record.

Usage:
    python3 scripts/crawl_via_wpjson.py --out research/wpjson

The wp-json endpoint returns one JSON record per post including:
    - id, slug, link, title, date, modified
    - content.rendered (full HTML body)
    - excerpt.rendered
    - categories[], tags[]  (integer IDs — also crawl /categories and /tags)
    - coauthors[]            (multi-author support — single-author site reduces to len 1)
    - acf                    (Advanced Custom Fields — varies per post type)
    - yoast_head_json        (SEO metadata)

Politeness defaults — tuned to NOT trip Cloudflare bot scoring:
    --sleep 6           : 6s between requests (mean)
    --jitter 0.5        : ±50% random jitter so timing isn't robotic
    --per-page 50       : smaller pages → faster individual requests, more
                          natural pacing
    --max-consecutive-errors 3
                        : circuit-breaker — stop entirely after 3 403/5xx in a row
                          (one 403 means the WAF flagged us; continuing makes
                          it worse)
    --max-requests 0    : optional hard cap (0 = unlimited)

Resumes automatically: each /posts page is cached as `_page_NNN.json`. If a
run is interrupted (or you ran into a soft block), re-running picks up
where it left off without re-fetching anything.

Run from a non-datacenter IP. Cloudflare's WAF flags datacenter ASNs
regardless of pacing, so even 1 req/min from AWS can be blocked. From a
home / office IP, the defaults below are very polite (~10 req/min peak).
"""
import argparse
import json
import pathlib
import random
import subprocess
import sys
import time

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


class Throttle:
    """Soft circuit-breaker: stops the whole crawl after N consecutive
    error responses, on the theory that one block makes more blocks more
    likely."""
    def __init__(self, sleep, jitter, max_consecutive_errors, max_requests):
        self.sleep = sleep
        self.jitter = jitter
        self.max_consec_errors = max_consecutive_errors
        self.max_requests = max_requests
        self.consec_errors = 0
        self.requests_made = 0
        self.first_error_at = None

    def wait(self):
        """Sleep with jitter before the next request."""
        if self.requests_made == 0:
            return
        lo = self.sleep * (1 - self.jitter)
        hi = self.sleep * (1 + self.jitter)
        time.sleep(random.uniform(lo, hi))

    def record(self, status):
        self.requests_made += 1
        if status == 200:
            self.consec_errors = 0
        else:
            self.consec_errors += 1
            if self.first_error_at is None:
                self.first_error_at = self.requests_made

    def should_stop(self):
        if self.max_requests and self.requests_made >= self.max_requests:
            return "request budget exhausted"
        if self.consec_errors >= self.max_consec_errors:
            return (f"hit {self.consec_errors} consecutive errors — likely WAF "
                    f"flag; aborting to avoid a longer cooldown. Wait an hour "
                    f"before resuming. Resume is automatic (cached pages skip).")
        return None


def curl_get(url, accept="application/json"):
    r = subprocess.run(
        ["curl", "-sS", "-m", "30",
         "-A", UA,
         "-H", f"Accept: {accept}",
         "-H", "Accept-Language: en-US,en;q=0.5",
         "-H", "Cache-Control: no-cache",
         "-w", "\n--HTTP=%{http_code}",
         url],
        capture_output=True, text=True,
    )
    body, _, status_line = r.stdout.rpartition("\n--HTTP=")
    return int(status_line.strip() or 0), body


def crawl_type(post_type, out_dir, throttle, max_pages, per_page):
    type_dir = out_dir / post_type
    type_dir.mkdir(parents=True, exist_ok=True)
    for page in range(1, max_pages + 1):
        manifest_path = type_dir / f"_page_{page:03d}.json"
        if manifest_path.exists() and manifest_path.stat().st_size > 200:
            continue

        throttle.wait()
        if (reason := throttle.should_stop()):
            print(f"\n[stop] {reason}", file=sys.stderr)
            return False

        url = f"{BASE}/{post_type}?per_page={per_page}&page={page}&_embed=false"
        status, body = curl_get(url)
        throttle.record(status)
        print(f"  {post_type} page {page}: HTTP {status}", file=sys.stderr)

        if status == 400 or status == 404:
            # WordPress returns 400 once you exceed the last page
            return True
        if status != 200:
            if (reason := throttle.should_stop()):
                print(f"\n[stop] {reason}", file=sys.stderr)
                return False
            continue

        try:
            posts = json.loads(body)
        except Exception as e:
            print(f"    JSON error: {e}", file=sys.stderr)
            return True
        if not isinstance(posts, list) or not posts:
            return True

        manifest_path.write_text(body, encoding="utf-8")
        for post in posts:
            pid = post.get("id")
            if pid:
                (type_dir / f"post_{pid}.json").write_text(
                    json.dumps(post, indent=2, default=str), encoding="utf-8"
                )
        print(f"    saved {len(posts)} records", file=sys.stderr)
    return True


def crawl_taxonomy(name, out_dir, throttle):
    out = out_dir / f"_{name}.json"
    if out.exists() and out.stat().st_size > 100:
        return True
    all_items = []
    for page in range(1, 50):
        throttle.wait()
        if (reason := throttle.should_stop()):
            print(f"\n[stop] {reason}", file=sys.stderr)
            return False
        status, body = curl_get(f"{BASE}/{name}?per_page=100&page={page}")
        throttle.record(status)
        print(f"  {name} page {page}: HTTP {status}", file=sys.stderr)
        if status != 200:
            if (reason := throttle.should_stop()):
                print(f"\n[stop] {reason}", file=sys.stderr)
                return False
            break
        items = json.loads(body)
        if not items:
            break
        all_items.extend(items)
    if all_items:
        out.write_text(json.dumps(all_items, indent=2, default=str), encoding="utf-8")
        print(f"  taxonomy {name}: {len(all_items)} items", file=sys.stderr)
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="research/wpjson")
    ap.add_argument("--max-pages", type=int, default=200,
                    help="hard cap on pages per post type (default 200)")
    ap.add_argument("--per-page", type=int, default=50,
                    help="records per page; smaller = more polite (default 50)")
    ap.add_argument("--sleep", type=float, default=6.0,
                    help="mean seconds between requests (default 6.0)")
    ap.add_argument("--jitter", type=float, default=0.5,
                    help="±fraction jitter, e.g. 0.5 = ±50%% (default 0.5)")
    ap.add_argument("--max-consecutive-errors", type=int, default=3,
                    help="abort after N consecutive non-200 responses (default 3)")
    ap.add_argument("--max-requests", type=int, default=0,
                    help="hard cap on total requests (0 = unlimited)")
    ap.add_argument("--types", nargs="+", default=POST_TYPES,
                    help=f"post types to crawl (default: {' '.join(POST_TYPES)})")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    rate = 60 / args.sleep
    print(f"[config] mean {args.sleep}s between requests (~{rate:.1f} req/min "
          f"at peak), ±{int(args.jitter*100)}% jitter, abort after "
          f"{args.max_consecutive_errors} consecutive errors", file=sys.stderr)
    print(f"[config] saving to {out.resolve()}", file=sys.stderr)
    print(f"[config] resume-safe: cached pages will not be refetched\n", file=sys.stderr)

    throttle = Throttle(args.sleep, args.jitter,
                        args.max_consecutive_errors, args.max_requests)

    for tax in ("categories", "tags"):
        if not crawl_taxonomy(tax, out, throttle):
            return 1

    for pt in args.types:
        print(f"\n=== {pt} ===", file=sys.stderr)
        if not crawl_type(pt, out, throttle,
                          max_pages=args.max_pages, per_page=args.per_page):
            return 1

    print(f"\n[done] {throttle.requests_made} requests made", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Curl-backed HTML scraper for AdvisorHub.

Fallback for when the wp-json endpoint is unavailable. Curl is used because
the site fingerprints Python's TLS stack and returns 403 on `requests`/
`httpx`/`curl_cffi` calls; native `curl` is what actually works (when the
egress IP isn't on Cloudflare's bot-blocked list).

Usage:
    python3 scripts/crawl_html.py urls.txt --out research/html --sleep 5
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse as up

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def slug(url):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", url)[:200]


def fetch(url, out_dir, sleep=5.0):
    p = out_dir / f"{slug(url)}.html"
    if p.exists() and p.stat().st_size > 5000:
        return True
    print(f"GET {url}", file=sys.stderr)
    res = subprocess.run(
        ["curl", "-sS", "-m", "30", "-A", UA,
         "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
         "-H", "Accept-Language: en-US,en;q=0.5",
         "-o", str(p),
         "-w", "%{http_code}",
         url],
        capture_output=True, text=True,
    )
    code = res.stdout.strip()
    time.sleep(sleep)
    if code != "200":
        print(f"  HTTP {code}", file=sys.stderr)
        if p.exists():
            p.unlink()
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls_file")
    ap.add_argument("--out", default="research/html")
    ap.add_argument("--sleep", type=float, default=5.0)
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    urls = [u.strip() for u in pathlib.Path(args.urls_file).read_text().splitlines() if u.strip() and not u.startswith("#")]
    ok = 0
    for u in urls:
        if fetch(u, out, sleep=args.sleep):
            ok += 1
    print(f"\n{ok}/{len(urls)} ok", file=sys.stderr)


if __name__ == "__main__":
    main()

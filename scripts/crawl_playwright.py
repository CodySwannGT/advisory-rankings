#!/usr/bin/env python3
"""Playwright fallback for AdvisorHub HTML.

Use when neither the wp-json API nor curl works. A real Chromium browser
sessions the site (homepage warm-up + navigation) which mimics human use
and bypasses TLS-fingerprint blocks. **Won't help against IP-reputation
blocks** — Cloudflare also flags datacenter ASNs.

Setup:
    pip install playwright beautifulsoup4 lxml
    python3 -m playwright install chromium

Usage:
    python3 scripts/crawl_playwright.py urls.txt --out research/html --sleep 5
"""
import argparse
import json
import pathlib
import re
import sys
import time
from playwright.sync_api import sync_playwright


def slug(url):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", url)[:200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls_file")
    ap.add_argument("--out", default="research/html")
    ap.add_argument("--sleep", type=float, default=5.0)
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    urls = [u.strip() for u in pathlib.Path(args.urls_file).read_text().splitlines() if u.strip() and not u.startswith("#")]

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        ctx = browser.new_context(
            user_agent=("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            ignore_https_errors=True,  # set False outside of MITM-proxy environments
        )
        page = ctx.new_page()

        try:
            page.goto("https://www.advisorhub.com/", wait_until="domcontentloaded", timeout=45000)
            time.sleep(3)
        except Exception as e:
            print(f"warm error: {e}", file=sys.stderr)

        ok = 0
        for u in urls:
            p_path = out / f"{slug(u)}.html"
            if p_path.exists() and p_path.stat().st_size > 5000:
                ok += 1
                continue
            try:
                resp = page.goto(u, wait_until="domcontentloaded", timeout=45000)
                content = page.content()
                if resp and resp.status == 200 and "Sorry, you have been blocked" not in content:
                    p_path.write_text(content, encoding="utf-8")
                    ok += 1
                    print(f"OK {u}", file=sys.stderr)
                else:
                    print(f"BLOCKED {resp.status if resp else '?'} {u}", file=sys.stderr)
            except Exception as e:
                print(f"ERR {u}: {e}", file=sys.stderr)
            time.sleep(args.sleep)

        browser.close()
        print(f"\n{ok}/{len(urls)} ok", file=sys.stderr)


if __name__ == "__main__":
    main()

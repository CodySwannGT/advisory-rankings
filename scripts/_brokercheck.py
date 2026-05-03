"""Polite HTTP client for FINRA BrokerCheck's JSON API.

Hits `api.brokercheck.finra.org`, the undocumented endpoint that
backs the BrokerCheck consumer SPA. See `docs/brokercheck-spike.md`
for why this endpoint, the ToU constraints, and the depth-of-coverage
study.

Politeness is non-negotiable here:

  - Default 1.5 s gap between requests with ±0.5 s jitter
    (≈ 0.4–0.7 req/sec). Override with $BC_RATE_SECONDS for slower
    crawls; we never crank it faster than 1 req/sec on shared
    deployments.
  - Exponential backoff on 4xx/5xx: 5 s, 15 s, 45 s, then bail.
  - Single-process global lock file so two scripts can't race the
    rate-limit budget on the same host.
  - User-Agent advertises us so FINRA's ops team can reach the owner.

Public surface:
    BrokerCheckClient(rate_seconds=1.5, jitter=0.5, ua=None)
        .search_individual(query, state=None, page=0, rows=12)
        .get_individual(crd)
        .search_firm(query, page=0, rows=12)
        .get_firm(firm_id)
        .firm_roster(firm_id, page=0, rows=50)

Each method returns the parsed JSON body or raises BrokerCheckError.
The client is stateless apart from the rate-limit clock, so wrap it
in your own retry loop if you want richer behavior.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from typing import Optional

# Single-host endpoint. Don't refactor away — written out so it's
# greppable, and so the next person inheriting this knows exactly
# which FINRA service we're hitting.
HOST = "https://api.brokercheck.finra.org"

# Polite defaults. Tuned to ≈ 0.4–0.7 req/sec under normal jitter;
# at 5 retries with exponential backoff a single crashed CRD costs
# us ~65 s of forward progress, which is fine.
DEFAULT_RATE_SECONDS = 1.5
DEFAULT_JITTER_SECONDS = 0.5
DEFAULT_TIMEOUT = 20
BACKOFF_LADDER_SECONDS = (5, 15, 45)

# Hard backoff for rate-limit / forbidden responses. These are the
# signals FINRA uses when our access pattern starts to look bulky;
# treat them very conservatively. After this many consecutive 429/403
# responses across the whole client lifetime, raise BrokerCheckBlocked
# so the orchestrator can stop the crawl rather than keep poking.
RATE_LIMIT_BACKOFF_SECONDS = (60, 300, 900)  # 1 min → 5 min → 15 min
RATE_LIMIT_STOP_AFTER_CONSECUTIVE = 5

DEFAULT_UA = (
    "advisory-rankings-research/0.1 "
    "(+https://github.com/CodySwannGT/advisory-rankings; "
    "compliance/investor-protection use; contact via repo issues)"
)


class BrokerCheckError(RuntimeError):
    """Wraps any non-recoverable HTTP / parse failure."""


class BrokerCheckBlocked(BrokerCheckError):
    """Raised when FINRA returns sustained 429/403 responses,
    indicating we're being throttled or blocked. Catch this in the
    orchestrator and stop the crawl rather than continue and risk a
    harder block."""


# ── Module-level rate-limit clock (single process, single host) ────
# Keeps this honest even when multiple BrokerCheckClient instances
# share a process — they all queue behind the same monotonic clock.
_LAST_REQUEST_AT = 0.0


def _wait_for_quota(rate_seconds: float, jitter: float) -> None:
    """Sleep until the rate-limit budget allows the next request."""
    global _LAST_REQUEST_AT
    now = time.monotonic()
    target_gap = rate_seconds + random.uniform(-jitter, jitter)
    target_gap = max(target_gap, 0.5)  # floor — never faster than 2 req/sec
    elapsed = now - _LAST_REQUEST_AT
    if elapsed < target_gap:
        time.sleep(target_gap - elapsed)
    _LAST_REQUEST_AT = time.monotonic()


class BrokerCheckClient:
    def __init__(
        self,
        rate_seconds: Optional[float] = None,
        jitter: Optional[float] = None,
        timeout: int = DEFAULT_TIMEOUT,
        ua: Optional[str] = None,
        verbose: bool = True,
    ) -> None:
        env_rate = os.environ.get("BC_RATE_SECONDS")
        self.rate_seconds = (
            float(env_rate) if env_rate
            else (rate_seconds if rate_seconds is not None else DEFAULT_RATE_SECONDS)
        )
        self.jitter = (
            jitter if jitter is not None else DEFAULT_JITTER_SECONDS
        )
        self.timeout = timeout
        self.ua = ua or DEFAULT_UA
        self.verbose = verbose
        self.request_count = 0
        # Track consecutive rate-limit / forbidden responses so we
        # can stop the crawl rather than keep poking once FINRA has
        # started to push back.
        self.consecutive_rate_limits = 0

    # ── transport ──────────────────────────────────────────────────

    def _get(self, path: str, params: dict) -> dict:
        url = f"{HOST}{path}?{urllib.parse.urlencode(params)}"
        last_err: Optional[Exception] = None
        for attempt, backoff in enumerate((0,) + BACKOFF_LADDER_SECONDS):
            if backoff:
                if self.verbose:
                    print(
                        f"  [bc] backoff {backoff}s before retry {attempt}",
                        file=sys.stderr,
                    )
                time.sleep(backoff)
            _wait_for_quota(self.rate_seconds, self.jitter)
            self.request_count += 1
            req = urllib.request.Request(
                url, headers={"User-Agent": self.ua, "Accept": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    body = resp.read().decode("utf-8")
                    self.consecutive_rate_limits = 0
                    return json.loads(body)
            except urllib.error.HTTPError as e:
                # 404 from a known-bad CRD is a real answer, not a retry.
                if e.code == 404:
                    self.consecutive_rate_limits = 0
                    raise BrokerCheckError(f"404 for {url}")
                # 429 / 403 → throttling / forbidden. Apply a *much*
                # longer backoff than for transient 5xx, and stop the
                # client outright if it persists. Better to bail
                # voluntarily than wear out FINRA's patience.
                if e.code in (429, 403):
                    self.consecutive_rate_limits += 1
                    rl_attempt = min(
                        self.consecutive_rate_limits - 1,
                        len(RATE_LIMIT_BACKOFF_SECONDS) - 1,
                    )
                    long_backoff = RATE_LIMIT_BACKOFF_SECONDS[rl_attempt]
                    if self.verbose:
                        print(
                            f"  [bc] HTTP {e.code} (rate-limited) — "
                            f"long backoff {long_backoff}s "
                            f"({self.consecutive_rate_limits} consecutive)",
                            file=sys.stderr,
                        )
                    if self.consecutive_rate_limits >= RATE_LIMIT_STOP_AFTER_CONSECUTIVE:
                        raise BrokerCheckBlocked(
                            f"HTTP {e.code} {self.consecutive_rate_limits} times "
                            f"in a row — stopping to avoid a harder block"
                        )
                    time.sleep(long_backoff)
                    last_err = e
                    continue
                # other 5xx → normal exponential backoff
                last_err = e
                if self.verbose:
                    print(
                        f"  [bc] HTTP {e.code} for {url}",
                        file=sys.stderr,
                    )
                continue
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last_err = e
                if self.verbose:
                    print(f"  [bc] transport error: {e}", file=sys.stderr)
                continue
        raise BrokerCheckError(
            f"exhausted retries for {url}: {last_err!r}"
        )

    # ── individuals ────────────────────────────────────────────────

    def search_individual(
        self,
        query: str,
        state: Optional[str] = None,
        page: int = 0,
        rows: int = 12,
    ) -> dict:
        """Search by name (and optional 2-letter state). Returns the raw
        envelope; callers walk `hits.hits[*]._source`."""
        params = {
            "query": query,
            "hl": "true",
            "nrows": rows,
            "start": page * rows,
            "r": 25,
            "sort": "score+desc",
            "wt": "json",
        }
        if state:
            params["state"] = state
        return self._get("/search/individual", params)

    def get_individual(self, crd: str) -> dict:
        """Full report for one individual. The juicy payload is at
        `hits.hits[0]._source.content` and is a JSON-encoded string;
        decode it with `json.loads(...)` before reading."""
        return self._get(f"/search/individual/{crd}", {"wt": "json"})

    # ── firms ──────────────────────────────────────────────────────

    def search_firm(self, query: str, page: int = 0, rows: int = 12) -> dict:
        params = {
            "query": query,
            "hl": "true",
            "nrows": rows,
            "start": page * rows,
            "r": 25,
            "sort": "score+desc",
            "wt": "json",
        }
        return self._get("/search/firm", params)

    def get_firm(self, firm_id: str) -> dict:
        return self._get(f"/search/firm/{firm_id}", {"wt": "json"})

    def firm_roster(
        self, firm_id: str, page: int = 0, rows: int = 50
    ) -> dict:
        """Walk every individual currently registered with `firm_id`.
        BrokerCheck's roster query is a vanilla individual search
        scoped by `firm`, with an *empty* query string (a wildcard
        like `*` returns 0 hits). Use this to discover advisors we
        don't yet know about."""
        params = {
            "query": "",
            "firm": firm_id,
            "hl": "false",
            "nrows": rows,
            "start": page * rows,
            "r": 25,
            "wt": "json",
        }
        return self._get("/search/individual", params)


# ── Convenience: extract the inner content blob ────────────────────

def unwrap_individual(raw: dict) -> Optional[dict]:
    """Pull out the JSON-encoded `content` field from a `get_individual`
    response. Returns None if the response had no hits."""
    hits = raw.get("hits", {}).get("hits") or []
    if not hits:
        return None
    src = hits[0].get("_source", {})
    content = src.get("content")
    if not content:
        return None
    return json.loads(content)


def unwrap_firm(raw: dict) -> Optional[dict]:
    """Same as `unwrap_individual` for firm responses."""
    hits = raw.get("hits", {}).get("hits") or []
    if not hits:
        return None
    src = hits[0].get("_source", {})
    content = src.get("content")
    if not content:
        return None
    return json.loads(content)

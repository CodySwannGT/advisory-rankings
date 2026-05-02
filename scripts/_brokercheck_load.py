"""Idempotent loader: parsed BrokerCheck output → Harper rows.

Sits between `_brokercheck_parse.py` (no I/O) and the orchestrator
script `fetch_brokercheck.py` (which decides what to fetch). This
file is the "knows about Harper, doesn't know about HTTP" layer.

Idempotency contract — same as `scripts/load_extractions.py`:

  - Every entity ID is either matched against an existing row or
    minted via `uid(...)` from a stable natural key. Re-running the
    loader on the same payload produces the same UUIDs.
  - Every Harper write is a PUT-by-id (a Harper upsert) — never an
    INSERT. Re-runs converge.
  - Resolver caches lookups within a single load run.

Transport: this module always writes via REST PUT-by-id, since the
sandbox's outbound :9925 is firewalled (see fabric-runbook §5). For
reads it uses REST GET-by-attribute on indexed columns (no SQL —
the operations API is firewalled too).
"""
from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.parse
from typing import Any, Optional

# Re-use the existing deterministic-ID helpers so brokercheck-discovered
# entities collide with article-extracted ones at the row level.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _ids import (  # noqa: E402
    uid, slugify, firm_id as canonical_firm_id, advisor_id as canonical_advisor_id,
    employment_history_id, disclosure_id, sanction_id,
)


# ── Transport ──────────────────────────────────────────────────────

class HarperREST:
    """Tiny REST client for the auto-exported tables on `:443`.

    Reads:   GET /<Table>/                    → list
             GET /<Table>/?<col>=<val>        → filter on indexed col
             GET /<Table>/<id>                → by id
    Writes:  PUT /<Table>/<id>  body=<row>    → upsert
    """

    def __init__(self, base_url: Optional[str] = None,
                 user: Optional[str] = None, password: Optional[str] = None,
                 timeout: int = 30, verbose: bool = True):
        self.base = (base_url or os.environ.get("HDB_TARGET_URL", "")).rstrip("/")
        if not self.base:
            raise SystemExit("HDB_TARGET_URL required for Harper REST writes")
        u = user or os.environ.get("HDB_ADMIN_USERNAME") or os.environ.get("HARPER_ADMIN_USERNAME") or ""
        p = password or os.environ.get("HDB_ADMIN_PASSWORD") or os.environ.get("HARPER_ADMIN_PASSWORD") or ""
        u, p = u.strip("“”\""), p.strip("“”\"")
        if not (u and p):
            raise SystemExit("Harper admin credentials missing")
        self.auth = "Basic " + base64.b64encode(f"{u}:{p}".encode()).decode()
        self.timeout = timeout
        self.verbose = verbose
        self.write_count = 0
        self.read_count = 0

    def _curl(self, args: list[str]) -> tuple[int, str]:
        res = subprocess.run(
            [
                "curl", "-sk", "-m", str(self.timeout),
                "-H", "Accept: application/json",
                "-H", f"Authorization: {self.auth}",
                *args,
                "-w", "\n--HTTP=%{http_code}",
            ],
            capture_output=True, text=True,
        )
        body, _, status = res.stdout.rpartition("\n--HTTP=")
        return int(status.strip() or 0), body

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        self.read_count += 1
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params, safe=",")
        code, body = self._curl([url])
        if code != 200:
            if self.verbose:
                print(f"  ! GET {path} → {code}: {body[:200]}", file=sys.stderr)
            return None
        try:
            return json.loads(body) if body.strip() else None
        except json.JSONDecodeError:
            return None

    def put(self, table: str, record: dict) -> bool:
        rid = record.get("id")
        if not rid:
            raise SystemExit(f"PUT requires id; got {record!r}")
        self.write_count += 1
        url = f"{self.base}/{table}/{urllib.parse.quote(str(rid))}"
        code, body = self._curl(
            [
                "-H", "Content-Type: application/json",
                "-X", "PUT",
                "-d", json.dumps(_drop_underscored(record)),
                url,
            ]
        )
        if code not in (200, 201, 204):
            print(
                f"  ! PUT /{table}/{rid} → {code}: {body[:200]}",
                file=sys.stderr,
            )
            return False
        return True


def _drop_underscored(record: dict) -> dict:
    """Strip keys beginning with `_` — those are parser-internal hints
    (firm name to resolve, scope marker, etc.) that don't belong in the
    Harper row."""
    return {k: v for k, v in record.items() if not k.startswith("_") and v is not None}


# ── Resolver ───────────────────────────────────────────────────────
#
# Mirrors the resolver pattern in scripts/load_extractions.py: query
# Harper first, mint a deterministic ID as fallback. Caches lookups
# within a single load run.

class Resolver:
    def __init__(self, rest: HarperREST):
        self.rest = rest
        self.cache: dict[tuple, str] = {}
        self.firm_listing: Optional[list[dict]] = None
        self.advisor_listing: Optional[list[dict]] = None
        self.stats: dict[str, int] = {
            "advisor_matched_crd": 0, "advisor_matched_name": 0,
            "advisor_minted": 0,
            "firm_matched_crd": 0, "firm_matched_name": 0,
            "firm_minted": 0,
            "disclosure_matched": 0, "disclosure_minted": 0,
            "employment_matched": 0, "employment_minted": 0,
            "sanction_matched": 0, "sanction_minted": 0,
            "license_matched": 0, "license_minted": 0,
        }

    # ── firm ──────────────────────────────────────────────────────

    def firm(self, names: list[str], finra_crd: Optional[str] = None) -> str:
        """Resolve a Firm to a UUID. Tries:
          1. exact `finraCrd` match (highest confidence)
          2. exact `name` match against any of `names` (case-insensitive,
             with LLC normalization)
          3. mint by canonical_firm_id(<best_name>)

        Caches by (crd, names tuple)."""
        names = [n for n in names if n]
        cache_key = ("firm", finra_crd or "", tuple(names))
        if cache_key in self.cache:
            return self.cache[cache_key]

        # 1. CRD lookup
        if finra_crd:
            hit = self.rest.get(f"/Firm/", {"finraCrd": finra_crd})
            if isinstance(hit, list) and hit:
                self.stats["firm_matched_crd"] += 1
                fid = hit[0]["id"]
                self.cache[cache_key] = fid
                return fid

        # 2. Name lookup against the cached firm listing.
        if self.firm_listing is None:
            self.firm_listing = self.rest.get("/Firm/") or []
        for n in names:
            for f in self.firm_listing:
                if _firm_name_match(f.get("name") or "", n):
                    self.stats["firm_matched_name"] += 1
                    fid = f["id"]
                    self.cache[cache_key] = fid
                    return fid

        # 3. Mint by best canonical name
        best = names[0] if names else f"firm-crd-{finra_crd or 'unknown'}"
        fid = canonical_firm_id(best)
        self.stats["firm_minted"] += 1
        self.cache[cache_key] = fid
        return fid

    # ── advisor ──────────────────────────────────────────────────

    def advisor(self, finra_crd: str, legal_name: str,
                first_employer: str = "",
                first_name: str = "", last_name: str = "") -> str:
        """Resolve an Advisor. Matching ladder:
          1. exact `finraCrd` (highest confidence).
          2. exact `legalName`.
          3. (firstName, lastName) match — handles "Jamison Embury"
             ↔ "Jamison G Embury" middle-initial variations, which
             otherwise duplicate when an AdvisorHub extraction had no
             middle name and BrokerCheck has one.
          4. mint a deterministic id keyed on legalName + crd.
        """
        cache_key = ("advisor", finra_crd, legal_name)
        if cache_key in self.cache:
            return self.cache[cache_key]

        # CRD lookup — direct attribute filter (case doesn't apply)
        if finra_crd:
            hit = self.rest.get("/Advisor/", {"finraCrd": finra_crd})
            if isinstance(hit, list) and hit:
                self.stats["advisor_matched_crd"] += 1
                aid = hit[0]["id"]
                self.cache[cache_key] = aid
                return aid

        # Cached listing match — case-insensitive on legalName /
        # (firstName, lastName). Harper's REST `?col=val` filter is
        # case-sensitive, which is wrong for human names — `McGlynn`
        # ≠ `Mcglynn`. Pull the full Advisor list once and match in
        # Python so we never miss a case variant.
        if self.advisor_listing is None:
            self.advisor_listing = self.rest.get("/Advisor/") or []

        if legal_name:
            ln = legal_name.lower()
            for r in self.advisor_listing:
                if (r.get("legalName") or "").lower() == ln:
                    self.stats["advisor_matched_name"] += 1
                    aid = r["id"]
                    self.cache[cache_key] = aid
                    return aid

        # firstName + lastName fallback — handles middle-initial diffs
        # ("Jamison Embury" ↔ "Jamison G Embury") and case variants
        # ("McGlynn" ↔ "Mcglynn").
        if first_name and last_name:
            fn = first_name.lower()
            ln = last_name.lower()
            firstlast = [
                r for r in self.advisor_listing
                if (r.get("firstName") or "").lower() == fn
                and (r.get("lastName") or "").lower() == ln
            ]
            if len(firstlast) == 1:
                self.stats["advisor_matched_name"] += 1
                aid = firstlast[0]["id"]
                self.cache[cache_key] = aid
                return aid
            # last-name-only fallback — match if exactly one and the
            # first-name is a prefix of either form (handles "C." vs
            # "Cody"-style abbreviations).
            if not firstlast:
                last_only = [
                    r for r in self.advisor_listing
                    if (r.get("lastName") or "").lower() == ln
                ]
                if len(last_only) == 1:
                    cand_first = (last_only[0].get("firstName") or "").lower().rstrip(".")
                    if (cand_first.startswith(fn.rstrip(".")) or
                        fn.rstrip(".").startswith(cand_first)):
                        self.stats["advisor_matched_name"] += 1
                        aid = last_only[0]["id"]
                        self.cache[cache_key] = aid
                        return aid

        # mint deterministic — prefix `crd:` so two advisors with the
        # same name but different CRDs don't collide
        hint = first_employer or finra_crd or ""
        aid = canonical_advisor_id(legal_name, hint=f"crd-{finra_crd}" if finra_crd else hint)
        self.stats["advisor_minted"] += 1
        self.cache[cache_key] = aid
        return aid

    # ── disclosure ───────────────────────────────────────────────

    def disclosure(self, advisor_id_val: str, disclosure_type: str,
                   date_initiated: str, docket_number: Optional[str],
                   regulator: str = "") -> str:
        """Disclosures are keyed on (advisor, type, date, docket). The
        docket — when present — is the canonical regulator-of-record
        identifier and disambiguates same-day filings.
        """
        cache_key = ("disc", advisor_id_val, disclosure_type,
                     date_initiated or "", docket_number or "", regulator)
        if cache_key in self.cache:
            return self.cache[cache_key]
        # Existing match attempt: query Disclosure by advisorId
        # (REST listing is small enough today; if/when it grows,
        # narrow this to indexed conditions).
        existing = self.rest.get("/Disclosure/", {"advisorId": advisor_id_val})
        if isinstance(existing, list):
            for d in existing:
                if (
                    d.get("disclosureType") == disclosure_type
                    and _date_prefix(d.get("dateInitiated")) == _date_prefix(date_initiated)
                    and (
                        (docket_number and d.get("docketNumber") == docket_number)
                        or (not docket_number)
                    )
                ):
                    self.stats["disclosure_matched"] += 1
                    self.cache[cache_key] = d["id"]
                    return d["id"]

        did = disclosure_id(
            advisor_id_val, disclosure_type,
            _date_prefix(date_initiated) or "",
            docket_number or regulator,
        )
        self.stats["disclosure_minted"] += 1
        self.cache[cache_key] = did
        return did

    # ── employment ───────────────────────────────────────────────

    def employment(self, advisor_id_val: str, firm_id_val: str,
                   start_date: str) -> str:
        cache_key = ("eh", advisor_id_val, firm_id_val,
                     _date_prefix(start_date))
        if cache_key in self.cache:
            return self.cache[cache_key]
        eid = employment_history_id(
            advisor_id_val, firm_id_val, _date_prefix(start_date) or "",
        )
        self.cache[cache_key] = eid
        return eid

    # ── sanction ─────────────────────────────────────────────────

    def sanction(self, disc_id: str, sanction_type: str,
                 amount: Optional[float], duration: Optional[float]) -> str:
        cache_key = ("sanc", disc_id, sanction_type,
                     str(amount or ""), str(duration or ""))
        if cache_key in self.cache:
            return self.cache[cache_key]
        sid = sanction_id(disc_id, sanction_type,
                          str(amount or ""), str(duration or ""))
        self.cache[cache_key] = sid
        return sid

    # ── license ──────────────────────────────────────────────────

    def license(self, advisor_id_val: str, license_type: str,
                granted_date: str) -> str:
        cache_key = ("lic", advisor_id_val, license_type,
                     _date_prefix(granted_date))
        if cache_key in self.cache:
            return self.cache[cache_key]
        lid = uid(
            f"lic:{advisor_id_val}:{slugify(license_type)}:{_date_prefix(granted_date) or ''}"
        )
        self.cache[cache_key] = lid
        return lid


# ── Helpers ─────────────────────────────────────────────────────────

def _firm_name_match(a: str, b: str) -> bool:
    """Case-insensitive match with light normalization for common
    legal-suffix noise. Matches:
        "Wells Fargo Advisors" ↔ "WELLS FARGO ADVISORS"
        "Wells Fargo Clearing Services, LLC" ↔ "Wells Fargo Clearing Services LLC"
    """
    if not (a and b):
        return False
    return _normalize_firm_name(a) == _normalize_firm_name(b)


def _normalize_firm_name(s: str) -> str:
    s = s.lower().strip()
    s = s.replace(",", " ")
    s = s.replace(".", " ")
    for token in (" llc", " l.l.c", " inc", " inc.", " l.p.", " lp",
                  " corporation", " corp"):
        if s.endswith(token):
            s = s[: -len(token)]
    s = " ".join(s.split())
    return s


def _date_prefix(value: Any) -> str:
    if not value:
        return ""
    s = str(value)
    return s[:10] if len(s) >= 10 else s


def now_iso() -> str:
    return _dt.datetime.now(tz=_dt.timezone.utc).isoformat()


def hash_content(content: dict) -> str:
    blob = json.dumps(content, sort_keys=True, default=str).encode()
    return hashlib.sha256(blob).hexdigest()


# ── Loader entry points ────────────────────────────────────────────

def load_individual(parsed: dict, raw_content: dict, *,
                    rest: HarperREST, resolver: Resolver,
                    write: bool = True) -> dict:
    """Persist one parsed individual into Harper. Returns a summary
    dict with row counts per table."""
    a = parsed["advisor"]
    crd = a.get("finraCrd") or ""
    if not crd:
        raise ValueError("parsed individual missing finraCrd")

    summary = parsed.get("summary", {})
    snapshot_id = uid(f"bcsnap:individual:{crd}")
    source_ref = snapshot_id  # link rows to this snapshot

    # 1. resolve advisor
    first_emp_name = (parsed["employments"][-1]["_firmName"]
                      if parsed["employments"] else "")
    advisor_uuid = resolver.advisor(
        crd, a.get("legalName") or "",
        first_employer=first_emp_name,
        first_name=a.get("firstName") or "",
        last_name=a.get("lastName") or "",
    )

    # 2. resolve firms touched by employments
    employments_rows: list[dict] = []
    advisor_firm_ids: list[str] = []
    for emp in parsed["employments"]:
        names = [emp.get("_firmName")] if emp.get("_firmName") else []
        firm_uuid = resolver.firm(names, finra_crd=emp.get("_firmFinraId"))
        # always make sure that firm has finraCrd populated downstream
        advisor_firm_ids.append(firm_uuid)
        eh_id = resolver.employment(advisor_uuid, firm_uuid, emp.get("startDate", ""))
        employments_rows.append({
            "id": eh_id,
            "advisorId": advisor_uuid,
            "firmId": firm_uuid,
            "startDate": emp.get("startDate"),
            "endDate": emp.get("endDate"),
            "sourceType": "brokercheck",
            "sourceRef": source_ref,
        })

    # 3. firm rows themselves — merge-upsert that sets finraCrd.
    #    Harper PUT-by-id is a full-record replace; the table has
    #    `channel: String!` (NOT NULL) and a few other fields the existing
    #    AdvisorHub-extracted rows already populated. So we read the
    #    existing row first and merge our brokercheck-derived fields on
    #    top, never blanking anything out. For freshly-minted rows we
    #    mark channel="unknown" (or "pure_ria" if BrokerCheck flagged it
    #    iaOnly) so the NOT-NULL constraint is satisfied; a human can
    #    reclassify in Studio.
    firm_rows: list[dict] = []
    seen_fids: set[str] = set()
    listing_by_id = {f.get("id"): f for f in (resolver.firm_listing or [])}
    for emp, fid in zip(parsed["employments"], advisor_firm_ids):
        if fid in seen_fids:
            continue
        seen_fids.add(fid)
        existed = fid in listing_by_id
        cleaned_name = (
            (emp.get("_firmName") or "").title()
            .replace("Llc", "LLC").replace("Lp", "LP")
            .replace("L.l.c", "L.L.C")
        )
        update = {
            "id": fid,
            "name": cleaned_name or None,
            "finraCrd": emp.get("_firmFinraId") or None,
        }
        if existed:
            existing = listing_by_id[fid]
            # Merge — preserve every field the existing row already had,
            # let our update override only the keys we explicitly ship.
            firm_row = {**existing, **{k: v for k, v in update.items() if v is not None}}
            # Keep the existing name if it's already populated and our
            # cleaned_name is just a different surface form of the same firm.
            if existing.get("name"):
                firm_row["name"] = existing["name"]
        else:
            firm_row = {**update,
                        "channel": "pure_ria" if emp.get("_iaOnly") else "unknown",
                        "notes": (
                            f"Auto-discovered via FINRA BrokerCheck "
                            f"(firmId={emp.get('_firmFinraId')}, "
                            f"snapshot={source_ref})"
                        )}
        firm_rows.append(firm_row)

    # 4. disclosures + sanctions
    disclosure_rows: list[dict] = []
    sanction_rows: list[dict] = []
    for d in parsed["disclosures"]:
        dd = d["disclosure"]
        # employment_separation disclosures don't carry a regulator
        regulator = dd.get("regulator") or ""
        did = resolver.disclosure(
            advisor_uuid,
            dd.get("disclosureType") or "",
            dd.get("dateInitiated") or "",
            dd.get("docketNumber"),
            regulator=regulator,
        )
        row = {**dd, "id": did, "advisorId": advisor_uuid,
               "sourceType": "brokercheck", "sourceRef": source_ref}
        disclosure_rows.append(row)
        for s in d["sanctions"]:
            sid = resolver.sanction(
                did, s.get("sanctionType") or "",
                s.get("amount"), s.get("durationMonths"),
            )
            sanction_rows.append({**s, "id": sid, "disclosureId": did})

    # 5. licenses
    license_rows: list[dict] = []
    for L in parsed["licenses"]:
        lid = resolver.license(
            advisor_uuid, L.get("licenseType") or "", L.get("grantedDate") or "",
        )
        license_rows.append({
            "id": lid, "advisorId": advisor_uuid,
            "licenseType": L.get("licenseType"),
            "grantedDate": L.get("grantedDate"),
            "status": "active",
        })

    # 6. advisor row itself
    advisor_row = {**a, "id": advisor_uuid}

    # 7. snapshot
    snapshot_row = {
        "id": snapshot_id,
        "subjectKind": "individual",
        "subjectCrd": crd,
        "subjectAdvisorId": advisor_uuid,
        "fetchedAt": now_iso(),
        "bcScope": summary.get("bcScope") or "",
        "iaScope": summary.get("iaScope") or "",
        "disclosureCount": summary.get("disclosureCount") or 0,
        "employmentCount": summary.get("employmentCount") or 0,
        "examCount": summary.get("examCount") or 0,
        "registeredStateCount": summary.get("registeredStateCount") or 0,
        "rawHash": hash_content(raw_content),
        "rawJson": json.dumps(raw_content),
    }

    # 8. write — order so referenced rows land first.
    counts: dict[str, int] = {}
    if write:
        counts["Firm"] = sum(rest.put("Firm", r) for r in firm_rows)
        counts["Advisor"] = int(rest.put("Advisor", advisor_row))
        counts["EmploymentHistory"] = sum(
            rest.put("EmploymentHistory", r) for r in employments_rows
        )
        counts["Disclosure"] = sum(
            rest.put("Disclosure", r) for r in disclosure_rows
        )
        counts["Sanction"] = sum(rest.put("Sanction", r) for r in sanction_rows)
        counts["License"] = sum(rest.put("License", r) for r in license_rows)
        counts["BrokerCheckSnapshot"] = int(
            rest.put("BrokerCheckSnapshot", snapshot_row)
        )
    else:
        counts = {
            "Firm": len(firm_rows), "Advisor": 1,
            "EmploymentHistory": len(employments_rows),
            "Disclosure": len(disclosure_rows),
            "Sanction": len(sanction_rows),
            "License": len(license_rows),
            "BrokerCheckSnapshot": 1,
        }
    return counts


def load_firm(parsed: dict, raw_content: dict, *,
              rest: HarperREST, resolver: Resolver,
              write: bool = True) -> dict:
    f = parsed["firm"]
    crd = f.get("finraCrd") or ""
    if not crd:
        raise ValueError("parsed firm missing finraCrd")

    names = [
        f.get("_iaFirmName"),
        f.get("name"),
        f.get("legalName"),
    ]
    firm_uuid = resolver.firm(names, finra_crd=crd)

    firm_row = {**f, "id": firm_uuid}
    snapshot_id = uid(f"bcsnap:firm:{crd}")
    snapshot_row = {
        "id": snapshot_id,
        "subjectKind": "firm",
        "subjectCrd": crd,
        "subjectFirmId": firm_uuid,
        "fetchedAt": now_iso(),
        "bcScope": parsed["summary"].get("bcScope") or "",
        "iaScope": parsed["summary"].get("iaScope") or "",
        "disclosureCount": (
            parsed["summary"].get("regulatoryDisclosureCount", 0)
            + parsed["summary"].get("arbitrationCount", 0)
            + parsed["summary"].get("civilCount", 0)
        ),
        "employmentCount": 0,
        "examCount": 0,
        "registeredStateCount": parsed["summary"].get("stateRegistrationCount") or 0,
        "rawHash": hash_content(raw_content),
        "rawJson": json.dumps(raw_content),
    }

    # Mirror the merge logic from load_individual: preserve the existing
    # row when matched (so we don't blank out channel/etc.), set defaults
    # only on fresh mints.
    listing_by_id = {f.get("id"): f for f in (resolver.firm_listing or [])}
    if firm_uuid in listing_by_id:
        existing = listing_by_id[firm_uuid]
        firm_row = {**existing, **{k: v for k, v in firm_row.items() if v is not None}}
        if existing.get("name"):
            firm_row["name"] = existing["name"]
    else:
        firm_row.setdefault("channel", "unknown")
        firm_row.setdefault(
            "notes",
            f"Auto-discovered via FINRA BrokerCheck "
            f"(firmId={crd}, snapshot={snapshot_id})",
        )

    counts: dict[str, int] = {}
    if write:
        counts["Firm"] = int(rest.put("Firm", firm_row))
        counts["BrokerCheckSnapshot"] = int(
            rest.put("BrokerCheckSnapshot", snapshot_row)
        )
    else:
        counts = {"Firm": 1, "BrokerCheckSnapshot": 1}
    return counts

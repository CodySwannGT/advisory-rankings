"""Pure parsing for FINRA BrokerCheck JSON payloads → our Harper schema.

Splits the I/O-bound fetching (`_brokercheck.py`) from the CPU-bound
shape-conversion (this file) so the parsers are unit-testable against
recorded fixtures without ever hitting FINRA.

Two entry points:

    parse_individual(content: dict) -> dict
        content = unwrap_individual(raw)  # or json.loads(...content...)
        Returns:
          {
            "advisor":     {<Advisor record fields>},
            "employments": [{<EmploymentHistory record fields>}, ...],
            "disclosures": [
              {"disclosure": {<Disclosure>}, "sanctions": [<Sanction>, ...]},
              ...
            ],
            "licenses":    [{<License record fields>}, ...],
            "summary":     {bcScope, iaScope, disclosureCount, employmentCount,
                            examCount, registeredStateCount},
          }

    parse_firm(content: dict) -> dict
        Returns:
          {
            "firm":        {<Firm record fields>},
            "other_names": [str, ...],
            "successions": [{<FirmSuccession partial fields>}, ...],
            "owners":      [{name, position, crd}, ...],
            "summary":     {bcScope, iaScope, regulatoryDisclosureCount,
                            arbitrationCount, civilCount, branchCount,
                            stateRegistrationCount},
          }

Mapping decisions are documented in `docs/brokercheck-spike.md` §3.
This file is the executable contract of that document — if the
mapping changes here, update §3 there in the same change.
"""
from __future__ import annotations

import datetime as _dt
import re
from typing import Any, Optional


# ── helpers ─────────────────────────────────────────────────────────

_MONTHS_RE = re.compile(r"^(?P<n>\d+)\s*month", re.IGNORECASE)
_YEARS_RE = re.compile(r"^(?P<n>\d+)\s*year", re.IGNORECASE)
_DAYS_RE = re.compile(r"^(?P<n>\d+)\s*day", re.IGNORECASE)
_WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "eighteen": 18, "twenty-four": 24,
}


def _to_iso_date(s: Optional[str]) -> Optional[str]:
    """Accept FINRA's `M/D/YYYY` or `MM/DD/YYYY`, return `YYYY-MM-DD`."""
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    # already ISO
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    parts = s.split("/")
    if len(parts) == 3:
        try:
            mm, dd, yyyy = (int(p) for p in parts)
            return _dt.date(yyyy, mm, dd).isoformat()
        except ValueError:
            return None
    return None


def _parse_money(value: Any) -> Optional[float]:
    """`$2,500.00` → 2500.0. Accepts dollar-string, plain string, or number."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^\d.\-]", "", value)
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _parse_duration_months(text: Optional[str]) -> Optional[float]:
    """`Four months` → 4.0; `2 years` → 24.0; `90 days` → 3.0."""
    if not text:
        return None
    t = text.strip().lower()
    # word numbers first (FINRA writes "Four months")
    leading = t.split()[0] if t.split() else ""
    n = _WORD_NUMBERS.get(leading)
    if n is not None:
        if "year" in t:
            return float(n * 12)
        if "month" in t:
            return float(n)
        if "day" in t:
            return float(n / 30.0)
        return float(n)
    if (m := _MONTHS_RE.match(t)):
        return float(m.group("n"))
    if (m := _YEARS_RE.match(t)):
        return float(int(m.group("n")) * 12)
    if (m := _DAYS_RE.match(t)):
        return float(int(m.group("n")) / 30.0)
    return None


def _industry_start_from_days(days: Any, calc_date: Optional[str] = None) -> Optional[str]:
    """`daysInIndustry=8597` → industryStartDate ≈ today − 8597 days."""
    if days is None or days == "":
        return None
    try:
        n = int(days)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    base = _dt.date.today()
    if calc_date:
        iso = _to_iso_date(calc_date) or (
            calc_date[:10] if len(calc_date) >= 10 else None
        )
        if iso:
            try:
                base = _dt.date.fromisoformat(iso)
            except ValueError:
                pass
    return (base - _dt.timedelta(days=n)).isoformat()


# ── disclosure mapping ─────────────────────────────────────────────

_DISCLOSURE_TYPE_MAP = {
    "regulatory": "regulatory",
    "customer dispute": "customer_dispute",
    "civil": "civil",
    "criminal": "criminal",
    "judgment / lien": "judgment_lien",
    "judgment/lien": "judgment_lien",
    "financial": "financial",
    "employment separation after allegations": "employment_separation",
    "termination": "employment_separation",
    "investigation": "investigation",
    "bond": "bond",
    "bankruptcy": "financial",
}


def _normalize_disclosure_type(raw: str) -> str:
    if not raw:
        return ""
    return _DISCLOSURE_TYPE_MAP.get(raw.strip().lower(), raw.strip().lower().replace(" ", "_"))


_REGULATOR_MAP = {
    "FINRA": "FINRA",
    "SEC": "SEC",
}

_STATE_RE = re.compile(r"^[A-Z][A-Za-z\s]+$")  # rough — matches "Texas", "New York"


def _normalize_regulator(raw: str) -> tuple[str, Optional[str]]:
    """`Initiated By` → (`regulator`, `regulatorState`).
    `FINRA` → ("FINRA", None); `Texas` → ("state_securities", "TX"); etc.
    """
    if not raw:
        return ("", None)
    r = raw.strip()
    if r in _REGULATOR_MAP:
        return (_REGULATOR_MAP[r], None)
    # State name lookup
    state_abbr = _STATE_NAME_TO_ABBR.get(r.lower())
    if state_abbr:
        return ("state_securities", state_abbr)
    return (r, None)


_STATE_NAME_TO_ABBR = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT",
    "delaware": "DE", "district of columbia": "DC", "florida": "FL",
    "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY",
    "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "puerto rico": "PR", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virgin islands": "VI",
    "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


_STATUS_MAP = {
    "Final": "final",
    "Pending": "pending",
    "Settled": "settled",
    "Denied": "denied",
    "Withdrawn": "withdrawn",
    "Closed-No Action": "closed_no_action",
    "On Appeal": "on_appeal",
}


def _normalize_resolution(raw: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Returns (status, admit_deny). FINRA's `Resolution` carries both;
    e.g. `Acceptance, Waiver & Consent(AWC)` ⇒ status=final, admitDeny=neither."""
    if not raw:
        return (None, None)
    r = raw.strip()
    rl = r.lower()
    if "acceptance, waiver" in rl or "awc" in rl:
        return ("final", "neither")
    if rl == "settled":
        return ("settled", None)
    if rl == "pending":
        return ("pending", None)
    if rl == "denied":
        return ("denied", None)
    if rl == "withdrawn":
        return ("withdrawn", None)
    if rl == "order":
        return ("final", None)
    if rl == "consent":
        return ("final", "neither")
    return (rl.replace(" ", "_") or None, None)


_SANCTION_MAP = {
    "civil and administrative penalty(ies)/fine(s)": "fine",
    "civil and administrative penalty/fine": "fine",
    "fine": "fine",
    "monetary penalty other than fines": "fine",
    "suspension": "suspension",
    "bar": "bar",
    "barred": "bar",
    "censure": "censure",
    "denial": "denial",
    "undertaking": "undertaking",
    "restitution": "restitution",
    "disgorgement": "disgorgement",
    "revocation": "revocation",
    "cease and desist": "cease_and_desist",
}


def _normalize_sanction_type(raw: Optional[str]) -> str:
    if not raw:
        return ""
    return _SANCTION_MAP.get(raw.strip().lower(), raw.strip().lower().replace(" ", "_"))


def _docket_number(detail: dict) -> Optional[str]:
    for k in ("DocketNumberFDA", "DocketNumberAAO", "DocketNumber"):
        v = detail.get(k)
        if v:
            return str(v)
    return None


# ── individual ─────────────────────────────────────────────────────

def parse_individual(content: dict) -> dict:
    """Convert a BrokerCheck individual `content` blob into our schema's
    record shapes. Returns plain dicts only — no Harper IDs are minted
    here; the loader resolves natural keys to UUIDs."""
    if not content:
        return {
            "advisor": {}, "employments": [], "disclosures": [],
            "licenses": [], "summary": {},
        }

    bi = content.get("basicInformation", {})
    crd = str(bi.get("individualId") or "")
    advisor = {
        "finraCrd": crd,
        "firstName": (bi.get("firstName") or "").title() or None,
        "middleName": (bi.get("middleName") or "").title() or None,
        "lastName": (bi.get("lastName") or "").title() or None,
        "legalName": _legal_name_from_basic(bi),
        "industryStartDate": _industry_start_from_days(
            bi.get("daysInIndustry"),
            bi.get("daysInIndustryCalculatedDate"),
        ),
        "careerStatus": _career_status_from_scopes(
            bi.get("bcScope"), bi.get("iaScope"),
            content.get("disclosures") or [],
        ),
    }

    # employments — both BD (currentEmployments / previousEmployments) and
    # IA-only (currentIAEmployments / previousIAEmployments). BrokerCheck
    # publishes BD and IA registrations as separate rows; same-firm rows
    # whose date ranges overlap or sit within ~90 days describe the same
    # tenure and get folded by `_dedupe_employments` so the loader writes
    # one EmploymentHistory row per real job.
    employments = []
    for emp in (
        content.get("currentEmployments", [])
        + content.get("previousEmployments", [])
        + content.get("currentIAEmployments", [])
        + content.get("previousIAEmployments", [])
    ):
        employments.append(_parse_employment(emp))
    employments = _dedupe_employments(employments)

    # disclosures + sanctions
    disclosures = []
    for d in content.get("disclosures", []):
        disclosures.append(_parse_disclosure(d))

    # exams → License rows
    licenses = []
    for ex in content.get("stateExamCategory", []) or []:
        licenses.append(_parse_exam(ex, scope="state"))
    for ex in content.get("principalExamCategory", []) or []:
        licenses.append(_parse_exam(ex, scope="principal"))
    for ex in content.get("productExamCategory", []) or []:
        licenses.append(_parse_exam(ex, scope="product"))

    summary = {
        "bcScope": bi.get("bcScope") or "",
        "iaScope": bi.get("iaScope") or "",
        "disclosureCount": len(content.get("disclosures") or []),
        "employmentCount": (
            len(content.get("currentEmployments") or [])
            + len(content.get("previousEmployments") or [])
        ),
        "examCount": (content.get("examsCount") or {}).get("stateExamCount", 0)
        + (content.get("examsCount") or {}).get("principalExamCount", 0)
        + (content.get("examsCount") or {}).get("productExamCount", 0),
        "registeredStateCount": len(content.get("registeredStates") or []),
    }
    return {
        "advisor": advisor,
        "employments": employments,
        "disclosures": disclosures,
        "licenses": licenses,
        "summary": summary,
    }


def _legal_name_from_basic(bi: dict) -> str:
    parts = [bi.get("firstName"), bi.get("middleName"), bi.get("lastName")]
    return " ".join(p.title() for p in parts if p).strip()


def _career_status_from_scopes(
    bc_scope: Optional[str], ia_scope: Optional[str], disclosures: list
) -> str:
    """Heuristic. BrokerCheck doesn't expose a single status field.
    `ACTIVE` on either scope ⇒ active. Otherwise check disclosures
    for an unresolved bar / suspension. Otherwise withdrawn."""
    is_active = (bc_scope or "").upper() == "ACTIVE" or (ia_scope or "").upper() == "ACTIVE"
    if is_active:
        return "active"
    for d in disclosures or []:
        sd = (d or {}).get("disclosureDetail") or {}
        for s in sd.get("SanctionDetails") or []:
            kind = (s.get("Sanctions") or "").lower()
            if "bar" in kind:
                return "barred"
            if "suspension" in kind:
                # Open suspension if no end date or end date in future
                for inner in s.get("SanctionDetails") or []:
                    end = _to_iso_date(inner.get("End Date"))
                    if not end:
                        return "suspended"
                    if end > _dt.date.today().isoformat():
                        return "suspended"
    return "withdrawn"


def _parse_employment(emp: dict) -> dict:
    return {
        "_firmFinraId": str(emp.get("firmId") or ""),
        "_firmName": emp.get("firmName") or "",
        "_iaSecNumber": emp.get("iaSECNumber") or None,
        "_bdSecNumber": emp.get("bdSECNumber") or None,
        "_iaOnly": (emp.get("iaOnly") or "N").upper() == "Y",
        "startDate": _to_iso_date(emp.get("registrationBeginDate")),
        "endDate": _to_iso_date(emp.get("registrationEndDate")),
        "_city": emp.get("city") or None,
        "_state": emp.get("state") or None,
    }


# Maximum gap (in days) between two same-firm registrations that we still
# treat as one continuous tenure. BrokerCheck splits BD vs IA registrations
# into separate rows even when they describe the same job — they typically
# differ by a few days (administrative U4 amendments). 90 days is enough to
# absorb that without folding a true boomerang ("left for years and came
# back" ⇒ usually a multi-year gap).
_EMPLOYMENT_MERGE_GAP_DAYS = 90


def _dedupe_employments(rows: list[dict]) -> list[dict]:
    """Collapse same-firm registrations that describe the same continuous
    tenure. BrokerCheck publishes BD and IA registrations as separate
    rows under `currentEmployments` / `currentIAEmployments` (and the
    previous variants); without this pass an advisor with both scopes
    at one firm would write two EmploymentHistory rows whose natural
    key (`advisor, firm, startDate`) differs by the few-day gap between
    the two registration dates.

    Rule: rows are grouped by `_firmFinraId` (falling back to
    `_firmName` when no firmId). Within a group, sort by startDate and
    merge any consecutive pair whose later startDate is within
    `_EMPLOYMENT_MERGE_GAP_DAYS` of the earlier endDate (or the earlier
    row is still current — endDate is null/empty). The merged row keeps
    the earliest startDate, the latest endDate (null wins — "still
    current"), and the union of the underscore-prefixed scope hints so
    the loader can still tell whether the tenure had IA + BD scope.
    """
    if not rows:
        return rows

    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for r in rows:
        key = r.get("_firmFinraId") or r.get("_firmName") or ""
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)

    out: list[dict] = []
    for key in order:
        bucket = sorted(groups[key], key=lambda r: r.get("startDate") or "")
        merged: list[dict] = []
        for r in bucket:
            if not merged:
                merged.append(dict(r))
                continue
            cur = merged[-1]
            cur_end = cur.get("endDate") or ""
            r_start = r.get("startDate") or ""
            if _within_merge_gap(cur_end, r_start):
                cur["startDate"] = min(
                    s for s in [cur.get("startDate"), r.get("startDate")] if s
                ) if (cur.get("startDate") and r.get("startDate")) else (
                    cur.get("startDate") or r.get("startDate")
                )
                # endDate: empty/null wins (still current)
                if not cur.get("endDate") or not r.get("endDate"):
                    cur["endDate"] = None
                else:
                    cur["endDate"] = max(cur["endDate"], r["endDate"])
                # Union scope hints so we don't lose IA-or-BD provenance
                cur["_iaOnly"] = cur.get("_iaOnly") and r.get("_iaOnly")
                for k in ("_iaSecNumber", "_bdSecNumber", "_city", "_state"):
                    if not cur.get(k) and r.get(k):
                        cur[k] = r.get(k)
            else:
                merged.append(dict(r))
        out.extend(merged)
    return out


def _within_merge_gap(prev_end: str, next_start: str) -> bool:
    """True if two registrations should fold into one tenure. Either
    (a) the previous registration is still current (no end date), or
    (b) the next start is within `_EMPLOYMENT_MERGE_GAP_DAYS` of the
        previous end — including the case where they overlap."""
    if not prev_end:
        return True
    if not next_start:
        return False
    try:
        from datetime import date as _date
        a = _date.fromisoformat(prev_end)
        b = _date.fromisoformat(next_start)
    except ValueError:
        return False
    return (b - a).days <= _EMPLOYMENT_MERGE_GAP_DAYS


def _parse_disclosure(d: dict) -> dict:
    detail = d.get("disclosureDetail") or {}
    regulator, regulator_state = _normalize_regulator(detail.get("Initiated By") or "")
    status, admit_deny = _normalize_resolution(detail.get("Resolution"))

    sanctions = []
    for sgrp in detail.get("SanctionDetails") or []:
        stype_raw = sgrp.get("Sanctions") or ""
        stype = _normalize_sanction_type(stype_raw)
        # Some sanction groups carry inner sub-records (Suspension w/
        # start/end), some carry an Amount directly, some both.
        inners = sgrp.get("SanctionDetails") or [{}]
        for inner in inners:
            sanctions.append(
                {
                    "sanctionType": stype,
                    "amount": _parse_money(inner.get("Amount")),
                    "durationMonths": _parse_duration_months(inner.get("Duration")),
                    "effectiveDate": _to_iso_date(inner.get("Start Date")),
                    "endDate": _to_iso_date(inner.get("End Date")),
                    "jurisdiction": inner.get("Registration Capacities Affected"),
                }
            )

    disclosure = {
        "disclosureType": _normalize_disclosure_type(d.get("disclosureType") or ""),
        "regulator": regulator,
        "regulatorState": regulator_state,
        "allegationText": (detail.get("Allegations") or "")[:8000] or None,
        "dateInitiated": _to_iso_date(d.get("eventDate")),
        "status": status,
        "admitDeny": admit_deny,
        "damagesRequested": _parse_money(detail.get("Damage Amount Requested")),
        "settlementAmount": _parse_money(detail.get("Settlement Amount")),
        "awardAmount": _parse_money(detail.get("Award Amount")),
        "docketNumber": _docket_number(detail),
    }
    # Employment-separation disclosures carry a Termination Type
    if termination := detail.get("Termination Type"):
        disclosure["_terminationType"] = termination.lower().replace(" ", "_")
        disclosure["_firmName"] = detail.get("Firm Name")

    return {"disclosure": disclosure, "sanctions": sanctions}


def _parse_exam(ex: dict, scope: str) -> dict:
    code = ex.get("examCategory") or ""
    return {
        "licenseType": code.replace(" ", "_") if code else "",
        "_examName": ex.get("examName"),
        "grantedDate": _to_iso_date(ex.get("examTakenDate")),
        "_scope": scope,
    }


# ── firm ───────────────────────────────────────────────────────────

def parse_firm(content: dict) -> dict:
    if not content:
        return {
            "firm": {}, "other_names": [], "successions": [],
            "owners": [], "summary": {},
        }
    bi = content.get("basicInformation", {})
    firm_finra_id = str(bi.get("firmId") or "")
    firm_record = {
        "finraCrd": firm_finra_id,
        "name": (bi.get("firmName") or "").title().replace("Llc", "LLC")
        if bi.get("firmName") else None,
        "legalName": bi.get("firmName") or None,
        "_iaFirmName": bi.get("iaFirmName") or None,
        "_bdSecNumber": bi.get("bdSECNumber") or None,
        "_iaSecNumber": bi.get("iaSECNumber") or None,
        "secFilerId": bi.get("bdSECNumber") or bi.get("iaSECNumber") or None,
        "_firmType": bi.get("firmType") or None,
        "_firmStatus": bi.get("firmStatus") or None,
        "_finraLastApprovalDate": _to_iso_date(bi.get("finraLastApprovalDate")),
    }

    # HQ from firmAddressDetails
    addr = (content.get("firmAddressDetails") or {}).get("officeAddress") or {}
    firm_record["hqCity"] = (addr.get("city") or "").title() or None
    firm_record["hqState"] = addr.get("state") or None
    firm_record["hqCountry"] = addr.get("country") or None

    other_names = list(bi.get("otherNames") or [])
    successions = []
    for prior in other_names:
        if prior and prior.upper() != (bi.get("firmName") or "").upper():
            successions.append(
                {
                    "_priorName": prior,
                    "_currentName": bi.get("firmName"),
                    "type": "name_change",
                }
            )

    owners = []
    for o in content.get("directOwners") or []:
        owners.append(
            {
                "name": o.get("legalName"),
                "position": o.get("position"),
                "crd": o.get("crdNumber") or None,
                "scope": o.get("bcScope") or None,
            }
        )

    disc_counts = {
        d.get("disclosureType"): d.get("disclosureCount")
        for d in content.get("disclosures") or []
    }
    regs = content.get("registrations") or {}

    summary = {
        "bcScope": bi.get("bcScope") or "",
        "iaScope": bi.get("iaScope") or "",
        "regulatoryDisclosureCount": disc_counts.get("Regulatory Event") or 0,
        "arbitrationCount": disc_counts.get("Arbitration") or 0,
        "civilCount": disc_counts.get("Civil Event") or 0,
        "branchCount": bi.get("firm_branches_count")
        or content.get("firm_branches_count")
        or 0,
        "stateRegistrationCount": regs.get("approvedStateRegistrationCount") or 0,
    }

    return {
        "firm": firm_record,
        "other_names": other_names,
        "successions": successions,
        "owners": owners,
        "summary": summary,
    }

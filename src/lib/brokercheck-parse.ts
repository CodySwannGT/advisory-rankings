// @ts-nocheck
const WORD_NUMBERS = new Map(Object.entries({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, "twenty-four": 24,
}));

const STATE_NAME_TO_ABBR = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "puerto rico": "PR", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", "virgin islands": "VI", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts.map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (d.getUTCFullYear() === yyyy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

export function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseDurationMonths(text?: string | null): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const leading = t.split(/\s+/)[0];
  const wordNumber = WORD_NUMBERS.get(leading);
  if (wordNumber != null) {
    if (t.includes("year")) return wordNumber * 12;
    if (t.includes("month")) return wordNumber;
    if (t.includes("day")) return wordNumber / 30;
    return wordNumber;
  }
  let m = t.match(/^(\d+)\s*month/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+)\s*year/);
  if (m) return Number(m[1]) * 12;
  m = t.match(/^(\d+)\s*day/);
  if (m) return Number(m[1]) / 30;
  return null;
}

function title(value?: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function industryStartFromDays(days: unknown, calcDate?: string): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  let base = new Date();
  const iso = toIsoDate(calcDate) ?? calcDate?.slice(0, 10);
  if (iso && !Number.isNaN(Date.parse(iso))) base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - n);
  return base.toISOString().slice(0, 10);
}

const DISCLOSURE_TYPE_MAP = {
  regulatory: "regulatory",
  "customer dispute": "customer_dispute",
  civil: "civil",
  criminal: "criminal",
  "judgment / lien": "judgment_lien",
  "judgment/lien": "judgment_lien",
  financial: "financial",
  "employment separation after allegations": "employment_separation",
  termination: "employment_separation",
  investigation: "investigation",
  bond: "bond",
  bankruptcy: "financial",
};

function normalizeDisclosureType(raw = ""): string {
  return DISCLOSURE_TYPE_MAP[raw.trim().toLowerCase()] ?? raw.trim().toLowerCase().replaceAll(" ", "_");
}

export function normalizeRegulator(raw = ""): [string, string | null] {
  const r = raw.trim();
  if (!r) return ["", null];
  if (r === "FINRA" || r === "SEC") return [r, null];
  const abbr = STATE_NAME_TO_ABBR[r.toLowerCase()];
  if (abbr) return ["state_securities", abbr];
  return [r, null];
}

export function normalizeResolution(raw?: string | null): [string | null, string | null] {
  if (!raw) return [null, null];
  const r = raw.trim();
  const rl = r.toLowerCase();
  if (rl.includes("acceptance, waiver") || rl.includes("awc")) return ["final", "neither"];
  if (["settled", "pending", "denied", "withdrawn"].includes(rl)) return [rl, null];
  if (rl === "order") return ["final", null];
  if (rl === "consent") return ["final", "neither"];
  return [rl.replaceAll(" ", "_") || null, null];
}

const SANCTION_MAP = {
  "civil and administrative penalty(ies)/fine(s)": "fine",
  "civil and administrative penalty/fine": "fine",
  fine: "fine",
  "monetary penalty other than fines": "fine",
  suspension: "suspension",
  bar: "bar",
  barred: "bar",
  censure: "censure",
  denial: "denial",
  undertaking: "undertaking",
  restitution: "restitution",
  disgorgement: "disgorgement",
  revocation: "revocation",
  "cease and desist": "cease_and_desist",
};

export function normalizeSanctionType(raw = ""): string {
  return SANCTION_MAP[raw.trim().toLowerCase()] ?? raw.trim().toLowerCase().replaceAll(" ", "_");
}

function legalNameFromBasic(bi: any): string {
  return [bi.firstName, bi.middleName, bi.lastName].filter(Boolean).map(title).join(" ").trim();
}

function careerStatusFromScopes(bcScope?: string, iaScope?: string, disclosures: any[] = []): string {
  if ((bcScope ?? "").toUpperCase() === "ACTIVE" || (iaScope ?? "").toUpperCase() === "ACTIVE") return "active";
  for (const d of disclosures) {
    for (const s of d?.disclosureDetail?.SanctionDetails ?? []) {
      const kind = String(s.Sanctions ?? "").toLowerCase();
      if (kind.includes("bar")) return "barred";
      if (kind.includes("suspension")) {
        for (const inner of s.SanctionDetails ?? []) {
          const end = toIsoDate(inner["End Date"]);
          if (!end || end > new Date().toISOString().slice(0, 10)) return "suspended";
        }
      }
    }
  }
  return "withdrawn";
}

function parseEmployment(emp: any): any {
  return {
    _firmFinraId: String(emp.firmId ?? ""),
    _firmName: emp.firmName ?? "",
    _iaSecNumber: emp.iaSECNumber ?? null,
    _bdSecNumber: emp.bdSECNumber ?? null,
    _iaOnly: String(emp.iaOnly ?? "N").toUpperCase() === "Y",
    startDate: toIsoDate(emp.registrationBeginDate),
    endDate: toIsoDate(emp.registrationEndDate),
    _city: emp.city ?? null,
    _state: emp.state ?? null,
  };
}

const EMPLOYMENT_MERGE_GAP_DAYS = 90;

export function dedupeEmployments(rows: any[]): any[] {
  const groups = new Map<string, any[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = r._firmFinraId || r._firmName || "";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  const out: any[] = [];
  for (const key of order) {
    const bucket = groups.get(key)!.sort((a, b) => String(a.startDate ?? "").localeCompare(String(b.startDate ?? "")));
    const merged: any[] = [];
    for (const r of bucket) {
      if (!merged.length) {
        merged.push({ ...r });
        continue;
      }
      const cur = merged[merged.length - 1];
      if (withinMergeGap(cur.endDate || "", r.startDate || "")) {
        cur.startDate = cur.startDate && r.startDate ? [cur.startDate, r.startDate].sort()[0] : (cur.startDate ?? r.startDate);
        cur.endDate = !cur.endDate || !r.endDate ? null : [cur.endDate, r.endDate].sort()[1];
        cur._iaOnly = cur._iaOnly && r._iaOnly;
        for (const k of ["_iaSecNumber", "_bdSecNumber", "_city", "_state"]) if (!cur[k] && r[k]) cur[k] = r[k];
      } else {
        merged.push({ ...r });
      }
    }
    out.push(...merged);
  }
  return out;
}

function withinMergeGap(prevEnd: string, nextStart: string): boolean {
  if (!prevEnd) return true;
  if (!nextStart) return false;
  const a = Date.parse(`${prevEnd}T00:00:00Z`);
  const b = Date.parse(`${nextStart}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return (b - a) / 86_400_000 <= EMPLOYMENT_MERGE_GAP_DAYS;
}

function docketNumber(detail: any): string | null {
  return detail.DocketNumberFDA ?? detail.DocketNumberAAO ?? detail.DocketNumber ?? null;
}

function parseDisclosure(d: any): any {
  const detail = d.disclosureDetail ?? {};
  const [regulator, regulatorState] = normalizeRegulator(detail["Initiated By"] ?? "");
  const [status, admitDeny] = normalizeResolution(detail.Resolution);
  const sanctions: any[] = [];
  for (const group of detail.SanctionDetails ?? []) {
    const sanctionType = normalizeSanctionType(group.Sanctions ?? "");
    const inners = group.SanctionDetails ?? [{}];
    for (const inner of inners) {
      sanctions.push({
        sanctionType,
        amount: parseMoney(inner.Amount),
        durationMonths: parseDurationMonths(inner.Duration),
        effectiveDate: toIsoDate(inner["Start Date"]),
        endDate: toIsoDate(inner["End Date"]),
        jurisdiction: inner["Registration Capacities Affected"],
      });
    }
  }
  const disclosure: any = {
    disclosureType: normalizeDisclosureType(d.disclosureType ?? ""),
    regulator,
    regulatorState,
    allegationText: (detail.Allegations ?? "").slice(0, 8000) || null,
    dateInitiated: toIsoDate(d.eventDate),
    status,
    admitDeny,
    damagesRequested: parseMoney(detail["Damage Amount Requested"]),
    settlementAmount: parseMoney(detail["Settlement Amount"]),
    awardAmount: parseMoney(detail["Award Amount"]),
    docketNumber: docketNumber(detail),
  };
  if (detail["Termination Type"]) {
    disclosure._terminationType = String(detail["Termination Type"]).toLowerCase().replaceAll(" ", "_");
    disclosure._firmName = detail["Firm Name"];
  }
  return { disclosure, sanctions };
}

function parseExam(ex: any, scope: string): any {
  const code = ex.examCategory ?? "";
  return {
    licenseType: code ? code.replaceAll(" ", "_") : "",
    _examName: ex.examName,
    grantedDate: toIsoDate(ex.examTakenDate),
    _scope: scope,
  };
}

export function parseIndividual(content: any): any {
  if (!content) return { advisor: {}, employments: [], disclosures: [], licenses: [], summary: {} };
  const bi = content.basicInformation ?? {};
  const crd = String(bi.individualId ?? "");
  const advisor = {
    finraCrd: crd,
    firstName: title(bi.firstName),
    middleName: title(bi.middleName),
    lastName: title(bi.lastName),
    legalName: legalNameFromBasic(bi),
    industryStartDate: industryStartFromDays(bi.daysInIndustry, bi.daysInIndustryCalculatedDate),
    careerStatus: careerStatusFromScopes(bi.bcScope, bi.iaScope, content.disclosures ?? []),
  };
  const employmentSources = [
    ...(content.currentEmployments ?? []),
    ...(content.previousEmployments ?? []),
    ...(content.currentIAEmployments ?? []),
    ...(content.previousIAEmployments ?? []),
  ];
  const employments = dedupeEmployments(employmentSources.map(parseEmployment));
  const disclosures = (content.disclosures ?? []).map(parseDisclosure);
  const licenses = [
    ...(content.stateExamCategory ?? []).map((x: any) => parseExam(x, "state")),
    ...(content.principalExamCategory ?? []).map((x: any) => parseExam(x, "principal")),
    ...(content.productExamCategory ?? []).map((x: any) => parseExam(x, "product")),
  ];
  const exams = content.examsCount ?? {};
  return {
    advisor,
    employments,
    disclosures,
    licenses,
    summary: {
      bcScope: bi.bcScope ?? "",
      iaScope: bi.iaScope ?? "",
      disclosureCount: (content.disclosures ?? []).length,
      employmentCount: (content.currentEmployments ?? []).length + (content.previousEmployments ?? []).length,
      examCount: (exams.stateExamCount ?? 0) + (exams.principalExamCount ?? 0) + (exams.productExamCount ?? 0),
      registeredStateCount: (content.registeredStates ?? []).length,
    },
  };
}

export function parseFirm(content: any): any {
  if (!content) return { firm: {}, other_names: [], successions: [], owners: [], summary: {} };
  const bi = content.basicInformation ?? {};
  const firmFinraId = String(bi.firmId ?? "");
  const addr = content.firmAddressDetails?.officeAddress ?? {};
  const firm = {
    finraCrd: firmFinraId,
    name: bi.firmName ? title(bi.firmName)?.replaceAll("Llc", "LLC") : null,
    legalName: bi.firmName ?? null,
    _iaFirmName: bi.iaFirmName ?? null,
    _bdSecNumber: bi.bdSECNumber ?? null,
    _iaSecNumber: bi.iaSECNumber ?? null,
    secFilerId: bi.bdSECNumber ?? bi.iaSECNumber ?? null,
    _firmType: bi.firmType ?? null,
    _firmStatus: bi.firmStatus ?? null,
    _finraLastApprovalDate: toIsoDate(bi.finraLastApprovalDate),
    hqCity: title(addr.city),
    hqState: addr.state ?? null,
    hqCountry: addr.country ?? null,
  };
  const otherNames = [...(bi.otherNames ?? [])];
  const successions = otherNames
    .filter(n => n && n.toUpperCase() !== String(bi.firmName ?? "").toUpperCase())
    .map(n => ({ _priorName: n, _currentName: bi.firmName, type: "name_change" }));
  const owners = (content.directOwners ?? []).map(o => ({
    name: o.legalName,
    position: o.position,
    crd: o.crdNumber ?? null,
    scope: o.bcScope ?? null,
  }));
  const discCounts = Object.fromEntries((content.disclosures ?? []).map(d => [d.disclosureType, d.disclosureCount]));
  const regs = content.registrations ?? {};
  return {
    firm,
    other_names: otherNames,
    successions,
    owners,
    summary: {
      bcScope: bi.bcScope ?? "",
      iaScope: bi.iaScope ?? "",
      regulatoryDisclosureCount: discCounts["Regulatory Event"] ?? 0,
      arbitrationCount: discCounts.Arbitration ?? 0,
      civilCount: discCounts["Civil Event"] ?? 0,
      branchCount: bi.firm_branches_count ?? content.firm_branches_count ?? 0,
      stateRegistrationCount: regs.approvedStateRegistrationCount ?? 0,
    },
  };
}

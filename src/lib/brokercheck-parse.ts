// @ts-nocheck
import {
  DISCLOSURE_TYPE_MAP,
  SANCTION_MAP,
  STATE_NAME_TO_ABBR,
  WORD_NUMBERS,
} from "./brokercheck-parse-constants.js";
import {
  dedupeEmployments,
  parseEmployment,
} from "./brokercheck-employment.js";
import { title, toIsoDate } from "./brokercheck-parse-shared.js";

export { dedupeEmployments } from "./brokercheck-employment.js";
export { toIsoDate } from "./brokercheck-parse-shared.js";

/**
 * BrokerCheck payload objects are sparse and vary by endpoint.
 */
export type BrokerRecord = Readonly<Record<string, unknown>>;

/**
 * Parsed advisor fields that callers inspect after individual parsing.
 */
interface ParsedAdvisor extends BrokerRecord {
  readonly legalName?: string;
}

/**
 * Parsed individual payload consumed by the BrokerCheck loader.
 */
interface ParsedIndividual extends BrokerRecord {
  readonly advisor: ParsedAdvisor;
}

/**
 * Parses money from source data.
 * @param value - Raw value to normalize or parse.
 * @returns The parsed value.
 */
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

/**
 * Parses duration months from source data.
 * @param text - Source text to parse.
 * @returns The parsed value.
 */
export function parseDurationMonths(text?: string | null): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const leading = t.split(/\s+/)[0];
  const wordNumber = WORD_NUMBERS.get(leading);
  const months = /^(\d+)\s*month/.exec(t);
  const years = /^(\d+)\s*year/.exec(t);
  const days = /^(\d+)\s*day/.exec(t);

  if (wordNumber != null) return durationByUnit(wordNumber, t);
  if (months) return Number(months[1]);
  if (years) return Number(years[1]) * 12;
  if (days) return Number(days[1]) / 30;
  return null;
}

/**
 * Applies the time unit embedded in BrokerCheck sanction duration text.
 * @param value - Parsed numeric duration.
 * @param text - Lowercase duration text containing the time unit.
 * @returns Duration in months, including fractional months for day values.
 */
function durationByUnit(value: number, text: string): number {
  if (text.includes("year")) return value * 12;
  if (text.includes("day")) return value / 30;
  return value;
}

/**
 * Handles industry start from days for this workflow.
 * @param days - days used by this operation.
 * @param calcDate - calc date used by this operation.
 * @returns The computed value.
 */
function industryStartFromDays(
  days: unknown,
  calcDate?: string
): string | null {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  const iso = toIsoDate(calcDate) ?? calcDate?.slice(0, 10);
  const base =
    iso && !Number.isNaN(Date.parse(iso))
      ? new Date(`${iso}T00:00:00Z`)
      : new Date();
  base.setUTCDate(base.getUTCDate() - n);
  return base.toISOString().slice(0, 10);
}

/**
 * Normalizes disclosure type for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
function normalizeDisclosureType(raw = ""): string {
  return (
    DISCLOSURE_TYPE_MAP[raw.trim().toLowerCase()] ??
    raw.trim().toLowerCase().replaceAll(" ", "_")
  );
}

/**
 * Normalizes regulator for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeRegulator(raw = ""): readonly [string, string | null] {
  const r = raw.trim();
  if (!r) return ["", null];
  if (r === "FINRA" || r === "SEC") return [r, null];
  const abbr = STATE_NAME_TO_ABBR[r.toLowerCase()];
  if (abbr) return ["state_securities", abbr];
  return [r, null];
}

/**
 * Normalizes resolution for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeResolution(
  raw?: string | null
): readonly [string | null, string | null] {
  if (!raw) return [null, null];
  const r = raw.trim();
  const rl = r.toLowerCase();
  if (rl.includes("acceptance, waiver") || rl.includes("awc"))
    return ["final", "neither"];
  if (["settled", "pending", "denied", "withdrawn"].includes(rl))
    return [rl, null];
  if (rl === "order") return ["final", null];
  if (rl === "consent") return ["final", "neither"];
  return [rl.replaceAll(" ", "_") || null, null];
}

/**
 * Normalizes sanction type for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeSanctionType(raw = ""): string {
  return (
    SANCTION_MAP[raw.trim().toLowerCase()] ??
    raw.trim().toLowerCase().replaceAll(" ", "_")
  );
}

/**
 * Builds the display legal name from BrokerCheck basic-name fields.
 * @param bi - Basic information payload.
 * @returns Title-cased legal name.
 */
function legalNameFromBasic(bi: BrokerRecord): string {
  return [bi.firstName, bi.middleName, bi.lastName]
    .filter(Boolean)
    .map(title)
    .join(" ")
    .trim();
}

/**
 * Infers current career status from active scopes and open sanction records.
 * @param bcScope - BrokerCheck broker scope.
 * @param iaScope - Investment adviser scope.
 * @param disclosures - Disclosure payloads that may include bars or suspensions.
 * @returns Local career status value.
 */
function careerStatusFromScopes(
  bcScope?: string,
  iaScope?: string,
  disclosures: readonly BrokerRecord[] = []
): string {
  if (
    (bcScope ?? "").toUpperCase() === "ACTIVE" ||
    (iaScope ?? "").toUpperCase() === "ACTIVE"
  )
    return "active";
  const sanctions = disclosures.flatMap(disclosureSanctions);
  if (
    sanctions.some(sanction =>
      String(sanction.Sanctions ?? "")
        .toLowerCase()
        .includes("bar")
    )
  )
    return "barred";
  if (sanctions.some(hasOpenSuspension)) return "suspended";
  return "withdrawn";
}

/**
 * Returns sanction groups from a disclosure detail payload.
 * @param disclosure - Disclosure payload.
 * @returns BrokerCheck sanction groups.
 */
function disclosureSanctions(
  disclosure: BrokerRecord
): readonly BrokerRecord[] {
  return disclosure.disclosureDetail?.SanctionDetails ?? [];
}

/**
 * Checks whether a sanction group represents a still-open suspension.
 * @param sanction - BrokerCheck sanction group.
 * @returns Whether the sanction includes an active or undated suspension.
 */
function hasOpenSuspension(sanction: BrokerRecord): boolean {
  const kind = String(sanction.Sanctions ?? "").toLowerCase();
  return (
    kind.includes("suspension") &&
    (sanction.SanctionDetails ?? []).some(inner => {
      const end = toIsoDate(inner["End Date"]);
      return !end || end > new Date().toISOString().slice(0, 10);
    })
  );
}

/**
 * Handles docket number for this workflow.
 * @param detail - Failure detail to include in logs.
 * @returns The computed value.
 */
function docketNumber(detail: BrokerRecord): string | null {
  return (
    detail.DocketNumberFDA ??
    detail.DocketNumberAAO ??
    detail.DocketNumber ??
    null
  );
}

/**
 * Parses disclosure from source data.
 * @param d - d used by this operation.
 * @returns The parsed value.
 */
function parseDisclosure(d: BrokerRecord): BrokerRecord {
  const detail = d.disclosureDetail ?? {};
  const [regulator, regulatorState] = normalizeRegulator(
    detail["Initiated By"] ?? ""
  );
  const [status, admitDeny] = normalizeResolution(detail.Resolution);
  const termination = detail["Termination Type"]
    ? {
        _terminationType: String(detail["Termination Type"])
          .toLowerCase()
          .replaceAll(" ", "_"),
        _firmName: detail["Firm Name"],
      }
    : {};
  const disclosure = {
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
    ...termination,
  };
  return { disclosure, sanctions: parseSanctions(detail) };
}

/**
 * Extracts sanction rows from BrokerCheck's nested sanction detail groups.
 * @param detail - Disclosure detail payload.
 * @returns Flat sanction rows linked to the disclosure.
 */
function parseSanctions(detail: BrokerRecord): readonly BrokerRecord[] {
  return (detail.SanctionDetails ?? []).flatMap(group => {
    const sanctionType = normalizeSanctionType(group.Sanctions ?? "");
    return (group.SanctionDetails ?? [{}]).map(inner => ({
      sanctionType,
      amount: parseMoney(inner.Amount),
      durationMonths: parseDurationMonths(inner.Duration),
      effectiveDate: toIsoDate(inner["Start Date"]),
      endDate: toIsoDate(inner["End Date"]),
      jurisdiction: inner["Registration Capacities Affected"],
    }));
  });
}

/**
 * Parses exam from source data.
 * @param ex - ex used by this operation.
 * @param scope - scope used by this operation.
 * @returns The parsed value.
 */
function parseExam(ex: BrokerRecord, scope: string): BrokerRecord {
  const code = ex.examCategory ?? "";
  return {
    licenseType: code ? code.replaceAll(" ", "_") : "",
    _examName: ex.examName,
    grantedDate: toIsoDate(ex.examTakenDate),
    _scope: scope,
  };
}

/**
 * Parses individual from source data.
 * @param content - BrokerCheck or source content payload.
 * @returns The parsed value.
 */
export function parseIndividual(content: BrokerRecord): ParsedIndividual {
  if (!content)
    return {
      advisor: {},
      employments: [],
      disclosures: [],
      licenses: [],
      summary: {},
    };
  const bi = content.basicInformation ?? {};
  const crd = String(bi.individualId ?? "");
  const advisor = {
    finraCrd: crd,
    firstName: title(bi.firstName),
    middleName: title(bi.middleName),
    lastName: title(bi.lastName),
    legalName: legalNameFromBasic(bi),
    industryStartDate: industryStartFromDays(
      bi.daysInIndustry,
      bi.daysInIndustryCalculatedDate
    ),
    careerStatus: careerStatusFromScopes(
      bi.bcScope,
      bi.iaScope,
      content.disclosures ?? []
    ),
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
    ...(content.stateExamCategory ?? []).map((x: BrokerRecord) =>
      parseExam(x, "state")
    ),
    ...(content.principalExamCategory ?? []).map((x: BrokerRecord) =>
      parseExam(x, "principal")
    ),
    ...(content.productExamCategory ?? []).map((x: BrokerRecord) =>
      parseExam(x, "product")
    ),
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
      employmentCount:
        (content.currentEmployments ?? []).length +
        (content.previousEmployments ?? []).length,
      examCount:
        (exams.stateExamCount ?? 0) +
        (exams.principalExamCount ?? 0) +
        (exams.productExamCount ?? 0),
      registeredStateCount: (content.registeredStates ?? []).length,
    },
  };
}

export { parseFirm } from "./brokercheck-parse-firm.js";

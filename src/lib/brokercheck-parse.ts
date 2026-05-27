import {
  dedupeEmployments,
  parseEmployment,
} from "./brokercheck-employment.js";
import {
  normalizeDisclosureType,
  normalizeRegulator,
  normalizeSanctionType,
  normalizeResolution,
  parseDurationMonths,
  parseMoney,
} from "./brokercheck-parse-normalize.js";
import {
  asCount,
  asString,
  recordArrayField,
  recordField,
  title,
  toIsoDate,
  type BrokerRecord,
} from "./brokercheck-parse-shared.js";

export { dedupeEmployments } from "./brokercheck-employment.js";
export { toIsoDate } from "./brokercheck-parse-shared.js";
export type { BrokerRecord } from "./brokercheck-parse-shared.js";
export {
  normalizeRegulator,
  normalizeResolution,
  normalizeSanctionType,
  parseDurationMonths,
  parseMoney,
} from "./brokercheck-parse-normalize.js";

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
 * Handles industry start from days for this workflow.
 * @param days - days used by this operation.
 * @param calcDate - calc date used by this operation.
 * @returns The computed value.
 */
function industryStartFromDays(
  days: unknown,
  calcDate?: string | null
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
 * Builds the display legal name from BrokerCheck basic-name fields.
 * @param bi - Basic information payload.
 * @returns Title-cased legal name.
 */
function legalNameFromBasic(bi: BrokerRecord): string {
  return [bi.firstName, bi.middleName, bi.lastName]
    .map(asString)
    .filter((value): value is string => Boolean(value))
    .map(title)
    .filter((value): value is string => Boolean(value))
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
  bcScope?: unknown,
  iaScope?: unknown,
  disclosures: readonly BrokerRecord[] = []
): string {
  if (
    String(bcScope ?? "").toUpperCase() === "ACTIVE" ||
    String(iaScope ?? "").toUpperCase() === "ACTIVE"
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
  const detail = recordField(disclosure, "disclosureDetail");
  return recordArrayField(detail, "SanctionDetails");
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
    recordArrayField(sanction, "SanctionDetails").some(inner => {
      const end = toIsoDate(asString(inner["End Date"]));
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
    asString(detail.DocketNumberFDA) ??
    asString(detail.DocketNumberAAO) ??
    asString(detail.DocketNumber) ??
    null
  );
}

/**
 * Builds the termination subset of a parsed disclosure row.
 * @param detail - Disclosure detail payload.
 * @returns Termination fields when the disclosure includes one, otherwise empty.
 */
function terminationFields(detail: BrokerRecord): BrokerRecord {
  const terminationType = detail["Termination Type"];
  if (!terminationType) return {};
  return {
    _terminationType: String(terminationType)
      .toLowerCase()
      .replaceAll(" ", "_"),
    _firmName: detail["Firm Name"],
  };
}

/**
 * Parses disclosure from source data.
 * @param d - d used by this operation.
 * @returns The parsed value.
 */
function parseDisclosure(d: BrokerRecord): BrokerRecord {
  const detail = recordField(d, "disclosureDetail");
  const [regulator, regulatorState] = normalizeRegulator(
    asString(detail["Initiated By"]) ?? ""
  );
  const [status, admitDeny] = normalizeResolution(asString(detail.Resolution));
  const allegations = asString(detail.Allegations) ?? "";
  const disclosure = {
    disclosureType: normalizeDisclosureType(asString(d.disclosureType) ?? ""),
    regulator,
    regulatorState,
    allegationText: allegations.slice(0, 8000) || null,
    dateInitiated: toIsoDate(asString(d.eventDate)),
    status,
    admitDeny,
    damagesRequested: parseMoney(detail["Damage Amount Requested"]),
    settlementAmount: parseMoney(detail["Settlement Amount"]),
    awardAmount: parseMoney(detail["Award Amount"]),
    docketNumber: docketNumber(detail),
    ...terminationFields(detail),
  };
  return { disclosure, sanctions: parseSanctions(detail) };
}

/**
 * Extracts sanction rows from BrokerCheck's nested sanction detail groups.
 * @param detail - Disclosure detail payload.
 * @returns Flat sanction rows linked to the disclosure.
 */
function parseSanctions(detail: BrokerRecord): readonly BrokerRecord[] {
  return recordArrayField(detail, "SanctionDetails").flatMap(group => {
    const sanctionType = normalizeSanctionType(asString(group.Sanctions) ?? "");
    const inners = recordArrayField(group, "SanctionDetails");
    const rows: readonly BrokerRecord[] = inners.length > 0 ? inners : [{}];
    return rows.map(inner => ({
      sanctionType,
      amount: parseMoney(inner.Amount),
      durationMonths: parseDurationMonths(asString(inner.Duration)),
      effectiveDate: toIsoDate(asString(inner["Start Date"])),
      endDate: toIsoDate(asString(inner["End Date"])),
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
  const code = asString(ex.examCategory) ?? "";
  return {
    licenseType: code ? code.replaceAll(" ", "_") : "",
    _examName: ex.examName,
    grantedDate: toIsoDate(asString(ex.examTakenDate)),
    _scope: scope,
  };
}

/**
 * Builds the parsed advisor subset from BrokerCheck basic information.
 * @param bi - BrokerCheck basicInformation payload.
 * @param disclosures - Disclosure payloads used to infer career status.
 * @returns Advisor row used downstream by the loader.
 */
function buildAdvisor(
  bi: BrokerRecord,
  disclosures: readonly BrokerRecord[]
): ParsedAdvisor {
  return {
    finraCrd: String(bi.individualId ?? ""),
    firstName: title(asString(bi.firstName)),
    middleName: title(asString(bi.middleName)),
    lastName: title(asString(bi.lastName)),
    legalName: legalNameFromBasic(bi),
    industryStartDate: industryStartFromDays(
      bi.daysInIndustry,
      asString(bi.daysInIndustryCalculatedDate)
    ),
    careerStatus: careerStatusFromScopes(bi.bcScope, bi.iaScope, disclosures),
  };
}

/**
 * Flattens BrokerCheck's split current/previous BD/IA employment arrays.
 * @param content - BrokerCheck individual payload.
 * @returns Concatenated employment source rows in input order.
 */
function employmentSources(content: BrokerRecord): readonly BrokerRecord[] {
  return [
    ...recordArrayField(content, "currentEmployments"),
    ...recordArrayField(content, "previousEmployments"),
    ...recordArrayField(content, "currentIAEmployments"),
    ...recordArrayField(content, "previousIAEmployments"),
  ];
}

/**
 * Builds the parsed license rows across state, principal, and product exams.
 * @param content - BrokerCheck individual payload.
 * @returns License rows tagged with their exam scope.
 */
function buildLicenses(content: BrokerRecord): readonly BrokerRecord[] {
  return [
    ...recordArrayField(content, "stateExamCategory").map(x =>
      parseExam(x, "state")
    ),
    ...recordArrayField(content, "principalExamCategory").map(x =>
      parseExam(x, "principal")
    ),
    ...recordArrayField(content, "productExamCategory").map(x =>
      parseExam(x, "product")
    ),
  ];
}

/**
 * Builds the parsed individual summary block surfaced by `parseIndividual`.
 * @param content - BrokerCheck individual payload.
 * @param bi - BrokerCheck basicInformation payload.
 * @returns Summary counts and scope fields.
 */
function buildSummary(content: BrokerRecord, bi: BrokerRecord): BrokerRecord {
  const exams = recordField(content, "examsCount");
  const disclosures = recordArrayField(content, "disclosures");
  return {
    bcScope: asString(bi.bcScope) ?? "",
    iaScope: asString(bi.iaScope) ?? "",
    disclosureCount: disclosures.length,
    employmentCount:
      recordArrayField(content, "currentEmployments").length +
      recordArrayField(content, "previousEmployments").length,
    examCount:
      asCount(exams.stateExamCount) +
      asCount(exams.principalExamCount) +
      asCount(exams.productExamCount),
    registeredStateCount: recordArrayField(content, "registeredStates").length,
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
  const bi = recordField(content, "basicInformation");
  const disclosureSource = recordArrayField(content, "disclosures");
  const advisor = buildAdvisor(bi, disclosureSource);
  const employments = dedupeEmployments(
    employmentSources(content).map(parseEmployment)
  );
  const disclosures = disclosureSource.map(parseDisclosure);
  const licenses = buildLicenses(content);
  return {
    advisor,
    employments,
    disclosures,
    licenses,
    summary: buildSummary(content, bi),
  };
}

export { parseFirm } from "./brokercheck-parse-firm.js";

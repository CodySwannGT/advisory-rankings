import { advisorId, branchId, employmentHistoryId, uid } from "./ids.js";
import { canonicalFirmId } from "./firm-identity.js";
import {
  certificationCode,
  cleanText,
  normalizePhone,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
import type { StifelAdvisorSource, StifelRows } from "./stifel-types.js";

const ACTIVE_STATUS = "active";
const STIFEL_FIRM_NAME = "Stifel";
const STIFEL_LEGAL_NAME = "Stifel, Nicolaus & Company, Incorporated";
const STIFEL_SOURCE_TYPE = "stifel_search_html";
const STIFEL_WEBSITE = "https://www.stifel.com/fa/search";
const STIFEL_FIRM_ID = canonicalFirmId(STIFEL_FIRM_NAME);
const DESIGNATION_RE =
  /\b(?:AAMS|AIF|ARPC|CEPA|CFP|CIMA|CKP|CLU|CPA|CPFA|CPWA|CRPC|MBA)\b/giu;

const EMPTY_ROWS: StifelRows = {
  Firm: [],
  FirmAlias: [],
  Branch: [],
  Advisor: [],
  EmploymentHistory: [],
  Designation: [],
  Team: [],
  TeamMembership: [],
  AdvisorResearchCheck: [],
};

/**
 * Maps Stifel search-result rows into canonical Harper table rows.
 * @param advisors - Advisor rows parsed from public search HTML.
 * @param checkedAt - Date recorded on generated research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapStifelAdvisors(
  advisors: ReadonlyArray<StifelAdvisorSource>,
  checkedAt = new Date().toISOString().slice(0, 10)
): StifelRows {
  return advisors
    .filter(source => Boolean(source.advisorName))
    .map(source => advisorRows(source, checkedAt))
    .reduce(mergeStifelRows, baseRows());
}

/**
 * Returns an empty Stifel row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyStifelRows(): StifelRows {
  return EMPTY_ROWS;
}

const mergeStifelRows = (left: StifelRows, right: StifelRows): StifelRows => ({
  Firm: uniqueRows([...left.Firm, ...right.Firm]),
  FirmAlias: [],
  Branch: uniqueRows([...left.Branch, ...right.Branch]),
  Advisor: uniqueRows([...left.Advisor, ...right.Advisor]),
  EmploymentHistory: uniqueRows([
    ...left.EmploymentHistory,
    ...right.EmploymentHistory,
  ]),
  Designation: uniqueRows([...left.Designation, ...right.Designation]),
  Team: [],
  TeamMembership: [],
  AdvisorResearchCheck: uniqueRows([
    ...left.AdvisorResearchCheck,
    ...right.AdvisorResearchCheck,
  ]),
});

const baseRows = (): StifelRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
});

const advisorRows = (
  source: StifelAdvisorSource,
  checkedAt: string
): StifelRows => {
  const branch = branchRow(source);
  const advisor = advisorRow(source);
  return {
    Firm: [],
    FirmAlias: [],
    Branch: [branch],
    Advisor: [advisor],
    EmploymentHistory: [employmentRow(advisor, branch, source)],
    Designation: designationRows(advisor, source),
    Team: [],
    TeamMembership: [],
    AdvisorResearchCheck: [researchCheckRow(advisor, source, checkedAt)],
  };
};

const firmRow = (): Record<string, unknown> => ({
  id: STIFEL_FIRM_ID,
  name: STIFEL_FIRM_NAME,
  legalName: STIFEL_LEGAL_NAME,
  channel: "regional_bd",
  subChannel: "Stifel_Nicolaus",
  website: STIFEL_WEBSITE,
});

const branchRow = (source: StifelAdvisorSource): Record<string, unknown> => {
  const branchKey =
    source.branchUrl ??
    [source.branchName, source.city, source.state].filter(Boolean).join(":");
  return withoutEmpty({
    id: branchId(STIFEL_FIRM_NAME, "branch", branchKey),
    firmId: STIFEL_FIRM_ID,
    level: "branch",
    name:
      source.branchName ??
      [source.city, source.state].filter(Boolean).join(", "),
    city: source.city,
    state: source.state,
    country: "US",
    phone: normalizePhone(source.businessPhone),
    sourceType: STIFEL_SOURCE_TYPE,
    sourceRef: source.branchUrl,
  });
};

const advisorRow = (source: StifelAdvisorSource): Record<string, unknown> => {
  const legalName = cleanText(source.advisorName);
  const names = splitName(legalName.split(",", 1)[0] ?? legalName);
  const notes = [
    source.roleTitle,
    source.linkedInUrl ? `LinkedIn: ${source.linkedInUrl}` : undefined,
    source.emailUrlFriendlyName
      ? `Stifel contact slug: ${source.emailUrlFriendlyName}`
      : undefined,
  ].filter(Boolean);
  return withoutEmpty({
    id: advisorId(
      legalName,
      source.advisorUrl ?? source.emailUrlFriendlyName ?? ""
    ),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: ACTIVE_STATUS,
    headshotUrl: source.headshotUrl,
    bioText: notes.length ? notes.join("\n") : undefined,
    businessPhone: normalizePhone(source.businessPhone),
    piiLevel: "public",
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  source: StifelAdvisorSource
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      STIFEL_FIRM_ID,
      STIFEL_SOURCE_TYPE
    ),
    advisorId: advisor.id,
    firmId: STIFEL_FIRM_ID,
    branchId: branch.id,
    roleTitle: source.roleTitle ?? "Financial Advisor",
    sourceType: STIFEL_SOURCE_TYPE,
    sourceRef: source.advisorUrl ?? source.searchUrl,
  });

const designationRows = (
  advisor: Record<string, unknown>,
  source: StifelAdvisorSource
): ReadonlyArray<Record<string, unknown>> => {
  return [
    ...new Set(cleanText(source.advisorName).match(DESIGNATION_RE) ?? []),
  ].map(value => ({
    id: uid(`designation:${advisor.id}:stifel:${certificationCode(value)}`),
    advisorId: advisor.id,
    code: certificationCode(value),
    grantingBody: value.toUpperCase(),
    status: ACTIVE_STATUS,
  }));
};

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: StifelAdvisorSource,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:stifel:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: STIFEL_SOURCE_TYPE,
  checkedAt,
  status: "success",
  sourcesChecked: [
    source.advisorUrl,
    source.branchUrl,
    source.searchUrl,
  ].filter(Boolean),
  notes:
    "Imported from Stifel public server-rendered advisor search results. Email contact metadata is retained in advisor notes when present.",
});

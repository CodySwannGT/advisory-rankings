import { advisorId, branchId, employmentHistoryId, uid } from "./ids.js";
import { canonicalFirmId } from "./firm-identity.js";
import {
  cleanText,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
import type { RbcAdvisorSource, RbcRows } from "./rbc-types.js";

const ACTIVE_STATUS = "active";
const RBC_FIRM_NAME = "RBC Wealth Management";
const RBC_LEGAL_NAME = "RBC Capital Markets, LLC";
const RBC_SOURCE_TYPE = "rbc_wealth_management_ajax";
const RBC_WEBSITE = "https://www.rbcwealthmanagement.com/en-us/find-an-advisor";
const RBC_LOGO_URL =
  "https://www.rbcwealthmanagement.com/en-us/wp-content/uploads/sites/7/2023/02/rbc.png";
const RBC_FIRM_ID = canonicalFirmId(RBC_FIRM_NAME);

const EMPTY_ROWS: RbcRows = {
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
 * Maps RBC Wealth Management AJAX advisor rows into Harper rows.
 * @param advisors - Advisor records parsed from public AJAX HTML.
 * @param checkedAt - Date recorded on research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapRbcAdvisors(
  advisors: ReadonlyArray<RbcAdvisorSource>,
  checkedAt = new Date().toISOString().slice(0, 10)
): RbcRows {
  return advisors
    .filter(source => Boolean(source.advisorName))
    .map(source => advisorRows(source, checkedAt))
    .reduce(mergeRbcRows, baseRows());
}

/**
 * Returns an empty RBC row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyRbcRows(): RbcRows {
  return EMPTY_ROWS;
}

const mergeRbcRows = (left: RbcRows, right: RbcRows): RbcRows => ({
  Firm: uniqueRows([...left.Firm, ...right.Firm]),
  FirmAlias: [],
  Branch: uniqueRows([...left.Branch, ...right.Branch]),
  Advisor: uniqueRows([...left.Advisor, ...right.Advisor]),
  EmploymentHistory: uniqueRows([
    ...left.EmploymentHistory,
    ...right.EmploymentHistory,
  ]),
  Designation: [],
  Team: [],
  TeamMembership: [],
  AdvisorResearchCheck: uniqueRows([
    ...left.AdvisorResearchCheck,
    ...right.AdvisorResearchCheck,
  ]),
});

const baseRows = (): RbcRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
});

const advisorRows = (source: RbcAdvisorSource, checkedAt: string): RbcRows => {
  const branch = branchRow(source);
  const advisor = advisorRow(source);
  return {
    Firm: [],
    FirmAlias: [],
    Branch: [branch],
    Advisor: [advisor],
    EmploymentHistory: [employmentRow(advisor, branch, source)],
    Designation: [],
    Team: [],
    TeamMembership: [],
    AdvisorResearchCheck: [researchCheckRow(advisor, source, checkedAt)],
  };
};

const firmRow = (): Record<string, unknown> => ({
  id: RBC_FIRM_ID,
  name: RBC_FIRM_NAME,
  legalName: RBC_LEGAL_NAME,
  channel: "wirehouse",
  subChannel: "RBC_Wealth_Management",
  website: RBC_WEBSITE,
  logoUrl: RBC_LOGO_URL,
});

const branchRow = (source: RbcAdvisorSource): Record<string, unknown> => {
  const branch = source.branch;
  return withoutEmpty({
    id: branchId(RBC_FIRM_NAME, "branch", branch.branchId),
    firmId: RBC_FIRM_ID,
    level: "branch",
    name: branch.name,
    address: branch.address,
    city: branch.city,
    state: branch.state,
    country: "US",
    postalCode: branch.postalCode,
    sourceType: RBC_SOURCE_TYPE,
    sourceRef: branch.branchUrl,
  });
};

const advisorRow = (source: RbcAdvisorSource): Record<string, unknown> => {
  const legalName = cleanText(source.advisorName);
  const names = splitName(legalName.split(",", 1)[0] ?? legalName);
  return withoutEmpty({
    id: advisorId(legalName, source.advisorUrl ?? source.businessEmail ?? ""),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: ACTIVE_STATUS,
    headshotUrl: source.headshotUrl,
    businessEmail: source.businessEmail,
    businessPhone: source.businessPhone,
    piiLevel: "public",
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  source: RbcAdvisorSource
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(String(advisor.id), RBC_FIRM_ID, RBC_SOURCE_TYPE),
    advisorId: advisor.id,
    firmId: RBC_FIRM_ID,
    branchId: branch.id,
    roleTitle: "Financial Advisor",
    sourceType: RBC_SOURCE_TYPE,
    sourceRef: source.advisorUrl ?? source.branch.branchUrl,
  });

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: RbcAdvisorSource,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:rbc:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: RBC_SOURCE_TYPE,
  checkedAt,
  status: "success",
  sourcesChecked: [source.advisorUrl, source.branch.branchUrl].filter(Boolean),
  notes: "Imported from RBC Wealth Management public advisor finder AJAX feed.",
});

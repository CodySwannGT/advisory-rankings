import { advisorId, branchId, employmentHistoryId, uid } from "./ids.js";
import { canonicalFirmId } from "./firm-identity.js";
import {
  cleanText,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
import type {
  RaymondJamesAdvisorSource,
  RaymondJamesRows,
} from "./raymond-james-types.js";

const ACTIVE_STATUS = "active";
const FIRM_NAME = "Raymond James";
const LEGAL_NAME = "Raymond James & Associates, Inc.";
const SOURCE_TYPE = "raymond_james_branch_roster";
const WEBSITE = "https://www.raymondjames.com/find-an-advisor";
const FIRM_ID = canonicalFirmId(FIRM_NAME);

const EMPTY_ROWS: RaymondJamesRows = {
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
 * Maps Raymond James branch roster rows into Harper rows.
 * @param advisors - Advisor records parsed from public branch pages.
 * @param checkedAt - Date recorded on research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapRaymondJamesAdvisors(
  advisors: ReadonlyArray<RaymondJamesAdvisorSource>,
  checkedAt = new Date().toISOString().slice(0, 10)
): RaymondJamesRows {
  return advisors
    .filter(source => Boolean(source.advisorName))
    .map(source => advisorRows(source, checkedAt))
    .reduce(mergeRows, baseRows());
}

/**
 * Returns an empty Raymond James row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyRaymondJamesRows(): RaymondJamesRows {
  return EMPTY_ROWS;
}

const mergeRows = (
  left: RaymondJamesRows,
  right: RaymondJamesRows
): RaymondJamesRows => ({
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

const baseRows = (): RaymondJamesRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
});

const advisorRows = (
  source: RaymondJamesAdvisorSource,
  checkedAt: string
): RaymondJamesRows => {
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
  id: FIRM_ID,
  name: FIRM_NAME,
  legalName: LEGAL_NAME,
  channel: "wirehouse",
  subChannel: "Raymond_James",
  website: WEBSITE,
});

const branchRow = (
  source: RaymondJamesAdvisorSource
): Record<string, unknown> =>
  withoutEmpty({
    id: branchId(FIRM_NAME, "branch", source.branch.branchUrl),
    firmId: FIRM_ID,
    level: "branch",
    name: source.branch.name,
    address: source.branch.address,
    city: source.branch.city,
    state: source.branch.state,
    country: "US",
    postalCode: source.branch.postalCode,
    phone: source.branch.phone,
    sourceType: SOURCE_TYPE,
    sourceRef: source.branch.branchUrl,
  });

const advisorRow = (
  source: RaymondJamesAdvisorSource
): Record<string, unknown> => {
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
  source: RaymondJamesAdvisorSource
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      FIRM_ID,
      source.advisorUrl ?? SOURCE_TYPE
    ),
    advisorId: advisor.id,
    firmId: FIRM_ID,
    branchId: branch.id,
    roleTitle: source.roleTitle ?? "Financial Advisor",
    sourceType: SOURCE_TYPE,
    sourceRef: source.advisorUrl ?? source.branch.branchUrl,
  });

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: RaymondJamesAdvisorSource,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:raymond-james:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: SOURCE_TYPE,
  checkedAt,
  sourcesChecked: [source.advisorUrl, source.branch.branchUrl].filter(Boolean),
  notes: "Imported from Raymond James public branch roster page.",
});

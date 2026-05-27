import { advisorId, branchId, employmentHistoryId, uid } from "./ids.js";
import { canonicalFirmId, firmAliasId } from "./firm-identity.js";
import {
  cleanText,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
import type {
  WellsFargoAdvisorSource,
  WellsFargoRows,
} from "./wells-fargo-types.js";

const ACTIVE_STATUS = "active";
const WELLS_FARGO_FIRM_NAME = "Wells Fargo Advisors";
const WELLS_FARGO_LEGAL_NAME = "Wells Fargo Clearing Services, LLC";
const WELLS_FARGO_SOURCE_TYPE = "wells_fargo_advisors_html";
const WELLS_FARGO_WEBSITE =
  "https://www.wellsfargo.com/locator/wellsfargoadvisors/";
const WELLS_FARGO_LOGO_URL =
  "https://www17.wellsfargomedia.com/assets/images/locator/wfa_logo.svg";
const WELLS_FARGO_FIRM_ID = canonicalFirmId(WELLS_FARGO_FIRM_NAME);
const WELLS_FARGO_ALIASES = [
  "Wells Fargo Advisors Financial Network",
  "Wells Fargo Banking and Investment Services",
];

const EMPTY_ROWS: WellsFargoRows = {
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
 * Maps Wells Fargo Advisors branch-page advisor records into Harper rows.
 * @param advisors - Advisor records parsed from public HTML branch pages.
 * @param checkedAt - Date recorded on research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapWellsFargoAdvisors(
  advisors: ReadonlyArray<WellsFargoAdvisorSource>,
  checkedAt = new Date().toISOString().slice(0, 10)
): WellsFargoRows {
  return advisors
    .filter(source => Boolean(source.advisorName))
    .map(source => advisorRows(source, checkedAt))
    .reduce(mergeWellsFargoRows, baseRows());
}

/**
 * Returns an empty Wells Fargo row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyWellsFargoRows(): WellsFargoRows {
  return EMPTY_ROWS;
}

const mergeWellsFargoRows = (
  left: WellsFargoRows,
  right: WellsFargoRows
): WellsFargoRows => ({
  Firm: uniqueRows([...left.Firm, ...right.Firm]),
  FirmAlias: uniqueRows([...left.FirmAlias, ...right.FirmAlias]),
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

const baseRows = (): WellsFargoRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
  FirmAlias: WELLS_FARGO_ALIASES.map(firmAliasRow),
});

const advisorRows = (
  source: WellsFargoAdvisorSource,
  checkedAt: string
): WellsFargoRows => {
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
  id: WELLS_FARGO_FIRM_ID,
  name: WELLS_FARGO_FIRM_NAME,
  legalName: WELLS_FARGO_LEGAL_NAME,
  channel: "wirehouse",
  subChannel: "Wells_Fargo_Advisors",
  website: WELLS_FARGO_WEBSITE,
  logoUrl: WELLS_FARGO_LOGO_URL,
});

const firmAliasRow = (alias: string): Record<string, unknown> => ({
  id: firmAliasId(WELLS_FARGO_FIRM_ID, alias),
  firmId: WELLS_FARGO_FIRM_ID,
  alias,
  normalizedAlias: alias.toLowerCase(),
  sourceType: WELLS_FARGO_SOURCE_TYPE,
  sourceRef: WELLS_FARGO_WEBSITE,
  confidence: "source",
});

const branchRow = (
  source: WellsFargoAdvisorSource
): Record<string, unknown> => {
  const branch = source.branch;
  const addressKey = [
    branch.address,
    branch.city,
    branch.state,
    branch.postalCode,
    branch.branchCode,
  ]
    .filter(Boolean)
    .join(":");
  return withoutEmpty({
    id: branchId(WELLS_FARGO_FIRM_NAME, "branch", addressKey),
    firmId: WELLS_FARGO_FIRM_ID,
    level: "branch",
    name: branch.name,
    address: branch.address,
    city: branch.city,
    state: branch.state,
    country: "US",
    postalCode: branch.postalCode,
    phone: branch.phone,
    sourceType: WELLS_FARGO_SOURCE_TYPE,
    sourceRef: branch.branchUrl,
  });
};

const advisorRow = (
  source: WellsFargoAdvisorSource
): Record<string, unknown> => {
  const legalName = cleanText(source.advisorName);
  const names = splitName(legalName);
  return withoutEmpty({
    id: advisorId(
      legalName,
      source.advisorUrl ?? source.branch.branchUrl ?? ""
    ),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: ACTIVE_STATUS,
    businessPhone: source.branch.phone,
    piiLevel: "public",
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  source: WellsFargoAdvisorSource
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      WELLS_FARGO_FIRM_ID,
      WELLS_FARGO_SOURCE_TYPE
    ),
    advisorId: advisor.id,
    firmId: WELLS_FARGO_FIRM_ID,
    branchId: branch.id,
    roleTitle: "Financial Advisor",
    sourceType: WELLS_FARGO_SOURCE_TYPE,
    sourceRef: source.advisorUrl ?? source.branch.branchUrl,
  });

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: WellsFargoAdvisorSource,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:wells-fargo:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: WELLS_FARGO_SOURCE_TYPE,
  checkedAt,
  sourcesChecked: [source.advisorUrl, source.branch.branchUrl].filter(Boolean),
  notes:
    "Imported from Wells Fargo Advisors public locator and branch profile HTML.",
});

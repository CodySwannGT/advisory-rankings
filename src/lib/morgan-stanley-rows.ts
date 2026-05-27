import {
  MORGAN_STANLEY_CANONICAL_NAME,
  MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS,
  canonicalFirmId,
  curatedFirmAliasRows,
} from "./firm-identity.js";
import type {
  MorganStanleyRows,
  MorganStanleyYextLocation,
} from "./morgan-stanley-types.js";
import { morganStanleyLocationView } from "./morgan-stanley-location-view.js";
import {
  advisorRow,
  branchRow,
  designationRows,
  employmentRow,
  isAdvisorLocation,
  researchCheckRow,
  teamMembershipRow,
  teamRow,
  type MorganStanleyBuilderConfig,
} from "./morgan-stanley-row-builders.js";
import { uniqueRows } from "./morgan-stanley-row-utils.js";

const MORGAN_STANLEY_FIRM_NAME = MORGAN_STANLEY_CANONICAL_NAME;
const MORGAN_STANLEY_PROGRAM_NAME = MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS;
const MORGAN_STANLEY_FIRM_ID = canonicalFirmId(MORGAN_STANLEY_FIRM_NAME);
const MORGAN_STANLEY_SOURCE_TYPE = "morgan_stanley_yext";
const MORGAN_STANLEY_ADVISOR_URL = "https://advisor.morganstanley.com/";
const MORGAN_STANLEY_LOGO_URL =
  "https://www.morganstanley.com/etc.clientlibs/msdotcomr4/clientlibs/clientlib-site/resources/images/brand/morgan-stanley-logo-black.svg";

const BUILDER_CONFIG: MorganStanleyBuilderConfig = {
  firmId: MORGAN_STANLEY_FIRM_ID,
  firmName: MORGAN_STANLEY_FIRM_NAME,
  programName: MORGAN_STANLEY_PROGRAM_NAME,
  sourceType: MORGAN_STANLEY_SOURCE_TYPE,
  advisorUrl: MORGAN_STANLEY_ADVISOR_URL,
};

const EMPTY_ROWS: MorganStanleyRows = {
  Firm: [],
  Branch: [],
  Advisor: [],
  EmploymentHistory: [],
  Designation: [],
  Team: [],
  TeamMembership: [],
  AdvisorResearchCheck: [],
  FirmAlias: [],
};

/**
 * Maps Morgan Stanley Yext locations into canonical Harper table rows.
 * @param locations - Locator records returned by the Morgan Stanley advisor search API.
 * @param checkedAt - Date recorded on generated research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapMorganStanleyLocations(
  locations: ReadonlyArray<MorganStanleyYextLocation>,
  checkedAt = new Date().toISOString().slice(0, 10)
): MorganStanleyRows {
  return locations
    .map(morganStanleyLocationView)
    .filter(isAdvisorLocation)
    .map(location => locationRows(location, checkedAt))
    .reduce(mergeMorganStanleyRows, baseRows());
}

/**
 * Returns an empty Morgan Stanley row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyMorganStanleyRows(): MorganStanleyRows {
  return EMPTY_ROWS;
}

/**
 * Merges two Morgan Stanley row bundles by table and row ID.
 * @param left - Existing rows accumulated from earlier query pages.
 * @param right - New rows from the current query page.
 * @returns Combined row bundle with later duplicate IDs replacing earlier rows.
 */
export function mergeMorganStanleyRows(
  left: MorganStanleyRows,
  right: MorganStanleyRows
): MorganStanleyRows {
  return {
    Firm: uniqueRows([...left.Firm, ...right.Firm]),
    FirmAlias: uniqueRows([...left.FirmAlias, ...right.FirmAlias]),
    Branch: uniqueRows([...left.Branch, ...right.Branch]),
    Advisor: uniqueRows([...left.Advisor, ...right.Advisor]),
    EmploymentHistory: uniqueRows([
      ...left.EmploymentHistory,
      ...right.EmploymentHistory,
    ]),
    Designation: uniqueRows([...left.Designation, ...right.Designation]),
    Team: uniqueRows([...left.Team, ...right.Team]),
    TeamMembership: uniqueRows([
      ...left.TeamMembership,
      ...right.TeamMembership,
    ]),
    AdvisorResearchCheck: uniqueRows([
      ...left.AdvisorResearchCheck,
      ...right.AdvisorResearchCheck,
    ]),
  };
}

const baseRows = (): MorganStanleyRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
  FirmAlias: curatedFirmAliasRows(),
});

const firmRow = (): Record<string, unknown> => ({
  id: MORGAN_STANLEY_FIRM_ID,
  name: MORGAN_STANLEY_FIRM_NAME,
  legalName: "Morgan Stanley Smith Barney LLC",
  channel: "wirehouse",
  subChannel: "Morgan_Stanley_Wealth_Management",
  website: MORGAN_STANLEY_ADVISOR_URL,
  logoUrl: MORGAN_STANLEY_LOGO_URL,
});

const locationRows = (
  location: ReturnType<typeof morganStanleyLocationView>,
  checkedAt: string
): MorganStanleyRows => {
  const advisor = advisorRow(location);
  const branch = branchRow(location, BUILDER_CONFIG);
  const team = teamRow(location, BUILDER_CONFIG);
  const membership = team ? teamMembershipRow(team, advisor) : null;
  return {
    Firm: [],
    FirmAlias: [],
    Branch: [branch],
    Advisor: [advisor],
    EmploymentHistory: [
      employmentRow(advisor, branch, location, BUILDER_CONFIG),
    ],
    Designation: designationRows(advisor, location),
    Team: team ? [team] : [],
    TeamMembership: membership ? [membership] : [],
    AdvisorResearchCheck: [
      researchCheckRow(advisor, location, checkedAt, BUILDER_CONFIG),
    ],
  };
};

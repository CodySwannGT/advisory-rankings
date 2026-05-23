// @ts-nocheck
import { advisorId, branchId, employmentHistoryId, uid } from "./ids.js";
import { canonicalFirmId } from "./firm-identity.js";
import {
  cleanText,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
import type {
  EdwardJonesAdvisorSource,
  EdwardJonesRows,
} from "./edward-jones-types.js";

const ACTIVE_STATUS = "active";
const FIRM_NAME = "Edward Jones";
const LEGAL_NAME = "Edward D. Jones & Co., L.P.";
const SOURCE_TYPE = "edward_jones_advisor_results_api";
const WEBSITE =
  "https://www.edwardjones.com/us-en/search/financial-advisor/results";
const FIRM_ID = canonicalFirmId(FIRM_NAME);

const EMPTY_ROWS: EdwardJonesRows = {
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
 * Maps Edward Jones public locator results into Harper rows.
 * @param advisors - Advisor records returned by the public locator feed.
 * @param checkedAt - Date recorded on research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapEdwardJonesAdvisors(
  advisors: ReadonlyArray<EdwardJonesAdvisorSource>,
  checkedAt = new Date().toISOString().slice(0, 10)
): EdwardJonesRows {
  return advisors
    .filter(source => Boolean(source.faName))
    .map(source => advisorRows(source, checkedAt))
    .reduce(mergeRows, baseRows());
}

/**
 * Returns an empty Edward Jones row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyEdwardJonesRows(): EdwardJonesRows {
  return EMPTY_ROWS;
}

const mergeRows = (
  left: EdwardJonesRows,
  right: EdwardJonesRows
): EdwardJonesRows => ({
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

const baseRows = (): EdwardJonesRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
});

const advisorRows = (
  source: EdwardJonesAdvisorSource,
  checkedAt: string
): EdwardJonesRows => {
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
  subChannel: "Edward_Jones",
  website: WEBSITE,
});

const branchRow = (source: EdwardJonesAdvisorSource): Record<string, unknown> =>
  withoutEmpty({
    id: branchId(FIRM_NAME, "branch", addressKey(source)),
    firmId: FIRM_ID,
    level: "branch",
    name: branchName(source),
    address: source.address,
    city: source.faCity,
    state: source.faState,
    country: source.faCountry ?? "US",
    postalCode: source.faZipCode,
    latitude: source.lat,
    longitude: source.lon,
    phone: source.phone,
    sourceType: SOURCE_TYPE,
    sourceRef: sourceUrl(source.faUrl) ?? WEBSITE,
  });

const advisorRow = (
  source: EdwardJonesAdvisorSource
): Record<string, unknown> => {
  const legalName = cleanText(source.faName);
  const names = splitName(legalName);
  return withoutEmpty({
    id: advisorId(legalName, String(source.faEntityId ?? source.faUrl ?? "")),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: ACTIVE_STATUS,
    headshotUrl: source.faImage,
    businessPhone: source.phone,
    piiLevel: "public",
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  source: EdwardJonesAdvisorSource
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      FIRM_ID,
      String(source.faEntityId ?? source.faUrl ?? SOURCE_TYPE)
    ),
    advisorId: advisor.id,
    firmId: FIRM_ID,
    branchId: branch.id,
    roleTitle: "Financial Advisor",
    sourceType: SOURCE_TYPE,
    sourceRef: sourceUrl(source.faUrl) ?? WEBSITE,
  });

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: EdwardJonesAdvisorSource,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:edward-jones:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: SOURCE_TYPE,
  checkedAt,
  sourcesChecked: [
    sourceUrl(source.faUrl),
    sourceUrl(source.faContactUrl),
    WEBSITE,
  ].filter(Boolean),
  notes: [
    "Imported from Edward Jones public financial-advisor search JSON.",
    source.degreeSuffix ? `Degree suffix: ${source.degreeSuffix}.` : "",
    source.certification ? `Certifications: ${source.certification}.` : "",
    source.focusArea ? `Focus areas: ${source.focusArea}.` : "",
  ]
    .filter(Boolean)
    .join(" "),
});

const sourceUrl = (path?: string): string | undefined => {
  if (!path) return undefined;
  if (/^https?:\/\//iu.test(path)) return path;
  return new URL(path, "https://www.edwardjones.com").toString();
};

const addressKey = (source: EdwardJonesAdvisorSource): string =>
  [source.address, source.faCity, source.faState, source.faZipCode]
    .filter(Boolean)
    .join(":");

const branchName = (source: EdwardJonesAdvisorSource): string =>
  [FIRM_NAME, source.faCity, source.faState, source.faZipCode]
    .filter(Boolean)
    .join(" ");

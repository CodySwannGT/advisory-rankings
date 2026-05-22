// @ts-nocheck
import {
  advisorId,
  branchId,
  employmentHistoryId,
  teamId,
  teamMembershipId,
  uid,
} from "./ids.js";
import {
  MORGAN_STANLEY_CANONICAL_NAME,
  MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS,
  canonicalFirmId,
  curatedFirmAliasRows,
} from "./firm-identity.js";
import type {
  MorganStanleyRows,
  MorganStanleyYextLocation,
  YextImage,
} from "./morgan-stanley-types.js";
import {
  addressKey,
  certificationCode,
  cleanText,
  listNote,
  normalizePhone,
  normalizeUrl,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
const ACTIVE_STATUS = "active";
const ADVISOR_PROFILE_SUFFIX = " - Morgan Stanley";
const MORGAN_STANLEY_FIRM_NAME = MORGAN_STANLEY_CANONICAL_NAME;
const MORGAN_STANLEY_PROGRAM_NAME = MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS;
const MORGAN_STANLEY_FIRM_ID = canonicalFirmId(MORGAN_STANLEY_FIRM_NAME);
const MORGAN_STANLEY_SOURCE_TYPE = "morgan_stanley_yext";
const MORGAN_STANLEY_ADVISOR_URL = "https://advisor.morganstanley.com/";
const MORGAN_STANLEY_LOGO_URL =
  "https://www.morganstanley.com/etc.clientlibs/msdotcomr4/clientlibs/clientlib-site/resources/images/brand/morgan-stanley-logo-black.svg";

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

const locationRows = (
  location: MorganStanleyYextLocation,
  checkedAt: string
): MorganStanleyRows => {
  const advisor = advisorRow(location);
  const branch = branchRow(location);
  const team = teamRow(location);
  const membership = team ? teamMembershipRow(team, advisor) : null;
  return {
    Firm: [],
    FirmAlias: [],
    Branch: [branch],
    Advisor: [advisor],
    EmploymentHistory: [employmentRow(advisor, branch, location)],
    Designation: designationRows(advisor, location),
    Team: team ? [team] : [],
    TeamMembership: membership ? [membership] : [],
    AdvisorResearchCheck: [researchCheckRow(advisor, location, checkedAt)],
  };
};

const isAdvisorLocation = (location: MorganStanleyYextLocation): boolean => {
  return location.c_profileType === "FA" && Boolean(displayName(location));
};

const displayName = (location: MorganStanleyYextLocation): string => {
  const name = location.c_pagesName ?? location.name ?? "";
  return cleanText(
    String(name).endsWith(ADVISOR_PROFILE_SUFFIX)
      ? String(name).slice(0, -ADVISOR_PROFILE_SUFFIX.length)
      : String(name)
  );
};

const firmRow = (): Record<string, unknown> => ({
  id: MORGAN_STANLEY_FIRM_ID,
  name: MORGAN_STANLEY_FIRM_NAME,
  legalName: "Morgan Stanley Smith Barney LLC",
  channel: "wirehouse",
  subChannel: "Morgan_Stanley_Wealth_Management",
  website: MORGAN_STANLEY_ADVISOR_URL,
  logoUrl: MORGAN_STANLEY_LOGO_URL,
});

const advisorRow = (
  location: MorganStanleyYextLocation
): Record<string, unknown> => {
  const legalName = displayName(location);
  const names = splitName(legalName);
  const notes = [
    location.c_primaryTitle,
    ...(location.c_secondaryTitles ?? []),
    listNote("Focus areas", location.c_extLocatorFocusAreas),
    listNote("Languages", location.c_extLocatorLanguages),
  ].filter(Boolean);
  return withoutEmpty({
    id: advisorId(
      legalName,
      `morgan-stanley-${location.uid ?? location.id ?? ""}`
    ),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: ACTIVE_STATUS,
    headshotUrl: imageUrl(location.c_profilePhotoSquare?.image),
    bioText: notes.length ? notes.join("\n") : undefined,
    linkedinUrl: normalizeUrl(location.c_linkedInURL),
    businessEmail: location.emails?.[0],
    businessPhone: normalizePhone(location.mainPhone),
    piiLevel: "public",
  });
};

const branchRow = (
  location: MorganStanleyYextLocation
): Record<string, unknown> => {
  const address = location.address ?? {};
  const branchName = cleanText(
    location.c_branchName ??
      location.c_branchAssociatedEntities?.[0]?.c_branchName ??
      "Morgan Stanley"
  );
  return withoutEmpty({
    id: branchId(
      MORGAN_STANLEY_FIRM_NAME,
      "branch",
      location.c_branchID ?? location.c_officeNumber ?? addressKey(address)
    ),
    firmId: MORGAN_STANLEY_FIRM_ID,
    level: "branch",
    name: branchName,
    address: [address.line1, address.line2].filter(Boolean).join(", "),
    city: address.city,
    state: address.region,
    country: address.countryCode,
    postalCode: address.postalCode,
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  location: MorganStanleyYextLocation
): Record<string, unknown> => {
  return withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      MORGAN_STANLEY_FIRM_ID,
      MORGAN_STANLEY_SOURCE_TYPE
    ),
    advisorId: advisor.id,
    firmId: MORGAN_STANLEY_FIRM_ID,
    branchId: branch.id,
    roleTitle: [location.c_primaryTitle, ...(location.c_secondaryTitles ?? [])]
      .filter(Boolean)
      .join("; "),
    sourceType: MORGAN_STANLEY_SOURCE_TYPE,
    sourceRef: sourceUrl(location),
  });
};

const designationRows = (
  advisor: Record<string, unknown>,
  location: MorganStanleyYextLocation
): ReadonlyArray<Record<string, unknown>> => {
  return (location.c_listOfCertifications ?? []).map(certification =>
    withoutEmpty({
      id: uid(`designation:${advisor.id}:${certificationCode(certification)}`),
      advisorId: advisor.id,
      code: certificationCode(certification),
      grantingBody: certification,
      status: ACTIVE_STATUS,
    })
  );
};

const teamRow = (
  location: MorganStanleyYextLocation
): Record<string, unknown> | null => {
  const name = cleanText(
    location.c_teamEntityName ??
      location.c_faTeamLinkedEntities?.[0]?.c_pagesName ??
      ""
  );
  const address =
    location.c_faTeamLinkedEntities?.[0]?.address ?? location.address ?? {};
  return name
    ? withoutEmpty({
        id: teamId(name, MORGAN_STANLEY_FIRM_NAME),
        name,
        currentFirmId: MORGAN_STANLEY_FIRM_ID,
        currentBranchId: branchId(
          MORGAN_STANLEY_FIRM_NAME,
          "branch",
          location.c_branchID ?? location.c_officeNumber ?? addressKey(address)
        ),
        firmProgram: MORGAN_STANLEY_PROGRAM_NAME,
      })
    : null;
};

const teamMembershipRow = (
  team: Record<string, unknown>,
  advisor: Record<string, unknown>
): Record<string, unknown> => ({
  id: teamMembershipId(String(team.id), String(advisor.id)),
  teamId: team.id,
  advisorId: advisor.id,
  role: "member",
});

const researchCheckRow = (
  advisor: Record<string, unknown>,
  location: MorganStanleyYextLocation,
  checkedAt: string
): Record<string, unknown> => {
  const sources = [sourceUrl(location), location.c_linkedInURL]
    .map(normalizeUrl)
    .filter(Boolean);
  return withoutEmpty({
    id: uid(
      `research:${advisor.id}:${MORGAN_STANLEY_SOURCE_TYPE}:${checkedAt}`
    ),
    advisorId: advisor.id,
    sourceType: MORGAN_STANLEY_SOURCE_TYPE,
    checkedAt,
    status: "success",
    sourcesChecked: sources,
    notes: `Imported from Morgan Stanley Yext location ${location.uid ?? location.id ?? "unknown"}.`,
  });
};

const sourceUrl = (location: MorganStanleyYextLocation): string => {
  return (
    normalizeUrl(
      location.c_pagesURL ?? location.c_locatorURL ?? MORGAN_STANLEY_ADVISOR_URL
    ) ?? MORGAN_STANLEY_ADVISOR_URL
  );
};

const imageUrl = (image?: YextImage): string | undefined => {
  return [
    image?.url,
    ...(image?.thumbnails ?? []).map(thumbnail => thumbnail.url),
  ]
    .map(normalizeUrl)
    .find((url): url is string => Boolean(url));
};

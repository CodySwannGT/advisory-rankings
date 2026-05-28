import {
  advisorId,
  branchId,
  employmentHistoryId,
  teamId,
  teamMembershipId,
  uid,
} from "./ids.js";
import { canonicalFirmId, firmAliasId } from "./firm-identity.js";
import type { MerrillRows, MerrillYextAdvisor } from "./merrill-types.js";
import type { YextAddress } from "./morgan-stanley-types.js";
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
const MERRILL_FIRM_NAME = "Merrill Lynch Wealth Management";
const MERRILL_LEGAL_NAME = "Merrill Lynch, Pierce, Fenner & Smith Incorporated";
const MERRILL_ALIAS = "Bank of America Merrill Lynch";
const MERRILL_SOURCE_TYPE = "merrill_yext";
const MERRILL_WEBSITE = "https://advisor.ml.com/search";
const MERRILL_LOGO_URL =
  "https://www.ml.com/etc.clientlibs/mlsite/clientlibs/clientlib-site/resources/images/ml-logo.svg";
const MERRILL_FIRM_ID = canonicalFirmId(MERRILL_FIRM_NAME);

const EMPTY_ROWS: MerrillRows = {
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
 * Maps Merrill Yext advisor rows into canonical Harper table rows.
 * @param advisors - Locator records returned by Merrill's advisor search API.
 * @param checkedAt - Date recorded on generated research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapMerrillAdvisors(
  advisors: ReadonlyArray<MerrillYextAdvisor>,
  checkedAt = new Date().toISOString().slice(0, 10)
): MerrillRows {
  return advisors
    .filter(isAdvisor)
    .map(advisor => advisorRows(advisor, checkedAt))
    .reduce(mergeMerrillRows, baseRows());
}

/**
 * Returns an empty Merrill row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyMerrillRows(): MerrillRows {
  return EMPTY_ROWS;
}

const mergeMerrillRows = (
  left: MerrillRows,
  right: MerrillRows
): MerrillRows => ({
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
  TeamMembership: uniqueRows([...left.TeamMembership, ...right.TeamMembership]),
  AdvisorResearchCheck: uniqueRows([
    ...left.AdvisorResearchCheck,
    ...right.AdvisorResearchCheck,
  ]),
});

const baseRows = (): MerrillRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
  FirmAlias: [firmAliasRow(MERRILL_ALIAS)],
});

const advisorRows = (
  source: MerrillYextAdvisor,
  checkedAt: string
): MerrillRows => {
  const advisor = advisorRow(source);
  const branch = branchRow(source);
  const team = teamRow(source);
  return {
    Firm: [],
    FirmAlias: [],
    Branch: [branch],
    Advisor: [advisor],
    EmploymentHistory: [employmentRow(advisor, branch, source)],
    Designation: designationRows(advisor, source),
    Team: team ? [team] : [],
    TeamMembership: team ? [teamMembershipRow(team, advisor)] : [],
    AdvisorResearchCheck: [researchCheckRow(advisor, source, checkedAt)],
  };
};

const isAdvisor = (source: MerrillYextAdvisor): boolean => {
  return Boolean(displayName(source)) && source.closed !== true;
};

const firmRow = (): Record<string, unknown> => ({
  id: MERRILL_FIRM_ID,
  name: MERRILL_FIRM_NAME,
  legalName: MERRILL_LEGAL_NAME,
  channel: "wirehouse",
  subChannel: "Merrill_Lynch_Wealth_Management",
  website: MERRILL_WEBSITE,
  logoUrl: MERRILL_LOGO_URL,
});

const firmAliasRow = (alias: string): Record<string, unknown> => ({
  id: firmAliasId(MERRILL_FIRM_ID, alias),
  firmId: MERRILL_FIRM_ID,
  alias,
  normalizedAlias: alias.toLowerCase(),
  sourceType: "merrill_yext",
  sourceRef: MERRILL_WEBSITE,
  confidence: "source",
});

const advisorRow = (source: MerrillYextAdvisor): Record<string, unknown> => {
  const legalName = displayName(source);
  const names = splitName(legalName);
  const notes = [
    asString(source.c_jobTitle),
    asString(source.c_recognitionTitle),
    listNote("Client focuses", asStringArray(source.c_clientFocuses)),
    listNote("Languages", languageValues(source)),
  ].filter(Boolean);
  const emails = asStringArray(source.emails);
  return withoutEmpty({
    id: advisorId(
      legalName,
      `merrill-${asString(source.id) ?? asString(source.uid) ?? ""}`
    ),
    legalName,
    firstName: cleanText(
      String(source.c_advisorFirstName ?? names.firstName ?? "")
    ),
    middleName: names.middleName,
    lastName: cleanText(
      String(source.c_advisorLastName ?? names.lastName ?? "")
    ),
    careerStatus: ACTIVE_STATUS,
    headshotUrl: imageUrl(source.c_profilePicture),
    bioText: notes.length ? notes.join("\n") : undefined,
    businessEmail: emails ? emails[0] : undefined,
    businessPhone: normalizePhone(String(source.mainPhone ?? "")),
    piiLevel: "public",
  });
};

const branchRow = (source: MerrillYextAdvisor): Record<string, unknown> => {
  const address: YextAddress = asRecord(source.address) ?? {};
  const city = asString(address.city);
  const region = asString(address.region);
  const line1 = asString(address.line1);
  const line2 = asString(address.line2);
  return withoutEmpty({
    id: branchId(MERRILL_FIRM_NAME, "branch", addressKey(address)),
    firmId: MERRILL_FIRM_ID,
    level: "branch",
    name: [city, region].filter(Boolean).join(", "),
    address: [line1, line2].filter(Boolean).join(", "),
    city,
    state: region,
    country: asString(address.countryCode),
    postalCode: asString(address.postalCode),
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  source: MerrillYextAdvisor
): Record<string, unknown> => {
  return withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      MERRILL_FIRM_ID,
      MERRILL_SOURCE_TYPE
    ),
    advisorId: advisor.id,
    firmId: MERRILL_FIRM_ID,
    branchId: branch.id,
    roleTitle: asString(source.c_jobTitle),
    startDate: asString(source.c_currentPositionStartDate),
    sourceType: MERRILL_SOURCE_TYPE,
    sourceRef: sourceUrl(source),
  });
};

const designationRows = (
  advisor: Record<string, unknown>,
  source: MerrillYextAdvisor
): ReadonlyArray<Record<string, unknown>> => {
  const certifications = asStringArray(source.certifications) ?? [];
  return certifications.map(certification =>
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
  source: MerrillYextAdvisor
): Record<string, unknown> | null => {
  const displayTeamName = source.c_displayTeamName;
  const name =
    typeof displayTeamName === "string" ? cleanText(displayTeamName) : "";
  if (!name) return null;
  return {
    id: teamId(name, MERRILL_FIRM_NAME),
    firmId: MERRILL_FIRM_ID,
    name,
    sourceType: MERRILL_SOURCE_TYPE,
    sourceRef: sourceUrl(source),
  };
};

const teamMembershipRow = (
  team: Record<string, unknown>,
  advisor: Record<string, unknown>
): Record<string, unknown> => ({
  id: teamMembershipId(String(team.id), String(advisor.id)),
  teamId: team.id,
  advisorId: advisor.id,
  role: "advisor",
});

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: MerrillYextAdvisor,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:merrill:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: MERRILL_SOURCE_TYPE,
  checkedAt,
  status: "success",
  sourcesChecked: [sourceUrl(source)].filter(Boolean),
  notes: "Imported from Merrill public advisor directory Yext feed.",
});

const displayName = (source: MerrillYextAdvisor): string => {
  return cleanText(String(source.c_marketingName ?? source.name ?? ""));
};

const languageValues = (
  source: MerrillYextAdvisor
): ReadonlyArray<string> | undefined => {
  const v2 = asStringArray(source.c_languagesV2);
  if (v2) return v2;
  if (!Array.isArray(source.c_language)) return undefined;
  return source.c_language
    .map(language => asString(asRecord(language)?.language))
    .filter((value): value is string => Boolean(value));
};

const imageUrl = (image: unknown): string | undefined => {
  const record = asRecord(image);
  if (!record) return undefined;
  return normalizeUrl(asString(record.url));
};

const sourceUrl = (source: MerrillYextAdvisor): string | undefined => {
  const websiteUrlRecord = asRecord(source.websiteUrl);
  const explicit = source.c_pagesURL ?? websiteUrlRecord?.url ?? source.website;
  if (typeof explicit === "string") return normalizeUrl(explicit);
  const slug = source.slug ? String(source.slug) : "";
  return slug ? `https://advisor.ml.com/${slug}` : undefined;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const asStringArray = (value: unknown): ReadonlyArray<string> | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
};

const isRecord = (value: unknown): value is YextAddress => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const asRecord = (value: unknown): YextAddress | undefined => {
  return isRecord(value) ? value : undefined;
};

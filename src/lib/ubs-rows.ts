import { advisorId, branchId, employmentHistoryId, uid } from "./ids.js";
import { canonicalFirmId } from "./firm-identity.js";
import {
  cleanText,
  normalizePhone,
  normalizeUrl,
  splitName,
  uniqueRows,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";
import type { UbsAddress, UbsAdvisorEntity, UbsRows } from "./ubs-types.js";

const ACTIVE_STATUS = "active";
const UBS_FIRM_NAME = "UBS Wealth Management USA";
const UBS_LEGAL_NAME = "UBS Financial Services Inc.";
const UBS_SOURCE_TYPE = "ubs_broadridge_presenter";
const UBS_LOCATOR_URL = "https://advisors.ubs.com/find-an-advisor/";
const UBS_FIRM_ID = canonicalFirmId(UBS_FIRM_NAME);

const EMPTY_ROWS: UbsRows = {
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
 * Maps UBS Broadridge Presenter advisor entities into Harper rows.
 * @param advisors - Individual profile entities returned by UBS search.
 * @param checkedAt - Date recorded on research-check rows.
 * @returns Deduplicated rows grouped by Harper table.
 */
export function mapUbsAdvisors(
  advisors: ReadonlyArray<UbsAdvisorEntity>,
  checkedAt = new Date().toISOString().slice(0, 10)
): UbsRows {
  return advisors
    .filter(source => Boolean(displayName(source)))
    .map(source => advisorRows(source, checkedAt))
    .reduce(mergeUbsRows, baseRows());
}

/**
 * Returns an empty UBS row bundle for scraper aggregation.
 * @returns Empty row arrays keyed by Harper table.
 */
export function emptyUbsRows(): UbsRows {
  return EMPTY_ROWS;
}

const mergeUbsRows = (left: UbsRows, right: UbsRows): UbsRows => ({
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

const baseRows = (): UbsRows => ({
  ...EMPTY_ROWS,
  Firm: [firmRow()],
});

const advisorRows = (source: UbsAdvisorEntity, checkedAt: string): UbsRows => {
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
  id: UBS_FIRM_ID,
  name: UBS_FIRM_NAME,
  legalName: UBS_LEGAL_NAME,
  channel: "wirehouse",
  subChannel: "UBS_Wealth_Management_USA",
  website: UBS_LOCATOR_URL,
});

const branchRow = (source: UbsAdvisorEntity): Record<string, unknown> => {
  const address = primaryAddress(source);
  const parentName = cleanText(
    String(source.AdditionalData?.ParentMarketingName ?? "")
  );
  return withoutEmpty({
    id: branchId(
      UBS_FIRM_NAME,
      "branch",
      source.AdditionalData?.ParentEntityId ??
        source.AdditionalData?.ParentSiteUrl ??
        addressKey(address)
    ),
    firmId: UBS_FIRM_ID,
    level: "branch",
    name:
      parentName ||
      [address?.City, address?.Region].filter(Boolean).join(", ") ||
      undefined,
    address: [address?.Address1, address?.Address2].filter(Boolean).join(", "),
    city: address?.City,
    state: address?.Region,
    country: address?.Country,
    postalCode: address?.PostalCode,
    sourceType: UBS_SOURCE_TYPE,
    sourceRef: branchUrl(source),
  });
};

const advisorRow = (source: UbsAdvisorEntity): Record<string, unknown> => {
  const legalName = displayName(source);
  const names =
    source.FirstName || source.LastName
      ? sourceNames(source)
      : splitName(legalName);
  const notes = [
    source.AdditionalData?.RankTitle,
    source.AdditionalData?.LinkedInUrl
      ? `LinkedIn: ${source.AdditionalData.LinkedInUrl}`
      : undefined,
    teamNote(source),
  ].filter(Boolean);
  return withoutEmpty({
    id: advisorId(
      legalName,
      String(
        source.AdditionalData?.EntityId ??
          source.ProfileId ??
          source.UniqueId ??
          ""
      )
    ),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: ACTIVE_STATUS,
    bioText: notes.length ? notes.join("\n") : undefined,
    businessEmail: firstCsv(source.AdditionalData?.Emails),
    businessPhone: normalizePhone(
      String(source.AdditionalData?.LocalNumber ?? "")
    ),
    piiLevel: "public",
  });
};

const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  source: UbsAdvisorEntity
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(String(advisor.id), UBS_FIRM_ID, UBS_SOURCE_TYPE),
    advisorId: advisor.id,
    firmId: UBS_FIRM_ID,
    branchId: branch.id,
    roleTitle: source.AdditionalData?.JobTitle ?? "Financial Advisor",
    sourceType: UBS_SOURCE_TYPE,
    sourceRef: profileUrl(source),
  });

const researchCheckRow = (
  advisor: Record<string, unknown>,
  source: UbsAdvisorEntity,
  checkedAt: string
): Record<string, unknown> => ({
  id: uid(`research-check:${advisor.id}:ubs:${checkedAt}`),
  advisorId: advisor.id,
  sourceType: UBS_SOURCE_TYPE,
  checkedAt,
  status: "success",
  sourcesChecked: [
    profileUrl(source),
    branchUrl(source),
    UBS_LOCATOR_URL,
  ].filter(Boolean),
  notes:
    "Imported from UBS public Broadridge Presenter advisor locator API. Team fields are retained in advisor notes for this first slice.",
});

const displayName = (source: UbsAdvisorEntity): string => {
  return cleanText(
    String(source.AdditionalData?.MarketingName ?? source.Company ?? "")
  );
};

const sourceNames = (
  source: UbsAdvisorEntity
): Readonly<
  Record<"firstName" | "middleName" | "lastName", string | undefined>
> => ({
  firstName: cleanText(String(source.FirstName ?? "")) || undefined,
  middleName: undefined,
  lastName: cleanText(String(source.LastName ?? "")) || undefined,
});

const primaryAddress = (source: UbsAdvisorEntity): UbsAddress | undefined => {
  return (
    source.Addresses?.find(address => address.AddressType === "Office") ??
    source.Addresses?.[0]
  );
};

const addressKey = (address: UbsAddress | undefined): string => {
  return [
    address?.Address1,
    address?.Address2,
    address?.City,
    address?.Region,
    address?.PostalCode,
  ]
    .filter(Boolean)
    .join(":");
};

const firstCsv = (value: string | null | undefined): string | undefined => {
  return cleanText(String(value ?? "").split(",")[0] ?? "") || undefined;
};

const profileUrl = (source: UbsAdvisorEntity): string | undefined => {
  const siteName = cleanText(String(source.AdditionalData?.SiteName ?? ""));
  return siteName ? `https://advisors.ubs.com/${siteName}/` : undefined;
};

const branchUrl = (source: UbsAdvisorEntity): string | undefined => {
  const value = source.AdditionalData?.ParentSiteUrl;
  if (!value) return undefined;
  return normalizeUrl(
    String(value).startsWith("//") ? `https:${value}` : String(value)
  );
};

const teamNote = (source: UbsAdvisorEntity): string | undefined => {
  const names = listValue(source.AdditionalData?.TeamSiteNames);
  const urls = listValue(source.AdditionalData?.TeamSiteUrls);
  return names.length || urls.length
    ? `Team fields: ${[names.join(", "), urls.join(", ")].filter(Boolean).join(" | ")}`
    : undefined;
};

const listValue = (
  value: string | readonly string[] | null | undefined
): readonly string[] => {
  if (Array.isArray(value))
    return value.map(String).map(cleanText).filter(Boolean);
  return String(value ?? "")
    .split(/[!,]/u)
    .map(cleanText)
    .filter(Boolean);
};

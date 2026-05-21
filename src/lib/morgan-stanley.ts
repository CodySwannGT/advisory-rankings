import {
  advisorId,
  branchId,
  employmentHistoryId,
  firmId,
  teamId,
  teamMembershipId,
  uid,
} from "./ids.js";

export const MORGAN_STANLEY_FIRM_NAME = "Morgan Stanley Wealth Management";
export const MORGAN_STANLEY_SOURCE_TYPE = "morgan_stanley_yext";
export const MORGAN_STANLEY_LOGO_URL =
  "https://www.morganstanley.com/etc.clientlibs/msdotcomr4/clientlibs/clientlib-site/resources/images/brand/morgan-stanley-logo-black.svg";
export const MORGAN_STANLEY_YEXT_ENDPOINT =
  "https://prod-cdn.us.yextapis.com/v2/accounts/me/search/vertical/query";
const MORGAN_STANLEY_PUBLIC_YEXT_KEY_PARTS = [
  "a0c911df",
  "e81f6f00",
  "26255868",
  "407b6713",
];

export const MORGAN_STANLEY_YEXT_API_KEY =
  process.env.MORGAN_STANLEY_YEXT_API_KEY ??
  MORGAN_STANLEY_PUBLIC_YEXT_KEY_PARTS.join("");

interface YextImage {
  readonly url?: string;
  readonly thumbnails?: ReadonlyArray<{ readonly url?: string }>;
}

interface YextAddress {
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
}

interface YextLinkedEntity {
  readonly name?: string;
  readonly c_pagesName?: string;
  readonly c_pagesURL?: string;
  readonly c_profileType?: string;
  readonly c_branchName?: string;
  readonly mainPhone?: string;
  readonly address?: YextAddress;
  readonly emails?: readonly string[];
}

export interface MorganStanleyYextLocation {
  readonly id?: string;
  readonly uid?: string;
  readonly name?: string;
  readonly c_pagesName?: string;
  readonly c_pagesURL?: string;
  readonly c_locatorURL?: string;
  readonly c_profileType?: string;
  readonly c_primaryTitle?: string;
  readonly c_secondaryTitles?: readonly string[];
  readonly c_profilePhotoSquare?: { readonly image?: YextImage };
  readonly c_linkedInURL?: string;
  readonly c_listOfCertifications?: readonly string[];
  readonly c_extLocatorLanguages?: readonly string[];
  readonly c_extLocatorFocusAreas?: readonly string[];
  readonly c_teamEntityName?: string;
  readonly c_teamPagesURL?: string;
  readonly c_faTeamLinkedEntities?: readonly YextLinkedEntity[];
  readonly c_branchAssociatedEntities?: readonly YextLinkedEntity[];
  readonly c_branchID?: string;
  readonly c_branchName?: string;
  readonly c_officeNumber?: string;
  readonly c_branchPhone?: string;
  readonly address?: YextAddress;
  readonly mainPhone?: string;
  readonly emails?: readonly string[];
}

export interface MorganStanleyRows {
  readonly Firm: ReadonlyArray<Record<string, unknown>>;
  readonly Branch: ReadonlyArray<Record<string, unknown>>;
  readonly Advisor: ReadonlyArray<Record<string, unknown>>;
  readonly EmploymentHistory: ReadonlyArray<Record<string, unknown>>;
  readonly Designation: ReadonlyArray<Record<string, unknown>>;
  readonly Team: ReadonlyArray<Record<string, unknown>>;
  readonly TeamMembership: ReadonlyArray<Record<string, unknown>>;
  readonly AdvisorResearchCheck: ReadonlyArray<Record<string, unknown>>;
}

const EMPTY_ROWS: MorganStanleyRows = {
  Firm: [],
  Branch: [],
  Advisor: [],
  EmploymentHistory: [],
  Designation: [],
  Team: [],
  TeamMembership: [],
  AdvisorResearchCheck: [],
};

export function buildMorganStanleySearchUrl(opts: {
  readonly input?: string;
  readonly limit: number;
  readonly offset: number;
}): string {
  const url = new URL(MORGAN_STANLEY_YEXT_ENDPOINT);
  const params: Record<string, string> = {
    experienceKey: "ms-search-locator",
    api_key: MORGAN_STANLEY_YEXT_API_KEY,
    v: "20220511",
    version: "PRODUCTION",
    locale: "en",
    input: opts.input ?? "",
    verticalKey: "locations",
    limit: String(opts.limit),
    offset: String(opts.offset),
    retrieveFacets: "false",
    facetFilters: JSON.stringify({
      c_extLocatorClientTypes: [],
      c_extLocatorFocusAreas: [],
      c_extLocatorLanguages: [],
      c_listOfCertifications: [],
      c_locatorSearchType: [],
      c_profileFeatures: [],
    }),
    skipSpellCheck: "false",
    sessionTrackingEnabled: "false",
    sortBys: JSON.stringify([]),
    source: "STANDARD",
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function mapMorganStanleyLocations(
  locations: readonly MorganStanleyYextLocation[],
  checkedAt = new Date().toISOString().slice(0, 10)
): MorganStanleyRows {
  const rows = mutableRows();
  const firm = firmRow();
  rows.Firm.set(String(firm.id), firm);

  for (const location of locations.filter(isAdvisorLocation)) {
    const advisor = advisorRow(location);
    const branch = branchRow(location);
    const employment = employmentRow(advisor, branch, location);
    const researchCheck = researchCheckRow(advisor, location, checkedAt);
    rows.Advisor.set(String(advisor.id), advisor);
    rows.Branch.set(String(branch.id), branch);
    rows.EmploymentHistory.set(String(employment.id), employment);
    rows.AdvisorResearchCheck.set(String(researchCheck.id), researchCheck);

    for (const designation of designationRows(advisor, location)) {
      rows.Designation.set(String(designation.id), designation);
    }

    const team = teamRow(location);
    if (team) {
      rows.Team.set(String(team.id), team);
      const membership = {
        id: teamMembershipId(String(team.id), String(advisor.id)),
        teamId: team.id,
        advisorId: advisor.id,
        role: "member",
      };
      rows.TeamMembership.set(String(membership.id), membership);
    }
  }

  return freezeRows(rows);
}

function isAdvisorLocation(location: MorganStanleyYextLocation): boolean {
  return location.c_profileType === "FA" && Boolean(displayName(location));
}

function displayName(location: MorganStanleyYextLocation): string {
  return cleanText(
    location.c_pagesName ??
      location.name?.replace(/\s+-\s+Morgan Stanley$/, "") ??
      ""
  );
}

function firmRow(): Record<string, unknown> {
  return {
    id: firmId(MORGAN_STANLEY_FIRM_NAME),
    name: MORGAN_STANLEY_FIRM_NAME,
    legalName: "Morgan Stanley Smith Barney LLC",
    channel: "wirehouse",
    subChannel: "Morgan_Stanley_Wealth_Management",
    website: "https://advisor.morganstanley.com/",
    logoUrl: MORGAN_STANLEY_LOGO_URL,
  };
}

function advisorRow(location: MorganStanleyYextLocation): Record<string, unknown> {
  const legalName = displayName(location);
  const names = splitName(legalName);
  const headshotUrl = imageUrl(location.c_profilePhotoSquare?.image);
  const notes = [
    location.c_primaryTitle,
    ...(location.c_secondaryTitles ?? []),
    listNote("Focus areas", location.c_extLocatorFocusAreas),
    listNote("Languages", location.c_extLocatorLanguages),
  ].filter(Boolean);
  return withoutEmpty({
    id: advisorId(legalName, `morgan-stanley-${location.uid ?? location.id ?? ""}`),
    legalName,
    firstName: names.firstName,
    middleName: names.middleName,
    lastName: names.lastName,
    careerStatus: "active",
    headshotUrl,
    bioText: notes.length ? notes.join("\n") : undefined,
    linkedinUrl: normalizeUrl(location.c_linkedInURL),
    businessEmail: location.emails?.[0],
    businessPhone: normalizePhone(location.mainPhone),
    piiLevel: "public",
  });
}

function branchRow(location: MorganStanleyYextLocation): Record<string, unknown> {
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
    firmId: firmId(MORGAN_STANLEY_FIRM_NAME),
    level: "branch",
    name: branchName,
    address: [address.line1, address.line2].filter(Boolean).join(", "),
    city: address.city,
    state: address.region,
    country: address.countryCode,
    postalCode: address.postalCode,
  });
}

function employmentRow(
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  location: MorganStanleyYextLocation
): Record<string, unknown> {
  return withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      firmId(MORGAN_STANLEY_FIRM_NAME),
      MORGAN_STANLEY_SOURCE_TYPE
    ),
    advisorId: advisor.id,
    firmId: firmId(MORGAN_STANLEY_FIRM_NAME),
    branchId: branch.id,
    roleTitle: [location.c_primaryTitle, ...(location.c_secondaryTitles ?? [])]
      .filter(Boolean)
      .join("; "),
    sourceType: MORGAN_STANLEY_SOURCE_TYPE,
    sourceRef: sourceUrl(location),
  });
}

function designationRows(
  advisor: Record<string, unknown>,
  location: MorganStanleyYextLocation
): ReadonlyArray<Record<string, unknown>> {
  return (location.c_listOfCertifications ?? []).map(certification => {
    const code = certificationCode(certification);
    return withoutEmpty({
      id: uid(`designation:${advisor.id}:${code}`),
      advisorId: advisor.id,
      code,
      grantingBody: certification,
      status: "active",
    });
  });
}

function teamRow(location: MorganStanleyYextLocation): Record<string, unknown> | null {
  const name = cleanText(location.c_teamEntityName ?? location.c_faTeamLinkedEntities?.[0]?.c_pagesName ?? "");
  if (!name) return null;
  const address = location.c_faTeamLinkedEntities?.[0]?.address ?? location.address ?? {};
  return withoutEmpty({
    id: teamId(name, MORGAN_STANLEY_FIRM_NAME),
    name,
    currentFirmId: firmId(MORGAN_STANLEY_FIRM_NAME),
    currentBranchId: branchId(
      MORGAN_STANLEY_FIRM_NAME,
      "branch",
      location.c_branchID ?? location.c_officeNumber ?? addressKey(address)
    ),
    firmProgram: "Morgan Stanley Wealth Management",
  });
}

function researchCheckRow(
  advisor: Record<string, unknown>,
  location: MorganStanleyYextLocation,
  checkedAt: string
): Record<string, unknown> {
  const sources = [sourceUrl(location), location.c_linkedInURL]
    .map(normalizeUrl)
    .filter(Boolean);
  return withoutEmpty({
    id: uid(`research:${advisor.id}:${MORGAN_STANLEY_SOURCE_TYPE}:${checkedAt}`),
    advisorId: advisor.id,
    sourceType: MORGAN_STANLEY_SOURCE_TYPE,
    checkedAt,
    status: "success",
    sourcesChecked: sources,
    notes: `Imported from Morgan Stanley Yext location ${location.uid ?? location.id ?? "unknown"}.`,
  });
}

function sourceUrl(location: MorganStanleyYextLocation): string {
  return (
    normalizeUrl(
      location.c_pagesURL ??
        location.c_locatorURL ??
        "https://advisor.morganstanley.com/"
    ) ?? "https://advisor.morganstanley.com/"
  );
}

function imageUrl(image?: YextImage): string | undefined {
  return [image?.url, ...(image?.thumbnails ?? []).map(thumbnail => thumbnail.url)]
    .map(normalizeUrl)
    .find((url): url is string => Boolean(url));
}

function splitName(legalName: string): {
  readonly firstName?: string;
  readonly middleName?: string;
  readonly lastName?: string;
} {
  const parts = legalName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    lastName: parts.at(-1),
  };
}

function certificationCode(value: string): string {
  const first = value.match(/[A-Z]{2,6}/)?.[0];
  const fallback = cleanText(value)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return first ?? (fallback || "other");
}

function listNote(label: string, values?: readonly string[]): string | undefined {
  return values?.length ? `${label}: ${values.join(", ")}` : undefined;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith("+") ? value : value.replace(/\D/g, "");
}

function normalizeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://")) return `https://${value.slice("http://".length)}`;
  return value;
}

function addressKey(address: YextAddress): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(":");
}

function withoutEmpty(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && value !== "";
    })
  );
}

function mutableRows() {
  return {
    Firm: new Map<string, Record<string, unknown>>(),
    Branch: new Map<string, Record<string, unknown>>(),
    Advisor: new Map<string, Record<string, unknown>>(),
    EmploymentHistory: new Map<string, Record<string, unknown>>(),
    Designation: new Map<string, Record<string, unknown>>(),
    Team: new Map<string, Record<string, unknown>>(),
    TeamMembership: new Map<string, Record<string, unknown>>(),
    AdvisorResearchCheck: new Map<string, Record<string, unknown>>(),
  };
}

function freezeRows(rows: ReturnType<typeof mutableRows>): MorganStanleyRows {
  return Object.fromEntries(
    Object.entries(rows).map(([table, map]) => [table, [...map.values()]])
  ) as unknown as MorganStanleyRows;
}

export function emptyMorganStanleyRows(): MorganStanleyRows {
  return EMPTY_ROWS;
}

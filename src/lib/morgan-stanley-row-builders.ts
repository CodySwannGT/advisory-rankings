import {
  advisorId,
  branchId,
  employmentHistoryId,
  teamId,
  teamMembershipId,
  uid,
} from "./ids.js";
import type {
  MorganStanleyAddressView,
  MorganStanleyImageView,
  MorganStanleyLocationView,
} from "./morgan-stanley-location-view.js";
import {
  addressKey,
  certificationCode,
  cleanText,
  listNote,
  normalizePhone,
  normalizeUrl,
  splitName,
  withoutEmpty,
} from "./morgan-stanley-row-utils.js";

const ACTIVE_STATUS = "active";
const ADVISOR_PROFILE_SUFFIX = " - Morgan Stanley";

/**
 * Constants describing the Morgan Stanley source bound to the row builders.
 */
export interface MorganStanleyBuilderConfig {
  readonly firmId: string;
  readonly firmName: string;
  readonly programName: string;
  readonly sourceType: string;
  readonly advisorUrl: string;
}

/**
 * Returns the display name for a Morgan Stanley advisor location, stripping
 * the canonical " - Morgan Stanley" suffix used by Yext rows.
 * @param location - Typed view of the Yext location.
 * @returns Cleaned advisor display name.
 */
const displayName = (location: MorganStanleyLocationView): string => {
  const name = location.c_pagesName ?? location.name ?? "";
  return cleanText(
    name.endsWith(ADVISOR_PROFILE_SUFFIX)
      ? name.slice(0, -ADVISOR_PROFILE_SUFFIX.length)
      : name
  );
};

/**
 * Returns true when the Yext location represents an advisor profile.
 * @param location - Typed view of the Yext location.
 * @returns Whether the location is an advisor profile with a usable name.
 */
export const isAdvisorLocation = (
  location: MorganStanleyLocationView
): boolean => location.c_profileType === "FA" && Boolean(displayName(location));

/**
 * Returns the best advisor source URL for a Morgan Stanley Yext row,
 * normalizing the protocol and falling back to the firm-wide landing page.
 * @param location - Typed view of the Yext location.
 * @param fallback - Firm-wide advisor URL used when no row-level URL exists.
 * @returns Normalized URL suitable for storage in source-of-truth columns.
 */
const sourceUrl = (
  location: MorganStanleyLocationView,
  fallback: string
): string =>
  normalizeUrl(location.c_pagesURL ?? location.c_locatorURL ?? fallback) ??
  fallback;

/**
 * Picks the first non-empty image URL from a Morgan Stanley profile photo.
 * @param image - Optional image entry with primary URL and thumbnails.
 * @returns First normalizable URL or undefined when none are populated.
 */
const imageUrl = (image?: MorganStanleyImageView): string | undefined =>
  [image?.url, ...(image?.thumbnails ?? []).map(thumbnail => thumbnail.url)]
    .map(normalizeUrl)
    .find((url): url is string => Boolean(url));

/**
 * Builds the Harper Advisor row for a Morgan Stanley Yext location.
 * @param location - Typed view of the Yext location.
 * @returns Advisor row keyed by canonical advisor ID.
 */
export const advisorRow = (
  location: MorganStanleyLocationView
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

/**
 * Builds the Harper Branch row for a Morgan Stanley Yext location.
 * @param location - Typed view of the Yext location.
 * @param config - Builder configuration tying rows to firm identity.
 * @returns Branch row keyed by canonical branch ID.
 */
export const branchRow = (
  location: MorganStanleyLocationView,
  config: MorganStanleyBuilderConfig
): Record<string, unknown> => {
  const address: MorganStanleyAddressView = location.address ?? {};
  const branchName = cleanText(
    location.c_branchName ??
      location.c_branchAssociatedEntities?.[0]?.c_branchName ??
      "Morgan Stanley"
  );
  return withoutEmpty({
    id: branchId(
      config.firmName,
      "branch",
      location.c_branchID ??
        location.c_officeNumber ??
        addressKey({ ...address })
    ),
    firmId: config.firmId,
    level: "branch",
    name: branchName,
    address: [address.line1, address.line2].filter(Boolean).join(", "),
    city: address.city,
    state: address.region,
    country: address.countryCode,
    postalCode: address.postalCode,
  });
};

/**
 * Builds the Harper EmploymentHistory row for a Morgan Stanley advisor.
 * @param advisor - Advisor row whose ID anchors the employment record.
 * @param branch - Branch row whose ID anchors the employment record.
 * @param location - Typed view of the Yext location.
 * @param config - Builder configuration tying rows to firm identity.
 * @returns EmploymentHistory row keyed by canonical employment-history ID.
 */
export const employmentRow = (
  advisor: Record<string, unknown>,
  branch: Record<string, unknown>,
  location: MorganStanleyLocationView,
  config: MorganStanleyBuilderConfig
): Record<string, unknown> =>
  withoutEmpty({
    id: employmentHistoryId(
      String(advisor.id),
      config.firmId,
      config.sourceType
    ),
    advisorId: advisor.id,
    firmId: config.firmId,
    branchId: branch.id,
    roleTitle: [location.c_primaryTitle, ...(location.c_secondaryTitles ?? [])]
      .filter(Boolean)
      .join("; "),
    sourceType: config.sourceType,
    sourceRef: sourceUrl(location, config.advisorUrl),
  });

/**
 * Builds the Harper Designation rows for a Morgan Stanley advisor.
 * @param advisor - Advisor row whose ID anchors each designation.
 * @param location - Typed view of the Yext location.
 * @returns Zero or more designation rows.
 */
export const designationRows = (
  advisor: Record<string, unknown>,
  location: MorganStanleyLocationView
): ReadonlyArray<Record<string, unknown>> =>
  (location.c_listOfCertifications ?? []).map(certification =>
    withoutEmpty({
      id: uid(`designation:${advisor.id}:${certificationCode(certification)}`),
      advisorId: advisor.id,
      code: certificationCode(certification),
      grantingBody: certification,
      status: ACTIVE_STATUS,
    })
  );

/**
 * Builds the Harper Team row for a Morgan Stanley advisor when team metadata
 * is present, otherwise returns null.
 * @param location - Typed view of the Yext location.
 * @param config - Builder configuration tying rows to firm identity.
 * @returns Team row or null when no team is associated.
 */
export const teamRow = (
  location: MorganStanleyLocationView,
  config: MorganStanleyBuilderConfig
): Record<string, unknown> | null => {
  const name = cleanText(
    location.c_teamEntityName ??
      location.c_faTeamLinkedEntities?.[0]?.c_pagesName ??
      ""
  );
  const address: MorganStanleyAddressView =
    location.c_faTeamLinkedEntities?.[0]?.address ?? location.address ?? {};
  return name
    ? withoutEmpty({
        id: teamId(name, config.firmName),
        name,
        currentFirmId: config.firmId,
        currentBranchId: branchId(
          config.firmName,
          "branch",
          location.c_branchID ??
            location.c_officeNumber ??
            addressKey({ ...address })
        ),
        firmProgram: config.programName,
      })
    : null;
};

/**
 * Builds the Harper TeamMembership row linking an advisor to a team.
 * @param team - Team row whose ID anchors the membership.
 * @param advisor - Advisor row whose ID anchors the membership.
 * @returns TeamMembership row.
 */
export const teamMembershipRow = (
  team: Record<string, unknown>,
  advisor: Record<string, unknown>
): Record<string, unknown> => ({
  id: teamMembershipId(String(team.id), String(advisor.id)),
  teamId: team.id,
  advisorId: advisor.id,
  role: "member",
});

/**
 * Builds the Harper AdvisorResearchCheck row recording the import of a
 * Morgan Stanley advisor from the Yext locator.
 * @param advisor - Advisor row whose ID anchors the research check.
 * @param location - Typed view of the Yext location.
 * @param checkedAt - ISO date recorded on the research check row.
 * @param config - Builder configuration tying rows to firm identity.
 * @returns AdvisorResearchCheck row.
 */
export const researchCheckRow = (
  advisor: Record<string, unknown>,
  location: MorganStanleyLocationView,
  checkedAt: string,
  config: MorganStanleyBuilderConfig
): Record<string, unknown> => {
  const sources = [
    sourceUrl(location, config.advisorUrl),
    location.c_linkedInURL,
  ]
    .map(normalizeUrl)
    .filter(Boolean);
  return withoutEmpty({
    id: uid(`research:${advisor.id}:${config.sourceType}:${checkedAt}`),
    advisorId: advisor.id,
    sourceType: config.sourceType,
    checkedAt,
    status: "success",
    sourcesChecked: sources,
    notes: `Imported from Morgan Stanley Yext location ${location.uid ?? location.id ?? "unknown"}.`,
  });
};

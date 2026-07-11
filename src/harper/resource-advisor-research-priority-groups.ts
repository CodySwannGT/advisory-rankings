import type { AdvisorResearchQueueItem } from "./resource-advisor-research-items.js";

export const NEVER_CHECKED_STATUS = "never_checked";

const PRIORITY_REPRESENTATIVE_LIMIT = 3;
const CONTACT_FIELDS = [
  "businessEmail",
  "businessPhone",
  "linkedinUrl",
] as const;
const PROFILE_SUBSTANCE_FIELDS = ["bioText", "headshotUrl"] as const;

/** Normalized queue filters needed to replay a priority group. */
export interface AdvisorResearchQueuePriorityInputFilters {
  readonly sourceType: string;
  readonly staleDays: number;
  readonly limit: number;
}

/** Stable identifier for one operator-facing research priority group. */
export type AdvisorResearchQueuePriorityGroupId =
  | "missing_contact_data"
  | "missing_profile_substance"
  | "stale_checked_profiles"
  | "never_checked_profiles";

/** Deterministic query mapping for replaying one priority group. */
export interface AdvisorResearchQueuePriorityGroupFilters {
  readonly sourceType: string;
  readonly staleDays: number;
  readonly status: string | null;
  readonly missingField: string | null;
  readonly limit: number;
}

/** One public-safe operator priority group for the returned queue slice. */
export interface AdvisorResearchQueuePriorityGroup {
  readonly id: AdvisorResearchQueuePriorityGroupId;
  readonly label: string;
  readonly count: number;
  readonly filters: AdvisorResearchQueuePriorityGroupFilters;
  readonly representativeAdvisorIds: ReadonlyArray<string>;
}

/** Status counts for due research rows in the current filtered slice. */
type AdvisorResearchQueueStatusCounts = Readonly<Record<string, number>>;

/**
 * Builds the public-safe priority groups for the returned queue slice.
 * @param items - Queue items.
 * @param filters - Active normalized filters.
 * @returns Fixed-order priority groups with deterministic filter mappings.
 */
export function priorityGroups(
  items: ReadonlyArray<AdvisorResearchQueueItem>,
  filters: AdvisorResearchQueuePriorityInputFilters
): ReadonlyArray<AdvisorResearchQueuePriorityGroup> {
  const contactItems = items.filter(item =>
    hasAnyMissingField(item, CONTACT_FIELDS)
  );
  const profileItems = items.filter(item =>
    hasAnyMissingField(item, PROFILE_SUBSTANCE_FIELDS)
  );
  const checkedItemsByStatus = splitItemsByCheckStatus(items);

  return buildPriorityGroups(
    checkedItemsByStatus,
    contactItems,
    filters,
    profileItems
  );
}

/**
 * Builds the fixed priority group order from pre-filtered queue slices.
 * @param checkedItemsByStatus - Stale and never-checked queue slices.
 * @param contactItems - Queue items missing contact fields.
 * @param filters - Active normalized filters.
 * @param profileItems - Queue items missing profile substance fields.
 * @returns Fixed-order priority groups.
 */
function buildPriorityGroups(
  checkedItemsByStatus: ReturnType<typeof splitItemsByCheckStatus>,
  contactItems: ReadonlyArray<AdvisorResearchQueueItem>,
  filters: AdvisorResearchQueuePriorityInputFilters,
  profileItems: ReadonlyArray<AdvisorResearchQueueItem>
): ReadonlyArray<AdvisorResearchQueuePriorityGroup> {
  return [
    priorityGroup(
      "missing_contact_data",
      "Missing contact data",
      contactItems,
      filters,
      primaryMissingField(contactItems, CONTACT_FIELDS),
      null
    ),
    priorityGroup(
      "missing_profile_substance",
      "Missing profile substance",
      profileItems,
      filters,
      primaryMissingField(profileItems, PROFILE_SUBSTANCE_FIELDS),
      null
    ),
    priorityGroup(
      "stale_checked_profiles",
      "Stale checked profiles",
      checkedItemsByStatus.stale,
      filters,
      null,
      primaryStatus(checkedItemsByStatus.stale)
    ),
    priorityGroup(
      "never_checked_profiles",
      "Never-checked profiles",
      checkedItemsByStatus.never,
      filters,
      null,
      NEVER_CHECKED_STATUS
    ),
  ];
}

/**
 * Splits queued items into checked and never-checked slices for priority summaries.
 * @param items - Queue items.
 * @returns Items keyed by check-status bucket.
 */
function splitItemsByCheckStatus(
  items: ReadonlyArray<AdvisorResearchQueueItem>
) {
  return {
    stale: items.filter(item => item.status !== null),
    never: items.filter(item => item.status === null),
  };
}

/**
 * Counts latest-check statuses in the returned slice.
 * @param items - Queue items.
 * @returns Counts keyed by status label.
 */
export function countStatuses(
  items: ReadonlyArray<AdvisorResearchQueueItem>
): AdvisorResearchQueueStatusCounts {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = item.status ?? NEVER_CHECKED_STATUS;
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
}

/**
 * Builds one priority group.
 * @param id - Stable group id.
 * @param label - Human-readable group label.
 * @param items - Items matching this group.
 * @param filters - Active normalized filters.
 * @param missingField - Replay missing-field filter.
 * @param status - Replay status filter.
 * @returns Priority group summary.
 */
function priorityGroup(
  id: AdvisorResearchQueuePriorityGroupId,
  label: string,
  items: ReadonlyArray<AdvisorResearchQueueItem>,
  filters: AdvisorResearchQueuePriorityInputFilters,
  missingField: string | null,
  status: string | null
): AdvisorResearchQueuePriorityGroup {
  return {
    id,
    label,
    count: items.length,
    filters: {
      sourceType: filters.sourceType,
      staleDays: filters.staleDays,
      status,
      missingField,
      limit: filters.limit,
    },
    representativeAdvisorIds: items
      .slice(0, PRIORITY_REPRESENTATIVE_LIMIT)
      .map(item => item.advisorId),
  };
}

/**
 * Tests whether an item is missing any field from a field group.
 * @param item - Queue item.
 * @param fields - Missing fields that define the group.
 * @returns True when at least one group field is missing.
 */
function hasAnyMissingField(
  item: AdvisorResearchQueueItem,
  fields: ReadonlyArray<string>
): boolean {
  return fields.some(field => item.missingFields.includes(field));
}

/**
 * Chooses a deterministic missing-field filter for replaying a group.
 * @param items - Items matching the group.
 * @param fields - Candidate fields in priority order.
 * @returns First present candidate field or null for an empty group.
 */
function primaryMissingField(
  items: ReadonlyArray<AdvisorResearchQueueItem>,
  fields: ReadonlyArray<string>
): string | null {
  return fields.find(field => hasMissingField(items, field)) ?? null;
}

/**
 * Tests whether any item is missing one field.
 * @param items - Queue items.
 * @param field - Missing field to find.
 * @returns True when a queued row is missing the field.
 */
function hasMissingField(
  items: ReadonlyArray<AdvisorResearchQueueItem>,
  field: string
): boolean {
  return items.some(item => item.missingFields.includes(field));
}

/**
 * Chooses a deterministic status filter for checked-profile replay.
 * @param items - Checked queue rows.
 * @returns Most common status, then alphabetically first on ties.
 */
function primaryStatus(
  items: ReadonlyArray<AdvisorResearchQueueItem>
): string | null {
  return (
    Object.entries(countStatuses(items))
      .filter(([status]) => status !== NEVER_CHECKED_STATUS)
      .sort(
        ([leftStatus, leftCount], [rightStatus, rightCount]) =>
          rightCount - leftCount || leftStatus.localeCompare(rightStatus)
      )[0]?.[0] ?? null
  );
}

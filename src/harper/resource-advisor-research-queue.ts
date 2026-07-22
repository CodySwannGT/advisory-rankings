import {
  selectDueAdvisors,
  type AdvisorResearchAdvisor,
  type AdvisorResearchCheck,
} from "../lib/advisor-research-select.js";
import type { RouteTarget } from "../types/harper-resource.js";
import type {
  AdvisorResearchCheckRow,
  AdvisorRow,
} from "../types/harper-schema.js";
import { loadAll } from "./resource-data.js";
import {
  dateString,
  queueItem,
  type AdvisorResearchQueueItem,
} from "./resource-advisor-research-items.js";
import {
  countStatuses,
  NEVER_CHECKED_STATUS,
  priorityGroups,
  type AdvisorResearchQueuePriorityGroup,
} from "./resource-advisor-research-priority-groups.js";
import {
  boundedNumber,
  readQuery,
} from "./resource-recruiting-market-utils.js";

const DEFAULT_SOURCE_TYPE = "web_research";
const DEFAULT_STALE_DAYS = 30;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Status counts for due research rows in the current filtered slice. */
export type AdvisorResearchQueueStatusCounts = Readonly<Record<string, number>>;

/** Echoed queue filters after normalization and bounds. */
export interface AdvisorResearchQueueResponseFilters {
  readonly sourceType: string;
  readonly staleDays: number;
  readonly status: string | null;
  readonly missingField: string | null;
  readonly limit: number;
}

/** Aggregate counts for the returned due queue slice. */
export interface AdvisorResearchQueueSummary {
  readonly totalDue: number;
  readonly returned: number;
  readonly statusCounts: AdvisorResearchQueueStatusCounts;
  readonly missingFieldCounts: Readonly<Record<string, number>>;
  readonly priorityGroups: ReadonlyArray<AdvisorResearchQueuePriorityGroup>;
}

/** Response envelope returned by the due research queue resource. */
export interface AdvisorResearchQueueResponse {
  readonly generatedAt: string;
  readonly filters: AdvisorResearchQueueResponseFilters;
  readonly summary: AdvisorResearchQueueSummary;
  readonly items: ReadonlyArray<AdvisorResearchQueueItem>;
}

/** Harper resource exposing the public-safe advisor research due queue. */
export class AdvisorResearchQueue extends Resource {
  /**
   * Keeps research freshness public: rows expose public advisor identity,
   * source-check status, and missing public profile fields only.
   * @returns True because no private user or analyst workflow rows are loaded.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Reads advisors due for public-web research.
   * @param target - Optional request target carrying query filters.
   * @returns Due research queue payload.
   */
  async get(target?: RouteTarget): Promise<AdvisorResearchQueueResponse> {
    const db = await loadAll();
    return advisorResearchQueueResponse(db, target);
  }
}

/**
 * Builds the public-safe advisor research queue response from preloaded rows.
 * @param db - Shared Harper resource index.
 * @param target - Optional request target carrying query filters.
 * @returns Due research queue payload.
 */
export function advisorResearchQueueResponse(
  db: Awaited<ReturnType<typeof loadAll>>,
  target?: RouteTarget
): AdvisorResearchQueueResponse {
  const filters = parseFilters(target);
  const due = selectDueAdvisors(
    db.advisors.map(toResearchAdvisor),
    db.researchChecks.map(toResearchCheck),
    dueAdvisorOptions(filters, db.advisors.length)
  );
  const filtered = due
    .filter(row => matchesStatus(row.lastCheck, filters.status))
    .filter(row => matchesMissingField(row.missingFields, filters.missingField))
    .slice(0, filters.limit);
  const items = filtered.map(row =>
    queueItem(
      row.advisor,
      row.lastCheck,
      row.missingFields,
      filters.sourceType,
      db
    )
  );
  return {
    generatedAt: new Date().toISOString(),
    filters,
    summary: {
      totalDue: due.length,
      returned: items.length,
      statusCounts: countStatuses(items),
      missingFieldCounts: countMissingFields(items),
      priorityGroups: priorityGroups(items, filters),
    },
    items,
  };
}

/**
 * Builds due-advisor selector options from already-normalized queue filters.
 * @param filters - Normalized queue filters.
 * @param advisorCount - Total advisors available for due selection.
 * @returns Selector options for due advisor ordering.
 */
function dueAdvisorOptions(
  filters: AdvisorResearchQueueResponseFilters,
  advisorCount: number
) {
  return {
    max: Math.max(filters.limit, advisorCount),
    staleDays: filters.staleDays,
    sourceType: filters.sourceType,
  };
}

/** Parsed URL filters for the queue resource. */
interface AdvisorResearchQueueFilters {
  readonly sourceType: string;
  readonly staleDays: number;
  readonly status: string | null;
  readonly missingField: string | null;
  readonly limit: number;
}

/**
 * Parses URL filters while keeping the resource bounded.
 * @param target - Harper request target.
 * @returns Normalized queue filters.
 */
function parseFilters(
  target: RouteTarget | undefined
): AdvisorResearchQueueFilters {
  return {
    sourceType: clean(readQuery(target, "sourceType")) ?? DEFAULT_SOURCE_TYPE,
    staleDays: boundedNumber(
      readQuery(target, "staleDays"),
      DEFAULT_STALE_DAYS,
      1,
      3650
    ),
    status: clean(readQuery(target, "status")),
    missingField: clean(readQuery(target, "missingField")),
    limit: boundedNumber(
      readQuery(target, "limit"),
      DEFAULT_LIMIT,
      1,
      MAX_LIMIT
    ),
  };
}

/**
 * Converts empty values to null and trims non-empty filters.
 * @param value - Raw query value.
 * @returns Trimmed string or null.
 */
function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

/**
 * Narrows an Advisor row to the selector's public research shape.
 * @param advisor - Source row.
 * @returns Selector-compatible advisor row.
 */
function toResearchAdvisor(advisor: AdvisorRow): AdvisorResearchAdvisor {
  return advisor;
}

/**
 * Converts Harper date values to the selector's string-based check shape.
 * @param check - Source row.
 * @returns Selector-compatible research check.
 */
function toResearchCheck(check: AdvisorResearchCheckRow): AdvisorResearchCheck {
  return {
    ...check,
    checkedAt: dateString(check.checkedAt) ?? "",
    nextCheckAfter: dateString(check.nextCheckAfter) ?? undefined,
  };
}

/**
 * Applies the optional status filter to latest-check rows.
 * @param check - Latest check row.
 * @param status - Desired status.
 * @returns True when the row should remain.
 */
function matchesStatus(
  check: AdvisorResearchCheck | null,
  status: string | null
): boolean {
  if (status === NEVER_CHECKED_STATUS) return !check;
  return !status || check?.status === status;
}

/**
 * Applies the optional missing-field filter.
 * @param missingFields - Missing fields for one advisor.
 * @param missingField - Desired missing field.
 * @returns True when the row should remain.
 */
function matchesMissingField(
  missingFields: ReadonlyArray<string>,
  missingField: string | null
): boolean {
  return !missingField || missingFields.includes(missingField);
}

/**
 * Counts missing public-web fields in the returned slice.
 * @param items - Queue items.
 * @returns Counts keyed by field name.
 */
function countMissingFields(
  items: ReadonlyArray<AdvisorResearchQueueItem>
): Readonly<Record<string, number>> {
  return items
    .flatMap(item => item.missingFields)
    .reduce<
      Record<string, number>
    >((acc, field) => ({ ...acc, [field]: (acc[field] ?? 0) + 1 }), {});
}

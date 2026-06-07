import {
  selectDueAdvisors,
  type AdvisorResearchAdvisor,
  type AdvisorResearchCheck,
} from "../lib/advisor-research-select.js";
import type { RouteTarget } from "../types/harper-resource.js";
import type {
  AdvisorResearchCheckRow,
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  HarperDate,
} from "../types/harper-schema.js";
import { loadAll, type ResourceIndex } from "./resource-data.js";
import {
  boundedNumber,
  readQuery,
} from "./resource-recruiting-market-utils.js";
import { advisorDisplayName } from "./resource-routing.js";

const DEFAULT_SOURCE_TYPE = "web_research";
const DEFAULT_STALE_DAYS = 30;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Status counts for due research rows in the current filtered slice. */
export type AdvisorResearchQueueStatusCounts = Readonly<Record<string, number>>;

/** Public-safe current firm context for one queued advisor. */
export interface AdvisorResearchQueueFirm {
  readonly id: string;
  readonly name: string;
  readonly roleTitle: string | null;
}

/** Public-safe queue row for one advisor due for research. */
export interface AdvisorResearchQueueItem {
  readonly advisorId: string;
  readonly advisorName: string;
  readonly finraCrd: string | null;
  readonly profileUrl: string;
  readonly firm: AdvisorResearchQueueFirm | null;
  readonly sourceType: string;
  readonly status: string | null;
  readonly lastCheckedAt: string | null;
  readonly nextCheckAfter: string | null;
  readonly daysSinceLastCheck: number | null;
  readonly missingFields: ReadonlyArray<string>;
  readonly provenance: AdvisorResearchQueueProvenance;
}

/** Source rows used to build one queue item. */
export interface AdvisorResearchQueueProvenance {
  readonly sourceTable: "AdvisorResearchCheck";
  readonly sourceIds: ReadonlyArray<string>;
}

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
   * The queue is read-only and public-safe; no private user tables are loaded.
   * @returns True because resource rows are filtered in `get`.
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
    const filters = parseFilters(target);
    const due = selectDueAdvisors(
      db.advisors.map(toResearchAdvisor),
      db.researchChecks.map(toResearchCheck),
      {
        max: Math.max(filters.limit, db.advisors.length),
        staleDays: filters.staleDays,
        sourceType: filters.sourceType,
      }
    );
    const filtered = due
      .filter(row => matchesStatus(row.lastCheck, filters.status))
      .filter(row =>
        matchesMissingField(row.missingFields, filters.missingField)
      )
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
      },
      items,
    };
  }
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
 * Builds one public-safe queue item.
 * @param advisor - Advisor row selected as due.
 * @param lastCheck - Latest check for the requested source type.
 * @param missingFields - Missing public-web profile fields.
 * @param sourceType - Active source filter for never-checked rows.
 * @param db - Loaded resource index.
 * @returns Queue item.
 */
function queueItem(
  advisor: AdvisorResearchAdvisor,
  lastCheck: AdvisorResearchCheck | null,
  missingFields: ReadonlyArray<string>,
  sourceType: string,
  db: ResourceIndex
): AdvisorResearchQueueItem {
  const row = db.byAdvisor.get(advisor.id) ?? (advisor as AdvisorRow);
  return {
    advisorId: row.id,
    advisorName: advisorDisplayName(row),
    finraCrd: row.finraCrd ?? null,
    profileUrl: `/advisor.html?id=${encodeURIComponent(profileId(row))}`,
    firm: currentFirm(row.id, db),
    sourceType: lastCheck?.sourceType ?? sourceType,
    status: lastCheck?.status ?? null,
    lastCheckedAt: dateString(lastCheck?.checkedAt),
    nextCheckAfter: dateString(lastCheck?.nextCheckAfter),
    daysSinceLastCheck: daysSince(lastCheck?.checkedAt),
    missingFields,
    provenance: {
      sourceTable: "AdvisorResearchCheck",
      sourceIds: lastCheck ? [lastCheck.id] : [],
    },
  };
}

/**
 * Chooses a stable browser profile identifier.
 * @param advisor - Advisor row.
 * @returns Slug when present, otherwise id.
 */
function profileId(advisor: AdvisorRow): string {
  const slug = Reflect.get(advisor, "slug");
  return typeof slug === "string" && slug.length > 0 ? slug : advisor.id;
}

/**
 * Resolves the advisor's latest known firm context.
 * @param advisorId - Advisor id.
 * @param db - Loaded resource index.
 * @returns Firm context or null.
 */
function currentFirm(
  advisorId: string,
  db: ResourceIndex
): AdvisorResearchQueueFirm | null {
  const employment = latestEmployment(advisorId, db.employments);
  const firm = employment ? db.byFirm.get(employment.firmId) : null;
  if (!firm) return null;
  return {
    id: firm.id,
    name: firmName(firm),
    roleTitle: employment?.roleTitle ?? null,
  };
}

/**
 * Finds the latest employment row for one advisor.
 * @param advisorId - Advisor id.
 * @param employments - Employment rows.
 * @returns Latest employment or null.
 */
function latestEmployment(
  advisorId: string,
  employments: readonly EmploymentHistoryRow[]
): EmploymentHistoryRow | null {
  return (
    employments
      .filter(row => row.advisorId === advisorId)
      .slice()
      .sort((left, right) =>
        String(right.startDate ?? "").localeCompare(
          String(left.startDate ?? "")
        )
      )[0] ?? null
  );
}

/**
 * Reads the display name for a firm.
 * @param firm - Firm row.
 * @returns Firm legal or common name.
 */
function firmName(firm: FirmRow): string {
  return firm.legalName ?? firm.name;
}

/**
 * Formats Harper date values for JSON payloads.
 * @param value - Date-like value.
 * @returns ISO string/date string or null.
 */
function dateString(value: HarperDate | string | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Calculates whole days since a check timestamp.
 * @param value - Latest check date.
 * @returns Whole days or null when absent/invalid.
 */
function daysSince(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

/**
 * Counts latest-check statuses in the returned slice.
 * @param items - Queue items.
 * @returns Counts keyed by status label.
 */
function countStatuses(
  items: ReadonlyArray<AdvisorResearchQueueItem>
): AdvisorResearchQueueStatusCounts {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = item.status ?? "never_checked";
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
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

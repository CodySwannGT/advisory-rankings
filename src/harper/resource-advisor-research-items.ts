import type {
  AdvisorResearchAdvisor,
  AdvisorResearchCheck,
} from "../lib/advisor-research-select.js";
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
  HarperDate,
} from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";
import { advisorDisplayName } from "./resource-routing.js";

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

/**
 * Builds one public-safe queue item.
 * @param advisor - Advisor row selected as due.
 * @param lastCheck - Latest check for the requested source type.
 * @param missingFields - Missing public-web profile fields.
 * @param sourceType - Active source filter for never-checked rows.
 * @param db - Loaded resource index.
 * @returns Queue item.
 */
export function queueItem(
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
 * Formats Harper date values for JSON payloads.
 * @param value - Date-like value.
 * @returns ISO string/date string or null.
 */
export function dateString(
  value: HarperDate | string | undefined
): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
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

import { inverseDateKey } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  HarperDate,
} from "../types/harper-schema.js";

/**
 * Roster filter accepted by `firmAdvisorRows`. Past selects rows with an end
 * date; current selects rows without one.
 */
export type FirmRosterStatus = "current" | "past";

/**
 * Subset of the resource index this module reads. Mirrors the shape
 * `buildDb` in `resource-data.ts` produces, narrowed to the tables and
 * lookup maps the firm advisor builder touches.
 */
export interface FirmAdvisorsDb {
  readonly employments: readonly EmploymentHistoryRow[];
  readonly byAdvisor: ReadonlyMap<string, AdvisorRow>;
}

/** Advisor chip embedded in a `FirmAdvisorRow`. */
export interface FirmAdvisorChip {
  readonly id: string;
  readonly name: string;
  readonly headshotUrl: string | null;
  readonly careerStatus: string | undefined;
}

/**
 * Single advisor entry returned by `firmAdvisorRows`. Carries private
 * pagination sort fields (`_sortKey`, `_id`) that the endpoint strips
 * before returning to clients.
 */
export interface FirmAdvisorRow {
  readonly _sortKey: string;
  readonly _id: string;
  readonly advisor: FirmAdvisorChip;
  readonly roleTitle: string | undefined;
  readonly roleCategory: string | undefined;
  readonly startDate: HarperDate | undefined;
  readonly endDate: HarperDate | undefined;
  readonly reasonForLeaving: string | undefined;
  readonly aumAtDeparture: number | undefined;
}

/** Intermediate join row used by `firmAdvisorRows`. */
interface FirmAdvisorJoin {
  readonly employment: EmploymentHistoryRow;
  readonly advisor: AdvisorRow;
}

/** Counts returned by `advisorCountsForFirm`. */
export interface FirmAdvisorCounts {
  readonly currentAdvisorCount: number;
  readonly pastAdvisorCount: number;
}

/**
 * Builds paginated advisor rows for one firm's current or past roster.
 * @param db - Loaded resource index bundle.
 * @param firmId - Firm ID requested by the route.
 * @param status - Current or past roster filter.
 * @returns Advisor rows with private pagination sort fields attached.
 */
export function firmAdvisorRows(
  db: FirmAdvisorsDb,
  firmId: string,
  status: FirmRosterStatus
): readonly FirmAdvisorRow[] {
  return db.employments
    .filter(employment => employment.firmId === firmId)
    .map(employment => ({
      employment,
      advisor: db.byAdvisor.get(employment.advisorId),
    }))
    .filter((entry): entry is FirmAdvisorJoin => {
      const { employment, advisor } = entry;
      const isPast = Boolean(employment.endDate);
      return Boolean(advisor) && (status === "past" ? isPast : !isPast);
    })
    .map(({ employment, advisor }) => ({
      _sortKey: inverseDateKey(
        status === "past" ? employment.endDate : employment.startDate
      ),
      _id: employment.id || advisor.id,
      advisor: {
        id: advisor.id,
        name: advisorDisplayName(advisor),
        headshotUrl: advisor.headshotUrl || null,
        careerStatus: advisor.careerStatus,
      },
      roleTitle: employment.roleTitle,
      roleCategory: employment.roleCategory,
      startDate: employment.startDate,
      endDate: employment.endDate,
      reasonForLeaving: employment.reasonForLeaving,
      aumAtDeparture: employment.aumAtDeparture,
    }));
}

/**
 * Counts current and past advisors associated with a firm.
 * @param db - Loaded resource index bundle.
 * @param firmId - Firm ID whose employment rows should be counted.
 * @returns Current and past advisor counts for the firm profile heading.
 */
export function advisorCountsForFirm(
  db: FirmAdvisorsDb,
  firmId: string
): FirmAdvisorCounts {
  return db.employments
    .filter(
      employment =>
        employment.firmId === firmId && db.byAdvisor.has(employment.advisorId)
    )
    .reduce<FirmAdvisorCounts>(
      (counts, employment) => ({
        currentAdvisorCount:
          counts.currentAdvisorCount + (employment.endDate ? 0 : 1),
        pastAdvisorCount:
          counts.pastAdvisorCount + (employment.endDate ? 1 : 0),
      }),
      { currentAdvisorCount: 0, pastAdvisorCount: 0 }
    );
}

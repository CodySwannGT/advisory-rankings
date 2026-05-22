// @ts-nocheck
import { inverseDateKey } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";

/**
 * Builds paginated advisor rows for one firm's current or past roster.
 * @param db - Loaded resource index bundle.
 * @param firmId - Firm ID requested by the route.
 * @param status - Current or past roster filter.
 * @returns Advisor rows with private pagination sort fields attached.
 */
export function firmAdvisorRows(db, firmId, status) {
  return db.employments
    .filter(employment => employment.firmId === firmId)
    .map(employment => ({
      employment,
      advisor: db.byAdvisor.get(employment.advisorId),
    }))
    .filter(({ employment, advisor }) => {
      const isPast = Boolean(employment.endDate);
      return advisor && (status === "past" ? isPast : !isPast);
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
export function advisorCountsForFirm(db, firmId) {
  return db.employments
    .filter(
      employment =>
        employment.firmId === firmId && db.byAdvisor.has(employment.advisorId)
    )
    .reduce(
      (counts, employment) => ({
        currentAdvisorCount:
          counts.currentAdvisorCount + (employment.endDate ? 0 : 1),
        pastAdvisorCount:
          counts.pastAdvisorCount + (employment.endDate ? 1 : 0),
      }),
      { currentAdvisorCount: 0, pastAdvisorCount: 0 }
    );
}

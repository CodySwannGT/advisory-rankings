import type { AdvisorProfilePayload } from "../types/advisor-profile.js";

/**
 * Groups reviewed discrepancy and correction rows for advisor profile rendering.
 * @param d - Advisor profile payload.
 * @returns Separate reviewed row groups plus their combined failure-card rows.
 */
export function reviewedNoteRows(d: AdvisorProfilePayload) {
  const discrepancies = d.reviewedRegulatoryDiscrepancies ?? [];
  const corrections = d.reviewedCorrectionRequests ?? [];
  return {
    discrepancies,
    corrections,
    all: [...discrepancies, ...corrections],
  };
}

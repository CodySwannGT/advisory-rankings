import { cmpDesc } from "./resource-pagination.js";
import type { ReviewedRegulatoryDiscrepancyNote } from "../types/advisor-profile.js";
import type { RegulatoryDiscrepancyRow } from "../types/harper-schema.js";

/** Minimal row bundle used to build public reviewed discrepancy notes. */
export interface AdvisorDiscrepancyNoteSource {
  readonly regulatoryDiscrepancies: readonly RegulatoryDiscrepancyRow[];
}

/**
 * Builds public reviewed discrepancy notes for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against discrepancy rows.
 * @returns Reviewed non-open discrepancy notes only.
 */
export function advisorReviewedRegulatoryDiscrepancies(
  db: AdvisorDiscrepancyNoteSource,
  advisorId: string
): readonly ReviewedRegulatoryDiscrepancyNote[] {
  return db.regulatoryDiscrepancies
    .filter(row => isPublicReviewedDiscrepancy(row, advisorId))
    .slice()
    .sort(cmpDesc("reviewedAt"))
    .map(row => ({
      id: row.id,
      fieldName: row.fieldName,
      status: row.status,
      severity: row.severity,
      reviewerNote: row.reviewerNote ?? "",
      reviewedAt: row.reviewedAt,
      brokerCheckValue: row.brokerCheckValue,
      advisorHubValue: row.advisorHubValue,
      brokerCheckSourceRef: row.brokerCheckSourceRef,
    }));
}

/**
 * Checks whether a discrepancy has been resolved enough for public copy.
 * @param row - Persisted discrepancy row.
 * @param advisorId - Advisor ID currently being rendered.
 * @returns True when the row can be shown on a public profile.
 */
function isPublicReviewedDiscrepancy(
  row: RegulatoryDiscrepancyRow,
  advisorId: string
): boolean {
  return (
    row.advisorId === advisorId &&
    row.status !== "open" &&
    Boolean(row.reviewedAt) &&
    Boolean(row.reviewerNote?.trim())
  );
}

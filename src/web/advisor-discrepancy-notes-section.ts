import { fmtDate, humanize } from "./app.js";
import { brokerCheckAttribution } from "./advisor-sections.js";
import {
  EntityListC,
  EntityRowC,
  SectionCardC,
  elC,
} from "./design-system-adapters.js";
import type {
  BrokerCheckSnapshotSlice,
  ReviewedRegulatoryDiscrepancyNote,
} from "../types/advisor-profile.js";

/**
 * Builds reviewed regulatory discrepancy notes for the public profile.
 * @param notes - Reviewed discrepancy notes from the profile payload.
 * @param snapshot - BrokerCheck snapshot row for required source attribution.
 * @returns Reviewed discrepancy section or null.
 */
export function reviewedDiscrepancyNotesSection(
  notes: readonly ReviewedRegulatoryDiscrepancyNote[],
  snapshot: BrokerCheckSnapshotSlice | null | undefined
): HTMLElement | null {
  if (!notes.length) return null;
  return SectionCardC({
    title: `Reviewed discrepancy notes (${notes.length.toLocaleString()})`,
    body: elC(
      "div",
      {},
      EntityListC({
        rows: notes.map(note =>
          EntityRowC({
            avatar: "BC",
            name: reviewedDiscrepancyTitle(note),
            sub: note.reviewerNote,
            tail: note.reviewedAt
              ? fmtDate(note.reviewedAt, { mode: "short" })
              : null,
            extras: [reviewedDiscrepancySourceLine(note)],
          })
        ),
      }),
      brokerCheckAttribution(snapshot)
    ),
  });
}

/**
 * Builds conservative row title copy for a reviewed discrepancy note.
 * @param note - Reviewed discrepancy note.
 * @returns Public row title.
 */
function reviewedDiscrepancyTitle(
  note: ReviewedRegulatoryDiscrepancyNote
): string {
  const field = humanize(note.fieldName) || note.fieldName;
  const status = humanize(note.status) || note.status;
  return `${field} review: ${status}`;
}

/**
 * Builds the source-value line for a reviewed discrepancy note.
 * @param note - Reviewed discrepancy note.
 * @returns DOM node containing source values.
 */
function reviewedDiscrepancySourceLine(
  note: ReviewedRegulatoryDiscrepancyNote
): HTMLElement {
  return elC(
    "div",
    { class: "sub" },
    [
      note.brokerCheckValue ? `BrokerCheck ${note.brokerCheckValue}` : null,
      note.advisorHubValue ? `AdvisorHub ${note.advisorHubValue}` : null,
      note.brokerCheckSourceRef ? `Ref ${note.brokerCheckSourceRef}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );
}

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
  ReviewedAdvisorCorrectionNote,
  ReviewedRegulatoryDiscrepancyNote,
} from "../types/advisor-profile.js";

/**
 *
 */
type ReviewedProfileNote =
  | ReviewedRegulatoryDiscrepancyNote
  | ReviewedAdvisorCorrectionNote;

/**
 * Builds reviewed regulatory discrepancy notes for the public profile.
 * @param discrepancyNotes - Reviewed discrepancy notes from the profile payload.
 * @param correctionNotes - Reviewed correction request notes from the profile payload.
 * @param snapshot - BrokerCheck snapshot row for required source attribution.
 * @returns Reviewed discrepancy section or null.
 */
export function reviewedDiscrepancyNotesSection(
  discrepancyNotes: readonly ReviewedRegulatoryDiscrepancyNote[],
  correctionNotes: readonly ReviewedAdvisorCorrectionNote[],
  snapshot: BrokerCheckSnapshotSlice | null | undefined
): HTMLElement | null {
  const notes = [...discrepancyNotes, ...correctionNotes].sort((left, right) =>
    String(right.reviewedAt ?? "").localeCompare(String(left.reviewedAt ?? ""))
  );
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
function reviewedDiscrepancyTitle(note: ReviewedProfileNote): string {
  const field = humanize(note.fieldName) || note.fieldName;
  const status = humanize(note.status) || note.status;
  const prefix = isCorrectionNote(note) ? "correction" : "review";
  return `${field} ${prefix}: ${status}`;
}

/**
 * Builds the source-value line for a reviewed discrepancy note.
 * @param note - Reviewed discrepancy note.
 * @returns DOM node containing source values.
 */
function reviewedDiscrepancySourceLine(note: ReviewedProfileNote): HTMLElement {
  return elC(
    "div",
    { class: "sub" },
    reviewedSourceParts(note).filter(Boolean).join(" · ")
  );
}

/**
 * Builds public source/value copy for a reviewed profile note.
 * @param note - Reviewed note from discrepancy or correction workflows.
 * @returns Displayable source line parts.
 */
function reviewedSourceParts(
  note: ReviewedProfileNote
): readonly (string | null | undefined)[] {
  return isCorrectionNote(note)
    ? correctionSourceParts(note)
    : regulatorySourceParts(note);
}

/**
 * Builds source/value copy for a reviewed regulatory discrepancy note.
 * @param note - Reviewed regulatory discrepancy note.
 * @returns Displayable source line parts.
 */
function regulatorySourceParts(
  note: ReviewedRegulatoryDiscrepancyNote
): readonly (string | null | undefined)[] {
  return [
    labeledPart("BrokerCheck", note.brokerCheckValue),
    labeledPart("AdvisorHub", note.advisorHubValue),
    labeledPart("Ref", note.brokerCheckSourceRef),
  ];
}

/**
 * Builds source/value copy for a reviewed correction request note.
 * @param note - Reviewed advisor correction note.
 * @returns Displayable source line parts.
 */
function correctionSourceParts(
  note: ReviewedAdvisorCorrectionNote
): readonly (string | null | undefined)[] {
  return [
    labeledPart("Displayed", note.displayedValue),
    labeledPart("Proposed", note.proposedValue),
    note.sourceType ? humanize(note.sourceType) : null,
    labeledPart("Ref", note.sourceRef),
    labeledPart("Context", note.sourceContext),
  ];
}

/**
 * Prefixes a non-empty source part.
 * @param label - Public label prefix.
 * @param value - Optional source value.
 * @returns Labeled value or null.
 */
function labeledPart(label: string, value: string | undefined): string | null {
  return value ? `${label} ${value}` : null;
}

/**
 * Distinguishes correction request notes from source-to-source discrepancy notes.
 * @param note - Public reviewed note.
 * @returns True for advisor correction request notes.
 */
function isCorrectionNote(
  note: ReviewedProfileNote
): note is ReviewedAdvisorCorrectionNote {
  return "proposedValue" in note;
}

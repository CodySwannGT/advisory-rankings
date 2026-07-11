import type { CorrectionField } from "./advisor-correction-fields.js";

/** Controls needed to serialize a correction request body. */
interface CorrectionRequestControls {
  readonly proposed: HTMLTextAreaElement;
  readonly note: HTMLTextAreaElement;
}

/**
 * Builds the AdvisorCorrectionRequest resource payload from the form state.
 * @param advisorId - Advisor profile id being corrected.
 * @param field - Selected immutable displayed field.
 * @param controls - Form controls with user-entered values.
 * @returns JSON payload for the correction request resource.
 */
export function correctionRequestPayload(
  advisorId: string,
  field: CorrectionField,
  controls: CorrectionRequestControls
) {
  return {
    advisorId,
    fieldName: field.name,
    displayedValue: field.value,
    proposedValue: controls.proposed.value,
    submitterNote: controls.note.value,
    sourceType: "advisor_profile",
    sourceContext: JSON.stringify({
      advisorId,
      fieldName: field.name,
      label: field.label,
      displayedValue: field.value,
    }),
  };
}

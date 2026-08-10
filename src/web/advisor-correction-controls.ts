/**
 * Clears text fields after a correction request is queued.
 * @param controls - Form controls to reset.
 */
export function clearCorrectionTextControls(
  controls: Readonly<
    Record<"proposed", HTMLTextAreaElement> &
      Record<"note", HTMLTextAreaElement>
  >
): void {
  [controls.proposed, controls.note].forEach(c =>
    Object.assign(c, { value: "" })
  );
}

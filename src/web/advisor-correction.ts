// Advisor profile correction request card.
// Keeps public profile facts immutable while queuing signed-in review requests.

import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import { postJson, refreshMe, isAuthFailure } from "./app.js";
import {
  Button,
  SectionCard,
  TextInput,
  clear,
  el,
} from "./design-system/index.js";
import {
  correctionFields,
  type CorrectionField,
} from "./advisor-correction-fields.js";

const NOTE_CLASS = "advisor-correction-note";

/** Form controls used by the correction submit handler. */
type CorrectionControls = Readonly<
  Record<"field", HTMLSelectElement> &
    Record<"displayed", HTMLInputElement> &
    Record<"proposed", HTMLTextAreaElement> &
    Record<"note", HTMLTextAreaElement> &
    Record<"submit", HTMLButtonElement>
>;

/** Minimal successful correction resource response. */
interface CorrectionResponse {
  readonly request?: Readonly<Record<"id", string>>;
}

/**
 * Builds the advisor correction request entry point.
 * @param profile - Advisor profile resource payload.
 * @returns Section card mounted on the advisor profile.
 */
export function advisorCorrectionCard(
  profile: AdvisorProfilePayload
): HTMLElement {
  const fields = correctionFields(profile);
  const body = el(
    "div",
    { class: "advisor-correction", "aria-live": "polite" },
    el("p", { class: NOTE_CLASS }, "Loading correction options...")
  );
  const card = SectionCard({
    title: "Request a correction",
    attrs: { class: "advisor-correction-card" },
    body,
  });
  void loadCorrectionCard(profile, fields, body);
  return card;
}

/**
 * Resolves auth state and renders the matching correction panel.
 * @param profile - Advisor profile resource payload.
 * @param fields - Selectable correction fields.
 * @param body - Card body element.
 */
async function loadCorrectionCard(
  profile: AdvisorProfilePayload,
  fields: readonly CorrectionField[],
  body: HTMLElement
): Promise<void> {
  try {
    const me = await refreshMe();
    if (!me?.authenticated) {
      renderSignedOutCorrection(body);
      return;
    }
    renderCorrectionForm(body, profile.advisor.id, fields);
  } catch (error) {
    renderCorrectionError(body, error);
  }
}

/**
 * Renders the signed-out affordance without hiding public profile content.
 * @param body - Card body element.
 */
function renderSignedOutCorrection(body: HTMLElement): void {
  const guidance = el("div", {
    class: "advisor-correction-guidance",
    hidden: true,
  });
  const action = Button({
    variant: "neutral",
    children: "Request a correction",
    attrs: { class: "advisor-correction-open" },
    onClick: (): void => {
      guidance.removeAttribute("hidden");
      guidance.replaceChildren(
        el(
          "p",
          { class: NOTE_CLASS },
          "Sign in to queue profile corrections. Public facts stay visible until an analyst reviews the request."
        ),
        el(
          "a",
          {
            class: "ab-btn ab-btn--primary advisor-correction-link",
            href: "/login",
          },
          "Sign in"
        )
      );
    },
  });
  clear(body);
  body.append(action, guidance);
}

/**
 * Renders a recoverable correction-card error.
 * @param body - Card body element.
 * @param error - Error thrown while resolving auth state.
 */
function renderCorrectionError(body: HTMLElement, error: unknown): void {
  clear(body);
  body.appendChild(
    el(
      "p",
      { class: `${NOTE_CLASS} advisor-correction-note--error` },
      isAuthFailure(error)
        ? "Sign in again to request corrections."
        : "Correction requests are temporarily unavailable."
    )
  );
}

/**
 * Renders the signed-in correction form.
 * @param body - Card body element.
 * @param advisorId - Advisor id for the correction request.
 * @param fields - Selectable source-backed fields.
 */
function renderCorrectionForm(
  body: HTMLElement,
  advisorId: string,
  fields: readonly CorrectionField[]
): void {
  const status = el("p", { class: "advisor-correction-status" });
  if (!fields.length) {
    renderNoCorrectionFields(body);
    return;
  }

  const controls = correctionControls(fields);
  const submit = correctionSubmitButton();
  const formControls: CorrectionControls = { ...controls, submit };
  const form = el(
    "form",
    {
      class: "advisor-correction-form",
      onSubmit: (event: Event): void => {
        void submitCorrection(event, advisorId, formControls, fields, status);
      },
    },
    correctionField("Field", formControls.field),
    correctionField("Displayed value", formControls.displayed),
    correctionField("Proposed value", formControls.proposed),
    correctionField("Note", formControls.note),
    formControls.submit,
    status
  );
  formControls.field.addEventListener("change", () => {
    syncDisplayedValue(formControls, fields);
  });
  clear(body);
  body.append(
    el(
      "p",
      { class: NOTE_CLASS },
      "Requests queue for analyst review. Public facts do not change from this form."
    ),
    form
  );
}

/**
 * Renders the empty correction-field state.
 * @param body - Card body element.
 */
function renderNoCorrectionFields(body: HTMLElement): void {
  clear(body);
  body.appendChild(
    el(
      "p",
      { class: NOTE_CLASS },
      "No source-backed profile values are available for correction."
    )
  );
}

/**
 * Builds the correction form submit button.
 * @returns Submit button element.
 */
function correctionSubmitButton(): HTMLButtonElement {
  return asHtmlButtonElement(
    Button({
      variant: "primary",
      type: "submit",
      children: "Submit correction",
      attrs: { class: "advisor-correction-submit" },
    })
  );
}

/**
 * Builds correction form controls.
 * @param fields - Selectable source-backed fields.
 * @returns Concrete form controls.
 */
function correctionControls(
  fields: readonly CorrectionField[]
): Omit<CorrectionControls, "submit"> {
  const field = asHtmlSelectElement(
    el(
      "select",
      { name: "fieldName", class: "advisor-correction-select" },
      ...fields.map(option =>
        el("option", { value: option.name }, option.label)
      )
    )
  );
  return {
    field,
    displayed: asHtmlInputElement(
      TextInput({
        name: "displayedValue",
        readonly: true,
        value: fields[0]?.value ?? "",
      })
    ),
    proposed: asHtmlTextAreaElement(
      el("textarea", {
        name: "proposedValue",
        maxlength: "2000",
        rows: "4",
        required: true,
      })
    ),
    note: asHtmlTextAreaElement(
      el("textarea", { name: "submitterNote", maxlength: "2000", rows: "3" })
    ),
  };
}

/**
 * Submits a correction request and reflects the queued state.
 * @param event - Form submit event.
 * @param advisorId - Advisor id for the request.
 * @param controls - Form controls to serialize.
 * @param fields - Selectable field metadata.
 * @param status - Inline status node.
 */
async function submitCorrection(
  event: Event,
  advisorId: string,
  controls: CorrectionControls,
  fields: readonly CorrectionField[],
  status: HTMLElement
): Promise<void> {
  const field = selectedField(controls.field.value, fields);
  const isSubmitting = controls.submit.disabled;
  event.preventDefault();
  if (isSubmitting) return;
  setCorrectionControlsDisabled(controls, true);
  status.replaceChildren("Submitting...");
  try {
    const response = await postJson("/AdvisorCorrectionRequest", {
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
    });
    const id = correctionRequestId(response);
    Object.assign(controls.proposed, { value: "" });
    Object.assign(controls.note, { value: "" });
    status.replaceChildren(
      id
        ? `Correction request queued for review (${id}). Public facts remain unchanged.`
        : "Correction request queued for review. Public facts remain unchanged."
    );
  } catch (error) {
    status.replaceChildren(
      isAuthFailure(error)
        ? "Sign in again to submit corrections."
        : "Could not queue correction request."
    );
  } finally {
    setCorrectionControlsDisabled(controls, false);
  }
}

/**
 * Toggles mutation controls while a correction request is in flight.
 * @param controls - Form controls to update.
 * @param disabled - Whether controls should be disabled.
 */
function setCorrectionControlsDisabled(
  controls: CorrectionControls,
  disabled: boolean
): void {
  Object.assign(controls.field, { disabled });
  Object.assign(controls.proposed, { disabled });
  Object.assign(controls.note, { disabled });
  Object.assign(controls.submit, { disabled });
}

/**
 * Updates the read-only displayed-value control for the selected field.
 * @param controls - Form controls.
 * @param fields - Selectable field metadata.
 */
function syncDisplayedValue(
  controls: CorrectionControls,
  fields: readonly CorrectionField[]
): void {
  Object.assign(controls.displayed, {
    value: selectedField(controls.field.value, fields).value,
  });
}

/**
 * Resolves the selected field, falling back to the first available field.
 * @param name - Selected field name.
 * @param fields - Selectable field metadata.
 * @returns Matching field.
 */
function selectedField(
  name: string,
  fields: readonly CorrectionField[]
): CorrectionField {
  const fallback = fields[0];
  if (!fallback) throw new Error("Expected at least one correction field");
  return fields.find(field => field.name === name) ?? fallback;
}

/**
 * Extracts the correction id from a resource response.
 * @param response - Resource response from `postJson`.
 * @returns Request id when present.
 */
function correctionRequestId(response: unknown): string | undefined {
  const envelope = response as CorrectionResponse | null;
  return typeof envelope?.request?.id === "string"
    ? envelope.request.id
    : undefined;
}

/**
 * Wraps a labeled correction control.
 * @param label - Human-readable label.
 * @param control - Form control.
 * @returns Label wrapper.
 */
function correctionField(label: string, control: HTMLElement): HTMLElement {
  return el("label", { class: "advisor-correction-field" }, label, control);
}

/**
 * Runtime guard for design-system `TextInput()`.
 * @param node - Element to narrow.
 * @returns HTML input element.
 */
function asHtmlInputElement(node: HTMLElement): HTMLInputElement {
  if (!(node instanceof HTMLInputElement)) {
    throw new Error("Expected HTMLInputElement");
  }
  return node;
}

/**
 * Runtime guard for generated select controls.
 * @param node - Element to narrow.
 * @returns HTML select element.
 */
function asHtmlSelectElement(node: HTMLElement): HTMLSelectElement {
  if (!(node instanceof HTMLSelectElement)) {
    throw new Error("Expected HTMLSelectElement");
  }
  return node;
}

/**
 * Runtime guard for generated textareas.
 * @param node - Element to narrow.
 * @returns HTML textarea element.
 */
function asHtmlTextAreaElement(node: HTMLElement): HTMLTextAreaElement {
  if (!(node instanceof HTMLTextAreaElement)) {
    throw new Error("Expected HTMLTextAreaElement");
  }
  return node;
}

/**
 * Runtime guard for generated buttons.
 * @param node - Element to narrow.
 * @returns HTML button element.
 */
function asHtmlButtonElement(node: HTMLElement): HTMLButtonElement {
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error("Expected HTMLButtonElement");
  }
  return node;
}

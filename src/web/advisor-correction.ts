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

const NOTE_CLASS = "advisor-correction-note";

/** Candidate source-backed profile field that can be corrected. */
interface CorrectionField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
}

/** Form controls used by the correction submit handler. */
type CorrectionControls = Readonly<
  Record<"field", HTMLSelectElement> &
    Record<"displayed", HTMLInputElement> &
    Record<"proposed", HTMLTextAreaElement> &
    Record<"note", HTMLTextAreaElement>
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
    clear(body);
    body.appendChild(
      el(
        "p",
        { class: NOTE_CLASS },
        "No source-backed profile values are available for correction."
      )
    );
    return;
  }

  const controls = correctionControls(fields);
  const form = el(
    "form",
    {
      class: "advisor-correction-form",
      onSubmit: (event: Event): void => {
        void submitCorrection(event, advisorId, controls, fields, status);
      },
    },
    correctionField("Field", controls.field),
    correctionField("Displayed value", controls.displayed),
    correctionField("Proposed value", controls.proposed),
    correctionField("Note", controls.note),
    Button({
      variant: "primary",
      type: "submit",
      children: "Submit correction",
      attrs: { class: "advisor-correction-submit" },
    }),
    status
  );
  controls.field.addEventListener("change", () => {
    syncDisplayedValue(controls, fields);
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
 * Builds correction form controls.
 * @param fields - Selectable source-backed fields.
 * @returns Concrete form controls.
 */
function correctionControls(
  fields: readonly CorrectionField[]
): CorrectionControls {
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
  event.preventDefault();
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
  }
}

/**
 * Returns selectable fields from profile facts already rendered on the page.
 * @param profile - Advisor profile resource payload.
 * @returns Source-backed correction fields.
 */
function correctionFields(
  profile: AdvisorProfilePayload
): readonly CorrectionField[] {
  const currentCareer = profile.career.find(row => !row.endDate);
  return [
    field("legalName", "Legal name", profile.advisor.legalName),
    field("preferredName", "Preferred name", profile.advisor.preferredName),
    field("finraCrd", "FINRA CRD", profile.advisor.finraCrd),
    field("secIard", "SEC IARD", profile.advisor.secIard),
    field("careerStatus", "Career status", profile.advisor.careerStatus),
    field("currentRole", "Current role", currentCareer?.roleTitle),
    field("currentFirm", "Current firm", firmNameOf(currentCareer?.firm)),
  ].filter((candidate): candidate is CorrectionField => candidate !== null);
}

/**
 * Builds one selectable field when the displayed value exists.
 * @param name - Resource field key.
 * @param label - Human-readable field label.
 * @param value - Displayed profile value.
 * @returns Correction field or null.
 */
function field(
  name: string,
  label: string,
  value: unknown
): CorrectionField | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? { name, label, value: normalized } : null;
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
 * Reads a firm display name from the opaque firm chip.
 * @param firm - Opaque firm chip from the AdvisorProfile resource.
 * @returns Firm name when present.
 */
function firmNameOf(firm: unknown): string | undefined {
  if (firm && typeof firm === "object" && "name" in firm) {
    const name = firm.name;
    if (typeof name === "string") return name;
  }
  return undefined;
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

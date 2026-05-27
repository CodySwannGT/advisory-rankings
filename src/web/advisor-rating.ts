// Advisor private rating card.
// All UI comes from the design system — see docs/design-system.md.

import { api, postJson, refreshMe, isAuthFailure } from "./app.js";
import {
  el,
  clear,
  SectionCard,
  Button,
  TextInput,
} from "./design-system/index.js";

/** Numeric private-rating field names backing the form. */
type RatingFieldName =
  | "ratingInt"
  | "responsiveness"
  | "transparency"
  | "performance"
  | "planningDepth";

/** Numeric form inputs keyed by rating field name. */
type RatingNumberControls = Readonly<Record<RatingFieldName, HTMLInputElement>>;

/** Full set of controls passed to the submit handler. */
type RatingControls = RatingNumberControls &
  Readonly<Record<"reviewText", HTMLTextAreaElement>>;

/** Sanitized rating row returned by `/AdvisorRating/<id>`. */
interface PrivateRating {
  readonly ratingInt?: number | null;
  readonly responsiveness?: number | null;
  readonly transparency?: number | null;
  readonly performance?: number | null;
  readonly planningDepth?: number | null;
  readonly reviewText?: string | null;
}

/** Auth-aware private rating envelope returned by `/AdvisorRating/<id>`. */
interface RatingEnvelope {
  readonly authenticated?: boolean;
  readonly rating?: PrivateRating | null;
}

/**
 * Runtime narrowing helper for the `<input>` elements produced by
 * `TextInput()`. The design-system factory declares its return type as
 * `HTMLElement` so callers can use it polymorphically; this card needs
 * the concrete `HTMLInputElement` shape to read `.value` and `.name`
 * inside the submit handler. `instanceof` is a runtime check, not a
 * cast — the type narrows because TypeScript sees the guard.
 *
 * @param node - Element produced by `TextInput()`.
 * @returns The same node, statically typed as `HTMLInputElement`.
 * @throws If `TextInput()` ever returns a non-input element.
 */
function asHtmlInputElement(node: HTMLElement): HTMLInputElement {
  if (!(node instanceof HTMLInputElement)) {
    throw new Error("Expected HTMLInputElement from TextInput factory");
  }
  return node;
}

/**
 * Runtime narrowing helper for the `<textarea>` element produced by
 * `el("textarea", ...)`. Same pattern as {@link asHtmlInputElement} —
 * `instanceof` is a runtime guard, not a cast.
 *
 * @param node - Element produced by `el("textarea", ...)`.
 * @returns The same node, statically typed as `HTMLTextAreaElement`.
 * @throws If the factory ever returns a non-textarea element.
 */
function asHtmlTextAreaElement(node: HTMLElement): HTMLTextAreaElement {
  if (!(node instanceof HTMLTextAreaElement)) {
    throw new Error('Expected HTMLTextAreaElement from el("textarea", ...)');
  }
  return node;
}

/**
 * Builds the private-rating card and kicks off the async load.
 * @param advisorId - Advisor whose private rating is being managed.
 * @returns Section card element ready to mount on the advisor page.
 */
export function privateRatingCard(advisorId: string): HTMLElement {
  const body = el(
    "div",
    { class: "private-rating", "aria-live": "polite" },
    el("p", { class: "private-rating-note" }, "Loading private rating...")
  );
  const card = SectionCard({
    title: "Private rating",
    attrs: { class: "private-rating-card" },
    body,
  });
  void loadPrivateRating(advisorId, body);
  return card;
}

/**
 * Loads the current user's private rating and swaps in the right view.
 * @param advisorId - Advisor whose private rating is being managed.
 * @param body - Card body element to render into.
 */
async function loadPrivateRating(
  advisorId: string,
  body: HTMLElement
): Promise<void> {
  try {
    const me = await refreshMe();
    if (!me?.authenticated) {
      renderSignedOutRating(body);
      return;
    }
    const state = await api<RatingEnvelope>(
      `/AdvisorRating/${encodeURIComponent(advisorId)}`
    );
    renderRatingForm(body, advisorId, state?.rating ?? {});
  } catch (error) {
    renderRatingError(body, error);
  }
}

/**
 * Renders the signed-out call-to-action inside the rating card.
 * @param body - Card body element to render into.
 */
function renderSignedOutRating(body: HTMLElement): void {
  clear(body);
  body.append(
    el(
      "p",
      { class: "private-rating-note" },
      "Sign in to add private ratings. Public advisor facts stay visible."
    ),
    el(
      "a",
      {
        class: "ab-btn ab-btn--neutral private-rating-link",
        href: "/login.html",
      },
      "Sign in"
    )
  );
}

/**
 * Renders an inline error state when the rating request fails.
 * @param body - Card body element to render into.
 * @param error - Error thrown by the rating request.
 */
function renderRatingError(body: HTMLElement, error: unknown): void {
  clear(body);
  body.appendChild(
    el(
      "p",
      { class: "private-rating-note private-rating-note--error" },
      isAuthFailure(error)
        ? "Sign in again to manage private ratings."
        : "Private ratings are temporarily unavailable."
    )
  );
}

/**
 * Renders the editable rating form, wiring submit to {@link saveRating}.
 * @param body - Card body element to render into.
 * @param advisorId - Advisor whose private rating is being managed.
 * @param rating - Existing private rating values to seed the form.
 */
function renderRatingForm(
  body: HTMLElement,
  advisorId: string,
  rating: PrivateRating
): void {
  const status = el("p", { class: "private-rating-status" });
  const numberControls = ratingControls(rating);
  const review = asHtmlTextAreaElement(
    el(
      "textarea",
      { name: "reviewText", maxlength: "1000", rows: "4" },
      rating.reviewText ?? ""
    )
  );
  const controls: RatingControls = { ...numberControls, reviewText: review };
  const form = el(
    "form",
    {
      class: "private-rating-form",
      onSubmit: (event: Event): void => {
        void saveRating(event, advisorId, controls, status);
      },
    },
    ratingField("Overall", numberControls.ratingInt),
    ratingField("Responsiveness", numberControls.responsiveness),
    ratingField("Transparency", numberControls.transparency),
    ratingField("Performance", numberControls.performance),
    ratingField("Planning depth", numberControls.planningDepth),
    el(
      "label",
      { class: "private-rating-field private-rating-field--wide" },
      "Review",
      review
    ),
    Button({
      variant: "primary",
      type: "submit",
      children: "Save rating",
      attrs: { class: "private-rating-save" },
    }),
    status
  );
  clear(body);
  body.appendChild(form);
}

/**
 * Creates the five numeric rating inputs seeded from the loaded rating.
 * @param rating - Existing private rating values to seed the inputs.
 * @returns Object keyed by rating field with the matching input element.
 */
function ratingControls(rating: PrivateRating): RatingNumberControls {
  const makeInput = (name: RatingFieldName): HTMLInputElement =>
    asHtmlInputElement(
      TextInput({
        name,
        type: "number",
        min: "1",
        max: "5",
        inputmode: "numeric",
        value: ratingValueAttr(rating[name]),
      })
    );
  return {
    ratingInt: makeInput("ratingInt"),
    responsiveness: makeInput("responsiveness"),
    transparency: makeInput("transparency"),
    performance: makeInput("performance"),
    planningDepth: makeInput("planningDepth"),
  };
}

/**
 * Coerces a stored rating field to the string value expected by the input.
 * @param value - Stored numeric rating (or null/undefined for unset).
 * @returns String value safe to assign to a numeric input attribute.
 */
function ratingValueAttr(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/**
 * Wraps a labeled rating input with the 1-5 helper hint.
 * @param label - Human-readable field label.
 * @param input - Numeric input element produced by {@link ratingControls}.
 * @returns Label element wrapping the input.
 */
function ratingField(label: string, input: HTMLInputElement): HTMLElement {
  return el(
    "label",
    { class: "private-rating-field" },
    label,
    input,
    el("span", { class: "private-rating-help" }, "1-5")
  );
}

/**
 * Persists the rating form and reflects success or failure in the status node.
 * @param event - Form submit event from the rating form.
 * @param advisorId - Advisor whose private rating is being managed.
 * @param controls - Form controls collected by {@link renderRatingForm}.
 * @param status - Inline status node updated with the result.
 */
async function saveRating(
  event: Event,
  advisorId: string,
  controls: RatingControls,
  status: HTMLElement
): Promise<void> {
  event.preventDefault();
  status.replaceChildren("Saving...");
  try {
    await postJson(`/AdvisorRating/${encodeURIComponent(advisorId)}`, {
      ratingInt: controls.ratingInt.value,
      responsiveness: controls.responsiveness.value,
      transparency: controls.transparency.value,
      performance: controls.performance.value,
      planningDepth: controls.planningDepth.value,
      reviewText: controls.reviewText.value,
    });
    status.replaceChildren("Saved.");
  } catch (error) {
    status.replaceChildren(
      isAuthFailure(error)
        ? "Sign in again to save ratings."
        : "Could not save rating."
    );
  }
}

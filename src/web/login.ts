// Sign-in page.
// All UI comes from the design system — see docs/design-system.md.

import { isAuthFailure, postJson, refreshMe, search } from "./app.js";
import {
  mountCenteredNarrowPage,
  el,
  SectionCard,
  Heading,
  Button,
  TextInput,
  LabeledField,
} from "./design-system/index.js";

/** Shared DOM controls used by the login submit lifecycle. */
interface SignInControls {
  readonly error: HTMLElement;
  readonly submit: HTMLButtonElement;
  readonly email: HTMLInputElement;
  readonly password: HTMLInputElement;
}

mountCenteredNarrowPage({
  active: "home",
  refreshMe,
  search,
  build({ center }) {
    const controls = signInControls();
    const form = signInForm(controls);

    center.appendChild(
      SectionCard({
        body: [
          Heading({
            level: 2,
            attrs: { class: "card-title" },
            children: "Sign in",
          }),
          el(
            "p",
            {
              class: "sub",
              style:
                "color: var(--ab-color-text-muted); margin: 0 0 16px; font-size: var(--ab-font-size-base);",
            },
            "You can browse advisors, firms and teams without signing in. Sign in to manage data."
          ),
          form,
        ],
      })
    );

    setTimeout(() => controls.email.focus(), 50);
  },
});

/**
 * Narrows a design-system atom (which returns the generic `HTMLElement`
 * type) to the specific DOM subtype the login page actually creates.
 *
 * This is the single adapter at the consumer boundary — every cast in
 * this module flows through here so the design-system signatures stay
 * unchanged for other callers.
 * @param node - Element produced by the design-system atom.
 * @returns The same node, typed as the requested subtype.
 */
function asElement<T extends HTMLElement>(node: HTMLElement): T {
  return node as T;
}

/**
 * Creates the form controls that need to be shared with submit handling.
 * @returns Email input, password input, submit button, and error block.
 */
function signInControls(): SignInControls {
  return {
    error: el("div", {
      class: "ab-empty",
      style: "display:none; color: var(--ab-color-danger); margin-top: 8px;",
    }),
    submit: asElement<HTMLButtonElement>(
      Button({
        variant: "primary",
        type: "submit",
        children: "Sign in",
      })
    ),
    email: asElement<HTMLInputElement>(
      TextInput({
        type: "email",
        name: "email",
        autocomplete: "username",
        required: true,
        placeholder: "you@example.com",
      })
    ),
    password: asElement<HTMLInputElement>(
      TextInput({
        type: "password",
        name: "password",
        autocomplete: "current-password",
        required: true,
      })
    ),
  };
}

/**
 * Builds the sign-in form and wires submit behavior.
 * @param controls - Shared form controls.
 * @returns Form node for the centered login page.
 */
function signInForm(controls: SignInControls): HTMLElement {
  return el(
    "form",
    { onSubmit: (event: Event) => void submitSignIn(event, controls) },
    LabeledField({ label: "Email", input: controls.email }),
    LabeledField({ label: "Password", input: controls.password }),
    el("div", { style: "margin-top: 16px;" }, controls.submit),
    controls.error
  );
}

/**
 * Attempts login and reports authentication errors inline.
 * @param event - Browser submit event.
 * @param controls - Shared form controls.
 */
async function submitSignIn(
  event: Event,
  controls: SignInControls
): Promise<void> {
  event.preventDefault();
  setError(controls, "");
  setSubmitting(controls, true);
  try {
    await postJson("/Login", {
      email: controls.email.value,
      password: controls.password.value,
    });
    await refreshMe();
    location.href = "/";
  } catch (error) {
    setError(controls, error);
  } finally {
    setSubmitting(controls, false);
  }
}

/**
 * Updates the submit button while a login request is running.
 * @param controls - Shared form controls.
 * @param submitting - Whether the request is active.
 */
function setSubmitting(controls: SignInControls, submitting: boolean): void {
  Object.assign(controls.submit, {
    disabled: submitting,
    textContent: submitting ? "Signing in…" : "Sign in",
  });
}

/**
 * Shows or hides the login error message.
 * @param controls - Shared form controls.
 * @param error - Error thrown by the login request, or empty to clear.
 */
function setError(controls: SignInControls, error: unknown): void {
  const message = error
    ? isAuthFailure(error)
      ? "Sign in failed. Check your account access or return to public pages."
      : error instanceof Error
        ? error.message
        : String(error)
    : "";
  Object.assign(controls.error, { textContent: message });
  Object.assign(controls.error.style, { display: message ? "block" : "none" });
}

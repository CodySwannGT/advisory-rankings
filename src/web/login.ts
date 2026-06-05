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

/** Single-column template context used by the centered login page. */
interface CenteredBuildContext {
  readonly center: HTMLElement;
}

/** Attribute subset used by the login form's text inputs. */
type SignInTextInputAttrs = Readonly<Record<string, string | boolean>>;

mountCenteredNarrowPage({
  active: "home",
  refreshMe,
  search,
  build({ center }: CenteredBuildContext): void {
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
 * Creates the form controls that need to be shared with submit handling.
 * @returns Email input, password input, submit button, and error block.
 */
function signInControls(): SignInControls {
  return {
    error: el("div", {
      class: "ab-empty",
      style:
        "display:none; color: var(--ab-color-danger); margin-top: 8px; overflow-wrap: anywhere;",
    }),
    submit: Button({
      variant: "primary",
      type: "submit",
      children: "Sign in",
    }) as HTMLButtonElement,
    email: signInTextInput({
      type: "email",
      name: "email",
      autocomplete: "username",
      required: true,
      placeholder: "you@example.com",
    }),
    password: signInTextInput({
      type: "password",
      name: "password",
      autocomplete: "current-password",
      required: true,
    }),
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
    ? isExpectedCredentialFailure(error)
      ? "Email or password is incorrect."
      : error instanceof Error
        ? error.message
        : String(error)
    : "";
  Object.assign(controls.error, { textContent: message });
  Object.assign(controls.error.style, { display: message ? "block" : "none" });
}

/**
 * Detects authentication failures that should be shown as normal sign-in copy.
 * @param error - Error thrown by the login request.
 * @returns Whether the login failure is expected user-facing auth feedback.
 */
function isExpectedCredentialFailure(error: unknown): boolean {
  const message = errorMessage(error);
  return isAuthFailure(error) || /invalid credentials/iu.test(message);
}

/**
 * Normalizes unknown thrown values before classifying login failures.
 * @param error - Value thrown by the login request.
 * @returns String message for matching and display fallback.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : String(error ?? "");
}

/**
 * Creates a typed input from the design-system's currently generic element API.
 * @param attrs - Input attributes forwarded to the shared TextInput atom.
 * @returns Text input narrowed to the DOM type used by login handlers.
 */
function signInTextInput(attrs: SignInTextInputAttrs): HTMLInputElement {
  return TextInput(attrs) as HTMLInputElement;
}

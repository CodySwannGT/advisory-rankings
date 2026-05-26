// @ts-nocheck
/* eslint-disable jsdoc/require-jsdoc -- This module owns form DOM wiring for the advisor rating card. */
import { api, postJson, refreshMe, isAuthFailure } from "./app.js";
import {
  el,
  clear,
  SectionCard,
  Button,
  TextInput,
} from "./design-system/index.js";

export function privateRatingCard(advisorId) {
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
  loadPrivateRating(advisorId, body);
  return card;
}

async function loadPrivateRating(advisorId, body) {
  try {
    const me = await refreshMe();
    if (!me?.authenticated) {
      renderSignedOutRating(body);
      return;
    }
    const state = await api(`/AdvisorRating/${encodeURIComponent(advisorId)}`);
    renderRatingForm(body, advisorId, state.rating || {});
  } catch (error) {
    renderRatingError(body, error);
  }
}

function renderSignedOutRating(body) {
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

function renderRatingError(body, error) {
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

function renderRatingForm(body, advisorId, rating) {
  const status = el("p", { class: "private-rating-status" });
  const controls = ratingControls(rating);
  const review = el(
    "textarea",
    { name: "reviewText", maxlength: "1000", rows: "4" },
    rating.reviewText || ""
  );
  const form = el(
    "form",
    {
      class: "private-rating-form",
      onSubmit: event =>
        saveRating(
          event,
          advisorId,
          { ...controls, reviewText: review },
          status
        ),
    },
    ratingField("Overall", controls.ratingInt),
    ratingField("Responsiveness", controls.responsiveness),
    ratingField("Transparency", controls.transparency),
    ratingField("Performance", controls.performance),
    ratingField("Planning depth", controls.planningDepth),
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

function ratingControls(rating) {
  return Object.fromEntries(
    [
      "ratingInt",
      "responsiveness",
      "transparency",
      "performance",
      "planningDepth",
    ].map(name => [
      name,
      TextInput({
        name,
        type: "number",
        min: "1",
        max: "5",
        inputmode: "numeric",
        value: rating[name] ?? "",
      }),
    ])
  );
}

function ratingField(label, input) {
  return el(
    "label",
    { class: "private-rating-field" },
    label,
    input,
    el("span", { class: "private-rating-help" }, "1-5")
  );
}

async function saveRating(event, advisorId, controls, status) {
  event.preventDefault();
  status.textContent = "Saving...";
  try {
    await postJson(`/AdvisorRating/${encodeURIComponent(advisorId)}`, {
      ratingInt: controls.ratingInt.value,
      responsiveness: controls.responsiveness.value,
      transparency: controls.transparency.value,
      performance: controls.performance.value,
      planningDepth: controls.planningDepth.value,
      reviewText: controls.reviewText.value,
    });
    status.textContent = "Saved.";
  } catch (error) {
    status.textContent = isAuthFailure(error)
      ? "Sign in again to save ratings."
      : "Could not save rating.";
  }
}
/* eslint-enable jsdoc/require-jsdoc -- This module owns form DOM wiring for the advisor rating card. */

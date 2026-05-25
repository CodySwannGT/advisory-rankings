// @ts-nocheck
import { el } from "./dom.js";
import { Button, EmptyText, Skeleton } from "./atoms.js";
import { SectionCard } from "./organisms-core.js";

const LOADING_SURFACES = new Map([
  ["list", [70, 95, 85]],
  ["detail", [45, 100, 90, 65]],
  ["inline", [60]],
]);

/**
 * Canonical async fallback contract from PRD #141.
 *
 * The object is exported so route code, tests, and documentation can share the
 * same source of truth for message intent and retry behavior while still
 * allowing surface-specific title/action wording.
 */
export const ASYNC_STATE_FALLBACKS = Object.freeze({
  loading: Object.freeze({
    kind: "loading",
    title: "Loading",
    messageIntent: "Content is loading.",
    primaryAction: "Wait for the request to resolve",
    retryRule: "none",
    tone: "neutral",
  }),
  error: Object.freeze({
    kind: "error",
    title: "Could not load",
    messageIntent: "We couldn't load this right now.",
    primaryAction: "Retry the failed request",
    retryRule: "required",
    tone: "error",
    actionLabel: "Retry",
  }),
  empty: Object.freeze({
    kind: "empty",
    title: "No results yet",
    messageIntent: "No results are available yet.",
    primaryAction: "Refresh or adjust search/filter if one exists",
    retryRule: "optional-refresh",
    tone: "empty",
  }),
  notFound: Object.freeze({
    kind: "notFound",
    title: "Item not found",
    messageIntent: "This item could not be found.",
    primaryAction: "Return to the feed or previous navigable surface",
    retryRule: "never",
    tone: "empty",
    actionLabel: "Back to feed",
  }),
  permission: Object.freeze({
    kind: "permission",
    title: "Access needed",
    messageIntent:
      "You don't have access to this content. Sign in again to continue.",
    primaryAction: "Sign in again or return to a safe surface",
    retryRule: "no-automatic-retry",
    tone: "permission",
    actionLabel: "Sign in",
  }),
  partial: Object.freeze({
    kind: "partial",
    title: "Some details are unavailable",
    messageIntent: "Some details couldn't be loaded.",
    primaryAction: "Retry the affected section when practical",
    retryRule: "section-only",
    tone: "warning",
    actionLabel: "Retry section",
  }),
});

/**
 * Resolves a canonical async fallback with surface-specific display overrides.
 *
 * This keeps route implementations aligned with the PRD retry rules while
 * letting pages use concrete titles like "Could not load feed".
 * @param kind - Async state kind to resolve.
 * @param overrides - Surface-specific display values.
 * @returns Immutable fallback config merged with caller overrides.
 */
export function resolveAsyncStateFallback(kind, overrides = {}) {
  const fallback = ASYNC_STATE_FALLBACKS[kind] || ASYNC_STATE_FALLBACKS.error;
  return { ...fallback, ...overrides, kind: fallback.kind };
}

/**
 * Renders stable loading placeholders for list, detail, or inline regions.
 *
 * Skeletons should be preferred for route and section loading because they
 * reserve space for the final layout and avoid blank async regions.
 * @param root0 - Loading-state render options.
 * @param root0.surface - Layout family: list, detail, or inline.
 * @param root0.rows - Number of skeleton groups to render.
 * @param root0.attrs - Element attributes for the wrapper.
 * @returns Loading-state DOM node.
 */
export function LoadingState({ surface = "list", rows = 1, attrs = {} } = {}) {
  const widths = LOADING_SURFACES.get(surface) || LOADING_SURFACES.get("list");
  const children = Array.from({ length: Math.max(1, rows) }, () =>
    el(
      "div",
      { class: "ab-loading-state__group" },
      ...widths.map(width => Skeleton({ width: `${width}%` }))
    )
  );
  return el(
    "div",
    { ...attrs, class: `ab-loading-state ${attrs.class || ""}`.trim() },
    ...children
  );
}

/**
 * Renders the canonical non-loading async state notice.
 *
 * Use this for empty, error, not-found, permission, and partial-resource
 * fallbacks so copy, retry affordance, and telemetry selectors stay consistent.
 * @param root0 - Async state render options.
 * @param root0.kind - Async state kind to render.
 * @param root0.title - Optional surface-specific title.
 * @param root0.body - Optional surface-specific body copy.
 * @param root0.actionLabel - Optional button label.
 * @param root0.onAction - Optional action handler.
 * @param root0.details - Optional non-sensitive detail text.
 * @param root0.attrs - Element attributes for the card.
 * @returns Async state card DOM node.
 */
export function AsyncStateNotice({
  kind = "error",
  title,
  body,
  actionLabel,
  onAction,
  details,
  attrs = {},
} = {}) {
  const fallback = resolveAsyncStateFallback(kind, {
    title,
    messageIntent: body,
    actionLabel,
  });
  const className = [
    "ab-async-state",
    `ab-async-state--${fallback.kind}`,
    attrs.class || "",
  ]
    .filter(Boolean)
    .join(" ");

  return SectionCard({
    title: fallback.title,
    attrs: {
      ...attrs,
      class: className,
      dataset: {
        ...attrs.dataset,
        asyncState: fallback.kind,
        retryRule: fallback.retryRule,
      },
    },
    body: [
      EmptyText({ children: fallback.messageIntent }),
      details ? el("p", { class: "ab-async-state__details" }, details) : null,
      fallback.actionLabel && onAction
        ? Button({
            variant: fallback.kind === "error" ? "primary" : "neutral",
            onClick: onAction,
            children: fallback.actionLabel,
            attrs: { class: "ab-async-state__action" },
          })
        : null,
    ],
  });
}

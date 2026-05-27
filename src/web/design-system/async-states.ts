import { el } from "./dom.js";
import { Button, EmptyText, Skeleton } from "./atoms.js";
import { SectionCard } from "./organisms-core.js";

/** Discriminator literal identifying an async state kind. */
type AsyncStateKind =
  | "loading"
  | "error"
  | "empty"
  | "notFound"
  | "permission"
  | "partial";

/** Layout family for {@link LoadingState} skeleton placeholders. */
type LoadingSurface = "list" | "detail" | "inline";

/** Attribute value shape forwarded to {@link el}. */
type AttrValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | EventListener
  | Readonly<Record<string, string>>;

/** Attribute bag forwarded to rendered DOM nodes. */
type DOMAttrs = Readonly<Record<string, AttrValue>>;

/** Canonical PRD-defined async fallback contract. */
interface AsyncStateFallback {
  readonly kind: AsyncStateKind;
  readonly title: string;
  readonly messageIntent: string;
  readonly primaryAction: string;
  readonly retryRule: string;
  readonly tone: string;
  readonly actionLabel?: string;
}

/** Overrides allowed when resolving a fallback for a specific surface. */
interface AsyncStateFallbackOverrides {
  readonly title?: string;
  readonly messageIntent?: string;
  readonly actionLabel?: string;
}

/** Resolved fallback merged with caller overrides. */
type ResolvedAsyncStateFallback = AsyncStateFallback;

/** Options for the {@link LoadingState} placeholder. */
interface LoadingStateOptions {
  readonly surface?: LoadingSurface;
  readonly rows?: number;
  readonly attrs?: DOMAttrs;
}

/** Options for the {@link AsyncStateNotice} fallback card. */
interface AsyncStateNoticeOptions {
  readonly kind?: AsyncStateKind;
  readonly title?: string;
  readonly body?: string;
  readonly actionLabel?: string;
  readonly onAction?: EventListener;
  readonly details?: string;
  readonly attrs?: DOMAttrs;
}

/** Narrow callable shape for design-system helpers still opting out of TS. */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

const LOADING_SURFACES: ReadonlyMap<LoadingSurface, readonly number[]> =
  new Map([
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
export const ASYNC_STATE_FALLBACKS: Readonly<
  Record<AsyncStateKind, AsyncStateFallback>
> = Object.freeze({
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
} satisfies Record<AsyncStateKind, AsyncStateFallback>);

// `SectionCard` is currently emitted from a producer that still opts out of
// strict checking. Adapt it here through the shared narrow callable shape so
// the rest of this module stays typed without a `@ts-*` directive.
const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;

/**
 * Resolves a canonical async fallback with surface-specific display overrides.
 *
 * This keeps route implementations aligned with the PRD retry rules while
 * letting pages use concrete titles like "Could not load feed".
 * @param kind - Async state kind to resolve.
 * @param overrides - Surface-specific display values.
 * @returns Immutable fallback config merged with caller overrides.
 */
export function resolveAsyncStateFallback(
  kind: AsyncStateKind | string,
  overrides: AsyncStateFallbackOverrides = {}
): ResolvedAsyncStateFallback {
  const fallback = isAsyncStateKind(kind)
    ? ASYNC_STATE_FALLBACKS[kind]
    : ASYNC_STATE_FALLBACKS.error;
  return {
    kind: fallback.kind,
    title: overrides.title ?? fallback.title,
    messageIntent: overrides.messageIntent ?? fallback.messageIntent,
    primaryAction: fallback.primaryAction,
    retryRule: fallback.retryRule,
    tone: fallback.tone,
    actionLabel: overrides.actionLabel ?? fallback.actionLabel,
  };
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
export function LoadingState({
  surface = "list",
  rows = 1,
  attrs = {},
}: LoadingStateOptions = {}): HTMLElement {
  const widths =
    LOADING_SURFACES.get(surface) ?? LOADING_SURFACES.get("list") ?? [];
  const children = Array.from({ length: Math.max(1, rows) }, () =>
    el(
      "div",
      { class: "ab-loading-state__group" },
      ...widths.map(width => Skeleton({ width: `${width}%` }))
    )
  );
  const wrapperClass = `ab-loading-state ${attrClassName(attrs)}`.trim();
  return el("div", { ...attrs, class: wrapperClass }, ...children);
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
}: AsyncStateNoticeOptions = {}): HTMLElement {
  const fallback = resolveAsyncStateFallback(kind, {
    title,
    messageIntent: body,
    actionLabel,
  });
  const className = [
    "ab-async-state",
    `ab-async-state--${fallback.kind}`,
    attrClassName(attrs),
  ]
    .filter(Boolean)
    .join(" ");

  return SectionCardComponent({
    title: fallback.title,
    attrs: {
      ...attrs,
      class: className,
      dataset: {
        ...attrDatasetMap(attrs),
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

/**
 * Type predicate for the {@link AsyncStateKind} discriminator literal.
 * @param value - Candidate kind value.
 * @returns `true` when `value` matches a known async state kind.
 */
function isAsyncStateKind(value: string): value is AsyncStateKind {
  return Object.prototype.hasOwnProperty.call(ASYNC_STATE_FALLBACKS, value);
}

/**
 * Reads an attribute bag's `class` value as a string for safe concatenation.
 * @param attrs - Attribute bag forwarded to a DOM helper.
 * @returns Existing class string, or an empty string when none is set.
 */
function attrClassName(attrs: DOMAttrs): string {
  const raw = attrs.class;
  return typeof raw === "string" ? raw : "";
}

/**
 * Reads an attribute bag's `dataset` value as a plain string-map.
 * @param attrs - Attribute bag forwarded to a DOM helper.
 * @returns Dataset map when present, otherwise an empty object.
 */
function attrDatasetMap(attrs: DOMAttrs): Readonly<Record<string, string>> {
  const raw = attrs.dataset;
  if (!isDatasetMap(raw)) return {};
  return raw;
}

/**
 * Type predicate that narrows an attribute value into the plain string-map
 * shape accepted by `element.dataset`.
 * @param value - Candidate attribute value.
 * @returns `true` when `value` is a plain object suitable for `dataset`.
 */
function isDatasetMap(
  value: AttrValue
): value is Readonly<Record<string, string>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value !== "function"
  );
}

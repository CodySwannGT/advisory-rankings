// Shared loading and partial-failure states for detail/profile routes.

import {
  AsyncStateNotice,
  AsyncStateCard,
  Card,
  EmptyText,
  SectionCard,
  Skeleton,
  clear,
  el,
} from "./design-system/index.js";

/**
 * Narrow callable type for design-system helpers that still opt out of TS.
 */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

const CardComponent = Card as unknown as DesignSystemComponent;
const EmptyTextComponent = EmptyText as unknown as DesignSystemComponent;
const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const SkeletonComponent = Skeleton as unknown as DesignSystemComponent;
const AsyncStateCardComponent =
  AsyncStateCard as unknown as DesignSystemComponent;
const AsyncStateNoticeComponent =
  AsyncStateNotice as unknown as DesignSystemComponent;

/**
 * Options for a detail not-found recovery card.
 */
type DetailNotFoundOptions = Readonly<
  Record<"title" | "actionLabel" | "href", string> &
    Partial<Record<"id", string>>
>;

/**
 * Renders profile/detail placeholders that preserve the final page structure.
 * @param root0 - Route columns and display copy.
 * @param root0.center - Main column node.
 * @param root0.right - Right rail node.
 * @param root0.label - Entity label displayed to assistive tech.
 */
export function renderDetailLoading({
  center,
  right,
  label,
}: Readonly<
  Record<"center" | "right", HTMLElement> & Record<"label", string>
>): void {
  center.appendChild(profileSkeleton(label));
  center.appendChild(sectionSkeleton("Overview"));
  center.appendChild(sectionSkeleton("Related activity"));
  right.appendChild(sectionSkeleton("Details"));
}

/**
 * Renders a route-level load failure without leaking implementation details.
 * @param title - Empty-state title.
 * @param error - Error thrown by the resource request.
 * @returns Empty-state card.
 */
export function DetailErrorCard(title: string, error: unknown): HTMLElement {
  console.error("Detail route failed to load", error);
  return detailErrorNotice({ title });
}

/**
 * Clears a detail route and renders a recoverable error state.
 * @param options - Detail route columns, copy, failure, and retry handler.
 * @param options.center - Main detail column.
 * @param options.right - Right detail rail.
 * @param options.title - Safe user-facing error title.
 * @param options.error - Raw error logged to the console only.
 * @param options.onRetry - Callback invoked by the Retry action.
 */
export function renderRecoverableDetailError({
  center,
  right,
  title,
  error,
  onRetry,
}: Readonly<
  Record<"center" | "right", HTMLElement> &
    Record<"title", string> &
    Record<"error", unknown> &
    Record<"onRetry", () => void>
>): void {
  console.error("Detail route failed to load", error);
  clear(center);
  clear(right);
  center.appendChild(detailErrorNotice({ title, onRetry }));
}

/**
 * Renders a detail-route not-found state with a direct recovery action.
 * @param options - Display copy and destination for the recovery action.
 * @param options.title - Not-found heading.
 * @param options.id - Requested record id.
 * @param options.actionLabel - Recovery button label.
 * @param options.href - Recovery route.
 * @returns Not-found card.
 */
export function DetailNotFoundCard({
  title,
  id,
  actionLabel,
  href,
}: DetailNotFoundOptions): HTMLElement {
  return AsyncStateCardComponent({
    kind: "not-found",
    title,
    body: id ? `Record id: ${id}` : undefined,
    actionLabel,
    onAction: () => {
      window.location.assign(href);
    },
    attrs: {
      class: "detail-not-found-card",
      "data-recovery-href": href,
    },
  });
}

/**
 * Converts optional related-resource arrays into a safe list.
 * @param rows - Resource field that may be an array or an error envelope.
 * @returns Array rows when available, otherwise an empty array.
 */
export function resourceRows(rows: unknown): readonly unknown[] {
  return Array.isArray(rows) ? rows : [];
}

/**
 * Builds a section-level failure card for an optional related resource.
 * @param title - Section title.
 * @param rows - Resource field that may contain an error envelope.
 * @returns Failure card or null when the resource loaded.
 */
export function PartialFailureCard(
  title: string,
  rows: unknown
): HTMLElement | null {
  if (!hasResourceError(rows)) return null;
  return SectionCardComponent({
    title,
    body: EmptyTextComponent({
      children: `${title} could not load. The rest of this profile remains available.`,
    }),
  });
}

/**
 * Checks whether a related-resource payload is an error envelope.
 * @param rows - Resource field that may contain an error value.
 * @returns Whether the resource failed independently.
 */
function hasResourceError(rows: unknown): boolean {
  return (
    typeof rows === "object" &&
    rows !== null &&
    "error" in rows &&
    Boolean((rows as Readonly<Record<string, unknown>>).error)
  );
}

/**
 * Builds safe detail-route error copy and optional retry action.
 * @param options - Display title and optional retry callback.
 * @param options.title - Safe user-facing error title.
 * @param options.onRetry - Optional callback invoked by the Retry action.
 * @returns Error-state card.
 */
function detailErrorNotice({
  title,
  onRetry,
}: Readonly<
  Record<"title", string> & Partial<Record<"onRetry", () => void>>
>): HTMLElement {
  return AsyncStateNoticeComponent({
    kind: "error",
    title,
    body: "Try again shortly.",
    actionLabel: onRetry ? "Retry" : undefined,
    onAction: onRetry,
    attrs: { class: "detail-error-card" },
  });
}

/**
 * Builds a profile masthead skeleton.
 * @param label - Entity label displayed to assistive tech.
 * @returns Skeleton card.
 */
function profileSkeleton(label: string): HTMLElement {
  return CardComponent({
    attrs: {
      class: "detail-loading-card",
      "aria-label": `Loading ${label}`,
      "aria-busy": "true",
    },
    children: [
      el("div", { class: "profile-cover" }),
      el(
        "div",
        { class: "profile-head" },
        SkeletonComponent({
          width: 104,
          height: 104,
          attrs: { class: "profile-avatar" },
        }),
        el(
          "div",
          { class: "profile-title" },
          SkeletonComponent({ width: "60%", height: 28 }),
          SkeletonComponent({ width: "42%", height: 14 }),
          SkeletonComponent({ width: "34%", height: 22 })
        )
      ),
    ],
  });
}

/**
 * Builds a section card skeleton.
 * @param title - Placeholder section label.
 * @returns Skeleton section card.
 */
function sectionSkeleton(title: string): HTMLElement {
  return SectionCardComponent({
    title,
    attrs: { class: "detail-loading-card", "aria-busy": "true" },
    body: [
      SkeletonComponent({ width: "88%" }),
      SkeletonComponent({ width: "72%" }),
      SkeletonComponent({ width: "54%" }),
    ],
  });
}

// @ts-nocheck
// Shared loading and partial-failure states for detail/profile routes.

import {
  Card,
  EmptyCard,
  EmptyText,
  SectionCard,
  Skeleton,
  el,
} from "./design-system/index.js";

/**
 * Renders profile/detail placeholders that preserve the final page structure.
 * @param root0 - Route columns and display copy.
 * @param root0.center - Main column node.
 * @param root0.right - Right rail node.
 * @param root0.label - Entity label displayed to assistive tech.
 */
export function renderDetailLoading({ center, right, label }) {
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
export function DetailErrorCard(title, error) {
  return EmptyCard({
    title,
    body: `Try again shortly. ${String(error?.message || error || "").slice(0, 180)}`,
  });
}

/**
 * Converts optional related-resource arrays into a safe list.
 * @param rows - Resource field that may be an array or an error envelope.
 * @returns Array rows when available, otherwise an empty array.
 */
export function resourceRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

/**
 * Builds a section-level failure card for an optional related resource.
 * @param title - Section title.
 * @param rows - Resource field that may contain an error envelope.
 * @returns Failure card or null when the resource loaded.
 */
export function PartialFailureCard(title, rows) {
  if (!rows?.error) return null;
  return SectionCard({
    title,
    body: EmptyText({
      children: `${title} could not load. The rest of this profile remains available.`,
    }),
  });
}

/**
 * Builds a profile masthead skeleton.
 * @param label - Entity label displayed to assistive tech.
 * @returns Skeleton card.
 */
function profileSkeleton(label) {
  return Card({
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
        Skeleton({
          width: 104,
          height: 104,
          attrs: { class: "profile-avatar" },
        }),
        el(
          "div",
          { class: "profile-title" },
          Skeleton({ width: "60%", height: 28 }),
          Skeleton({ width: "42%", height: 14 }),
          Skeleton({ width: "34%", height: 22 })
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
function sectionSkeleton(title) {
  return SectionCard({
    title,
    attrs: { class: "detail-loading-card", "aria-busy": "true" },
    body: [
      Skeleton({ width: "88%" }),
      Skeleton({ width: "72%" }),
      Skeleton({ width: "54%" }),
    ],
  });
}

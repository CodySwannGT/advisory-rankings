// Public compare-entry actions shared by advisor profiles and directory rows.
//
// The comparison route is URL-backed, so entry points only need to maintain the
// selected advisor ids and navigate to `/compare?ids=...` when the selection is
// valid.

import { Button, el } from "./design-system/index.js";
import {
  comparisonUrl,
  selectedComparisonIdsFromParams,
} from "./compare-selection.js";

const MAX_COMPARISON_ADVISORS = 4;
const CAP_MESSAGE = "Compare supports up to four advisors.";
const DUPLICATE_MESSAGE = "Advisor is already in this comparison.";

/** Options for rendering one compare-entry action. */
export interface CompareEntryOptions {
  readonly advisorId: string;
  readonly label?: string;
  readonly className?: string;
}

/** Navigation target or blocked-selection feedback for a compare entry. */
export interface CompareTarget {
  readonly href?: string;
  readonly message?: string;
}

/**
 * Builds a button plus inline status that adds one advisor to the comparison
 * URL or explains why the current selection cannot accept another advisor.
 * @param options - Advisor id and optional display tweaks.
 * @param options.advisorId - Advisor id to add to the comparison URL.
 * @param options.label - Button label.
 * @param options.className - Extra class applied to the button.
 * @returns Compare-entry control.
 */
export function compareEntryAction({
  advisorId,
  label = "Compare",
  className = "",
}: CompareEntryOptions): HTMLElement {
  const status = el("span", {
    class: "compare-entry-status",
    role: "status",
    "aria-live": "polite",
  });
  const button = Button({
    variant: "neutral",
    type: "button",
    children: label,
    attrs: { class: `compare-entry-button ${className}`.trim() },
    onClick: () => handleCompareEntry(advisorId, status),
  });
  return el("span", { class: "compare-entry-action" }, button, status);
}

/**
 * Returns the comparison URL after adding `advisorId`, or a blocking message.
 * Exported for focused regression coverage without needing a browser.
 * @param advisorId - Advisor id being added.
 * @param currentUrl - Current page URL.
 * @returns Navigation URL or a user-facing block reason.
 */
export function nextComparisonTarget(
  advisorId: string,
  currentUrl: string
): CompareTarget {
  const url = new URL(currentUrl, window.location.origin);
  const ids = selectedComparisonIdsFromParams(url.searchParams);
  if (ids.includes(advisorId)) {
    return { href: comparisonUrl(ids) };
  }
  if (ids.length >= MAX_COMPARISON_ADVISORS) {
    return { message: CAP_MESSAGE };
  }
  return { href: comparisonUrl([...ids, advisorId]) };
}

/**
 * Handles a click on a public compare-entry action.
 * @param advisorId - Advisor id being added.
 * @param status - Inline status node for blocked selections.
 */
function handleCompareEntry(advisorId: string, status: HTMLElement): void {
  const target = nextComparisonTarget(advisorId, window.location.href);
  if (target.href) {
    window.location.href = target.href;
    return;
  }
  status.replaceChildren(target.message ?? DUPLICATE_MESSAGE);
}

// Public compare-entry actions shared by advisor profiles and directory rows.
//
// The comparison route is URL-backed, so entry points only need to maintain the
// selected advisor ids and navigate to `/compare?ids=...` when the selection is
// valid.

import { Button, el } from "./design-system/index.js";

const MAX_COMPARISON_ADVISORS = 4;
const IDS_PARAM = "ids";
const LEGACY_ADVISOR_IDS_PARAM = "advisorIds";
const CAP_MESSAGE = "Compare supports up to four advisors.";
const DUPLICATE_MESSAGE = "Advisor is already in this comparison.";

/** Options for rendering one compare-entry action. */
export interface CompareEntryOptions {
  readonly advisorId: string;
  readonly label?: string;
  readonly className?: string;
  readonly onDirectoryToggle?: (advisorId: string) => void;
  readonly registerDirectoryButton?: (button: HTMLButtonElement) => void;
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
 * @param options.onDirectoryToggle - Optional in-page directory selection handler.
 * @param options.registerDirectoryButton - Optional directory button registration hook.
 * @returns Compare-entry control.
 */
export function compareEntryAction({
  advisorId,
  label = "Compare",
  className = "",
  onDirectoryToggle,
  registerDirectoryButton,
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
    onClick: () =>
      onDirectoryToggle
        ? onDirectoryToggle(advisorId)
        : handleCompareEntry(advisorId, status),
  });
  if (registerDirectoryButton && button instanceof HTMLButtonElement) {
    registerDirectoryButton(button);
  }
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
  const ids = selectedIds(url.searchParams);
  if (ids.includes(advisorId)) {
    return { href: comparisonHref(ids) };
  }
  if (ids.length >= MAX_COMPARISON_ADVISORS) {
    return { message: CAP_MESSAGE };
  }
  return { href: comparisonHref([...ids, advisorId]) };
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

/**
 * Reads comparison ids from the canonical `ids` query parameter, falling back
 * to the older `advisorIds` spelling accepted by the resource.
 * @param params - Current page query params.
 * @returns Deduplicated advisor ids in URL order.
 */
function selectedIds(params: URLSearchParams): readonly string[] {
  const raw = params.get(IDS_PARAM) || params.get(LEGACY_ADVISOR_IDS_PARAM);
  if (!raw) return [];
  return raw
    .split(",")
    .map(id => id.trim())
    .filter(Boolean)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

/**
 * Builds the public comparison route URL for selected advisor ids.
 * @param ids - Advisor ids in selection order.
 * @returns Absolute-path comparison href.
 */
function comparisonHref(ids: readonly string[]): string {
  return `/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}

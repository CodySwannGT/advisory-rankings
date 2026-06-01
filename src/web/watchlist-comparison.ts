// Watchlist-to-comparison selection controls.
//
// The watchlist renderer owns row layout and mutations; this module keeps the
// comparison-specific DOM state small enough to test through the browser suite.

import { ButtonC, elC } from "./watchlist-types.js";

/** Minimum saved advisors required by the comparison route. */
const MIN_COMPARISON_ADVISORS = 2;
/** Maximum saved advisors accepted by the comparison route. */
const MAX_COMPARISON_ADVISORS = 4;

/** DOM controls rendered at the top of a watchlist card. */
export interface WatchlistComparisonControls {
  readonly container: HTMLElement;
  readonly refresh: () => void;
}

/**
 * Builds comparison controls for a single watchlist card.
 * @param listId - Watchlist id used to scope selected checkboxes.
 * @returns Comparison control group plus refresh callback.
 */
export function watchlistComparisonControls(
  listId: string
): WatchlistComparisonControls {
  const status = elC("span", { class: "watchlist-compare-status" });
  const button = ButtonC({
    variant: "primary",
    type: "button",
    children: "Compare selected",
    attrs: {
      class: "watchlist-compare-button",
      disabled: true,
    },
  });
  const refresh = () => updateComparisonButton(button, status, listId);
  const container = elC(
    "div",
    { class: "watchlist-compare-controls" },
    button,
    status
  );
  button.addEventListener("click", () => navigateToComparison(listId));
  refresh();
  return { container, refresh };
}

/**
 * Navigates to the public comparison route when selection count is valid.
 * @param listId - Watchlist card id used to scope selected checkboxes.
 */
function navigateToComparison(listId: string): void {
  const ids = selectedComparisonIds(listId);
  if (!isValidComparisonCount(ids.length)) return;
  window.location.href = `/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}

/**
 * Updates compare button affordance from current card selections.
 * @param button - Compare navigation button.
 * @param status - Inline validation status.
 * @param listId - Watchlist card id used to scope selected checkboxes.
 */
function updateComparisonButton(
  button: HTMLButtonElement,
  status: HTMLElement,
  listId: string
): void {
  const count = selectedComparisonIds(listId).length;
  button.toggleAttribute("disabled", !isValidComparisonCount(count));
  status.replaceChildren(
    count > MAX_COMPARISON_ADVISORS ? "Choose up to four advisors." : ""
  );
}

/**
 * Reads selected advisor ids from one watchlist card.
 * @param listId - Watchlist card id.
 * @returns Selected advisor ids in row order.
 */
function selectedComparisonIds(listId: string): ReadonlyArray<string> {
  const card = document.querySelector(
    `.watchlist-card[data-list-id="${CSS.escape(listId)}"]`
  );
  if (!card) return [];
  return Array.from(
    card.querySelectorAll<HTMLInputElement>(".watchlist-compare-select:checked")
  ).map(input => input.value);
}

/**
 * Checks the comparison route's supported selection size.
 * @param count - Selected advisor count.
 * @returns Whether navigation should be enabled.
 */
function isValidComparisonCount(count: number): boolean {
  return count >= MIN_COMPARISON_ADVISORS && count <= MAX_COMPARISON_ADVISORS;
}

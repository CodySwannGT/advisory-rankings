// Add-to-watchlist entry point shared by the advisor profile and the home-feed
// discovery surface.
//
// This module turns the now-available authenticated `/UserWatchlists` resource
// (shipped by #226) into a reusable affordance for adding an advisor to one of
// the signed-in user's private watchlists. It gates anonymous visitors with a
// safe sign-in path (no private data is fetched or revealed), reuses the pure
// request-body builders and view normalization in `watchlist-logic.ts`, and
// posts the same `addEntry` contract the watchlist management page uses.
//
// Two shapes are exported:
//   • addToWatchlistCard(advisorId)    — a full SectionCard for the advisor
//     profile column (mirrors privateRatingCard).
//   • addToWatchlistControl(advisorId) — a compact, collapsible control for a
//     discovery surface (the home-feed "Recent compliance events" rows).

import { refreshMe, isAuthFailure } from "./app.js";
import { el, clear, SectionCard, Button } from "./design-system/index.js";
import {
  addEntryBody,
  canMutate,
  nextRank,
  normalizeWatchlistResponse,
  signInGuidance,
  type WatchlistView,
} from "./watchlist-logic.js";
import { apiC, postJsonC } from "./watchlist-types.js";

/** Resource path shared by every watchlist read and mutation. */
const WATCHLISTS_PATH = "/UserWatchlists";

/** Class applied to the card's note/copy lines. */
const NOTE_CLASS = "add-watchlist-note";

/**
 * Runtime narrowing helper for the `<select>` element produced by
 * `el("select", ...)`. `instanceof` is a runtime guard, not a cast — the type
 * narrows because TypeScript sees the guard.
 * @param node - Element produced by `el("select", ...)`.
 * @returns The same node, statically typed as `HTMLSelectElement`.
 * @throws If the factory ever returns a non-select element.
 */
function asHtmlSelectElement(node: HTMLElement): HTMLSelectElement {
  if (!(node instanceof HTMLSelectElement)) {
    throw new Error('Expected HTMLSelectElement from el("select", ...)');
  }
  return node;
}

/**
 * Builds the advisor-profile "Add to watchlist" card and starts the async load.
 * @param advisorId - Advisor the card adds to a watchlist.
 * @returns Section card element ready to mount on the advisor page.
 */
export function addToWatchlistCard(advisorId: string): HTMLElement {
  const body = el(
    "div",
    { class: "add-watchlist", "aria-live": "polite" },
    el("p", { class: NOTE_CLASS }, "Loading watchlists…")
  );
  const card = SectionCard({
    title: "Add to watchlist",
    attrs: { class: "add-watchlist-card" },
    body,
  });
  void mountAddToWatchlist(advisorId, body);
  return card;
}

/**
 * Builds the compact discovery-surface control: a toggle button that reveals an
 * inline watchlist picker for the supplied advisor on first expand.
 * @param advisorId - Advisor the control adds to a watchlist.
 * @returns Inline control element for a discovery row.
 */
export function addToWatchlistControl(advisorId: string): HTMLElement {
  const panel = el("div", {
    class: "add-watchlist add-watchlist--inline",
    "aria-live": "polite",
    hidden: "hidden",
  });
  const toggle = Button({
    variant: "neutral",
    type: "button",
    children: "+ Watchlist",
    attrs: { class: "add-watchlist-toggle", "aria-expanded": "false" },
    onClick: () => togglePanel(advisorId, toggle, panel),
  });
  return el("div", { class: "add-watchlist-control" }, toggle, panel);
}

/**
 * Expands or collapses the inline picker, mounting its contents the first time
 * it is opened (tracked via a data attribute, not mutable closure state).
 * @param advisorId - Advisor being added.
 * @param toggle - The toggle button whose aria-expanded reflects panel state.
 * @param panel - The collapsible picker container.
 */
function togglePanel(
  advisorId: string,
  toggle: HTMLElement,
  panel: HTMLElement
): void {
  if (!panel.hasAttribute("hidden")) {
    panel.setAttribute("hidden", "hidden");
    toggle.setAttribute("aria-expanded", "false");
    return;
  }
  panel.removeAttribute("hidden");
  toggle.setAttribute("aria-expanded", "true");
  if (panel.getAttribute("data-mounted") !== "true") {
    panel.setAttribute("data-mounted", "true");
    void mountAddToWatchlist(advisorId, panel);
  }
}

/**
 * Loads the session and the user's watchlists, then renders the right view into
 * the supplied container. Fails closed: any error renders a safe message and
 * never reveals private list data.
 * @param advisorId - Advisor being added.
 * @param body - Container element to render into.
 */
async function mountAddToWatchlist(
  advisorId: string,
  body: HTMLElement
): Promise<void> {
  try {
    const me = await refreshMe();
    if (!canMutate(me)) {
      renderSignedOut(body);
      return;
    }
    const payload = await apiC<unknown>(WATCHLISTS_PATH);
    const view = normalizeWatchlistResponse(payload);
    if (!view.authenticated) {
      renderSignedOut(body);
      return;
    }
    renderPicker(body, advisorId, view.lists);
  } catch (error) {
    renderLoadError(body, error);
  }
}

/**
 * Renders the signed-out call-to-action with a safe sign-in path.
 * @param body - Container element to render into.
 */
function renderSignedOut(body: HTMLElement): void {
  const guidance = signInGuidance();
  clear(body);
  body.append(
    el("p", { class: NOTE_CLASS }, guidance.message),
    el(
      "a",
      {
        class: "ab-btn ab-btn--neutral add-watchlist-signin",
        href: guidance.href,
      },
      guidance.label
    )
  );
}

/**
 * Renders a recoverable load error without leaking private data.
 * @param body - Container element to render into.
 * @param error - Error thrown while loading.
 */
function renderLoadError(body: HTMLElement, error: unknown): void {
  clear(body);
  body.appendChild(
    el(
      "p",
      { class: `${NOTE_CLASS} ${NOTE_CLASS}--error` },
      isAuthFailure(error)
        ? "Sign in again to add advisors to a watchlist."
        : "Watchlists are temporarily unavailable."
    )
  );
}

/**
 * Renders either the list picker or a create-first prompt, depending on whether
 * the signed-in user has any watchlists yet.
 * @param body - Container element to render into.
 * @param advisorId - Advisor being added.
 * @param lists - Normalized watchlists for the signed-in user.
 */
function renderPicker(
  body: HTMLElement,
  advisorId: string,
  lists: ReadonlyArray<WatchlistView>
): void {
  clear(body);
  if (lists.length === 0) {
    renderCreateFirst(body);
    return;
  }
  body.appendChild(listForm(advisorId, lists));
}

/**
 * Renders the create-first prompt linking to the watchlist management page.
 * @param body - Container element to render into.
 */
function renderCreateFirst(body: HTMLElement): void {
  body.append(
    el(
      "p",
      { class: NOTE_CLASS },
      "Create a watchlist first, then add advisors from here."
    ),
    el(
      "a",
      {
        class: "ab-btn ab-btn--primary add-watchlist-create",
        href: "/watchlists",
      },
      "Create a watchlist"
    )
  );
}

/**
 * Builds the list-picker form (select + Add) wired to the add-entry mutation.
 * @param advisorId - Advisor being added.
 * @param lists - Normalized watchlists (non-empty).
 * @returns The picker form element.
 */
function listForm(
  advisorId: string,
  lists: ReadonlyArray<WatchlistView>
): HTMLElement {
  const select = asHtmlSelectElement(
    el(
      "select",
      { name: "watchlist", class: "add-watchlist-select" },
      ...lists.map(list =>
        el("option", { value: list.id }, list.name || "Untitled")
      )
    )
  );
  const status = el("span", { class: "add-watchlist-status", role: "status" });
  return el(
    "form",
    {
      class: "add-watchlist-form",
      onSubmit: (event: Event): void => {
        event.preventDefault();
        void addAdvisor(advisorId, lists, select.value, status);
      },
    },
    select,
    Button({
      variant: "primary",
      type: "submit",
      children: "Add",
      attrs: { class: "add-watchlist-add" },
    }),
    status
  );
}

/**
 * Posts the add-entry mutation for the chosen list, surfacing success or a
 * recoverable failure in the status node.
 * @param advisorId - Advisor being added.
 * @param lists - Normalized watchlists (used to resolve the next rank + name).
 * @param listId - Selected watchlist id.
 * @param status - Inline status node updated with the result.
 */
async function addAdvisor(
  advisorId: string,
  lists: ReadonlyArray<WatchlistView>,
  listId: string,
  status: HTMLElement
): Promise<void> {
  const list = lists.find(candidate => candidate.id === listId);
  if (!list) {
    status.replaceChildren("Choose a watchlist.");
    return;
  }
  status.replaceChildren("Adding…");
  try {
    await postJsonC(
      WATCHLISTS_PATH,
      addEntryBody(list.id, advisorId, nextRank(list.entries), "")
    );
    status.replaceChildren(`Added to ${list.name || "watchlist"}.`);
  } catch (error) {
    status.replaceChildren(
      isAuthFailure(error)
        ? "Sign in again to add advisors."
        : "Could not add to watchlist."
    );
  }
}

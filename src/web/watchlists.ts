// Signed-in watchlist management page.
//
// Loads the authenticated `/UserWatchlists` resource, gates anonymous
// visitors with a safe sign-in path, and renders create / reorder / note /
// remove controls. Non-DOM behavior lives in `watchlist-logic.ts`; rendering
// and mutation wiring live in `watchlist-render.ts`.

import { refreshMe, logout, search, type MeEnvelope } from "./app.js";
import { normalizeWatchlistResponse } from "./watchlist-logic.js";
import {
  renderError,
  renderSignedOut,
  renderWatchlists,
} from "./watchlist-render.js";
import {
  apiC,
  elC,
  MountThreeColumnPage,
  type ThreeColumnLayout,
} from "./watchlist-types.js";

MountThreeColumnPage({
  active: "watchlists",
  refreshMe,
  logout,
  search,
  pageTitle: "Watchlists",
  build({ center }: ThreeColumnLayout): void {
    center.appendChild(
      elC("p", { class: "watchlist-note" }, "Loading watchlists…")
    );
    void load(center);
  },
});

/**
 * Refreshes the current session, returning null instead of throwing on failure.
 * @returns The session envelope, or null when the lookup fails.
 */
async function safeRefreshMe(): Promise<MeEnvelope | null> {
  try {
    return await refreshMe();
  } catch {
    return null;
  }
}

/**
 * Loads the current session and watchlists, then renders the page.
 * @param center - Main content column.
 */
async function load(center: HTMLElement): Promise<void> {
  const me = await safeRefreshMe();
  if (!me?.authenticated) {
    renderSignedOut(center);
    return;
  }
  try {
    const payload = await apiC<unknown>("/UserWatchlists");
    const view = normalizeWatchlistResponse(payload);
    if (!view.authenticated) {
      renderSignedOut(center);
      return;
    }
    renderWatchlists(
      { center, me, reload: () => void load(center) },
      view.lists
    );
  } catch {
    renderError(
      center,
      "Watchlists are temporarily unavailable. Public pages remain available."
    );
  }
}

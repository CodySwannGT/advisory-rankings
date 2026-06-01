import {
  DEFAULT_FEED_MODE,
  FEED_MODE_PARAM,
  normalizeFeedFilters,
} from "./feed-filters.js";

const feedPopstate: Readonly<
  Record<"reload", (() => void) | null> & Record<"listenerInstalled", boolean>
> = { reload: null as (() => void) | null, listenerInstalled: false };

/**
 * Installs the browser-history reload callback for feed filters.
 * @param reloadFeed - Reloads the feed after history navigation.
 */
export function installFeedPopstateReload(reloadFeed: () => void): void {
  Object.assign(feedPopstate, { reload: reloadFeed });
  if (feedPopstate.listenerInstalled) return;
  window.addEventListener("popstate", () => {
    feedPopstate.reload?.();
  });
  Object.assign(feedPopstate, { listenerInstalled: true });
}

/**
 * Builds the feed resource path for the current URL filters.
 * @returns Feed API path with the mode query when needed.
 */
export function feedApiPath(): string {
  const filters = normalizeFeedFilters({
    mode: new URLSearchParams(location.search).get(FEED_MODE_PARAM),
  });
  if (filters.mode === DEFAULT_FEED_MODE) return "/Feed";
  return `/Feed?${new URLSearchParams({ mode: filters.mode }).toString()}`;
}

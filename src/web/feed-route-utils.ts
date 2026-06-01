import type { FeedItem } from "../harper/resource-feed-types.js";
import { api } from "./app.js";
import {
  DEFAULT_FEED_MODE,
  FEED_MODE_PARAM,
  normalizeFeedFilters,
} from "./feed-filters.js";

/** Feed payload returned by the `/Feed` resource. */
export interface FeedPayload {
  readonly items?: readonly FeedItem[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
}

/** Server-side pagination cursor state for the feed. */
export interface FeedCursor {
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

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
 * @param cursor - Opaque server cursor for the next page, when paginating.
 * @returns Feed API path with the mode query and cursor when needed.
 */
export function feedApiPath(cursor?: string | null): string {
  const filters = normalizeFeedFilters({
    mode: new URLSearchParams(location.search).get(FEED_MODE_PARAM),
  });
  const params = new URLSearchParams();
  if (filters.mode !== DEFAULT_FEED_MODE) params.set("mode", filters.mode);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/Feed?${query}` : "/Feed";
}

/**
 * Maps a feed payload to the cursor state for fetching its next page.
 * @param payload - Feed payload returned by the `/Feed` resource.
 * @returns Pagination cursor state.
 */
export function feedCursorFrom(payload: FeedPayload): FeedCursor {
  return {
    cursor: payload.nextCursor ?? null,
    hasMore: payload.hasMore ?? false,
  };
}

/**
 * Fetches the next server page of feed items and hands the caller the new
 * items plus the advanced cursor state.
 * @param cursor - Opaque cursor returned by the previous feed response.
 * @param onPage - Receives the next page's items and cursor state.
 * @param onError - Receives a rejection so the caller can recover (e.g. keep
 *   the "Load more" control so the user can retry a transient failure).
 */
export function fetchNextFeedPage(
  cursor: string,
  onPage: (items: readonly FeedItem[], next: FeedCursor) => void,
  onError: (error: unknown) => void
): void {
  void (api as unknown as (path: string) => Promise<FeedPayload>)(
    feedApiPath(cursor)
  )
    .then(payload => onPage(payload.items ?? [], feedCursorFrom(payload)))
    .catch(onError);
}

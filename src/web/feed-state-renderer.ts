import type { FeedItem } from "../harper/resource-feed-types.js";
import {
  feedCategories,
  filterFeedItems,
  readFeedFilters,
  writeFeedFilters,
} from "./feed-filters.js";
import { fetchNextFeedPage, type FeedCursor } from "./feed-route-utils.js";
import { renderCenter } from "./feed-center.js";
import type { FeedFilterValues, ThreeColumnLayout } from "./index-types.js";

const FEED_PAGE_SIZE = 20;

/** Callback that redraws the feed for a loaded item set and cursor. */
export type FeedStateRenderer = (
  loadedItems: readonly FeedItem[],
  cursor: FeedCursor,
  visibleLimit?: number
) => void;

/** Current state needed to reveal or fetch more feed items. */
export interface LoadMoreFeedItemsOptions {
  readonly cursor: FeedCursor;
  readonly loadedItems: readonly FeedItem[];
  readonly moreLoadedToReveal: boolean;
  readonly renderCurrentState: FeedStateRenderer;
  readonly visibleLimit: number;
}

/**
 * Renders filtered feed rows, pagination controls, and sidebars for one state.
 * @param layout Page columns used by the feed.
 * @param loadedItems Loaded feed rows.
 * @param cursor Pagination cursor.
 * @param visibleLimit Number of loaded rows currently visible.
 * @param reloadFeed Reloads the feed for changed filters.
 * @param renderCurrentState Recursive renderer used by the load-more path.
 * @param renderSidebars Renders sidebars for the visible rows.
 */
export function renderFeedState(
  layout: ThreeColumnLayout,
  loadedItems: readonly FeedItem[],
  cursor: FeedCursor,
  visibleLimit: number,
  reloadFeed: () => void,
  renderCurrentState: FeedStateRenderer,
  renderSidebars: (visibleItems: readonly FeedItem[]) => void
): void {
  const categories = feedCategories(loadedItems);
  const filters = readFeedFilters(categories);
  const filteredItems = filterFeedItems(loadedItems, filters);
  const visibleItems = filteredItems.slice(0, visibleLimit);
  const moreLoadedToReveal = visibleItems.length < filteredItems.length;
  renderCenter(layout.center, visibleItems, {
    categories,
    count: visibleItems.length,
    filters,
    hasMore: moreLoadedToReveal || cursor.hasMore,
    total: filteredItems.length,
    onChange: (nextFilters: FeedFilterValues) => {
      writeFeedFilters(nextFilters);
      reloadFeed();
    },
    onLoadMore: () =>
      loadMoreFeedItems({
        cursor,
        loadedItems,
        moreLoadedToReveal,
        renderCurrentState,
        visibleLimit,
      }),
  });
  renderSidebars(visibleItems);
}

/**
 * Reveals loaded feed rows or fetches the next cursor page.
 * @param options Current feed pagination state.
 */
function loadMoreFeedItems(options: LoadMoreFeedItemsOptions): void {
  const nextLimit = options.visibleLimit + FEED_PAGE_SIZE;
  if (
    options.moreLoadedToReveal ||
    !options.cursor.hasMore ||
    !options.cursor.cursor
  ) {
    options.renderCurrentState(options.loadedItems, options.cursor, nextLimit);
    return;
  }
  fetchNextFeedPage(
    options.cursor.cursor,
    (more, next) =>
      options.renderCurrentState(
        [...options.loadedItems, ...more],
        next,
        nextLimit
      ),
    (error: unknown) => {
      // Keep the loaded set and control so transient fetches can be retried.
      console.error("Feed: load-more page fetch failed", error);
      options.renderCurrentState(
        options.loadedItems,
        options.cursor,
        options.visibleLimit
      );
    }
  );
}

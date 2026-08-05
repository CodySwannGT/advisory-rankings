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
  const view = visibleFeedView(loadedItems, visibleLimit);
  const moreLoadedToReveal =
    view.visibleItems.length < view.filteredItems.length;
  const onLoadMore = loadMoreHandler(
    cursor,
    loadedItems,
    moreLoadedToReveal,
    renderCurrentState,
    visibleLimit
  );
  const options = feedOptionsForState(
    view.categories,
    view.filteredItems,
    view.visibleItems.length,
    moreLoadedToReveal || cursor.hasMore,
    reloadFeed,
    onLoadMore
  );
  renderCenter(layout.center, view.visibleItems, options);
  renderSidebars(view.visibleItems);
}

const visibleFeedView = (
  loadedItems: readonly FeedItem[],
  visibleLimit: number
) => {
  const categories = feedCategories(loadedItems);
  const filteredItems = filterFeedItems(
    loadedItems,
    readFeedFilters(categories)
  );
  return {
    categories,
    filteredItems,
    visibleItems: filteredItems.slice(0, visibleLimit),
  };
};

const feedOptionsForState = (
  categories: readonly string[],
  filteredItems: readonly FeedItem[],
  visibleCount: number,
  hasMore: boolean,
  reloadFeed: () => void,
  onLoadMore: () => void
) =>
  feedCenterOptions(
    categories,
    filteredItems,
    visibleCount,
    hasMore,
    reloadFeed,
    onLoadMore
  );

const loadMoreHandler =
  (
    cursor: FeedCursor,
    loadedItems: readonly FeedItem[],
    moreLoadedToReveal: boolean,
    renderCurrentState: FeedStateRenderer,
    visibleLimit: number
  ): (() => void) =>
  () =>
    loadMoreFeedItems(
      loadMoreOptions(
        cursor,
        loadedItems,
        moreLoadedToReveal,
        renderCurrentState,
        visibleLimit
      )
    );

const feedCenterOptions = (
  categories: readonly string[],
  filteredItems: readonly FeedItem[],
  visibleCount: number,
  hasMore: boolean,
  reloadFeed: () => void,
  onLoadMore: () => void
): Parameters<typeof renderCenter>[2] => ({
  categories,
  count: visibleCount,
  filters: readFeedFilters(categories),
  hasMore,
  total: filteredItems.length,
  onChange: (nextFilters: FeedFilterValues) => {
    writeFeedFilters(nextFilters);
    reloadFeed();
  },
  onLoadMore,
});

const loadMoreOptions = (
  cursor: FeedCursor,
  loadedItems: readonly FeedItem[],
  moreLoadedToReveal: boolean,
  renderCurrentState: FeedStateRenderer,
  visibleLimit: number
): LoadMoreFeedItemsOptions => ({
  cursor,
  loadedItems,
  moreLoadedToReveal,
  renderCurrentState,
  visibleLimit,
});

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

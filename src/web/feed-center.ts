import type { FeedItem } from "../harper/resource-feed-types.js";
import { fmts } from "./app.js";
import { clear } from "./design-system/index.js";
import { feedFilterCard, filterEmptyState } from "./feed-filters.js";
import { ButtonC, EmptyCardC, FeedPostCardC } from "./index-types.js";
import type { FeedRenderState } from "./index-types.js";

/**
 * Renders the center feed column: the filter card, post cards, and the
 * "Load more" control when more items are available.
 * @param root - DOM root node.
 * @param items - Items to render.
 * @param state - Current filter state and callbacks.
 */
export function renderCenter(
  root: HTMLElement,
  items: readonly FeedItem[],
  state: FeedRenderState
): void {
  clear(root);
  root.appendChild(feedFilterCard(state));
  if (!items.length) {
    const empty = state.filters.active
      ? filterEmptyState(state.filters)
      : {
          title: "No articles yet",
          body: "Once the ingest crawler runs, articles appear here.",
        };
    root.appendChild(
      EmptyCardC({
        title: empty.title,
        body: empty.body,
      })
    );
    return;
  }
  for (const item of items) root.appendChild(FeedPostCardC(item, fmts));
  if (state.hasMore) {
    root.appendChild(
      ButtonC({
        variant: "neutral",
        onClick: state.onLoadMore,
        children: "Load more posts",
        attrs: { class: "feed-load-more" },
      })
    );
  }
}

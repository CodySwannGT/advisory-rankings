import type { FeedItem } from "../harper/resource-feed-types.js";

import {
  installFeedPopstateReload,
  type FeedCursor,
} from "./feed-route-utils.js";
import type { LoadMoreFeedItemsOptions } from "./index.js";

export const finishFeedRender = (
  renderCurrentState: LoadMoreFeedItemsOptions["renderCurrentState"],
  items: readonly FeedItem[],
  page: FeedCursor,
  reloadFeed: () => void
): void => {
  renderCurrentState(items, page);
  installFeedPopstateReload(reloadFeed);
};

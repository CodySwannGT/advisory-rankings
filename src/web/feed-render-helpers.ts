import type { FeedItem } from "../harper/resource-feed-types.js";

import {
  installFeedPopstateReload,
  type FeedCursor,
} from "./feed-route-utils.js";
import type { FeedStateRenderer } from "./feed-state-renderer.js";

export const finishFeedRender = (
  renderCurrentState: FeedStateRenderer,
  items: readonly FeedItem[],
  page: FeedCursor,
  reloadFeed: () => void
): void => {
  renderCurrentState(items, page);
  installFeedPopstateReload(reloadFeed);
};

import type {
  ArticleViewErrorPayload,
  ArticleViewPayload,
} from "./article-types.js";

import { PartialFailureCard } from "./detail-state.js";

export const appendArticlePartialFailures = (
  center: HTMLElement,
  d: Exclude<ArticleViewPayload, ArticleViewErrorPayload>
): void => {
  appendIfPresent(center, PartialFailureCard("Article events", d.eventCards));
  appendIfPresent(center, PartialFailureCard("Mentioned firms", d.firms));
  appendIfPresent(center, PartialFailureCard("Mentioned teams", d.teams));
  appendIfPresent(center, PartialFailureCard("Mentioned advisors", d.advisors));
};

const appendIfPresent = (
  parent: HTMLElement,
  child: HTMLElement | null
): void => {
  if (child) parent.appendChild(child);
};

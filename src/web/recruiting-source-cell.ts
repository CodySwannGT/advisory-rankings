import { articlePath } from "./app.js";
import { el } from "./design-system/index.js";
import type { DomChild } from "./design-system/dom.js";
import type { MoveArticle } from "../harper/resource-recruiting-market-types.js";

/**
 * Renders a recent-move article link or the missing-source badge.
 * @param article - Source article attached to a recent move.
 * @param missingSource - Badge rendered when the article has no target.
 * @returns Source link or missing-source tag.
 */
export function moveArticleSource(
  article: MoveArticle | null,
  missingSource: DomChild
): DomChild {
  const href = moveArticleHref(article);
  if (!href) return missingSource;
  return el(
    "a",
    {
      href,
      target: article?.id ? null : "_blank",
      rel: article?.id ? null : "noreferrer",
    },
    article?.headline || "Source"
  );
}

/**
 * Resolves the public or external href for a move article.
 * @param article - Source article attached to a recent move.
 * @returns Internal article path, external URL, or null when unavailable.
 */
function moveArticleHref(article: MoveArticle | null): string | null {
  if (article?.id) return articlePath(article);
  return article?.url ?? null;
}

import { articleSource, fmtDate } from "./app.js";
import { ArticleListBlock, SectionCard } from "./design-system/index.js";

/**
 * Narrow callable type for design-system helpers that still opt out of TS.
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const ArticleListBlockComponent =
  ArticleListBlock as unknown as DesignSystemComponent;
const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;

/**
 * Builds the advisor profile coverage card.
 * @param articles - Article rows to render.
 * @returns Coverage section card.
 */
export function advisorCoverageSection(
  articles: readonly unknown[]
): HTMLElement {
  return SectionCardComponent({
    attrs: { id: "profile-articles" },
    title: `Coverage (${articles.length.toLocaleString()})`,
    body: ArticleListBlockComponent({ articles, fmtDate, articleSource }),
  });
}

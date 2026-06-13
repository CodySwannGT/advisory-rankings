import { DetailsCardComponent, SectionCardComponent } from "./article-types.js";
import type {
  ArticleBodyPayload,
  ArticleMetadata,
  ArticleSourceMetadata,
} from "./article-types.js";
import { articleSource, fmtDate, humanize } from "./app.js";
import { el } from "./design-system/index.js";

/**
 * Builds the optional article body section.
 * @param body - Article body payload from ArticleView.
 * @returns Body card or null when no text is available.
 */
export function articleBodyCard(body: unknown): HTMLElement | null {
  const text = articleBodyText(body);
  return text
    ? SectionCardComponent({
        title: "Article body",
        body: el("div", {}, ...paragraphs(text)),
      })
    : null;
}

/**
 * Builds the source-first card used when the article has no stored body.
 * @param article - Article metadata row.
 * @param body - Article body payload from ArticleView.
 * @returns Link-out card, or null when body text/error content is present.
 */
export function linkOutCard(
  article: ArticleMetadata,
  body: unknown
): HTMLElement | null {
  if (articleBodyText(body) || isResourceErrorPayload(body)) return null;
  const src = articleSource(article) as ArticleSourceMetadata;
  return SectionCardComponent({
    title: "Read the original story",
    attrs: { class: "article-linkout-card" },
    body: [
      el("p", { class: "article-linkout-source" }, `Source: ${src.source}`),
      article.url
        ? el(
            "a",
            {
              href: article.url,
              target: "_blank",
              rel: "noreferrer",
              class: "article-linkout-button",
            },
            src.ctaLabel
          )
        : null,
    ],
  });
}

/**
 * Builds the article metadata sidebar card.
 * @param article - Article metadata row.
 * @returns Details card for the right rail.
 */
export function metadataSection(article: ArticleMetadata): HTMLElement {
  const src = articleSource(article) as ArticleSourceMetadata;
  return DetailsCardComponent({
    title: "About this article",
    pairs: [
      [
        "Source",
        article.url && src.publicOriginalLink !== false
          ? el(
              "a",
              { href: article.url, target: "_blank", rel: "noreferrer" },
              `${src.source} →`
            )
          : article.url
            ? (src.ctaLabel ?? null)
            : null,
      ],
      ["Published", fmtDate(article.publishedDate)],
      ["Category", humanize(article.category)],
      ["Authors", (article.authors || []).join(", ")],
    ],
  });
}

/**
 * Splits article body text into paragraph nodes.
 * @param text - Source text to parse.
 * @returns Paragraph nodes.
 */
function paragraphs(text: string): readonly HTMLElement[] {
  return text.split(/\n{2,}/).map(p => el("p", {}, p));
}

/**
 * Reads stored body text from an ArticleView body payload.
 * @param body - Article body payload from ArticleView.
 * @returns Trimmed article body text or null.
 */
function articleBodyText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const text = (body as ArticleBodyPayload).text?.trim();
  return text || null;
}

/**
 * Detects partial-resource error envelopes.
 * @param value - Resource payload to inspect.
 * @returns Whether the payload represents a failed related resource.
 */
function isResourceErrorPayload(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "error" in value);
}

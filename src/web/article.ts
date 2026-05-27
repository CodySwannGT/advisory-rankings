// Article detail page.
// All UI comes from the design system — see docs/design-system.md.

import {
  api,
  refreshMe,
  logout,
  search,
  fmts,
  fmtDate,
  humanize,
  getArticleIdParam,
  articleSource,
  canonicalizeArticleRoute,
} from "./app.js";
import { clear } from "./design-system/index.js";
import {
  CardC,
  ChipRowC,
  DetailsCardC,
  DisclosureEventCardC,
  EmptyCardC,
  PostHeaderC,
  SectionCardC,
  TransitionEventCardC,
  elC,
  mountThreeColumnPageC,
} from "./design-system-adapters.js";
import {
  DetailErrorCard,
  DetailNotFoundCard,
  PartialFailureCard,
  renderDetailLoading,
  resourceRows,
} from "./detail-state.js";
import { compactProvenance, evidenceSection } from "./article-evidence.js";
import type {
  ArticleBody,
  ArticleDetail,
  RouteError,
} from "../harper/resource-profile-endpoints-types.js";
import type {
  ArticlePayload,
  FeedEventCard,
} from "../harper/resource-feed-types.js";

/** Source attribution slice returned by `articleSource`. */
interface ArticleSourceInfo {
  readonly source: string;
  readonly initials: string;
  readonly ctaLabel: string;
}

mountThreeColumnPageC({
  active: "home",
  refreshMe,
  logout,
  search,
  build({ center, right }) {
    const id = getArticleIdParam();
    if (!id) {
      center.appendChild(
        EmptyCardC({
          title: "No article selected",
          body: "Pick an article from the feed.",
        })
      );
      return;
    }
    renderDetailLoading({ center, right, label: "article" });
    api(`/ArticleView/${encodeURIComponent(id)}`)
      .then((d: ArticleDetail | RouteError) => {
        clear(center);
        clear(right);
        render(d, center, right);
      })
      .catch((err: unknown) => {
        clear(center);
        clear(right);
        center.appendChild(DetailErrorCard("Could not load article", err));
      });
  },
});

/**
 * Renders the loaded article payload into the page columns.
 * @param d - ArticleView response payload (success or route error).
 * @param center - Main content column.
 * @param right - Right sidebar column.
 */
function render(
  d: ArticleDetail | RouteError,
  center: HTMLElement,
  right: HTMLElement
): void {
  if ("error" in d) {
    center.appendChild(
      DetailNotFoundCard({
        title: "Article not found",
        id: d.id,
        actionLabel: "Back to Articles",
        href: "/",
      })
    );
    return;
  }
  const a = d.article;
  const evidenceRows = compactProvenance(resourceRows(d.provenance));

  canonicalizeArticleRoute(a);
  center.appendChild(articleHead(d, a));
  appendIfPresent(center, PartialFailureCard("Article events", d.eventCards));
  appendIfPresent(center, PartialFailureCard("Mentioned firms", d.firms));
  appendIfPresent(center, PartialFailureCard("Mentioned teams", d.teams));
  appendIfPresent(center, PartialFailureCard("Mentioned advisors", d.advisors));
  appendIfPresent(center, articleBodyCard(d.body));
  appendIfPresent(center, PartialFailureCard("Article body", d.body));
  appendIfPresent(center, evidenceSection(evidenceRows));
  appendIfPresent(center, PartialFailureCard("Extracted facts", d.provenance));
  right.appendChild(metadataSection(a));
}

/**
 * Builds the article header card with event cards and mentioned entities.
 * @param d - ArticleView response payload.
 * @param article - Article metadata row.
 * @returns Header card for the article detail page.
 */
function articleHead(d: ArticleDetail, article: ArticlePayload): HTMLElement {
  const src = sourceInfo(article);
  const eventCardRows = resourceRows(d.eventCards);
  return CardC({
    tag: "article",
    children: [
      PostHeaderC({
        initials: src.initials,
        source: src.source,
        authors: article.authors,
        when: fmtDate(article.publishedDate),
        category: article.category,
      }),
      elC("h2", { class: "post-headline" }, article.headline || "(untitled)"),
      article.dek ? elC("div", { class: "post-dek" }, article.dek) : null,
      ...eventCards(eventCardRows),
      ChipRowC({
        firms: resourceRows(d.firms),
        teams: resourceRows(d.teams),
        advisors: resourceRows(d.advisors),
      }),
      articleFooter(article, src),
    ],
  });
}

/**
 * Converts article event payloads into matching event cards.
 * @param cards - Transition and disclosure card payloads.
 * @returns Rendered event card nodes.
 */
function eventCards(cards: readonly unknown[]): readonly HTMLElement[] {
  return cards
    .map(card => renderEventCard(card))
    .filter((node): node is HTMLElement => node !== null);
}

/**
 * Dispatches a single event-card payload to its design-system renderer.
 * @param card - One transition or disclosure event card.
 * @returns Rendered card node or null when the kind is unrecognized.
 */
function renderEventCard(card: unknown): HTMLElement | null {
  const kind = eventCardKind(card);
  if (kind === "transition") return TransitionEventCardC(card, fmts);
  if (kind === "disclosure") return DisclosureEventCardC(card, fmts);
  return null;
}

/**
 * Reads the discriminant of an event-card payload safely.
 * @param card - Event-card row of unknown shape.
 * @returns The card's `kind` when it is a recognized FeedEventCard kind.
 */
function eventCardKind(card: unknown): FeedEventCard["kind"] | undefined {
  if (typeof card !== "object" || card === null) return undefined;
  const kind = (card as Readonly<Record<string, unknown>>).kind;
  return kind === "transition" || kind === "disclosure" ? kind : undefined;
}

/**
 * Builds the outbound source link row for the article card.
 * @param article - Article metadata row.
 * @param source - Source attribution metadata.
 * @returns Footer node with the original article link.
 */
function articleFooter(
  article: ArticlePayload,
  source: ArticleSourceInfo
): HTMLElement {
  return elC(
    "div",
    { class: "post-footer" },
    article.url
      ? elC(
          "a",
          {
            href: article.url,
            target: "_blank",
            rel: "noreferrer",
            class: "ext-link",
          },
          source.ctaLabel
        )
      : null
  );
}

/**
 * Builds the optional article body section.
 * @param body - Article body payload from ArticleView.
 * @returns Body card or null when no text is available.
 */
function articleBodyCard(body: ArticleBody): HTMLElement | null {
  return body?.text
    ? SectionCardC({
        title: "Article body",
        body: elC("div", {}, ...paragraphs(body.text)),
      })
    : null;
}

/**
 * Builds the article metadata sidebar card.
 * @param article - Article metadata row.
 * @returns Details card for the right rail.
 */
function metadataSection(article: ArticlePayload): HTMLElement {
  const src = sourceInfo(article);
  return DetailsCardC({
    title: "Article metadata",
    pairs: [
      ["Slug", article.slug],
      ["Category", humanize(article.category)],
      ["Published", fmtDate(article.publishedDate)],
      ["Modified", fmtDate(article.modifiedDate)],
      ["Authors", (article.authors || []).join(", ")],
      [
        "Source",
        article.url
          ? elC(
              "a",
              { href: article.url, target: "_blank", rel: "noreferrer" },
              `${src.source} →`
            )
          : null,
      ],
    ],
  });
}

/**
 * Narrows the still-untyped `articleSource()` helper to a typed slice.
 * @param article - Article metadata row.
 * @returns Source label, initials, and outbound CTA label.
 */
function sourceInfo(article: ArticlePayload): ArticleSourceInfo {
  const raw = articleSource(article) as unknown as Readonly<
    Record<string, unknown>
  >;
  return {
    source: typeof raw.source === "string" ? raw.source : "External",
    initials: typeof raw.initials === "string" ? raw.initials : "?",
    ctaLabel:
      typeof raw.ctaLabel === "string" ? raw.ctaLabel : "Read original →",
  };
}

/**
 * Appends a node only when the section exists.
 * @param parent - Parent column node.
 * @param child - Optional section node.
 */
function appendIfPresent(parent: HTMLElement, child: HTMLElement | null): void {
  if (child) parent.appendChild(child);
}

/**
 * Splits article body text into paragraph nodes.
 * @param text - Source text to parse.
 * @returns Paragraph nodes.
 */
function paragraphs(text: string): readonly HTMLElement[] {
  return text.split(/\n{2,}/).map(p => elC("p", {}, p));
}

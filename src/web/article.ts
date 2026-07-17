// Article detail page.
// All UI comes from the design system — see docs/design-system.md.

import {
  CardComponent,
  ChipRowComponent,
  DisclosureEventCardComponent,
  PostHeaderComponent,
  ScrollableTableComponent,
  SectionCardComponent,
  TransitionEventCardComponent,
} from "./article-types.js";
import type {
  ArticleEventCard,
  ArticleHeadOptions,
  ArticleMetadata,
  ArticleProvenancePayload,
  ArticleSourceMetadata,
  ArticleViewErrorPayload,
  ArticleViewPayload,
  EntityChipPayload,
  EvidenceTableRow,
} from "./article-types.js";
import {
  api,
  refreshMe,
  logout,
  search,
  fmts,
  fmtDate,
  getArticleIdParam,
  articleSource,
  canonicalizeArticleRoute,
} from "./app.js";
import {
  articleBodyCard,
  linkOutCard,
  metadataSection,
} from "./article-presentation.js";
import {
  limitationsSection,
  type ArticleLimitationResources,
} from "./article-limitations.js";
import { articleEvidenceMap } from "./article-evidence-map.js";
import {
  mountThreeColumnPage,
  el,
  EmptyCard,
  clear,
} from "./design-system/index.js";
import {
  DetailNotFoundCard,
  PartialFailureCard,
  renderDetailLoading,
  renderRecoverableDetailError,
  resourceRows,
} from "./detail-state.js";
import { compactProvenance } from "./article-provenance.js";

const OUTBOUND_ARTICLE_ATTRS = {
  target: "_blank",
  rel: "noreferrer",
  class: "ext-link",
} as const;

mountThreeColumnPage({
  active: "home",
  refreshMe,
  logout,
  search,
  build({ center, right }: Readonly<Record<"center" | "right", HTMLElement>>) {
    const id = getArticleIdParam();
    if (!id) {
      center.appendChild(
        EmptyCard({
          title: "No article selected",
          body: "Pick an article from the feed.",
        })
      );
      return;
    }
    const loadArticle = (): void => {
      clear(center);
      clear(right);
      renderDetailLoading({ center, right, label: "article" });
      api<ArticleViewPayload>(`/ArticleView/${encodeURIComponent(id)}`)
        .then(d => {
          clear(center);
          clear(right);
          render(d, center, right);
        })
        .catch((err: unknown) => {
          renderRecoverableDetailError({
            center,
            right,
            title: "Could not load article",
            error: err,
            onRetry: loadArticle,
          });
        });
    };

    loadArticle();
  },
});

/**
 * Renders render into the page.
 * @param d - d used by this operation.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 * @returns The rendered DOM node or section.
 */
function render(
  d: ArticleViewPayload,
  center: HTMLElement,
  right: HTMLElement
): void {
  if (isArticleViewError(d)) {
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
  const resources = articleResources(d);

  canonicalizeArticleRoute(a);
  center.append(
    articleHead({
      article: a,
      events: resources.events,
      firms: resources.firmRows,
      teams: resources.teamRows,
      advisors: resources.advisorRows,
    }),
    articleEvidenceMap(a, resources)
  );
  appendArticleSections(center, d, a, resources);
  right.appendChild(metadataSection(a));
}

/**
 * Appends optional article sections after the masthead.
 * @param center - Main content column.
 * @param d - Successful ArticleView payload.
 * @param article - Article metadata row.
 * @param resources - Normalized article resources.
 */
function appendArticleSections(
  center: HTMLElement,
  d: Exclude<ArticleViewPayload, ArticleViewErrorPayload>,
  article: ArticleMetadata,
  resources: ArticleLimitationResources
): void {
  [
    limitationsSection(resources),
    PartialFailureCard("Article events", d.eventCards),
    PartialFailureCard("Mentioned firms", d.firms),
    PartialFailureCard("Mentioned teams", d.teams),
    PartialFailureCard("Mentioned advisors", d.advisors),
    articleBodyCard(d.body),
    linkOutCard(article, d.body),
    PartialFailureCard("Article body", d.body),
    evidenceSection(resources.evidenceRows),
    PartialFailureCard("Extracted facts", d.provenance),
  ].forEach(section => appendIfPresent(center, section));
}

/**
 * Normalizes public ArticleView resource fields for article sections.
 * @param d - Successful ArticleView payload.
 * @returns Public resource rows and their raw payloads.
 */
function articleResources(
  d: Exclude<ArticleViewPayload, ArticleViewErrorPayload>
): ArticleLimitationResources {
  const provenanceRows = resourceRows(
    d.provenance
  ) as readonly ArticleProvenancePayload[];
  return {
    body: d.body,
    eventCards: d.eventCards,
    events: resourceRows(d.eventCards) as readonly ArticleEventCard[],
    firms: d.firms,
    firmRows: resourceRows(d.firms) as readonly EntityChipPayload[],
    teams: d.teams,
    teamRows: resourceRows(d.teams) as readonly EntityChipPayload[],
    advisors: d.advisors,
    advisorRows: resourceRows(d.advisors) as readonly EntityChipPayload[],
    provenance: d.provenance,
    provenanceRows,
    evidenceRows: compactProvenance(provenanceRows),
  };
}

/**
 * Builds the article header card with event cards and mentioned entities.
 * @param options - Public article content rows.
 * @param options.article - Article metadata row.
 * @param options.events - Public article event cards.
 * @param options.firms - Public firm chip rows.
 * @param options.teams - Public team chip rows.
 * @param options.advisors - Public advisor chip rows.
 * @returns Header card for the article detail page.
 */
function articleHead({
  article,
  events,
  firms,
  teams,
  advisors,
}: ArticleHeadOptions): HTMLElement {
  const src = articleSource(article) as ArticleSourceMetadata;
  return CardComponent({
    tag: "article",
    children: [
      PostHeaderComponent({
        initials: src.initials,
        source: src.source,
        authors: article.authors,
        when: fmtDate(article.publishedDate),
        category: article.category,
      }),
      el("h1", { class: "post-headline" }, article.headline || "(untitled)"),
      article.dek ? el("div", { class: "post-dek" }, article.dek) : null,
      ...eventCards(events),
      ChipRowComponent({
        firms,
        teams,
        advisors,
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
function eventCards(
  cards: readonly ArticleEventCard[]
): readonly HTMLElement[] {
  return cards
    .map(card =>
      card.kind === "transition"
        ? TransitionEventCardComponent(card, fmts)
        : card.kind === "disclosure"
          ? DisclosureEventCardComponent(card, fmts)
          : null
    )
    .filter((card): card is HTMLElement => card !== null);
}

/**
 * Builds the outbound source link row for the article card.
 * @param article - Article metadata row.
 * @param source - Source attribution metadata.
 * @returns Footer node with the original article link.
 */
function articleFooter(
  article: ArticleMetadata,
  source: ArticleSourceMetadata
): HTMLElement {
  return el(
    "div",
    { class: "post-footer" },
    article.url
      ? el(
          "a",
          { ...OUTBOUND_ARTICLE_ATTRS, href: article.url },
          source.ctaLabel
        )
      : null
  );
}

/**
 * Builds the source-backed article facts section.
 * @param rows - Deduplicated provenance rows.
 * @returns Evidence card or null when no public facts have source context.
 */
function evidenceSection(
  rows: readonly EvidenceTableRow[]
): HTMLElement | null {
  return rows.length
    ? SectionCardComponent({
        title: `Source-backed facts (${rows.length})`,
        body: ScrollableTableComponent(evidenceTable(rows)),
      })
    : null;
}

/**
 * Renders extracted facts in a compact table.
 * @param rows - Deduplicated provenance rows.
 * @returns Table node wrapped by the evidence section.
 */
function evidenceTable(rows: readonly EvidenceTableRow[]): HTMLElement {
  const head = el(
    "tr",
    {},
    ...["Fact", "Source context"].map(label => el("th", {}, label))
  );
  const bodyRows = rows.map(row =>
    el("tr", {}, el("td", {}, row.field), el("td", {}, row.value))
  );
  return el(
    "table",
    { class: "snap-table" },
    el("thead", {}, head),
    el("tbody", {}, ...bodyRows)
  );
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
 * Narrows ArticleView responses to the route error envelope.
 * @param payload - ArticleView response payload.
 * @returns Whether the payload is an error response.
 */
function isArticleViewError(
  payload: ArticleViewPayload
): payload is ArticleViewErrorPayload {
  return "error" in payload && Boolean(payload.error);
}

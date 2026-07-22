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
  CompactProvenanceAccumulator,
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
  humanize,
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
import { appendArticlePartialFailures } from "./article-render-helpers.js";

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
  const resources = articleResources(d);
  canonicalizeArticleRoute(d.article);
  center.appendChild(
    articleHead({
      article: d.article,
      events: resources.events,
      firms: resources.firmRows,
      teams: resources.teamRows,
      advisors: resources.advisorRows,
    })
  );
  center.appendChild(articleEvidenceMap(d.article, resources));
  appendIfPresent(center, limitationsSection(resources));
  appendArticlePartialFailures(center, d);
  appendIfPresent(center, articleBodyCard(d.body));
  appendIfPresent(center, linkOutCard(d.article, d.body));
  appendIfPresent(center, PartialFailureCard("Article body", d.body));
  appendIfPresent(center, evidenceSection(resources.evidenceRows));
  appendIfPresent(center, PartialFailureCard("Extracted facts", d.provenance));
  right.appendChild(metadataSection(d.article));
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
  return el(
    "table",
    { class: "snap-table" },
    el(
      "thead",
      {},
      el("tr", {}, el("th", {}, "Fact"), el("th", {}, "Source context"))
    ),
    el(
      "tbody",
      {},
      ...rows.map(row =>
        el("tr", {}, el("td", {}, row.field), el("td", {}, row.value))
      )
    )
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

/**
 * Deduplicates extracted article facts by normalized field/value pairs.
 * @param rows - Provenance rows returned by ArticleView.
 * @returns Compact provenance rows for display.
 */
function compactProvenance(
  rows: readonly ArticleProvenancePayload[]
): readonly EvidenceTableRow[] {
  return rows.reduce(
    (acc: CompactProvenanceAccumulator, row) => {
      const fact = humanFacingFact(row);
      const context = sourceContext(row);
      if (!fact || !context) return acc;
      const value = `${context}`;
      const field = fact;
      const key = `${field.toLowerCase()}::${value.toLowerCase()}`;
      if (acc.keys.includes(key)) return acc;
      return {
        keys: [...acc.keys, key],
        rows: [...acc.rows, { field, value }],
      };
    },
    { keys: [], rows: [] }
  ).rows;
}

/**
 * Builds a public fact label from the asserted value and field.
 * @param row - Provenance row returned by ArticleView.
 * @returns Human-facing fact summary or null when no value exists.
 */
function humanFacingFact(row: ArticleProvenancePayload): string | null {
  const value = String(row.assertedValue ?? "").trim();
  if (!value) return null;
  const field = publicFactLabel(row.fieldName);
  return field ? `${value} (${field})` : value;
}

/**
 * Maps raw extraction fields to public article labels.
 * @param fieldName - Raw provenance field name.
 * @returns Product-language label.
 */
function publicFactLabel(fieldName: unknown): string | null {
  const raw = String(fieldName ?? "")
    .trim()
    .toLowerCase();
  if (raw === "money_mention" || raw === "money mention") {
    return "Reported amount";
  }
  return humanize(fieldName) || null;
}

/**
 * Extracts source context that explains what a fact refers to.
 * @param row - Provenance row returned by ArticleView.
 * @returns Source phrase when it adds context beyond the raw value.
 */
function sourceContext(row: ArticleProvenancePayload): string | null {
  const value = String(row.assertedValue ?? "").trim();
  const quote = String(row.quotePhrase ?? "").trim();
  if (!quote || quote.toLowerCase() === value.toLowerCase()) return null;
  return quote;
}

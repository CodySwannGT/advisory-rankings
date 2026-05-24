// @ts-nocheck
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
import {
  mountThreeColumnPage,
  el,
  EmptyCard,
  SectionCard,
  Card,
  PostHeader,
  ChipRow,
  DetailsCard,
  TransitionEventCard,
  DisclosureEventCard,
  ScrollableTable,
  clear,
} from "./design-system/index.js";
import {
  DetailErrorCard,
  PartialFailureCard,
  renderDetailLoading,
  resourceRows,
} from "./detail-state.js";

mountThreeColumnPage({
  active: "home",
  refreshMe,
  logout,
  search,
  build({ center, right }) {
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
    renderDetailLoading({ center, right, label: "article" });
    api(`/ArticleView/${encodeURIComponent(id)}`)
      .then(d => {
        clear(center);
        clear(right);
        render(d, center, right);
      })
      .catch(err => {
        clear(center);
        clear(right);
        center.appendChild(DetailErrorCard("Could not load article", err));
      });
  },
});

/**
 * Renders render into the page.
 * @param d - d used by this operation.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 * @returns The rendered DOM node or section.
 */
function render(d, center, right) {
  if (d.error) {
    center.appendChild(
      EmptyCard({ title: "Article not found", body: d.id || "" })
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
function articleHead(d, article) {
  const src = articleSource(article);
  const eventCardRows = resourceRows(d.eventCards);
  return Card({
    tag: "article",
    children: [
      PostHeader({
        initials: src.initials,
        source: src.source,
        authors: article.authors,
        when: fmtDate(article.publishedDate),
        category: article.category,
      }),
      el("h2", { class: "post-headline" }, article.headline || "(untitled)"),
      article.dek ? el("div", { class: "post-dek" }, article.dek) : null,
      ...eventCards(eventCardRows),
      ChipRow({
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
function eventCards(cards) {
  return cards
    .map(card =>
      card.kind === "transition"
        ? TransitionEventCard(card, fmts)
        : card.kind === "disclosure"
          ? DisclosureEventCard(card, fmts)
          : null
    )
    .filter(Boolean);
}

/**
 * Builds the outbound source link row for the article card.
 * @param article - Article metadata row.
 * @param source - Source attribution metadata.
 * @returns Footer node with the original article link.
 */
function articleFooter(article, source) {
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
 * Builds the optional article body section.
 * @param body - Article body payload from ArticleView.
 * @returns Body card or null when no text is available.
 */
function articleBodyCard(body) {
  return body?.text
    ? SectionCard({
        title: "Article body",
        body: el("div", {}, ...paragraphs(body.text)),
      })
    : null;
}

/**
 * Builds the extracted-facts evidence section.
 * @param rows - Deduplicated provenance rows.
 * @returns Evidence card or null when no extracted facts exist.
 */
function evidenceSection(rows) {
  return rows.length
    ? SectionCard({
        title: `Extracted facts (${rows.length})`,
        body: ScrollableTable(evidenceTable(rows)),
      })
    : null;
}

/**
 * Renders extracted facts in a compact table.
 * @param rows - Deduplicated provenance rows.
 * @returns Table node wrapped by the evidence section.
 */
function evidenceTable(rows) {
  return el(
    "table",
    { class: "snap-table" },
    el("thead", {}, el("tr", {}, el("th", {}, "Field"), el("th", {}, "Value"))),
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
 * Builds the article metadata sidebar card.
 * @param article - Article metadata row.
 * @returns Details card for the right rail.
 */
function metadataSection(article) {
  const src = articleSource(article);
  return DetailsCard({
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
          ? el(
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
 * Appends a node only when the section exists.
 * @param parent - Parent column node.
 * @param child - Optional section node.
 */
function appendIfPresent(parent, child) {
  if (child) parent.appendChild(child);
}

/**
 * Splits article body text into paragraph nodes.
 * @param text - Source text to parse.
 * @returns Paragraph nodes.
 */
function paragraphs(text) {
  return text.split(/\n{2,}/).map(p => el("p", {}, p));
}

/**
 * Deduplicates extracted article facts by normalized field/value pairs.
 * @param rows - Provenance rows returned by ArticleView.
 * @returns Compact provenance rows for display.
 */
function compactProvenance(rows) {
  return rows.reduce(
    (acc, row) => {
      const field = humanize(row.fieldName);
      const value = String(row.assertedValue || row.quotePhrase || "").trim();
      if (!field || !value) return acc;
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

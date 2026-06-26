import type { SourceArticleTriageRow } from "../harper/resource-source-article-triage.js";

import { fmtDate } from "./app.js";
import { articleSource } from "./app-formatters.js";
import { Tag, el } from "./design-system/index.js";
import { feedCategoryLabel } from "./feed-category-labels.js";

/** Callable adapter for untyped design-system components. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

const TagC = Tag as unknown as DesignSystemComponent;

/**
 * Builds one article triage row.
 * @param row - Source article triage row.
 * @returns Row element.
 */
export function sourceArticleTriageRowCard(
  row: SourceArticleTriageRow
): HTMLElement {
  return el(
    "article",
    { class: "source-triage-row" },
    rowMain(row),
    rowCounts(row),
    rowState(row),
    rowActions(row)
  );
}

/**
 * Builds the headline, metadata, and reason labels for a row.
 * @param row - Source article triage row.
 * @returns Main row section.
 */
function rowMain(row: SourceArticleTriageRow): HTMLElement {
  const source = articleSource({ url: row.sourceUrl });
  return el(
    "div",
    { class: "source-triage-row-main" },
    el(
      "a",
      { class: "source-triage-title", href: row.articleViewPath },
      row.headline || "Untitled source article"
    ),
    el(
      "div",
      { class: "source-triage-meta" },
      fmtDate(row.publishedDate, { mode: "short" }),
      " · ",
      source.source,
      " · ",
      feedCategoryLabel(row.category ?? "")
    ),
    el(
      "div",
      { class: "source-triage-reasons" },
      ...row.reasons.map(reason =>
        TagC({ kind: "warn", children: reason.label })
      )
    )
  );
}

/**
 * Builds extraction count pills for a row.
 * @param row - Source article triage row.
 * @returns Counts section.
 */
function rowCounts(row: SourceArticleTriageRow): HTMLElement {
  return el(
    "div",
    { class: "source-triage-counts", "aria-label": "Extraction counts" },
    countPill("Advisors", row.advisorCount),
    countPill("Firms", row.firmCount),
    countPill("Teams", row.teamCount),
    countPill("Events", row.eventCardCount)
  );
}

/**
 * Builds body/provenance state lines for a row.
 * @param row - Source article triage row.
 * @returns State section.
 */
function rowState(row: SourceArticleTriageRow): HTMLElement {
  return el(
    "div",
    { class: "source-triage-state" },
    stateLine("Body", row.hasBody ? "Loaded" : "Missing"),
    stateLine(
      "Provenance",
      `${row.provenanceCount} total, ${row.candidateProvenanceCount} candidate`
    )
  );
}

/**
 * Builds ArticleView and original-source links for a row.
 * @param row - Source article triage row.
 * @returns Actions section.
 */
function rowActions(row: SourceArticleTriageRow): HTMLElement {
  const source = articleSource({ url: row.sourceUrl });
  return el(
    "div",
    { class: "source-triage-actions" },
    el("a", { href: row.articleViewPath }, "ArticleView"),
    source.publicOriginalLink
      ? el(
          "a",
          {
            href: row.sourceUrl,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Original source"
        )
      : null
  );
}

/**
 * Builds one extraction count pill.
 * @param label - Count label.
 * @param value - Count value.
 * @returns Count element.
 */
function countPill(label: string, value: number): HTMLElement {
  return el(
    "span",
    { class: "source-triage-count-pill" },
    el("span", {}, label),
    el("strong", {}, String(value))
  );
}

/**
 * Builds one key/value state line.
 * @param label - State label.
 * @param value - State value.
 * @returns State line element.
 */
function stateLine(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "source-triage-state-line" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

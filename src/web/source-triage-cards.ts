import type { SourceArticleTriageResponse } from "../harper/resource-source-article-triage.js";
import {
  SOURCE_ARTICLE_TRIAGE_REASON_TOKENS,
  sourceArticleTriageReasonLabel,
  type SourceArticleTriageReason,
} from "../harper/resource-source-article-triage-reasons.js";

import { fmtDate } from "./app.js";
import { Button, EmptyCard, SectionCard, el } from "./design-system/index.js";
import { feedCategoryLabel } from "./feed-category-labels.js";

/** Callable adapter for untyped design-system components. */
type DesignSystemComponent = (...args: ReadonlyArray<unknown>) => HTMLElement;

const ButtonC = Button as unknown as DesignSystemComponent;
const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;
const SectionCardC = SectionCard as unknown as DesignSystemComponent;

const CATEGORY_OPTIONS = [
  "",
  "unknown",
  "advisorhub_article",
  "firm_bio",
  "press",
  "rankings",
  "web_research",
];

/**
 * Builds the page summary header.
 * @param data - Triage resource response.
 * @returns Header card.
 */
export function headerCard(data: SourceArticleTriageResponse): HTMLElement {
  return SectionCardC({
    title: "Source Article Triage",
    attrs: { class: "source-triage-header" },
    body: [
      el(
        "p",
        { class: "source-triage-lede" },
        "Public source articles with observable extraction gaps, linked back to ArticleView and original sources."
      ),
      el(
        "div",
        { class: "source-triage-stat-grid" },
        stat("Rows", String(data.count)),
        stat("Category", filterLabel(data.filters.category)),
        stat("Reason", reasonLabel(data.filters.reason))
      ),
    ],
  });
}

/**
 * Builds the GET-backed filter form.
 * @param data - Current resource payload.
 * @returns Filter card.
 */
export function filterCard(data: SourceArticleTriageResponse): HTMLElement {
  return SectionCardC({
    title: "Filters",
    attrs: { class: "source-triage-filter-card" },
    body: el(
      "form",
      {
        class: "source-triage-filters",
        method: "get",
        action: "/source-triage",
      },
      selectField(
        "Category",
        "category",
        data.filters.category,
        CATEGORY_OPTIONS.map(value => [value, filterLabel(value)] as const)
      ),
      selectField("Reason", "reason", data.filters.reason ?? "", [
        ["", "All reasons"],
        ...SOURCE_ARTICLE_TRIAGE_REASON_TOKENS.map(
          token => [token, sourceArticleTriageReasonLabel(token)] as const
        ),
      ]),
      ButtonC({
        variant: "primary",
        children: "Apply",
        attrs: { type: "submit" },
      }),
      ButtonC({
        variant: "neutral",
        children: "Clear",
        onClick: () => {
          location.href = "/source-triage";
        },
        attrs: {
          type: "button",
        },
      })
    ),
  });
}

/**
 * Builds the no-results state.
 * @returns Empty state card.
 */
export function emptyResultsCard(): HTMLElement {
  return EmptyCardC({
    title: "No source articles match these filters",
    body: [
      "Try another category or reason, or return to the broader Feed. ",
      el("a", { href: "/" }, "Open Feed"),
    ],
  });
}

/**
 * Builds the right-rail summary.
 * @param data - Current resource payload.
 * @returns Summary card.
 */
export function summaryCard(data: SourceArticleTriageResponse): HTMLElement {
  return SectionCardC({
    title: "Queue snapshot",
    body: el(
      "div",
      { class: "source-triage-summary" },
      stateLine("Generated", fmtDate(data.generatedAt, { mode: "rel" })),
      stateLine("Has more", data.hasMore ? "Yes" : "No"),
      stateLine("Limit", String(data.filters.limit))
    ),
  });
}

/**
 * Builds a compact metric block.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric element.
 */
function stat(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "source-triage-stat" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

/**
 * Builds one label/select field.
 * @param label - Field label.
 * @param name - Query parameter name.
 * @param current - Current selected value.
 * @param options - Select options.
 * @returns Field element.
 */
function selectField(
  label: string,
  name: string,
  current: string,
  options: ReadonlyArray<readonly [string, string]>
): HTMLElement {
  return el(
    "label",
    { class: "source-triage-field" },
    el("span", {}, label),
    el(
      "select",
      { name },
      ...options.map(([value, optionLabel]) =>
        el(
          "option",
          { value, selected: value === String(current || "") },
          optionLabel
        )
      )
    )
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

/**
 * Formats a category filter value.
 * @param value - Category token.
 * @returns Visible label.
 */
function filterLabel(value: string): string {
  return value ? feedCategoryLabel(value) : "All categories";
}

/**
 * Formats a nullable reason filter value.
 * @param reason - Reason token.
 * @returns Visible label.
 */
function reasonLabel(reason: SourceArticleTriageReason | null): string {
  return reason ? sourceArticleTriageReasonLabel(reason) : "All reasons";
}

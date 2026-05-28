/**
 * Shared constants and types for the high-signal filter verification evidence
 * smoke (issue #250). The per-marker scenario modules import from here so the
 * selectors and case matrices are declared exactly once.
 */
export const ARTICLE_CARD = "article.card";
export const EVENT_CARD = ".event-card";
export const TRANSITION_EVENT = ".event-card.transition";
export const DISCLOSURE_EVENT = ".event-card.disclosure";
export const FEED_MODE_SELECT = 'form.feed-filters select[name="mode"]';
export const FEED_CATEGORY_SELECT = 'form.feed-filters select[name="category"]';
export const FEED_FILTER_SUMMARY = ".feed-filter-summary";
export const FEED_FILTER_EMPTY_TEXT = "text=No feed posts match these filters";
export const FEED_ERROR_SELECTOR = ".ab-async-state--error";
export const FEED_ERROR_TITLE = "text=Could not load feed";
export const SEARCH_RESULT_ROWS = "#global-search-results .gs-item";
export const SEARCH_COUNT_HINT = "#global-search-results .gs-more";

/** Signal mode + the event-kind selector each filtered row must include. */
export interface EventBackedMode {
  readonly mode: "event" | "moves" | "compliance";
  readonly label: string;
  readonly requiredEventSelector: string;
}

export const EVENT_BACKED_MODES: readonly EventBackedMode[] = [
  { mode: "event", label: "event-backed", requiredEventSelector: EVENT_CARD },
  {
    mode: "moves",
    label: "recruiting moves",
    requiredEventSelector: TRANSITION_EVENT,
  },
  {
    mode: "compliance",
    label: "compliance disclosures",
    requiredEventSelector: DISCLOSURE_EVENT,
  },
];

/** Search kind buttons rendered by the global navbar (post #248). */
export interface SearchKindCase {
  readonly kind: "advisor" | "firm" | "team";
  readonly buttonName: "Advisors" | "Firms" | "Teams";
  readonly rowKindLabel: "Advisor" | "Firm" | "Team";
}

export const SEARCH_KIND_CASES: readonly SearchKindCase[] = [
  { kind: "advisor", buttonName: "Advisors", rowKindLabel: "Advisor" },
  { kind: "firm", buttonName: "Firms", rowKindLabel: "Firm" },
  { kind: "team", buttonName: "Teams", rowKindLabel: "Team" },
];

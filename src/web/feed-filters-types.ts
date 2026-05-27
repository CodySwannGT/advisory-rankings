// Types and pure helpers for the home feed filter card.

import * as app from "./app.js";

/** Feed signal mode supported by the home-feed filter card. */
export type FeedMode = "all" | "event" | "moves" | "compliance";

/** Value/label option pair used by the mode and category selects. */
export type FeedFilterOption = readonly [value: string, label: string];

/** Value/label option pair specialized for {@link FeedMode} options. */
export type FeedModeOption = readonly [value: FeedMode, label: string];

/** Mutable filter state written back to the URL. */
export interface FeedFilters {
  readonly mode: FeedMode;
  readonly category: string;
}

/** Full filter state including active-state flag for clear-button wiring. */
export interface FeedFilterState extends FeedFilters {
  readonly active: boolean;
}

/** Filter-card props passed by the home feed renderer. */
export interface FeedFilterCardState {
  readonly filters: FeedFilterState;
  readonly categories: readonly string[];
  readonly count?: number | null;
  readonly total: number;
  readonly onChange: (next: FeedFilters) => void;
}

/** Empty-state copy shown when no posts match the active filters. */
export interface FilterEmptyState {
  readonly title: string;
  readonly body: string;
}

/** Raw input accepted by the normalize step. */
export interface RawFeedFilters {
  readonly mode?: string | null;
  readonly category?: string | null;
}

export const FEED_MODE_PARAM = "mode";
export const FEED_CATEGORY_PARAM = "category";
export const DEFAULT_FEED_MODE: FeedMode = "all";

export const FEED_MODE_ALIASES: ReadonlyMap<string, FeedMode> = new Map([
  ["event-backed", "event"],
]);

export const FEED_MODES: readonly FeedModeOption[] = [
  ["all", "All posts"],
  ["event", "Event-backed"],
  ["moves", "Recruiting moves"],
  ["compliance", "Compliance disclosures"],
];

/**
 * Typed surface for the `@ts-nocheck`'d `app.js` exports we consume.
 * Single adapter `as` cast for the whole module.
 */
interface AppModuleAdapter {
  readonly getQueryParam: (name: string) => string | null;
  readonly humanize: (value: unknown) => string | null;
}
const appAdapter = app as unknown as AppModuleAdapter;

/** Untyped `getQueryParam` re-exposed with a real signature. */
export const getQueryParamFn: AppModuleAdapter["getQueryParam"] =
  appAdapter.getQueryParam;

/** Untyped `humanize` re-exposed with a real signature. */
export const humanizeFn: AppModuleAdapter["humanize"] = appAdapter.humanize;

/**
 * Coerces an unknown form-data value into a string.
 * @param value - Raw form-data entry value.
 * @returns The string form, or `""` for blob/null entries.
 */
export function toFormString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Narrows an arbitrary string to a supported {@link FeedMode}.
 * @param value - Candidate mode string.
 * @returns `true` when `value` is one of the supported feed modes.
 */
export function isFeedMode(value: string): value is FeedMode {
  return FEED_MODES.some(([mode]) => mode === value);
}

/**
 * Normalizes arbitrary filter values into supported values.
 * @param filters - Raw URL or form filter values.
 * @returns Normalized filters.
 */
export function normalizeFeedFilters(filters: RawFeedFilters): FeedFilters {
  const rawMode = String(filters.mode ?? "").trim();
  const candidateMode = FEED_MODE_ALIASES.get(rawMode) ?? rawMode;
  const mode: FeedMode = isFeedMode(candidateMode)
    ? candidateMode
    : DEFAULT_FEED_MODE;
  return {
    mode,
    category: String(filters.category ?? "").trim(),
  };
}

/**
 * Returns a display label for the feed mode.
 * @param mode - Feed signal mode.
 * @returns Visible label.
 */
export function modeLabelFor(mode: FeedMode): string {
  return FEED_MODES.find(([value]) => value === mode)?.[1] ?? "All posts";
}

/**
 * Humanizes feed category values without hiding placeholder-like source values.
 * @param value - Raw article category.
 * @returns Visible category label.
 */
export function categoryLabel(value: string): string {
  const humanized = humanizeFn(value);
  if (humanized) return humanized;
  return String(value || "uncategorized")
    .replace(/_+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

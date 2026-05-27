// AdvisorBook · Design system — ORGANISMS · EVENTS (shared types)
//
// Shared interfaces and formatter signatures used by the event-card
// organisms split across `organisms-events-feed.ts`,
// `organisms-events-career.ts`, and the `organisms-events.ts` barrel.
// Kept in its own file so the implementation modules stay under the
// project-wide max-lines threshold.

import type {
  EmploymentHistoryRow,
  TeamMetricSnapshotRow,
} from "../../types/harper-schema.js";
import type { ArticlePayload } from "../../harper/resource-feed-types.js";

/**
 * Narrow callable shape for design-system helpers still opting out of TS.
 *
 * `molecules.ts`, `organisms-core.ts`, and `organisms-search.ts` are still
 * file-level `@ts-nocheck`'d. Consumers adapt each consumed export through
 * this shared shape so the rest of the call sites stay typed without
 * scattering per-call `@ts-*` directives or per-export `as` casts.
 */
export type DesignSystemComponent = (
  options?: Readonly<Record<string, unknown>>
) => HTMLElement;

/** Source-attribution metadata used by article rows in feeds and lists. */
export interface ArticleSourceMeta {
  readonly source: string;
  readonly initials: string;
  readonly ctaLabel?: string;
}

/** Adapter signature for resolving an article's source attribution. */
export type ArticleSourceFn = (
  article: ArticlePayload | ArticleStubLike
) => ArticleSourceMeta;

/** Money formatter signature accepted across feed/event renderers. */
export type FmtMoney = (value: number | null | undefined) => string;

/** Percent formatter signature accepted across feed/event renderers. */
export type FmtPct = (value: number | null | undefined) => string;

/** Date-format mode accepted by {@link FmtDate}. */
export type FmtDateMode = "short" | "long" | "rel";

/** Optional formatter options accepted by {@link FmtDate}. */
export interface FmtDateOptions {
  readonly mode?: FmtDateMode;
}

/** Date formatter signature accepted across feed/event renderers. */
export type FmtDate = (
  value: string | number | Date | null | undefined,
  options?: FmtDateOptions
) => string;

/**
 * Humanizer signature used to convert enum-ish values to display copy.
 * Returns null/undefined when the input is null/undefined or a recognized
 * placeholder; callers are expected to treat those as missing.
 */
export type Humanize = (
  value: string | null | undefined
) => string | null | undefined;

/** Shared bag of formatter callbacks supplied by the page. */
export interface EventFormatters {
  readonly fmtMoney?: FmtMoney;
  readonly fmtPct?: FmtPct;
  readonly fmtDate?: FmtDate;
  readonly humanize?: Humanize;
  readonly articleSource?: ArticleSourceFn;
}

/** Minimal article shape accepted by {@link ArticleListBlock}. */
export interface ArticleStubLike {
  readonly id?: string;
  readonly headline?: string;
  readonly title?: string;
  readonly slug?: string;
  readonly publishedDate?: string | number | Date | null;
  readonly category?: string | null;
  readonly url?: string | null;
}

/** Options accepted by `ArticleListBlock`. */
export interface ArticleListBlockOptions {
  readonly articles?: readonly ArticleStubLike[] | null;
  readonly fmtDate?: FmtDate;
  readonly articleSource?: ArticleSourceFn;
}

/** Options accepted by `CareerTimeline`. */
export interface CareerTimelineOptions {
  readonly career?: readonly CareerTimelineStep[];
  readonly fmtDate?: FmtDate;
}

/** Single employment-history step rendered inside `CareerTimeline`. */
export interface CareerTimelineStep {
  readonly firm?: CareerTimelineFirm | null;
  readonly branch?: CareerTimelineBranch | null;
  readonly roleTitle?: string | null;
  readonly startDate?: EmploymentHistoryRow["startDate"] | null;
  readonly endDate?: EmploymentHistoryRow["endDate"] | null;
  readonly reasonForLeaving?: string | null;
  readonly u5Filed?: boolean | null;
}

/** Firm slice rendered inside a career timeline step. */
export interface CareerTimelineFirm {
  readonly id?: string;
  readonly name?: string;
  readonly short?: string;
}

/** Branch slice rendered inside a career timeline step. */
export interface CareerTimelineBranch {
  readonly id?: string;
  readonly name?: string;
}

/** Options accepted by `SnapshotTable`. */
export interface SnapshotTableOptions {
  readonly snaps?: readonly TeamMetricSnapshotRow[];
  readonly fmtMoney?: FmtMoney;
  readonly fmtDate?: FmtDate;
  readonly humanize?: Humanize;
}

/**
 * Identity humanizer used when callers omit one. Preserves the
 * legacy `humanize = x => x` default behavior used by the original
 * untyped module while normalizing nullish inputs to "".
 * @param value - Raw enum-ish value.
 * @returns Stringified value, or "" for null/undefined.
 */
export const identityHumanize: Humanize = value =>
  value == null ? "" : String(value);

/**
 * Default money formatter used when callers omit one. Returns a
 * placeholder for null inputs so call sites can keep their existing
 * `value != null && fmt` guards without changing return shape when the
 * formatter is absent.
 * @param value - Numeric amount to render.
 * @returns Formatted string, or "—" when null/undefined.
 */
export const defaultFmtMoney: FmtMoney = value =>
  value == null ? "—" : String(value);

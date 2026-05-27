// Typed adapters for the article detail route.

import type { ArticleRow, FieldAssertionRow } from "../types/harper-schema.js";
import {
  Card,
  ChipRow,
  DetailsCard,
  DisclosureEventCard,
  PostHeader,
  ScrollableTable,
  SectionCard,
  TransitionEventCard,
} from "./design-system/index.js";

/** Generic typed shape for design-system option components. */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

/** Generic typed shape for nullable design-system option components. */
type NullableDesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement | null;

/** Generic typed shape for article event-card renderers. */
type EventCardComponent = (
  card: ArticleEventCard,
  fmts: Readonly<Record<string, unknown>>
) => HTMLElement;

/** ArticleView response payload. */
export type ArticleViewPayload =
  | ArticleViewSuccessPayload
  | ArticleViewErrorPayload;

/** ArticleView not-found or route error payload. */
export interface ArticleViewErrorPayload {
  readonly error: unknown;
  readonly id?: string;
}

/** ArticleView successful detail payload. */
export interface ArticleViewSuccessPayload {
  readonly error?: false | null;
  readonly article: ArticleMetadata;
  readonly body?: ArticleBodyPayload | unknown;
  readonly eventCards: readonly ArticleEventCard[] | unknown;
  readonly firms: readonly EntityChipPayload[] | unknown;
  readonly teams: readonly EntityChipPayload[] | unknown;
  readonly advisors: readonly EntityChipPayload[] | unknown;
  readonly provenance: readonly ArticleProvenancePayload[] | unknown;
}

/** Article metadata fields used by the detail page. */
export type ArticleMetadata = Pick<
  ArticleRow,
  | "id"
  | "url"
  | "slug"
  | "headline"
  | "dek"
  | "publishedDate"
  | "modifiedDate"
  | "authors"
  | "category"
>;

/** Optional article body payload returned by ArticleView. */
export interface ArticleBodyPayload {
  readonly html?: string | null;
  readonly text?: string | null;
}

/** Provenance row shape shown in the extracted-facts table. */
export type ArticleProvenancePayload = Pick<
  FieldAssertionRow,
  | "targetTable"
  | "targetId"
  | "fieldName"
  | "assertedValue"
  | "quotePhrase"
  | "confidence"
>;

/** Deduplicated extracted-fact display row. */
export interface EvidenceTableRow {
  readonly field: string;
  readonly value: string;
}

/** Accumulator used while compacting provenance rows. */
export interface CompactProvenanceAccumulator {
  readonly keys: readonly string[];
  readonly rows: readonly EvidenceTableRow[];
}

/** Entity chip payloads are rendered by the shared design-system chip row. */
export type EntityChipPayload = Readonly<Record<string, unknown>>;

/** Source attribution metadata derived from an article row. */
export interface ArticleSourceMetadata {
  readonly initials: string;
  readonly source: string;
  readonly ctaLabel: string;
}

/** Event cards linked from an article feed item. */
export interface ArticleEventCard {
  readonly kind: "transition" | "disclosure";
  readonly [key: string]: unknown;
}

/** Typed adapter for Card. */
export const CardComponent = Card as unknown as DesignSystemComponent;

/** Typed adapter for SectionCard. */
export const SectionCardComponent =
  SectionCard as unknown as DesignSystemComponent;

/** Typed adapter for PostHeader. */
export const PostHeaderComponent =
  PostHeader as unknown as DesignSystemComponent;

/** Typed adapter for ChipRow. */
export const ChipRowComponent =
  ChipRow as unknown as NullableDesignSystemComponent;

/** Typed adapter for DetailsCard. */
export const DetailsCardComponent =
  DetailsCard as unknown as DesignSystemComponent;

/** Typed adapter for ScrollableTable. */
export const ScrollableTableComponent = ScrollableTable as unknown as (
  table: HTMLElement
) => HTMLElement;

/** Typed adapter for TransitionEventCard. */
export const TransitionEventCardComponent =
  TransitionEventCard as unknown as EventCardComponent;

/** Typed adapter for DisclosureEventCard. */
export const DisclosureEventCardComponent =
  DisclosureEventCard as unknown as EventCardComponent;

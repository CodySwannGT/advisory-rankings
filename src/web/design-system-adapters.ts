// Typed adapters for the still-`@ts-nocheck`'d design-system helpers.
//
// Until `src/web/design-system/*` is fully typed, callers in stripped
// modules import the typed re-exports below instead of the raw
// untyped helpers. Each adapter is the single permitted `as unknown`
// boundary for one design-system component.

import {
  el,
  EmptyText,
  SectionCard,
  EntityList,
  EntityRow,
  DetailsCard,
  Heading,
  CareerTimeline,
  DisclosureEventCard,
  TransitionEventCard,
  SourceAttribution,
  Card,
  EmptyCard,
  PostHeader,
  ChipRow,
  ScrollableTable,
  mountThreeColumnPage,
} from "./design-system/index.js";

/** Narrow callable type for design-system helpers that still opt out of TS. */
export type DesignSystemComponent = (
  options?: Readonly<Record<string, unknown>>
) => HTMLElement;

/** Typed `el` adapter — builds a DOM element with arbitrary attrs/children. */
export type ElAdapter = (
  tag: string,
  attrs?: Readonly<Record<string, unknown>>,
  ...children: readonly unknown[]
) => HTMLElement;

/** Typed `DisclosureEventCard` adapter — takes a raw row plus formatter bag. */
export type DisclosureEventCardAdapter = (
  d: unknown,
  fmts?: unknown
) => HTMLElement;

/** Typed `TransitionEventCard` adapter — takes a raw row plus formatter bag. */
export type TransitionEventCardAdapter = (
  d: unknown,
  fmts?: unknown
) => HTMLElement;

/** Typed `ScrollableTable` adapter — wraps a table node in a scroll container. */
export type ScrollableTableAdapter = (table: HTMLElement) => HTMLElement;

/** Columns surfaced to the page `build` callback. */
export interface MountThreeColumnPageBuildColumns {
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

/** Build callback invoked by `mountThreeColumnPage` with rendered columns. */
export type MountThreeColumnPageBuild = (
  columns: MountThreeColumnPageBuildColumns
) => void;

/** Option bag accepted by the `mountThreeColumnPage` adapter. */
export interface MountThreeColumnPageOptions {
  readonly active: string;
  readonly refreshMe: () => Promise<unknown>;
  readonly logout: () => Promise<unknown>;
  readonly search: (...args: readonly unknown[]) => unknown;
  readonly build: MountThreeColumnPageBuild;
}

/** Typed `mountThreeColumnPage` adapter — accepts the page mount option bag. */
export type MountThreeColumnPageAdapter = (
  options: MountThreeColumnPageOptions
) => void;

export const EmptyTextC = EmptyText as unknown as DesignSystemComponent;
export const SectionCardC = SectionCard as unknown as DesignSystemComponent;
export const EntityListC = EntityList as unknown as DesignSystemComponent;
export const EntityRowC = EntityRow as unknown as DesignSystemComponent;
export const DetailsCardC = DetailsCard as unknown as DesignSystemComponent;
export const HeadingC = Heading as unknown as DesignSystemComponent;
export const CareerTimelineC =
  CareerTimeline as unknown as DesignSystemComponent;
export const SourceAttributionC =
  SourceAttribution as unknown as DesignSystemComponent;
export const DisclosureEventCardC =
  DisclosureEventCard as unknown as DisclosureEventCardAdapter;
export const TransitionEventCardC =
  TransitionEventCard as unknown as TransitionEventCardAdapter;
export const CardC = Card as unknown as DesignSystemComponent;
export const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;
export const PostHeaderC = PostHeader as unknown as DesignSystemComponent;
export const ChipRowC = ChipRow as unknown as DesignSystemComponent;
export const ScrollableTableC =
  ScrollableTable as unknown as ScrollableTableAdapter;
export const mountThreeColumnPageC =
  mountThreeColumnPage as unknown as MountThreeColumnPageAdapter;
export const elC = el as unknown as ElAdapter;

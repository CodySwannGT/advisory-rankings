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
  SourceAttribution,
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
export const elC = el as unknown as ElAdapter;

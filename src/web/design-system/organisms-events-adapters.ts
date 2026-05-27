// AdvisorBook · Design system — ORGANISMS · EVENTS (typed adapters)
//
// Single-cast adapter bundle for the still-`@ts-nocheck`'d producers
// consumed by the event-card organisms (`molecules.ts`,
// `organisms-core.ts`, `organisms-search.ts`). One `unknown`
// reinterpretation re-types the whole group so the implementation
// modules (organisms-events-feed.ts, organisms-events-career.ts)
// stay typed without per-call casts.

import {
  PostHeader,
  EntityRow,
  SanctionPill,
  DealStrip,
  EventStat,
  FirmArrow,
} from "./molecules.js";
import { ChipRow, EntityList, ScrollableTable } from "./organisms-core.js";
import { formatInlineLabel } from "./organisms-search.js";
import type { DesignSystemComponent } from "./organisms-events-types.js";

/**
 * Bundle of typed adapters for the producers in this module's import
 * graph that still opt out of TS. One `unknown` reinterpretation
 * re-types the whole group so consumers stay typed without per-call
 * casts.
 */
interface ProducerAdapters {
  readonly PostHeader: DesignSystemComponent;
  readonly EntityRow: DesignSystemComponent;
  readonly SanctionPill: DesignSystemComponent;
  readonly DealStrip: DesignSystemComponent;
  readonly EventStat: DesignSystemComponent;
  readonly FirmArrow: DesignSystemComponent;
  readonly ChipRow: DesignSystemComponent;
  readonly EntityList: DesignSystemComponent;
  readonly ScrollableTable: (table: HTMLElement) => HTMLElement;
  readonly formatInlineLabel: (
    value: string | null | undefined
  ) => string | null;
}

const adapters = {
  PostHeader,
  EntityRow,
  SanctionPill,
  DealStrip,
  EventStat,
  FirmArrow,
  ChipRow,
  EntityList,
  ScrollableTable,
  formatInlineLabel,
} as unknown as ProducerAdapters;

export const PostHeaderC = adapters.PostHeader;
export const EntityRowC = adapters.EntityRow;
export const SanctionPillC = adapters.SanctionPill;
export const DealStripC = adapters.DealStrip;
export const EventStatC = adapters.EventStat;
export const FirmArrowC = adapters.FirmArrow;
export const ChipRowC = adapters.ChipRow;
export const EntityListC = adapters.EntityList;
export const ScrollableTableC = adapters.ScrollableTable;
export const formatInlineLabelFn = adapters.formatInlineLabel;

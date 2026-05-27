// Typed adapters and shapes for the home feed page (`src/web/index.ts`).
//
// `src/web/index.ts` was previously file-level `@ts-nocheck`'d. Splitting
// the types and design-system adapters out of the page module keeps the
// page itself under the 300-line cap while collecting the single-cast
// adapter surface in one place.

import type { FirmChip } from "../harper/resource-feed-types.js";
import {
  mountThreeColumnPage,
  SkeletonCard,
  EmptyCard,
  FeedPostCard,
  BrowseCard,
  RollupCard,
  SectionCard,
  EntityList,
  EntityRow,
  Heading,
  Button,
  Avatar,
} from "./design-system/index.js";

/** DOM columns supplied to `mountThreeColumnPage` build callbacks. */
export interface ThreeColumnLayout {
  readonly left: HTMLElement;
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

/** Options accepted by the `mountThreeColumnPage` adapter. */
export interface MountThreeColumnPageOptions {
  readonly active: string;
  readonly refreshMe: unknown;
  readonly logout: unknown;
  readonly search: unknown;
  readonly pageTitle?: string;
  readonly build: (layout: ThreeColumnLayout) => void;
}

/** Adapter for `mountThreeColumnPage` accepting the page-build callback. */
export type MountThreeColumnPageAdapter = (
  options: MountThreeColumnPageOptions
) => void;

/**
 * Narrow callable type for design-system helpers that still opt out of TS.
 * Producers under `src/web/design-system/` still carry `@ts-nocheck`, so
 * their exports leak inferred narrow shapes (or `any`) across module
 * boundaries; this adapter restores a single uniform call signature for
 * every component the home page uses.
 */
export type DesignSystemComponent = (
  ...args: readonly unknown[]
) => HTMLElement;

/** Normalized feed filter values shared with `feed-filters.ts`. */
export interface FeedFilterValues {
  readonly mode: string;
  readonly category: string;
}

/** Filter state returned by `readFeedFilters`, adds the active flag. */
export interface FeedFilterState extends FeedFilterValues {
  readonly active: boolean;
}

/** Single firm/mention-count pair surfaced in the right rail. */
export interface TrendingFirmRow {
  readonly firm: FirmChip;
  readonly count: number;
}

/** Render state passed to the center column. */
export interface FeedRenderState {
  readonly categories: readonly string[];
  readonly count: number;
  readonly filters: FeedFilterState;
  readonly hasMore: boolean;
  readonly total: number;
  readonly onChange: (next: FeedFilterValues) => void;
  readonly onLoadMore: () => void;
}

/** Typed adapter for `mountThreeColumnPage`. */
export const MountThreeColumnPage =
  mountThreeColumnPage as unknown as MountThreeColumnPageAdapter;
/** Typed adapter for `SkeletonCard`. */
export const SkeletonCardC = SkeletonCard as unknown as DesignSystemComponent;
/** Typed adapter for `EmptyCard`. */
export const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;
/** Typed adapter for `FeedPostCard`. */
export const FeedPostCardC = FeedPostCard as unknown as DesignSystemComponent;
/** Typed adapter for `BrowseCard`. */
export const BrowseCardC = BrowseCard as unknown as DesignSystemComponent;
/** Typed adapter for `RollupCard`. */
export const RollupCardC = RollupCard as unknown as DesignSystemComponent;
/** Typed adapter for `SectionCard`. */
export const SectionCardC = SectionCard as unknown as DesignSystemComponent;
/** Typed adapter for `EntityList`. */
export const EntityListC = EntityList as unknown as DesignSystemComponent;
/** Typed adapter for `EntityRow`. */
export const EntityRowC = EntityRow as unknown as DesignSystemComponent;
/** Typed adapter for `Heading`. */
export const HeadingC = Heading as unknown as DesignSystemComponent;
/** Typed adapter for `Button`. */
export const ButtonC = Button as unknown as DesignSystemComponent;
/** Typed adapter for `Avatar`. */
export const AvatarC = Avatar as unknown as DesignSystemComponent;

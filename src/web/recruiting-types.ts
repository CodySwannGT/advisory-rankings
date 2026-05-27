// Typed adapters and shapes for the recruiting page (`src/web/recruiting.ts`).
//
// `src/web/recruiting.ts` was previously file-level `@ts-nocheck`'d. Splitting
// the types and design-system adapters out of the page module keeps the page
// itself under the 300-line cap while collecting the single-cast adapter
// surface in one place. Producers under `src/web/design-system/`,
// `src/web/app.ts`, and `src/web/recruiting-sections.ts` still carry
// `@ts-nocheck`, so their exports leak inferred narrow shapes (or `any`)
// across module boundaries; these adapters restore a single uniform call
// signature for every consumer the page uses.

import type { RecruitingMarketResponse } from "../harper/resource-recruiting-market-types.js";
import { api, fmtMoney, getQueryParam } from "./app.js";
import {
  mountThreeColumnPage,
  clear,
  el,
  EmptyCard,
  SectionCard,
  SkeletonCard,
} from "./design-system/index.js";
import {
  fmtNumber,
  marketCard,
  momentumCard,
  recentMovesCard,
  sourceCard,
  summaryCard,
  topMarketsCard,
  watchlistCard,
} from "./recruiting-sections.js";

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

/** Narrow callable type for design-system helpers that still opt out of TS. */
export type DesignSystemComponent = (
  ...args: readonly unknown[]
) => HTMLElement;

/** Typed `clear` adapter — empties a DOM column. */
export type ClearAdapter = (root: HTMLElement) => void;

/** Typed `el` adapter — builds a DOM element with arbitrary attrs/children. */
export type ElAdapter = (
  tag: string,
  attrs?: Readonly<Record<string, unknown>> | null,
  ...children: readonly unknown[]
) => HTMLElement;

/** Typed adapter for `mountThreeColumnPage`. */
export const MountThreeColumnPage =
  mountThreeColumnPage as unknown as MountThreeColumnPageAdapter;

/** Typed adapter for `clear`. */
export const clearC = clear as unknown as ClearAdapter;

/** Typed adapter for `el`. */
export const elC = el as unknown as ElAdapter;

/** Typed adapter for `EmptyCard`. */
export const EmptyCardC = EmptyCard as unknown as DesignSystemComponent;

/** Typed adapter for `SectionCard`. */
export const SectionCardC = SectionCard as unknown as DesignSystemComponent;

/** Typed adapter for `SkeletonCard`. */
export const SkeletonCardC = SkeletonCard as unknown as DesignSystemComponent;

/** Typed `api` adapter — fetches a JSON resource. */
export type ApiAdapter = (
  path: string,
  init?: Readonly<Record<string, unknown>>
) => Promise<unknown>;

/** Options accepted by the typed `fmtMoney` adapter. */
export interface FmtMoneyOptions {
  readonly compact?: boolean;
}

/** Typed `fmtMoney` adapter — formats a numeric value as money. */
export type FmtMoneyAdapter = (
  n: number | null | undefined,
  options?: FmtMoneyOptions
) => string;

/** Typed `getQueryParam` adapter — reads one query string value. */
export type GetQueryParamAdapter = (name: string) => string | null;

/** Typed `fmtNumber` adapter — formats a numeric value with separators. */
export type FmtNumberAdapter = (value: number | null | undefined) => string;

/** Adapter for a recruiting-section card that may decline to render. */
export type RecruitingNullableSectionAdapter = (
  data: unknown
) => HTMLElement | null;

/** Adapter for a recruiting-section card that always renders. */
export type RecruitingSectionAdapter = (data: unknown) => HTMLElement;

/** Typed adapter for `api`. */
export const apiC = api as unknown as ApiAdapter;
/** Typed adapter for `fmtMoney`. */
export const fmtMoneyC = fmtMoney as unknown as FmtMoneyAdapter;
/** Typed adapter for `getQueryParam`. */
export const getQueryParamC = getQueryParam as unknown as GetQueryParamAdapter;
/** Typed adapter for `fmtNumber`. */
export const fmtNumberC = fmtNumber as unknown as FmtNumberAdapter;
/** Typed adapter for `momentumCard`. */
export const momentumCardC =
  momentumCard as unknown as RecruitingSectionAdapter;
/** Typed adapter for `marketCard`. */
export const marketCardC = marketCard as unknown as RecruitingSectionAdapter;
/** Typed adapter for `recentMovesCard`. */
export const recentMovesCardC =
  recentMovesCard as unknown as RecruitingSectionAdapter;
/** Typed adapter for `summaryCard`. */
export const summaryCardC = summaryCard as unknown as RecruitingSectionAdapter;
/** Typed adapter for `topMarketsCard`. */
export const topMarketsCardC =
  topMarketsCard as unknown as RecruitingSectionAdapter;
/** Typed adapter for `sourceCard`. */
export const sourceCardC = sourceCard as unknown as RecruitingSectionAdapter;
/** Typed adapter for `watchlistCard`. */
export const watchlistCardC =
  watchlistCard as unknown as RecruitingNullableSectionAdapter;

/** Re-export of the resource payload shape consumed by the page. */
export type { RecruitingMarketResponse };

// AdvisorBook · Atomic Design — organisms-core option bags and helpers.
//
// Co-located with `organisms-core.ts`. Split out so each public organism
// function stays small while the option-bag interfaces and the molecule
// shim live in a single place. Imported only by `organisms-core.ts`.

import type { DomAttrs, DomChild } from "./dom.js";
import * as Molecules from "./molecules.js";

/** Children accepted by organism builders; mirrors `DomChild` from dom.ts. */
export type OrganismChildren = DomChild | readonly DomChild[];

/** Async-state copy descriptor used to populate `AsyncStateCard`. */
export interface AsyncStateCopy {
  readonly title: string;
  readonly body: string;
}

/** Known async-state categories. */
export type AsyncStateKind =
  | "empty"
  | "not-found"
  | "permission"
  | "transient"
  | "partial";

/** Tag payload accepted by `ProfileHead`. */
export interface ProfileHeadTag {
  readonly kind?: string;
  readonly label: OrganismChildren;
}

/** Card rendering options. */
export interface CardOptions {
  readonly tag?: string;
  readonly children?: OrganismChildren;
  readonly attrs?: DomAttrs;
}

/** SectionCard rendering options. */
export interface SectionCardOptions {
  readonly title?: OrganismChildren;
  readonly body?: OrganismChildren;
  readonly attrs?: DomAttrs;
}

/** EmptyCard rendering options. */
export interface EmptyCardOptions {
  readonly title?: OrganismChildren;
  readonly body?: OrganismChildren;
}

/** AsyncStateCard rendering options. */
export interface AsyncStateCardOptions {
  readonly kind?: AsyncStateKind;
  readonly title?: OrganismChildren;
  readonly body?: OrganismChildren;
  readonly actionLabel?: OrganismChildren;
  readonly onAction?: EventListener;
  readonly attrs?: DomAttrs;
}

/** ChipRow rendering options. */
export interface ChipRowOptions {
  readonly firms?: readonly unknown[];
  readonly teams?: readonly unknown[];
  readonly advisors?: readonly unknown[];
}

/** EntityList rendering options. */
export interface EntityListOptions {
  readonly rows?: readonly DomChild[];
  readonly empty?: OrganismChildren;
}

/** ProfileHead rendering options. */
export interface ProfileHeadOptions {
  readonly initialsText?: string | number | null;
  readonly imageUrl?: string | null;
  readonly title?: string | null;
  readonly subtitle?: OrganismChildren;
  readonly tags?: readonly ProfileHeadTag[];
}

/** BrowseCard navigation item descriptor. */
export interface BrowseCardItem {
  readonly label: string;
  readonly icon?: OrganismChildren;
  readonly href?: string;
}

/** BrowseCard rendering options. */
export interface BrowseCardOptions {
  readonly items: readonly BrowseCardItem[];
}

/** Adapter shape produced by a `RollupCard` `renderRow` callback. */
export interface RollupRowConfig {
  readonly avatar?: DomChild;
  readonly name?: OrganismChildren;
  readonly sub?: OrganismChildren;
  readonly tail?: OrganismChildren;
  readonly href?: string;
}

/** Option bag forwarded to the `EntityRow` molecule. */
export interface EntityRowOptions {
  readonly avatar?: DomChild;
  readonly name?: OrganismChildren;
  readonly sub?: OrganismChildren;
  readonly tail?: OrganismChildren;
  readonly href?: string;
  readonly extras?: readonly DomChild[];
  readonly attrs?: DomAttrs;
}

/** RollupCard rendering options. */
export interface RollupCardOptions<Row> {
  readonly title?: OrganismChildren;
  readonly rows?: readonly Row[] | null;
  readonly renderRow: (row: Row) => RollupRowConfig;
}

/** Single label/value pair rendered by `DetailsCard`. */
export type DetailsCardPair = readonly [OrganismChildren, OrganismChildren];

/** DetailsCard rendering options. */
export interface DetailsCardOptions {
  readonly title?: OrganismChildren;
  readonly pairs: readonly DetailsCardPair[];
}

/** Generic adapter signature for the molecule wrappers exposed below. */
export type MoleculeFn<Arg, Ret = HTMLElement | null> = (arg: Arg) => Ret;

/**
 * Typed view of the `molecules.ts` exports actually consumed by
 * `organisms-core`. The producer module is still `@ts-nocheck`'d in a
 * parallel change, so its inferred shapes leak `any`s that don't match the
 * real contract. This shim restates the contract once.
 */
export interface MoleculesShim {
  readonly EntityChip: MoleculeFn<unknown>;
  readonly EntityRow: MoleculeFn<EntityRowOptions, HTMLElement>;
  readonly KvList: (
    pairs: readonly DetailsCardPair[],
    attrs?: DomAttrs
  ) => HTMLElement;
  readonly NavRow: MoleculeFn<BrowseCardItem, HTMLElement>;
}

/**
 * Single `unknown` adapter cast for the whole `molecules` module — see
 * {@link MoleculesShim}. Restated as one local module-level cast so the
 * public organism functions can call typed wrappers below.
 */
export const M = Molecules as unknown as MoleculesShim;

/** Default copy for each {@link AsyncStateKind}. */
export const ASYNC_STATE_DEFAULTS: Readonly<
  Record<AsyncStateKind, AsyncStateCopy>
> = {
  empty: {
    title: "No results yet",
    body: "New data will appear here once it is available.",
  },
  "not-found": {
    title: "Not found",
    body: "This record may have moved, been removed, or not been loaded yet.",
  },
  permission: {
    title: "Sign in required",
    body: "Sign in again or continue browsing public pages.",
  },
  transient: {
    title: "Could not load this section",
    body: "Refresh this section or try again in a moment.",
  },
  partial: {
    title: "Some details are unavailable",
    body: "The main record loaded, but one supporting section failed.",
  },
};

/**
 * Normalizes optional child content into an array for `el`.
 * @param x - Possibly-nested child input from organism callers.
 * @returns Flat array suitable for `el(...)` spread arguments.
 */
export function arrify(x: OrganismChildren | undefined): readonly DomChild[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x as DomChild];
}

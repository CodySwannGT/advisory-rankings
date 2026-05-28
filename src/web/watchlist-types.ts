// Typed adapters and shapes for the watchlist page (`src/web/watchlists.ts`).
//
// Mirrors `src/web/recruiting-types.ts`: the design-system organisms and a few
// `app.ts` helpers still leak loose / untyped shapes across module boundaries,
// so this module collects the single-cast adapter surface in one place and the
// page itself stays strictly typed (no file-level `@ts-nocheck`).

import { api, postJson } from "./app.js";
import {
  Button,
  clear,
  el,
  EmptyCard,
  SectionCard,
  TextInput,
} from "./design-system/index.js";
import { mountThreeColumnPage } from "./design-system/templates.js";

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

/** Typed `el` adapter — builds a DOM element with arbitrary attrs/children. */
export type ElAdapter = (
  tag: string,
  attrs?: Readonly<Record<string, unknown>> | null,
  ...children: readonly unknown[]
) => HTMLElement;

/** Typed `clear` adapter — empties a DOM container. */
export type ClearAdapter = (node: ParentNode) => void;

/** Options accepted by the SectionCard adapter. */
export interface SectionCardOptions {
  readonly title?: unknown;
  readonly body: unknown;
  readonly attrs?: Readonly<Record<string, unknown>>;
}
/** Typed SectionCard adapter. */
export type SectionCardAdapter = (options: SectionCardOptions) => HTMLElement;

/** Options accepted by the EmptyCard adapter. */
export interface EmptyCardOptions {
  readonly title?: unknown;
  readonly body?: unknown;
}
/** Typed EmptyCard adapter. */
export type EmptyCardAdapter = (options: EmptyCardOptions) => HTMLElement;

/** Options accepted by the Button adapter. */
export interface ButtonOptions {
  readonly variant?: "primary" | "neutral" | "danger";
  readonly type?: "button" | "submit";
  readonly children?: unknown;
  readonly onClick?: (event: Event) => void;
  readonly attrs?: Readonly<Record<string, unknown>>;
}
/** Typed Button adapter. */
export type ButtonAdapter = (options: ButtonOptions) => HTMLButtonElement;

/** Typed TextInput adapter. */
export type TextInputAdapter = (
  attrs: Readonly<Record<string, string | number | boolean>>
) => HTMLInputElement;

/** Typed adapter for `mountThreeColumnPage`. */
export const MountThreeColumnPage =
  mountThreeColumnPage as unknown as MountThreeColumnPageAdapter;

/** Typed adapter for `el`. */
export const elC = el as unknown as ElAdapter;

/** Typed adapter for `clear`. */
export const clearC = clear as unknown as ClearAdapter;

/** Typed adapter for `SectionCard`. */
export const SectionCardC = SectionCard as unknown as SectionCardAdapter;

/** Typed adapter for `EmptyCard`. */
export const EmptyCardC = EmptyCard as unknown as EmptyCardAdapter;

/** Typed adapter for `Button`. */
export const ButtonC = Button as unknown as ButtonAdapter;

/** Typed adapter for `TextInput`. */
export const TextInputC = TextInput as unknown as TextInputAdapter;

/** Typed JSON GET adapter. */
export const apiC = api as <T>(path: string) => Promise<T>;

/** Typed JSON POST adapter. */
export const postJsonC = postJson as (
  path: string,
  body: Readonly<Record<string, unknown>>
) => Promise<unknown>;

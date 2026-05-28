// Shared adapters, types, and string constants for the firm profile page.
// Extracted from `firm.ts` so each topic module stays under the
// max-lines limit while every export is fully typed.

import type {
  FirmProfileResponse,
  RouteError,
} from "../../harper/resource-profile-endpoints-types.js";
import type { DueDiligenceModules } from "../../harper/resource-firm-due-diligence-types.js";
import type {
  EntityRowOptions,
  ProfileHeadTag,
} from "../design-system/organisms-core-types.js";
import {
  EmptyCard,
  EmptyText,
  ProfileHead,
  SectionCard,
  EntityList,
  EntityRow,
  ArticleListBlock,
  Button,
  Tag,
  SourceAttribution,
} from "../design-system/index.js";
import {
  firmDetailsCard,
  regulatoryCard,
  branchesCard,
  firmTags,
  firmSubtitle,
  paginatedAdvisors,
} from "../firm-sections.js";

/**
 * Narrow callable type for design-system helpers whose producer modules
 * still opt out of TS. `molecules.ts` and `templates.ts` are still
 * file-level `@ts-nocheck`'d, and `firm-sections.ts` (which this page
 * imports) is also untyped. Their inferred shapes leak `any` across the
 * module boundary, so this single adapter restates the call signature
 * for components and helpers used as opaque DOM factories.
 */
export type DesignSystemComponent = (
  ...args: readonly unknown[]
) => HTMLElement;

/** Avatar prop accepted by EntityRow in addition to the typed options. */
export interface EntityRowAvatar {
  readonly avatar?: unknown;
}

export const SectionCardComponent =
  SectionCard as unknown as DesignSystemComponent;
export const EmptyCardComponent = EmptyCard as unknown as DesignSystemComponent;
export const ProfileHeadComponent =
  ProfileHead as unknown as DesignSystemComponent;
export const ArticleListBlockComponent =
  ArticleListBlock as unknown as DesignSystemComponent;
export const EntityListComponent =
  EntityList as unknown as DesignSystemComponent;
export const EntityRowComponent = EntityRow as unknown as (
  options: EntityRowOptions & EntityRowAvatar
) => HTMLElement;
export const ButtonComponent = Button as unknown as DesignSystemComponent;
export const TagComponent = Tag as unknown as DesignSystemComponent;
export const SourceAttributionComponent =
  SourceAttribution as unknown as DesignSystemComponent;
export const EmptyTextComponent = EmptyText as unknown as DesignSystemComponent;
export const firmDetailsCardComponent =
  firmDetailsCard as unknown as DesignSystemComponent;
export const regulatoryCardComponent =
  regulatoryCard as unknown as DesignSystemComponent;
export const branchesCardComponent =
  branchesCard as unknown as DesignSystemComponent;
export const paginatedAdvisorsComponent =
  paginatedAdvisors as unknown as DesignSystemComponent;
export const firmTagsAdapter = firmTags as unknown as (
  firm: unknown
) => readonly ProfileHeadTag[];
export const firmSubtitleAdapter = firmSubtitle as unknown as (
  firm: unknown
) => string;

/** Column references provided by `mountThreeColumnPage`'s `build` callback. */
export interface PageColumns {
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

/** Either a successful firm profile payload or a not-found envelope. */
export type FirmProfilePayloadOrError = FirmProfileResponse | RouteError;

/** Optional firm-header fields read locally that aren't on the typed header. */
export interface FirmExtraFields {
  readonly logoUrl?: string;
  readonly notes?: string;
}

/** Minimal discriminator shape used to narrow disclosure event cards. */
export interface KindHolder {
  readonly kind?: unknown;
}

/** Minimal shape used to narrow article stubs from `resourceRows`. */
export interface IdHolder {
  readonly id?: unknown;
}

/** Extra article fields read locally by the coverage timeline. */
export interface CoverageArticleExtras {
  readonly headline?: string;
  readonly url?: string;
}

/** Allowed entity kinds for move subject chip links. */
export type MoveSubjectKind = "firm" | "advisor" | "team";

/** Subject chip shape exposed by `RecentTransitionMove.subject`. */
export interface MoveSubject {
  readonly id?: string;
  readonly kind?: MoveSubjectKind;
  readonly name?: string;
}

/** Module-shape input accepted by `moduleStatusGroup`. */
export interface ModuleStatusHolder {
  readonly status?: string;
}

/** Renderable entry produced by `dueDiligenceModules`. */
export interface ModuleEntry {
  readonly key: keyof DueDiligenceModules;
  readonly node: HTMLElement;
}

/** Pre-filter entry shape carrying a possibly-null module card node. */
export interface NullableModuleEntry {
  readonly key: keyof DueDiligenceModules;
  readonly node: HTMLElement | null;
}

/** Provenance slot accepted by the local `moduleCard` shell. */
export interface ModuleShellProvenance {
  readonly sourceTable?: string;
  readonly sourceTables?: readonly string[];
  readonly sourceIds?: readonly string[];
}

/** Freshness slot accepted by the local `moduleCard` shell. */
export interface ModuleShellFreshness {
  readonly asOf?: unknown;
}

/** Module payload accepted by the local `moduleCard` shell. */
export interface ModuleShellPayload {
  readonly status?: string;
  readonly note?: string;
  readonly provenance?: ModuleShellProvenance;
  readonly freshness?: ModuleShellFreshness;
}

/** Minimal team row shape rendered by `teamsSection`. */
export interface FirmTeamRow {
  readonly id?: string;
  readonly name?: string;
  readonly serviceModel?: string | null;
  readonly aum?: number | null;
  readonly teamSize?: number | null;
}

// Module status group literals reused across due-diligence helpers.
export const STATUS_LOADED = "loaded";
export const STATUS_MISSING = "missing";

// Reader-facing copy tied to module status groups.
export const COPY_SOURCE_BACKED = "Source-backed";
export const COPY_NEEDS_DATA = "Needs data";
export const COPY_NOT_LOADED = "not loaded";

// Repeated CSS class names used across due-diligence builders.
export const CLASS_STAT_ROW = "firm-dd-stat-row";
export const CLASS_LIST = "firm-dd-list";
export const CLASS_LIST_ROW = "firm-dd-list-row";

// Repeated section labels.
export const LABEL_BRANCHES = "Branches";
export const LABEL_DATA_CONFIDENCE = "Data confidence";
export const COPY_NO_MATCHING_MODULES =
  "No due-diligence modules match this filter.";

// Firm header field read for the short-name fallback in transition titles.
export const FIRM_SHORT_FIELD = "short";

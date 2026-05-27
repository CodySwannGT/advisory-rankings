// Section builders and row predicates for the team profile page.
// Extracted from `team.ts` so the page module stays under the
// max-lines limit while every export is fully typed.

import type { HarperDate } from "../types/harper-schema.js";
import type {
  TeamProfileResponse,
  TeamProfileBranch,
} from "../harper/resource-profile-endpoints-types.js";
import type { TeamMemberRow } from "../harper/resource-team.js";
import type { ResolvableTeam } from "../harper/resource-routing.js";
import type { ProfileHeadTag } from "./design-system/organisms-core-types.js";
import {
  fmts,
  fmtMoney,
  fmtDate,
  humanize,
  initials,
  entityPath,
  articleSource,
} from "./app.js";
import {
  el,
  EmptyText,
  ProfileHead,
  SectionCard,
  EntityList,
  EntityRow,
  DetailsCard,
  ArticleListBlock,
  SnapshotTable,
  TransitionEventCard,
} from "./design-system/index.js";

/**
 * Narrow callable type for design-system helpers whose producer modules
 * still opt out of TS. Producers under `src/web/design-system/` still
 * carry `@ts-nocheck`, so their exports leak inferred narrow shapes (or
 * `any`) across module boundaries; this single adapter restates a
 * uniform call signature for every component the team page uses as an
 * opaque DOM factory.
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const EmptyTextComponent = EmptyText as unknown as DesignSystemComponent;
const ProfileHeadComponent = ProfileHead as unknown as DesignSystemComponent;
const EntityListComponent = EntityList as unknown as DesignSystemComponent;
const EntityRowComponent = EntityRow as unknown as DesignSystemComponent;
const DetailsCardComponent = DetailsCard as unknown as DesignSystemComponent;
const ArticleListBlockComponent =
  ArticleListBlock as unknown as DesignSystemComponent;
const SnapshotTableComponent =
  SnapshotTable as unknown as DesignSystemComponent;
const TransitionEventCardComponent =
  TransitionEventCard as unknown as DesignSystemComponent;

/** Minimal firm chip shape read from `TeamProfileResponse.currentFirm`. */
export interface CurrentFirmChip {
  readonly id?: string;
  readonly name?: string;
}

/** Extra fields read off the team header that aren't on the typed schema. */
interface TeamHeaderExtras {
  readonly serviceModel?: string | null;
  readonly firmProgram?: string | null;
  readonly foundedYear?: number | string | null;
  readonly dissolvedYear?: number | string | null;
}

/** Latest metric snapshot fields rendered by the right rail. */
export interface MetricSnapshotView {
  readonly asOf?: HarperDate;
  readonly aum?: number | null;
  readonly annualRevenue?: number | null;
  readonly householdCount?: number | null;
  readonly teamSize?: number | null;
  readonly sourceType?: string | null;
}

/** Inline shape for narrowing the optional `advisor` slot. */
interface AdvisorSlot {
  readonly advisor?: unknown;
}

/** Inline shape for narrowing the optional `id` slot. */
interface IdSlot {
  readonly id?: unknown;
}

/**
 * Narrows an unknown row to the `MetricSnapshotView` shape used by
 * `SnapshotTable` and the latest-metrics right-rail card.
 * @param value - Row under inspection.
 * @returns Whether the row carries an `asOf` date.
 */
export function isMetricSnapshot(value: unknown): value is MetricSnapshotView {
  return typeof value === "object" && value !== null && "asOf" in value;
}

/**
 * Narrows an unknown row to the `TeamMemberRow` shape used by member lists.
 * @param value - Row under inspection.
 * @returns Whether the row carries an `advisor` object with an `id`.
 */
export function isTeamMemberRow(value: unknown): value is TeamMemberRow {
  if (typeof value !== "object" || value === null) return false;
  const advisor = (value as AdvisorSlot).advisor;
  if (typeof advisor !== "object" || advisor === null) return false;
  return typeof (advisor as IdSlot).id === "string";
}

/**
 * Filters a `readonly unknown[]` row array through a typed predicate.
 * @param rows - Unknown row array as returned by `resourceRows`.
 * @param guard - Type predicate used to narrow each row.
 * @returns Array of rows satisfying `guard`.
 */
export function narrowRows<T>(
  rows: readonly unknown[],
  guard: (value: unknown) => value is T
): readonly T[] {
  return rows.filter(guard);
}

/**
 * Narrows the unknown `currentFirm` slot to a chip shape with `id`/`name`.
 * @param value - Slot under inspection.
 * @returns Whether the value looks like a firm chip.
 */
export function asCurrentFirm(value: unknown): CurrentFirmChip | null {
  if (typeof value !== "object" || value === null) return null;
  return value as CurrentFirmChip;
}

/** Options accepted by `memberList` for date label behavior. */
interface MemberListOptions {
  readonly showStart?: boolean;
  readonly showRange?: boolean;
}

/**
 * Renders team members as linked advisor rows.
 * @param members - Team membership rows.
 * @param options - Date display options.
 * @returns EntityList containing member rows.
 */
function memberList(
  members: readonly TeamMemberRow[],
  options: MemberListOptions = {}
): HTMLElement {
  const { showStart = false, showRange = false } = options;
  return EntityListComponent({
    rows: members.map(m => {
      const a = m.advisor;
      const tail = memberTail(m, { showStart, showRange });
      return EntityRowComponent({
        avatar: initials(a.name),
        name: a.name,
        sub: humanize(m.role ?? a.careerStatus ?? undefined) || "",
        tail,
        href: entityPath("advisor", a),
      });
    }),
  });
}

/**
 * Builds the membership date label for a member row.
 * @param member - Team membership record.
 * @param options - Date display options.
 * @returns Tail text for the member row.
 */
function memberTail(
  member: TeamMemberRow,
  options: MemberListOptions = {}
): string {
  const { showStart = false, showRange = false } = options;
  if (showRange && member.startDate && member.endDate)
    return `${fmtDate(member.startDate, { mode: "short" })} – ${fmtDate(member.endDate, { mode: "short" })}`;
  if (showStart && member.startDate)
    return `since ${fmtDate(member.startDate, { mode: "short" })}`;
  return "";
}

/**
 * Builds the current-members card, including the empty state.
 * @param members - Current team memberships.
 * @returns Current members section.
 */
export function currentMembersCard(
  members: readonly TeamMemberRow[]
): HTMLElement {
  return SectionCardComponent({
    title: `Current members (${members.length.toLocaleString()})`,
    body: members.length
      ? memberList(members, { showStart: true })
      : EmptyTextComponent({ children: "No current members." }),
  });
}

/**
 * Builds the past-members section when historical memberships exist.
 * @param members - Past team memberships.
 * @returns Past members section or null.
 */
export function pastMembersCard(
  members: readonly TeamMemberRow[]
): HTMLElement | null {
  return members.length
    ? SectionCardComponent({
        title: `Past members (${members.length.toLocaleString()})`,
        body: memberList(members, { showRange: true }),
      })
    : null;
}

/**
 * Builds the transitions section when team move events exist.
 * @param transitions - Team transition event cards.
 * @returns Transition section or null.
 */
export function transitionsCard(
  transitions: readonly unknown[]
): HTMLElement | null {
  return transitions.length
    ? SectionCardComponent({
        title: "Team transitions",
        body: el(
          "div",
          {},
          ...transitions.map(tr => TransitionEventCardComponent(tr, fmts))
        ),
      })
    : null;
}

/**
 * Builds the metric-history section when snapshots exist.
 * @param snapshots - Team metric snapshots.
 * @returns Metric history section or null.
 */
export function metricHistoryCard(
  snapshots: readonly MetricSnapshotView[]
): HTMLElement | null {
  return snapshots.length
    ? SectionCardComponent({
        title: `Metric history (${snapshots.length.toLocaleString()} snapshot${snapshots.length === 1 ? "" : "s"})`,
        body: SnapshotTableComponent({
          snaps: snapshots,
          fmtMoney,
          fmtDate,
          humanize,
        }),
      })
    : null;
}

/**
 * Builds the coverage section showing all coverage articles for the team.
 * @param articles - Coverage article rows.
 * @returns Coverage section.
 */
export function coverageCard(articles: readonly unknown[]): HTMLElement {
  return SectionCardComponent({
    title: `Coverage (${articles.length.toLocaleString()})`,
    body: ArticleListBlockComponent({ articles, fmtDate, articleSource }),
  });
}

/**
 * Builds the right-rail team details card.
 * @param team - Team profile record.
 * @param currentFirm - Current firm record when present.
 * @returns Team details card.
 */
export function teamDetailsCard(
  team: ResolvableTeam,
  currentFirm: CurrentFirmChip | null
): HTMLElement {
  const extras = team as ResolvableTeam & TeamHeaderExtras;
  return DetailsCardComponent({
    title: "Team details",
    pairs: [
      ["Name", team.name],
      ["Service model", humanize(extras.serviceModel ?? undefined)],
      ["Firm program", extras.firmProgram ?? null],
      ["Founded", extras.foundedYear ?? null],
      ["Dissolved", extras.dissolvedYear ?? null],
      [
        "Current firm",
        currentFirm?.id
          ? el(
              "a",
              { href: entityPath("firm", currentFirm) },
              currentFirm.name ?? ""
            )
          : null,
      ],
    ],
  });
}

/**
 * Builds the latest metrics card from the newest snapshot.
 * @param latest - Latest metric snapshot.
 * @returns Latest metrics details card or null.
 */
export function latestMetricsCard(
  latest: MetricSnapshotView | undefined
): HTMLElement | null {
  if (!latest) return null;
  return DetailsCardComponent({
    title: `Latest metrics (${fmtDate(latest.asOf as HarperDate)})`,
    pairs: [
      ["AUM", latest.aum != null ? fmtMoney(latest.aum) : null],
      [
        "Annual revenue",
        latest.annualRevenue != null ? fmtMoney(latest.annualRevenue) : null,
      ],
      ["Households", latest.householdCount ?? null],
      ["Team size", latest.teamSize ?? null],
      ["Source", humanize(latest.sourceType ?? undefined)],
    ],
  });
}

/**
 * Builds profile badges for team status and metrics.
 * @param team - Team record from TeamProfile.
 * @param latest - Latest metric snapshot when present.
 * @returns Tag data for ProfileHead.
 */
export function teamTags(
  team: ResolvableTeam,
  latest: MetricSnapshotView | undefined
): readonly ProfileHeadTag[] {
  const extras = team as ResolvableTeam & TeamHeaderExtras;
  const serviceModelLabel = humanize(extras.serviceModel ?? undefined);
  const tags: readonly (ProfileHeadTag | null)[] = [
    serviceModelLabel ? { label: `${serviceModelLabel} clients` } : null,
    extras.firmProgram ? { label: extras.firmProgram } : null,
    latest?.aum ? { kind: "ok", label: `${fmtMoney(latest.aum)} AUM` } : null,
    latest?.teamSize ? { label: `${latest.teamSize} members` } : null,
  ];
  return tags.filter((tag): tag is ProfileHeadTag => tag !== null);
}

/**
 * Builds the location and current-firm subtitle for a team profile.
 * @param d - TeamProfile payload.
 * @param currentFirm - Narrowed current firm chip.
 * @returns Subtitle text for ProfileHead.
 */
export function teamSubtitle(
  d: TeamProfileResponse,
  currentFirm: CurrentFirmChip | null
): string {
  const branch: TeamProfileBranch | null = d.currentBranch;
  const where = branch
    ? [branch.buildingName || branch.name, branch.city, branch.state]
        .filter((part): part is string => Boolean(part))
        .join(", ")
    : "";
  return [currentFirm?.name ? `Currently at ${currentFirm.name}` : null, where]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * Builds the team profile-header element from team + latest snapshot.
 * @param team - Team header record.
 * @param payload - Full team profile payload.
 * @param currentFirm - Narrowed current firm chip.
 * @param latest - Latest metric snapshot when present.
 * @returns Profile head element.
 */
export function teamProfileHead(
  team: ResolvableTeam,
  payload: TeamProfileResponse,
  currentFirm: CurrentFirmChip | null,
  latest: MetricSnapshotView | undefined
): HTMLElement {
  return ProfileHeadComponent({
    initialsText: initials(team.name),
    title: team.name,
    subtitle: teamSubtitle(payload, currentFirm),
    tags: teamTags(team, latest),
  });
}

// Center- and right-column firm profile section builders.

import type {
  FirmProfileBody,
  FirmProfileResponse,
} from "../../harper/resource-profile-endpoints-types.js";
import type { DisclosureEventCard as DisclosureEventCardPayload } from "../../harper/resource-feed-types.js";
import type { ArticleStubLike } from "../design-system/organisms-events-types.js";
import {
  entityPath,
  fmtDate,
  fmtMoney,
  fmts,
  humanize,
  initials,
  articleSource,
} from "../app.js";
import {
  ArticleListBlockComponent,
  branchesCardComponent,
  EntityListComponent,
  EntityRowComponent,
  EmptyTextComponent,
  firmDetailsCardComponent,
  FirmExtraFields,
  FirmTeamRow,
  IdHolder,
  KindHolder,
  paginatedAdvisorsComponent,
  regulatoryCardComponent,
  SectionCardComponent,
} from "./shared.js";
import {
  DisclosureEventCard,
  TransitionEventCard,
  el,
} from "../design-system/index.js";
import { PartialFailureCard, resourceRows } from "../detail-state.js";
import { dueDiligenceSection } from "./due-diligence.js";

/**
 * Type predicate for the DisclosureEventCard payload used by the firm
 * "Disclosures filed while at this firm" section. The producer types
 * `disclosuresAtThisFirm` as `readonly unknown[]` because it sometimes
 * resolves to an error envelope; narrow per-row here.
 * @param value - Row under inspection.
 * @returns Whether the row matches a disclosure event card.
 */
export function isDisclosureEventCard(
  value: unknown
): value is DisclosureEventCardPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as KindHolder).kind === "disclosure"
  );
}

/**
 * Narrows an unknown article row to the minimal `ArticleStubLike` shape
 * accepted by `ArticleListBlock`. Rows that fail are dropped.
 * @param value - Row under inspection.
 * @returns Whether the row carries the minimum article-stub fields.
 */
export function isArticleStub(value: unknown): value is ArticleStubLike {
  if (typeof value !== "object" || value === null) return false;
  const id = (value as IdHolder).id;
  return typeof id === "string";
}

/**
 * Filters a `readonly unknown[]` row array through a typed predicate.
 * Mirrors the helper used by the advisor page so we never `as`-cast
 * across the resource boundary.
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
 * Appends only present section nodes to a profile column.
 * @param root - Column node.
 * @param sections - Candidate sections.
 */
export function appendSections(
  root: HTMLElement,
  sections: readonly (HTMLElement | null)[]
): void {
  sections.forEach(section => {
    if (section) root.appendChild(section);
  });
}

/**
 * Builds the center-column firm sections.
 * @param d - FirmProfile payload.
 * @returns Ordered center-column sections.
 */
export function firmCenterSections(
  d: FirmProfileResponse
): readonly (HTMLElement | null)[] {
  const currentTeams = resourceRows(d.currentTeams);
  const transitionsIn = resourceRows(d.transitionsIn);
  const transitionsOut = resourceRows(d.transitionsOut);
  const disclosuresAtThisFirm = narrowRows(
    resourceRows(d.disclosuresAtThisFirm),
    isDisclosureEventCard
  );
  const articles = narrowRows(resourceRows(d.articles), isArticleStub);
  const shortName = d.firm.short || d.firm.name;
  const movesToTitle = `Recent moves to ${shortName}`;
  const movesAwayTitle = `Recent moves away from ${shortName}`;
  const disclosuresTitle = `Disclosures filed while advisors were at ${shortName}`;
  return [
    dueDiligenceSection(d.dueDiligence),
    aboutSection(d.firm as unknown as FirmExtraFields),
    currentAdvisorsSection(d),
    pastAdvisorsSection(d),
    teamsSection(currentTeams),
    PartialFailureCard("Teams currently at this firm", d.currentTeams),
    transitionSection(movesToTitle, transitionsIn),
    PartialFailureCard(movesToTitle, d.transitionsIn),
    transitionSection(movesAwayTitle, transitionsOut),
    PartialFailureCard(movesAwayTitle, d.transitionsOut),
    disclosuresSection(disclosuresTitle, disclosuresAtThisFirm),
    PartialFailureCard(disclosuresTitle, d.disclosuresAtThisFirm),
    SectionCardComponent({
      title: `Coverage (${articles.length.toLocaleString()})`,
      body: ArticleListBlockComponent({ articles, fmtDate, articleSource }),
    }),
    PartialFailureCard("Coverage", d.articles),
  ];
}

/**
 * Builds the right-rail firm sections.
 * @param d - FirmProfile payload.
 * @returns Ordered right-rail sections.
 */
export function firmRightSections(
  d: FirmProfileBody
): readonly (HTMLElement | null)[] {
  return [
    firmDetailsCardComponent(d.firm),
    regulatoryCardComponent(d.brokerCheckSnapshot),
    branchesCardComponent(d.firm, resourceRows(d.branches)),
    PartialFailureCard("Branches", d.branches),
  ];
}

/**
 * Builds the optional "About" section when firm notes are present.
 * @param firm - Firm extra fields holder.
 * @returns About section or null.
 */
function aboutSection(firm: FirmExtraFields): HTMLElement | null {
  return firm.notes
    ? SectionCardComponent({
        title: "About",
        body: el("div", {}, firm.notes),
      })
    : null;
}

/**
 * Builds the past-advisors section when the firm has any.
 * @param d - FirmProfile payload.
 * @returns Past advisors section or null.
 */
function pastAdvisorsSection(d: FirmProfileResponse): HTMLElement | null {
  return d.pastAdvisorCount > 0
    ? SectionCardComponent({
        title: `Past advisors (${d.pastAdvisorCount.toLocaleString()})`,
        body: paginatedAdvisorsComponent(d.firm.id, "past", {
          showEnd: true,
        }),
      })
    : null;
}

/**
 * Builds the current-advisors section with an explicit empty state.
 * @param d - FirmProfile payload.
 * @returns Current advisors section.
 */
export function currentAdvisorsSection(d: FirmProfileResponse): HTMLElement {
  return d.currentAdvisorCount > 0
    ? SectionCardComponent({
        title: `Current advisors (${d.currentAdvisorCount.toLocaleString()})`,
        body: paginatedAdvisorsComponent(d.firm.id, "current", {
          showStart: true,
        }),
      })
    : SectionCardComponent({
        title: "Current advisors (0)",
        body: EmptyTextComponent({ children: "No current advisors on file." }),
      });
}

/**
 * Builds the current-teams section when the firm has team rows.
 * @param teams - Current team rows.
 * @returns Team section or null.
 */
export function teamsSection(teams: readonly unknown[]): HTMLElement | null {
  if (!teams.length) return null;
  const typed = teams as readonly FirmTeamRow[];
  return SectionCardComponent({
    title: `Teams currently at this firm (${teams.length.toLocaleString()})`,
    body: EntityListComponent({
      rows: typed.map(t =>
        EntityRowComponent({
          avatar: initials(t.name ?? ""),
          name: t.name ?? undefined,
          sub: [
            t.serviceModel ? `${humanize(t.serviceModel)} clients` : null,
            t.aum != null ? `${fmtMoney(t.aum)} AUM` : null,
            t.teamSize ? `${t.teamSize} members` : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · "),
          href: entityPath("team", t),
        })
      ),
    }),
  });
}

/**
 * Builds a transition section when move events exist.
 * @param title - Section title prefix.
 * @param transitions - Transition event rows.
 * @returns Transition section or null.
 */
export function transitionSection(
  title: string,
  transitions: readonly unknown[]
): HTMLElement | null {
  return transitions.length
    ? SectionCardComponent({
        title: `${title} (${transitions.length.toLocaleString()})`,
        body: el(
          "div",
          {},
          ...transitions.map(t => TransitionEventCard(t as never, fmts))
        ),
      })
    : null;
}

/**
 * Builds the disclosures-at-this-firm section when rows exist.
 * @param title - Section title.
 * @param rows - Narrowed disclosure event card rows.
 * @returns Disclosures section or null.
 */
export function disclosuresSection(
  title: string,
  rows: readonly DisclosureEventCardPayload[]
): HTMLElement | null {
  return rows.length
    ? SectionCardComponent({
        title,
        body: el("div", {}, ...rows.map(dis => DisclosureEventCard(dis, fmts))),
      })
    : null;
}

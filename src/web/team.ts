// Team profile page.
// All UI comes from the design system — see docs/design-system.md.

import type {
  TeamProfileResponse,
  RouteError,
} from "../harper/resource-profile-endpoints-types.js";
import {
  api,
  refreshMe,
  logout,
  search,
  getEntityIdParam,
  canonicalizeEntityRoute,
} from "./app.js";
import {
  mountThreeColumnPage,
  EmptyCard,
  clear,
  el,
} from "./design-system/index.js";
import {
  DetailNotFoundCard,
  PartialFailureCard,
  renderDetailLoading,
  renderRecoverableDetailError,
  resourceRows,
} from "./detail-state.js";
import {
  type CurrentFirmChip,
  type MetricSnapshotView,
  asCurrentFirm,
  coverageCard,
  currentMembersCard,
  isMetricSnapshot,
  isTeamMemberRow,
  latestMetricsCard,
  metricHistoryCard,
  narrowRows,
  pastMembersCard,
  teamDetailsCard,
  teamProfileHead,
  transitionsCard,
} from "./team-sections.js";

/**
 * Narrow callable type for design-system helpers whose producer modules
 * still opt out of TS. Producers under `src/web/design-system/` still
 * carry `@ts-nocheck`, so their exports leak inferred narrow shapes (or
 * `any`) across module boundaries; this adapter restates a uniform
 * call signature for the single `EmptyCard` factory used directly here.
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const EmptyCardComponent = EmptyCard as unknown as DesignSystemComponent;

/** Column references provided by `mountThreeColumnPage`'s `build` callback. */
interface PageColumns {
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

/** Either a successful team profile payload or a not-found envelope. */
type TeamProfilePayloadOrError = TeamProfileResponse | RouteError;

mountThreeColumnPage({
  active: "teams",
  refreshMe,
  logout,
  search,
  build({ center, right }: PageColumns): void {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCardComponent({
          title: "No team selected",
          body: "Pick a team from a firm or feed.",
        })
      );
      return;
    }
    const loadTeamProfile = (): void => {
      clear(center);
      clear(right);
      renderDetailLoading({ center, right, label: "team profile" });
      api<TeamProfilePayloadOrError>(`/TeamProfile/${encodeURIComponent(id)}`)
        .then(d => {
          clear(center);
          clear(right);
          render(d, center, right);
        })
        .catch((err: unknown) => {
          renderRecoverableDetailError({
            center,
            right,
            title: "Could not load team",
            error: err,
            onRetry: loadTeamProfile,
          });
        });
    };

    loadTeamProfile();
  },
});

/**
 * Discriminates a not-found error envelope from a team profile payload.
 * @param payload - Resource response under inspection.
 * @returns Whether the payload represents a not-found envelope.
 */
function isErrorPayload(
  payload: TeamProfilePayloadOrError
): payload is RouteError {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    Boolean(payload.error)
  );
}

/**
 * Renders the team profile into the page.
 * @param d - TeamProfile payload returned by the TeamProfile resource.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 */
function render(
  d: TeamProfilePayloadOrError,
  center: HTMLElement,
  right: HTMLElement
): void {
  if (isErrorPayload(d)) {
    center.appendChild(
      DetailNotFoundCard({
        title: "Team not found",
        id: d.id,
        actionLabel: "Back to Teams",
        href: "/teams",
      })
    );
    return;
  }
  const t = d.team;
  const metricSnapshots = narrowRows(
    resourceRows(d.metricSnapshots),
    isMetricSnapshot
  );
  const currentMembers = narrowRows(
    resourceRows(d.currentMembers),
    isTeamMemberRow
  );
  const pastMembers = narrowRows(resourceRows(d.pastMembers), isTeamMemberRow);
  const transitions = resourceRows(d.transitions);
  const articles = resourceRows(d.articles);
  const latest: MetricSnapshotView | undefined =
    metricSnapshots[metricSnapshots.length - 1];
  const currentFirm: CurrentFirmChip | null = asCurrentFirm(d.currentFirm);

  canonicalizeEntityRoute("team", t);
  appendSections(center, [
    teamProfileHead(t, d, currentFirm, latest),
    currentMembersCard(currentMembers),
    PartialFailureCard("Current members", d.currentMembers),
    pastMembersCard(pastMembers),
    PartialFailureCard("Past members", d.pastMembers),
    transitionsCard(transitions),
    PartialFailureCard("Team transitions", d.transitions),
    metricHistoryCard(metricSnapshots),
    PartialFailureCard("Metric history", d.metricSnapshots),
    coverageCard(articles),
    PartialFailureCard("Coverage", d.articles),
    mobileTeamDetailsCard(t, currentFirm),
  ]);
  appendSections(right, [
    teamDetailsCard(t, currentFirm),
    latestMetricsCard(latest),
  ]);
}

/**
 * Renders the shared team details card in the mobile content flow.
 * @param team - Team profile record.
 * @param currentFirm - Current firm record when present.
 * @returns Mobile-only team details wrapper.
 */
function mobileTeamDetailsCard(
  team: TeamProfileResponse["team"],
  currentFirm: CurrentFirmChip | null
): HTMLElement {
  return el(
    "div",
    { class: "team-mobile-details" },
    teamDetailsCard(team, currentFirm)
  );
}

/**
 * Appends present sections while skipping empty optional cards.
 * @param root - Column element receiving sections.
 * @param sections - Candidate section nodes.
 */
function appendSections(
  root: HTMLElement,
  sections: readonly (HTMLElement | null)[]
): void {
  sections.forEach(section => {
    if (section) root.appendChild(section);
  });
}

import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import type {
  AdvisorRow,
  OutsideBusinessActivityRow,
} from "../types/harper-schema.js";
import {
  api,
  refreshMe,
  logout,
  search,
  humanize,
  initials,
  getEntityIdParam,
  canonicalizeEntityRoute,
} from "./app.js";
import {
  mountThreeColumnPage,
  el,
  EmptyCard,
  ProfileHead,
  SectionCard,
  clear,
} from "./design-system/index.js";
import { privateRatingCard } from "./advisor-rating.js";
import { advisorCorrectionCard } from "./advisor-correction.js";
import { addToWatchlistCard } from "./add-to-watchlist.js";
import {
  compareAdvisorCard,
  transitionEventCard,
} from "./advisor-compare-card.js";
import {
  PartialFailureCard,
  renderDetailLoading,
  renderRecoverableDetailError,
  resourceRows,
} from "./detail-state.js";
import { renderAdvisorNotFound } from "./advisor-not-found.js";
import {
  careerSection,
  designationsSection,
  educationSection,
  disclosuresSection,
  licensesSection,
  outsideActivitiesSection,
  teamsSection,
} from "./advisor-sections.js";
import { publicReadinessCard } from "./advisor-readiness-card.js";
import { appendAdvisorRightRail } from "./advisor-render-helpers.js";
import { reviewedDiscrepancyNotesSection } from "./advisor-discrepancy-notes-section.js";
import {
  advisorEvidenceProfileSections,
  mountResponsiveEvidenceSections,
} from "./advisor-evidence-sections.js";
import { advisorTrustChecklistCard } from "./advisor-trust-checklist.js";
import { advisorCoverageSection } from "./advisor-coverage-section.js";
import { isErrorPayload } from "./advisor-error-payload.js";
import { reviewedNoteRows } from "./advisor-reviewed-note-rows.js";
import { appendRegistrationApplications } from "./advisor-registration-applications.js";
import {
  isAdvisorTeamRow,
  isDesignationStub,
  isEducationStub,
  isLicenseStub,
  isOutsideBusinessActivityRow,
  narrowRows,
} from "./advisor-row-predicates.js";

/**
 * Narrow callable type for design-system helpers that still opt out of TS.
 * Producers under `src/web/design-system/` still carry `@ts-nocheck`, so
 * their exports leak inferred narrow shapes (or `any`) across module
 * boundaries; this adapter restores a single uniform call signature for
 * every component this page uses.
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const EmptyCardComponent = EmptyCard as unknown as DesignSystemComponent;
const ProfileHeadComponent = ProfileHead as unknown as DesignSystemComponent;

/** Tag descriptor accepted by `ProfileHead.tags`. */
interface ProfileTag {
  readonly kind?: string;
  readonly label: string;
}

/** Column references provided by `mountThreeColumnPage`'s `build` callback. */
interface PageColumns {
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

mountThreeColumnPage({
  active: "advisors",
  refreshMe,
  logout,
  search,
  build({ center, right }: PageColumns): void {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCardComponent({
          title: "No advisor selected",
          body: "Pick an advisor from the feed.",
        })
      );
      return;
    }
    loadAdvisorProfile(id, center, right);
  },
});

/**
 * Loads the selected advisor profile and wires retry back to the same route id.
 * @param id - Advisor id from the route.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 */
function loadAdvisorProfile(
  id: string,
  center: HTMLElement,
  right: HTMLElement
): void {
  const profileRequest = api<AdvisorProfilePayload>(
    `/AdvisorProfile/${encodeURIComponent(id)}`
  );
  const meRequest = refreshMe().catch(() => null);
  clear(center);
  clear(right);
  renderDetailLoading({ center, right, label: "advisor profile" });
  Promise.all([profileRequest, meRequest])
    .then(([d, me]) => {
      clear(center);
      clear(right);
      render(d, center, right, isAnalystSession(me));
    })
    .catch((err: unknown) => {
      renderRecoverableDetailError({
        center,
        right,
        title: "Could not load advisor",
        error: err,
        onRetry: () => loadAdvisorProfile(id, center, right),
      });
    });
}

/**
 * Renders an advisor profile from the AdvisorProfile resource payload.
 * @param d - Advisor profile payload returned by the AdvisorProfile resource.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 * @param showAnalystDetails - Whether analyst evidence detail should render.
 * @returns Nothing; writes profile sections into the supplied columns.
 */
function render(
  d: AdvisorProfilePayload,
  center: HTMLElement,
  right: HTMLElement,
  showAnalystDetails: boolean
): void {
  if (isErrorPayload(d)) return renderAdvisorNotFound(center, d.id);
  const mobileEvidenceRoot = el("div", { class: "advisor-mobile-evidence" });
  const desktopEvidenceRoot = el("div", { class: "advisor-desktop-evidence" });
  const sections = advisorEvidenceProfileSections(d, { showAnalystDetails });
  canonicalizeEntityRoute("advisor", { ...d.advisor, name: d.displayName });
  appendSections(center, [
    advisorProfileHead(d),
    ...advisorCenterSections(d, mobileEvidenceRoot),
  ]);
  appendAdvisorRightRail(right, d, desktopEvidenceRoot);
  mountResponsiveEvidenceSections({
    desktopRoot: desktopEvidenceRoot,
    mobileRoot: mobileEvidenceRoot,
    sections,
  });
  mobileEvidenceRoot.appendChild(publicReadinessCard(d));
  appendRegistrationApplications(right, d);
}

/**
 * Builds the advisor profile header component.
 * @param profile - Advisor profile payload.
 * @returns Rendered profile header.
 */
function advisorProfileHead(profile: AdvisorProfilePayload): HTMLElement {
  return ProfileHeadComponent({
    initialsText: initials(profile.displayName),
    imageUrl: profile.advisor.headshotUrl,
    title: profile.displayName,
    subtitle: advisorSubtitle(profile),
    tags: advisorTags(profile.advisor),
  });
}

/**
 * Appends present profile sections to a column.
 * @param root - Column node.
 * @param sections - Candidate sections.
 */
function appendSections(
  root: HTMLElement,
  sections: readonly (HTMLElement | null | undefined)[]
): void {
  sections.forEach(section => {
    if (section) root.appendChild(section);
  });
}

/**
 * Builds advisor profile badges.
 * @param advisor - Advisor record.
 * @returns Tags for ProfileHead.
 */
function advisorTags(advisor: AdvisorRow): readonly ProfileTag[] {
  const candidates: readonly (ProfileTag | null)[] = [
    advisor.careerStatus
      ? {
          kind: careerStatusKind(advisor.careerStatus),
          label: humanize(advisor.careerStatus) ?? advisor.careerStatus,
        }
      : null,
    advisor.yearsExperience
      ? { label: `${advisor.yearsExperience}y experience` }
      : null,
    advisor.finraCrd ? { label: `CRD ${advisor.finraCrd}` } : null,
  ];
  return candidates.filter((tag): tag is ProfileTag => tag !== null);
}

/**
 * Maps advisor career status to a tag tone.
 * @param status - Career status value.
 * @returns Tag kind.
 */
function careerStatusKind(status: string): string {
  if (status === "active") return "ok";
  if (status === "barred" || status === "suspended") return "danger";
  if (status === "retired" || status === "deceased") return "warn";
  return "default";
}

/**
 * Builds the advisor profile subtitle from current or most recent employment.
 * @param d - AdvisorProfile payload.
 * @returns Subtitle text for ProfileHead.
 */
function advisorSubtitle(d: AdvisorProfilePayload): string {
  const currentEh = d.career.find(c => !c.endDate);
  if (currentEh) {
    const firmName = firmNameOf(currentEh.firm);
    const branchName = branchNameOf(currentEh.branch);
    return [
      [currentEh.roleTitle, firmName].filter(Boolean).join(" at "),
      branchName,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (d.career.length) {
    const lastFirm = firmNameOf(d.career[d.career.length - 1]?.firm);
    return `Last seen at ${lastFirm || "?"}`;
  }
  return "";
}

/**
 * Safely reads a firm display name from an opaque chip payload.
 * @param firm - Firm chip value as returned by the resource.
 * @returns Firm display name when present.
 */
function firmNameOf(firm: unknown): string | undefined {
  if (firm && typeof firm === "object" && "name" in firm) {
    const name = firm.name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

/**
 * Safely reads a branch display name from an advisor career row.
 * @param branch - Branch chip value as returned by the resource.
 * @returns Branch display name when present.
 */
function branchNameOf(branch: BranchNamePart | null): string | undefined {
  return branch?.name;
}

/** Minimal branch shape required for subtitle formatting. */
interface BranchNamePart {
  readonly name: string | undefined;
}

/**
 * Builds center-column advisor sections.
 * @param d - AdvisorProfile payload.
 * @param mobileEvidenceRoot - Responsive evidence slot for narrow viewports.
 * @returns Ordered center-column sections.
 */
function advisorCenterSections(
  d: AdvisorProfilePayload,
  mobileEvidenceRoot: HTMLElement
): readonly (HTMLElement | null)[] {
  const reviewed = reviewedNoteRows(d);
  const snapshot = d.brokerCheckSnapshot;
  const rows = advisorSectionRows(d);
  return [
    ...advisorPrimaryCards(d, mobileEvidenceRoot),
    careerSection(d),
    teamsSection(rows.teams),
    PartialFailureCard("Teams", d.teams),
    licensesSection(rows.licenses, snapshot),
    PartialFailureCard("Licenses", d.licenses),
    designationsSection(rows.designations),
    PartialFailureCard("Designations", d.designations),
    educationSection(rows.education),
    PartialFailureCard("Education", d.education),
    disclosuresSection(resourceRows(d.disclosures), snapshot),
    PartialFailureCard("Disclosures", d.disclosures),
    reviewedDiscrepancyNotesSection(
      reviewed.discrepancies,
      reviewed.corrections,
      snapshot
    ),
    PartialFailureCard("Reviewed discrepancy notes", reviewed.all),
    outsideActivitiesSection(advisorOutsideBusinessActivities(d)),
    PartialFailureCard("Outside activities", d.outsideBusinessActivities),
    ...advisorActivitySections(d),
  ];
}

const advisorActivitySections = (
  d: AdvisorProfilePayload
): readonly (HTMLElement | null)[] => [
  advisorTransitionsSection(resourceRows(d.transitions)),
  PartialFailureCard("Transitions involving this advisor", d.transitions),
  advisorCoverageSection(resourceRows(d.articles)),
  PartialFailureCard("Coverage", d.articles),
];

const advisorSectionRows = (d: AdvisorProfilePayload) => ({
  designations: narrowRows(resourceRows(d.designations), isDesignationStub),
  education: narrowRows(resourceRows(d.education), isEducationStub),
  licenses: narrowRows(resourceRows(d.licenses), isLicenseStub),
  teams: narrowRows(resourceRows(d.teams), isAdvisorTeamRow),
});

/**
 * Checks whether the session can see analyst-only profile details.
 * @param me - Current session payload, or null when unauthenticated.
 * @returns True when the user is an authenticated analyst.
 */
function isAnalystSession(
  me: Awaited<ReturnType<typeof refreshMe>> | null
): boolean {
  return me?.authenticated === true && me.role === "analyst";
}

/**
 * Reads verified outside-business activity rows from the profile payload.
 * @param d - Advisor profile payload.
 * @returns Narrowed outside-business activity rows.
 */
function advisorOutsideBusinessActivities(
  d: AdvisorProfilePayload
): readonly OutsideBusinessActivityRow[] {
  return narrowRows(
    resourceRows(d.outsideBusinessActivities),
    isOutsideBusinessActivityRow
  );
}

/**
 * Builds the fixed set of primary advisor action cards.
 * @param d - Advisor profile payload.
 * @param mobileEvidenceRoot - Responsive evidence slot.
 * @returns Primary action and evidence cards.
 */
function advisorPrimaryCards(
  d: AdvisorProfilePayload,
  mobileEvidenceRoot: HTMLElement
): readonly HTMLElement[] {
  return [
    compareAdvisorCard(d.advisor.id),
    addToWatchlistCard(d.advisor.id),
    privateRatingCard(d.advisor.id),
    advisorCorrectionCard(d),
    advisorTrustChecklistCard(d),
    mobileEvidenceRoot,
  ];
}

/**
 * Builds the advisor transition history section.
 * @param transitions - Transition rows for the advisor.
 * @returns Transition section when rows are present.
 */
function advisorTransitionsSection(
  transitions: readonly unknown[]
): HTMLElement | null {
  return transitions.length
    ? SectionCardComponent({
        title: "Transitions involving this advisor",
        body: el("div", {}, ...transitions.map(transitionEventCard)),
      })
    : null;
}

import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import type { AdvisorRow } from "../types/harper-schema.js";
import {
  api,
  refreshMe,
  logout,
  search,
  fmtDate,
  humanize,
  initials,
  getEntityIdParam,
  articleSource,
  canonicalizeEntityRoute,
} from "./app.js";
import {
  mountThreeColumnPage,
  el,
  EmptyCard,
  ProfileHead,
  SectionCard,
  ArticleListBlock,
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
  DetailNotFoundCard,
  PartialFailureCard,
  renderDetailLoading,
  renderRecoverableDetailError,
  resourceRows,
} from "./detail-state.js";
import {
  careerSection,
  designationsSection,
  educationSection,
  disclosuresSection,
  licensesSection,
  outsideActivitiesSection,
  teamsSection,
  identityCard,
  registrationApplicationsSection,
} from "./advisor-sections.js";
import { reviewedDiscrepancyNotesSection } from "./advisor-discrepancy-notes-section.js";
import {
  advisorEvidenceProfileSections,
  mountResponsiveEvidenceSections,
} from "./advisor-evidence-sections.js";
import { isErrorPayload } from "./advisor-error-payload.js";
import {
  isAdvisorTeamRow,
  isDesignationStub,
  isEducationStub,
  isLicenseStub,
  isOutsideBusinessActivityRow,
  isRegistrationApplicationRow,
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
const ArticleListBlockComponent =
  ArticleListBlock as unknown as DesignSystemComponent;

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
    const loadAdvisorProfile = (): void => {
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
          render(
            d,
            center,
            right,
            me?.authenticated === true && me.role === "analyst"
          );
        })
        .catch((err: unknown) => {
          renderRecoverableDetailError({
            center,
            right,
            title: "Could not load advisor",
            error: err,
            onRetry: loadAdvisorProfile,
          });
        });
    };

    loadAdvisorProfile();
  },
});

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
  if (isErrorPayload(d)) {
    center.appendChild(
      DetailNotFoundCard({
        title: "Advisor not found",
        id: d.id,
        actionLabel: "Back to Advisors",
        href: "/advisors",
      })
    );
    return;
  }
  const a = d.advisor;
  const mobileEvidenceRoot = el("div", { class: "advisor-mobile-evidence" });
  const desktopEvidenceRoot = el("div", { class: "advisor-desktop-evidence" });
  const evidenceSections = advisorEvidenceProfileSections(d, {
    showAnalystDetails,
  });

  canonicalizeEntityRoute("advisor", { ...a, name: d.displayName });
  appendSections(center, [
    ProfileHeadComponent({
      initialsText: initials(d.displayName),
      imageUrl: a.headshotUrl,
      title: d.displayName,
      subtitle: advisorSubtitle(d),
      tags: advisorTags(a),
    }),
    ...advisorCenterSections(d, mobileEvidenceRoot),
  ]);
  right.appendChild(identityCard(d.advisor));
  right.appendChild(desktopEvidenceRoot);
  mountResponsiveEvidenceSections({
    desktopRoot: desktopEvidenceRoot,
    mobileRoot: mobileEvidenceRoot,
    sections: evidenceSections,
  });
  appendSections(right, [
    registrationApplicationsSection(
      narrowRows(
        resourceRows(d.registrationApplications),
        isRegistrationApplicationRow
      )
    ),
    PartialFailureCard("Registration applications", d.registrationApplications),
  ]);
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
  const transitions = resourceRows(d.transitions);
  const articles = resourceRows(d.articles);
  const reviewedDiscrepancies = d.reviewedRegulatoryDiscrepancies ?? [];
  const reviewedCorrections = d.reviewedCorrectionRequests ?? [];
  return [
    compareAdvisorCard(d.advisor.id),
    addToWatchlistCard(d.advisor.id),
    privateRatingCard(d.advisor.id),
    advisorCorrectionCard(d),
    mobileEvidenceRoot,
    careerSection(d),
    teamsSection(narrowRows(resourceRows(d.teams), isAdvisorTeamRow)),
    PartialFailureCard("Teams", d.teams),
    licensesSection(
      narrowRows(resourceRows(d.licenses), isLicenseStub),
      d.brokerCheckSnapshot
    ),
    PartialFailureCard("Licenses", d.licenses),
    designationsSection(
      narrowRows(resourceRows(d.designations), isDesignationStub)
    ),
    PartialFailureCard("Designations", d.designations),
    educationSection(narrowRows(resourceRows(d.education), isEducationStub)),
    PartialFailureCard("Education", d.education),
    disclosuresSection(resourceRows(d.disclosures), d.brokerCheckSnapshot),
    PartialFailureCard("Disclosures", d.disclosures),
    reviewedDiscrepancyNotesSection(
      reviewedDiscrepancies,
      reviewedCorrections,
      d.brokerCheckSnapshot
    ),
    PartialFailureCard("Reviewed discrepancy notes", [
      ...reviewedDiscrepancies,
      ...reviewedCorrections,
    ]),
    outsideActivitiesSection(
      narrowRows(
        resourceRows(d.outsideBusinessActivities),
        isOutsideBusinessActivityRow
      )
    ),
    PartialFailureCard("Outside activities", d.outsideBusinessActivities),
    transitions.length
      ? SectionCardComponent({
          title: "Transitions involving this advisor",
          body: el("div", {}, ...transitions.map(transitionEventCard)),
        })
      : null,
    PartialFailureCard("Transitions involving this advisor", d.transitions),
    SectionCardComponent({
      title: `Coverage (${articles.length.toLocaleString()})`,
      body: ArticleListBlockComponent({ articles, fmtDate, articleSource }),
    }),
    PartialFailureCard("Coverage", d.articles),
  ];
}

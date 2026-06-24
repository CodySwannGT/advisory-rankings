import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import type { AdvisorReadiness } from "../harper/resource-advisor-readiness.js";
import { advisorReadiness } from "../harper/resource-advisor-readiness.js";

/** Public-safe checklist state for one advisor trust signal. */
export type AdvisorTrustChecklistState =
  | "present"
  | "missing"
  | "needs-review"
  | "not-found";

/** Deterministic row consumed by the advisor profile checklist UI. */
export interface AdvisorTrustChecklistRow {
  readonly id: string;
  readonly label: string;
  readonly state: AdvisorTrustChecklistState;
  readonly stateLabel: string;
  readonly summary: string;
  readonly supportLabel: string;
  readonly supportHref: string;
}

const SUPPORT_SECTIONS = {
  articles: { href: "#profile-articles", label: "Coverage articles" },
  crd: { href: "#profile-identity", label: "Profile identity" },
  disclosures: { href: "#profile-disclosures", label: "Disclosures" },
  firmContext: { href: "#profile-career", label: "Career and teams" },
  freshness: { href: "#profile-provenance", label: "Profile provenance" },
  profileReadiness: { href: "#public-readiness", label: "Public readiness" },
  reviewedNotes: {
    href: "#reviewed-discrepancy-notes",
    label: "Reviewed discrepancy notes",
  },
} as const;
const STATE_LABELS: Record<AdvisorTrustChecklistState, string> = {
  missing: "Unavailable public data",
  "needs-review": "Review source details",
  "not-found": "No public row loaded",
  present: "Source-backed",
};
const STATE_NEEDS_REVIEW = "needs-review";
const STATE_NOT_FOUND = "not-found";

/** Support section metadata attached to a checklist row. */
type SupportSection = (typeof SUPPORT_SECTIONS)[keyof typeof SUPPORT_SECTIONS];

/** Checklist row fields before derived copy and support values are attached. */
type ChecklistRowInput = Omit<
  AdvisorTrustChecklistRow,
  "stateLabel" | "supportHref" | "supportLabel"
> &
  Readonly<Record<"support", SupportSection>>;

/**
 * Builds public advisor trust checklist rows from existing profile payload
 * sections. Missing source data remains neutral and never implies safety.
 * @param profile - Public advisor profile payload.
 * @returns Checklist rows in stable display order.
 */
export function advisorTrustChecklistRows(
  profile: AdvisorProfilePayload
): readonly AdvisorTrustChecklistRow[] {
  const readiness = advisorReadiness(profile.advisor, freshnessState(profile));
  return [
    contactProfileRow(readiness),
    crdRow(readiness),
    freshnessRow(readiness),
    disclosureRow(profile),
    firmContextRow(profile),
    articlesRow(profile),
    reviewedNotesRow(profile),
  ];
}

/**
 * Maps profile freshness evidence to the public readiness state vocabulary.
 * @param profile - Public advisor profile payload.
 * @returns Freshness state for readiness and checklist mapping.
 */
function freshnessState(
  profile: AdvisorProfilePayload
): AdvisorReadiness["freshness"] {
  if (!profile.evidenceFreshness.hasData) return "unknown";
  return profile.evidenceFreshness.lastCheckedAt ? "current" : "unknown";
}

/**
 * Builds contact and profile substance readiness row.
 * @param readiness - Public readiness summary.
 * @returns Checklist row.
 */
function contactProfileRow(
  readiness: AdvisorReadiness
): AdvisorTrustChecklistRow {
  const present =
    readiness.contact === "ready" && readiness.profileSubstance === "present";
  return checklistRow({
    id: "contact-profile-readiness",
    label: "Contact and profile readiness",
    state: present ? "present" : "missing",
    summary: present
      ? "Public contact fields and profile substance are available."
      : "One or more public contact or profile substance fields are unavailable in public source data.",
    support: SUPPORT_SECTIONS.profileReadiness,
  });
}

/**
 * Builds CRD status row.
 * @param readiness - Public readiness summary.
 * @returns Checklist row.
 */
function crdRow(readiness: AdvisorReadiness): AdvisorTrustChecklistRow {
  return checklistRow({
    id: "finra-crd",
    label: "FINRA CRD",
    state: readiness.crd === "present" ? "present" : "missing",
    summary:
      readiness.crd === "present"
        ? "FINRA CRD is available in public profile data."
        : "FINRA CRD is unavailable in public profile data; this is a source-data limitation.",
    support: SUPPORT_SECTIONS.crd,
  });
}

/**
 * Builds source freshness row.
 * @param readiness - Public readiness summary.
 * @returns Checklist row.
 */
function freshnessRow(readiness: AdvisorReadiness): AdvisorTrustChecklistRow {
  const state =
    readiness.freshness === "current"
      ? "present"
      : readiness.freshness === "stale"
        ? STATE_NEEDS_REVIEW
        : STATE_NOT_FOUND;
  return checklistRow({
    id: "evidence-freshness",
    label: "Evidence freshness",
    state,
    summary:
      readiness.freshness === "current"
        ? "Public source-check evidence is loaded for this profile."
        : "Public source-check freshness is unavailable or needs review before relying on recency.",
    support: SUPPORT_SECTIONS.freshness,
  });
}

/**
 * Builds disclosure and regulatory signal row.
 * @param profile - Public advisor profile payload.
 * @returns Checklist row.
 */
function disclosureRow(
  profile: AdvisorProfilePayload
): AdvisorTrustChecklistRow {
  const count = profile.disclosures.length;
  return checklistRow({
    id: "disclosures-regulatory-signals",
    label: "Disclosures and regulatory signals",
    state: count ? STATE_NEEDS_REVIEW : STATE_NOT_FOUND,
    summary: count
      ? `${count.toLocaleString()} public disclosure row${count === 1 ? "" : "s"} loaded for reader review.`
      : "No public disclosure rows are loaded; this is not a statement that no disclosures exist.",
    support: SUPPORT_SECTIONS.disclosures,
  });
}

/**
 * Builds firm and team context row.
 * @param profile - Public advisor profile payload.
 * @returns Checklist row.
 */
function firmContextRow(
  profile: AdvisorProfilePayload
): AdvisorTrustChecklistRow {
  const contextCount = profile.career.length + profile.teams.length;
  return checklistRow({
    id: "firm-team-context",
    label: "Firm and team context",
    state: contextCount ? "present" : STATE_NOT_FOUND,
    summary: contextCount
      ? "Firm career or team context is available."
      : "No firm career or team context is loaded in public profile data.",
    support: SUPPORT_SECTIONS.firmContext,
  });
}

/**
 * Builds article context row.
 * @param profile - Public advisor profile payload.
 * @returns Checklist row.
 */
function articlesRow(profile: AdvisorProfilePayload): AdvisorTrustChecklistRow {
  const count = profile.articles.length;
  return checklistRow({
    id: "article-context",
    label: "Article context",
    state: count ? "present" : STATE_NOT_FOUND,
    summary: count
      ? `${count.toLocaleString()} public article reference${count === 1 ? "" : "s"} loaded.`
      : "No public article references are loaded for this profile.",
    support: SUPPORT_SECTIONS.articles,
  });
}

/**
 * Builds reviewed note availability row.
 * @param profile - Public advisor profile payload.
 * @returns Checklist row.
 */
function reviewedNotesRow(
  profile: AdvisorProfilePayload
): AdvisorTrustChecklistRow {
  const count =
    profile.reviewedRegulatoryDiscrepancies.length +
    profile.reviewedCorrectionRequests.length;
  return checklistRow({
    id: "reviewed-notes",
    label: "Reviewed notes",
    state: count ? STATE_NEEDS_REVIEW : STATE_NOT_FOUND,
    summary: count
      ? `${count.toLocaleString()} reviewed public discrepancy or correction note${count === 1 ? "" : "s"} loaded.`
      : "Only reviewed public discrepancy or correction notes are eligible for this row; none are loaded.",
    support: SUPPORT_SECTIONS.reviewedNotes,
  });
}

/**
 * Attaches public-facing state and support metadata to one checklist row.
 * @param input - Checklist row fields plus support section.
 * @returns Complete public checklist row.
 */
function checklistRow(input: ChecklistRowInput): AdvisorTrustChecklistRow {
  return {
    id: input.id,
    label: input.label,
    state: input.state,
    stateLabel: STATE_LABELS[input.state],
    summary: input.summary,
    supportHref: input.support.href,
    supportLabel: input.support.label,
  };
}

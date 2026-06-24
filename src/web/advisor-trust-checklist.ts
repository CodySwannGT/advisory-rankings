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
  readonly summary: string;
  readonly supportHref: string;
}

const SUPPORT_HREFS = {
  articles: "#profile-articles",
  crd: "#profile-identity",
  disclosures: "#profile-disclosures",
  firmContext: "#profile-career",
  freshness: "#profile-provenance",
  profileReadiness: "#public-readiness",
  reviewedNotes: "#reviewed-discrepancy-notes",
} as const;
const STATE_NEEDS_REVIEW = "needs-review";
const STATE_NOT_FOUND = "not-found";

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
  return {
    id: "contact-profile-readiness",
    label: "Contact and profile readiness",
    state: present ? "present" : "missing",
    summary: present
      ? "Public contact fields and profile substance are available."
      : "One or more public contact or profile substance fields are unavailable.",
    supportHref: SUPPORT_HREFS.profileReadiness,
  };
}

/**
 * Builds CRD status row.
 * @param readiness - Public readiness summary.
 * @returns Checklist row.
 */
function crdRow(readiness: AdvisorReadiness): AdvisorTrustChecklistRow {
  return {
    id: "finra-crd",
    label: "FINRA CRD",
    state: readiness.crd === "present" ? "present" : "missing",
    summary:
      readiness.crd === "present"
        ? "FINRA CRD is available in public profile data."
        : "FINRA CRD is unavailable in public profile data.",
    supportHref: SUPPORT_HREFS.crd,
  };
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
  return {
    id: "evidence-freshness",
    label: "Evidence freshness",
    state,
    summary:
      readiness.freshness === "current"
        ? "Public source-check evidence is loaded for this profile."
        : "Public source-check freshness is unavailable or needs review.",
    supportHref: SUPPORT_HREFS.freshness,
  };
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
  return {
    id: "disclosures-regulatory-signals",
    label: "Disclosures and regulatory signals",
    state: count ? STATE_NEEDS_REVIEW : STATE_NOT_FOUND,
    summary: count
      ? `${count.toLocaleString()} public disclosure row${count === 1 ? "" : "s"} loaded for review.`
      : "No public disclosure rows are loaded for this profile.",
    supportHref: SUPPORT_HREFS.disclosures,
  };
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
  return {
    id: "firm-team-context",
    label: "Firm and team context",
    state: contextCount ? "present" : STATE_NOT_FOUND,
    summary: contextCount
      ? "Firm career or team context is available."
      : "No firm career or team context is loaded for this profile.",
    supportHref: SUPPORT_HREFS.firmContext,
  };
}

/**
 * Builds article context row.
 * @param profile - Public advisor profile payload.
 * @returns Checklist row.
 */
function articlesRow(profile: AdvisorProfilePayload): AdvisorTrustChecklistRow {
  const count = profile.articles.length;
  return {
    id: "article-context",
    label: "Article context",
    state: count ? "present" : STATE_NOT_FOUND,
    summary: count
      ? `${count.toLocaleString()} public article reference${count === 1 ? "" : "s"} loaded.`
      : "No public article references are loaded for this profile.",
    supportHref: SUPPORT_HREFS.articles,
  };
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
  return {
    id: "reviewed-notes",
    label: "Reviewed notes",
    state: count ? STATE_NEEDS_REVIEW : STATE_NOT_FOUND,
    summary: count
      ? `${count.toLocaleString()} reviewed public note${count === 1 ? "" : "s"} loaded.`
      : "No reviewed public discrepancy or correction notes are loaded.",
    supportHref: SUPPORT_HREFS.reviewedNotes,
  };
}

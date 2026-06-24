// Advisor profile auxiliary sections.

import {
  fmtMoney,
  fmtDate,
  humanize,
  initials,
  fmts,
  entityPath,
} from "./app.js";
import {
  EmptyTextC,
  SectionCardC,
  EntityListC,
  EntityRowC,
  DetailsCardC,
  HeadingC,
  CareerTimelineC,
  DisclosureEventCardC,
  SourceAttributionC,
  elC,
} from "./design-system-adapters.js";
import type {
  AdvisorCareerRow,
  AdvisorRegistrationApplicationRow,
  AdvisorTeamRow,
  BrokerCheckSnapshotSlice,
  DesignationStub,
  EducationStub,
  LicenseStub,
} from "../types/advisor-profile.js";
import type {
  OutsideBusinessActivityRow,
  TeamRow,
} from "../types/harper-schema.js";
import type { ResolvableAdvisor } from "../harper/resource-routing.js";

const BROKERCHECK_SOURCE = "FINRA BrokerCheck";
const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";

/**
 * Builds a SourceAttribution node for BrokerCheck-backed sections.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns Attribution node or null.
 */
export function brokerCheckAttribution(
  snapshot: BrokerCheckSnapshotSlice | null | undefined
): HTMLElement | null {
  return snapshot
    ? SourceAttributionC({
        source: BROKERCHECK_SOURCE,
        url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(snapshot.subjectCrd)}`,
        termsUrl: BROKERCHECK_TERMS_URL,
        fetchedAt: snapshot.fetchedAt,
      })
    : null;
}

/** Minimal advisor profile slice consumed by `careerSection`. */
interface CareerSectionPayload {
  readonly career: readonly AdvisorCareerRow[];
  readonly brokerCheckSnapshot: BrokerCheckSnapshotSlice | null;
}

/**
 * Builds the career timeline section.
 * @param d - AdvisorProfile payload.
 * @returns Career section.
 */
export function careerSection(d: CareerSectionPayload): HTMLElement {
  return SectionCardC({
    attrs: { id: "profile-career" },
    title: `Career (${d.career.length.toLocaleString()} firm${d.career.length === 1 ? "" : "s"})`,
    body: elC(
      "div",
      {},
      d.career.length
        ? CareerTimelineC({ career: d.career, fmtDate })
        : EmptyTextC({ children: "No employment history on file." }),
      d.career.length ? brokerCheckAttribution(d.brokerCheckSnapshot) : null
    ),
  });
}

/** Firm slice surfaced on a team membership. */
interface TeamMembershipFirm {
  readonly short?: string;
  readonly name?: string;
}

/** Runtime shape the team-membership row exposes for UI rendering. */
interface TeamMembershipTeam {
  readonly id?: TeamRow["id"];
  readonly name?: TeamRow["name"];
  readonly firm?: TeamMembershipFirm | null;
}

/** Advisor team row whose `team` slice is populated. */
interface ResolvedTeamMembership extends AdvisorTeamRow {
  readonly team: TeamMembershipTeam;
}

/**
 * Type guard for advisor team rows whose `team` slice is populated.
 * @param row - Advisor team row.
 * @returns True when `team` is a non-null object.
 */
function isTeamMembership(row: AdvisorTeamRow): row is ResolvedTeamMembership {
  return typeof row.team === "object" && row.team !== null;
}

/**
 * Builds the team memberships section.
 * @param teams - Team membership rows.
 * @returns Team section or null.
 */
export function teamsSection(
  teams: readonly AdvisorTeamRow[]
): HTMLElement | null {
  if (!teams.length) return null;
  return SectionCardC({
    title: "Teams",
    body: EntityListC({
      rows: teams.filter(isTeamMembership).map(m =>
        EntityRowC({
          avatar: initials(m.team.name ?? ""),
          name: m.team.name,
          sub: [m.role, m.team.firm?.short || m.team.firm?.name]
            .filter(Boolean)
            .join(" · "),
          tail: membershipTail(m),
          href: entityPath("team", m.team),
        })
      ),
    }),
  });
}

/**
 * Builds a team membership date label.
 * @param membership - Team membership row.
 * @returns Tail text.
 */
function membershipTail(membership: AdvisorTeamRow): string {
  if (membership.endDate)
    return `${fmtDate(membership.startDate, { mode: "short" })} – ${fmtDate(membership.endDate, { mode: "short" })}`;
  if (membership.startDate)
    return `since ${fmtDate(membership.startDate, { mode: "short" })}`;
  return "";
}

/**
 * Builds the licenses and exams section.
 * @param licenses - License rows.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns License section or null.
 */
export function licensesSection(
  licenses: readonly LicenseStub[] | null | undefined,
  snapshot: BrokerCheckSnapshotSlice | null | undefined
): HTMLElement | null {
  if (!licenses?.length) return null;
  return SectionCardC({
    title: `Licenses & exams (${licenses.length.toLocaleString()})`,
    body: elC(
      "div",
      {},
      EntityListC({
        rows: licenses.map(l =>
          EntityRowC({
            avatar: initials(humanize(l.licenseType)),
            name: humanize(l.licenseType) || l.licenseType,
            sub: [
              l.state ? `state ${l.state}` : null,
              l.grantedDate
                ? `granted ${fmtDate(l.grantedDate, { mode: "short" })}`
                : null,
              l.status && l.status !== "active" ? humanize(l.status) : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })
        ),
      }),
      brokerCheckAttribution(snapshot)
    ),
  });
}

/**
 * Builds designation rows.
 * @param designations - Designation rows.
 * @returns Designations section or null.
 */
export function designationsSection(
  designations: readonly DesignationStub[] | null | undefined
): HTMLElement | null {
  if (!designations?.length) return null;
  return SectionCardC({
    title: `Designations (${designations.length.toLocaleString()})`,
    body: EntityListC({
      rows: designations.map(g =>
        EntityRowC({
          avatar: g.code,
          name: g.code,
          sub: [
            g.grantingBody,
            g.earnedDate
              ? `earned ${fmtDate(g.earnedDate, { mode: "short" })}`
              : null,
            g.status && g.status !== "active" ? humanize(g.status) : null,
          ]
            .filter(Boolean)
            .join(" · "),
        })
      ),
    }),
  });
}

/**
 * Builds education rows.
 * @param education - Education rows.
 * @returns Education section or null.
 */
export function educationSection(
  education: readonly EducationStub[] | null | undefined
): HTMLElement | null {
  if (!education?.length) return null;
  return SectionCardC({
    title: `Education (${education.length.toLocaleString()})`,
    body: EntityListC({
      rows: education.map(e =>
        EntityRowC({
          avatar: initials(e.institution || "?"),
          name: e.institution || "(unknown institution)",
          sub: [e.degree, e.field, e.graduationYear]
            .filter(Boolean)
            .join(" · "),
        })
      ),
    }),
  });
}

/**
 * Builds disclosure event rows.
 * @param disclosures - Disclosure rows.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns Disclosure section or null.
 */
export function disclosuresSection(
  disclosures: readonly unknown[],
  snapshot: BrokerCheckSnapshotSlice | null | undefined
): HTMLElement | null {
  if (!disclosures.length) return null;
  return SectionCardC({
    attrs: { id: "profile-disclosures" },
    title: `Disclosures (${disclosures.length.toLocaleString()})`,
    body: elC(
      "div",
      {},
      ...disclosures.map(dis => DisclosureEventCardC(dis, fmts)),
      brokerCheckAttribution(snapshot)
    ),
  });
}

/**
 * Builds outside business activity rows.
 * @param activities - Outside business activity rows.
 * @returns OBA section or null.
 */
export function outsideActivitiesSection(
  activities: readonly OutsideBusinessActivityRow[]
): HTMLElement | null {
  if (!activities.length) return null;
  return SectionCardC({
    title: "Outside business activities",
    body: EntityListC({
      rows: activities.map(o =>
        EntityRowC({
          avatar: "🏷",
          name: o.name || humanize(o.vehicleType) || "Outside activity",
          sub: [
            humanize(o.vehicleType),
            o.withCustomers ? "with customers" : null,
            o.disclosedToFirm ? "disclosed" : "undisclosed",
            o.startDate
              ? `${fmtDate(o.startDate, { mode: "short" })}–${fmtDate(o.endDate, { mode: "short" })}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          tail: o.compensationAmountMin
            ? `≥ ${fmtMoney(o.compensationAmountMin)}`
            : null,
        })
      ),
    }),
  });
}

/**
 * Builds the identity details card.
 * @param advisor - Advisor record.
 * @returns Details card node.
 */
export function identityCard(advisor: ResolvableAdvisor): HTMLElement {
  return DetailsCardC({
    attrs: { id: "profile-identity" },
    title: "Identity",
    pairs: [
      ["Legal name", advisor.legalName],
      ["Preferred name", advisor.preferredName],
      ["FINRA CRD", advisor.finraCrd],
      ["SEC IARD", advisor.secIard],
      [
        "Industry start",
        advisor.industryStartDate ? fmtDate(advisor.industryStartDate) : null,
      ],
      ["Years experience", advisor.yearsExperience],
      ["Career status", humanize(advisor.careerStatus)],
      ["Birth year", advisor.birthYear],
      ["Gender", advisor.gender === "undisclosed" ? null : advisor.gender],
    ],
  });
}

/**
 * Builds public contact-readiness details for profile drilldown parity with
 * the advisor finder.
 * @param profile - Advisor profile payload.
 * @returns Details card with public readiness facts.
 */
/** Firm slice surfaced on a registration application. */
interface RegistrationFirmSlice {
  readonly name?: string;
}

/**
 * Narrows a registration application's `firm` slice to a readable shape.
 * @param row - Registration application row.
 * @returns Firm slice or null.
 */
function registrationFirm(
  row: AdvisorRegistrationApplicationRow
): RegistrationFirmSlice | null {
  return typeof row.firm === "object" && row.firm !== null
    ? (row.firm as RegistrationFirmSlice)
    : null;
}

/**
 * Builds registration application rows.
 * @param applications - Registration application rows.
 * @returns Registration applications section or null.
 */
export function registrationApplicationsSection(
  applications: readonly AdvisorRegistrationApplicationRow[]
): HTMLElement | null {
  if (!applications.length) return null;
  return SectionCardC({
    body: [
      HeadingC({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Registration applications",
      }),
      EntityListC({
        rows: applications.map(r => {
          const firm = registrationFirm(r);
          return EntityRowC({
            avatar: initials(firm?.name || "?"),
            name: firm?.name || "?",
            sub: [
              humanize(r.status),
              r.appliedDate
                ? `applied ${fmtDate(r.appliedDate, { mode: "short" })}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          });
        }),
      }),
    ],
  });
}

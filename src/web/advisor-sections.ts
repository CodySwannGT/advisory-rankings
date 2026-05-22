// @ts-nocheck
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
  el,
  EmptyText,
  SectionCard,
  EntityList,
  EntityRow,
  DetailsCard,
  Heading,
  CareerTimeline,
  DisclosureEventCard,
  SourceAttribution,
} from "./design-system/index.js";

const BROKERCHECK_SOURCE = "FINRA BrokerCheck";
const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";

/**
 * Builds a SourceAttribution node for BrokerCheck-backed sections.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns Attribution node or null.
 */
export function brokerCheckAttribution(snapshot) {
  return snapshot
    ? SourceAttribution({
        source: BROKERCHECK_SOURCE,
        url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(snapshot.subjectCrd)}`,
        termsUrl: BROKERCHECK_TERMS_URL,
        fetchedAt: snapshot.fetchedAt,
      })
    : null;
}

/**
 * Builds the career timeline section.
 * @param d - AdvisorProfile payload.
 * @returns Career section.
 */
export function careerSection(d) {
  return SectionCard({
    title: `Career (${d.career.length.toLocaleString()} firm${d.career.length === 1 ? "" : "s"})`,
    body: el(
      "div",
      {},
      d.career.length
        ? CareerTimeline({ career: d.career, fmtDate })
        : EmptyText({ children: "No employment history on file." }),
      d.career.length ? brokerCheckAttribution(d.brokerCheckSnapshot) : null
    ),
  });
}

/**
 * Builds the team memberships section.
 * @param teams - Team membership rows.
 * @returns Team section or null.
 */
export function teamsSection(teams) {
  return teams.length
    ? SectionCard({
        title: "Teams",
        body: EntityList({
          rows: teams
            .filter(t => t.team)
            .map(m =>
              EntityRow({
                avatar: initials(m.team.name),
                name: m.team.name,
                sub: [m.role, m.team.firm?.short || m.team.firm?.name]
                  .filter(Boolean)
                  .join(" · "),
                tail: membershipTail(m),
                href: entityPath("team", m.team),
              })
            ),
        }),
      })
    : null;
}

/**
 * Builds a team membership date label.
 * @param membership - Team membership row.
 * @returns Tail text.
 */
function membershipTail(membership) {
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
export function licensesSection(licenses, snapshot) {
  return licenses?.length
    ? SectionCard({
        title: `Licenses & exams (${licenses.length.toLocaleString()})`,
        body: el(
          "div",
          {},
          EntityList({
            rows: licenses.map(l =>
              EntityRow({
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
      })
    : null;
}

/**
 * Builds designation rows.
 * @param designations - Designation rows.
 * @returns Designations section or null.
 */
export function designationsSection(designations) {
  return designations?.length
    ? SectionCard({
        title: `Designations (${designations.length.toLocaleString()})`,
        body: EntityList({
          rows: designations.map(g =>
            EntityRow({
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
      })
    : null;
}

/**
 * Builds education rows.
 * @param education - Education rows.
 * @returns Education section or null.
 */
export function educationSection(education) {
  return education?.length
    ? SectionCard({
        title: `Education (${education.length.toLocaleString()})`,
        body: EntityList({
          rows: education.map(e =>
            EntityRow({
              avatar: initials(e.institution || "?"),
              name: e.institution || "(unknown institution)",
              sub: [e.degree, e.field, e.graduationYear]
                .filter(Boolean)
                .join(" · "),
            })
          ),
        }),
      })
    : null;
}

/**
 * Builds disclosure event rows.
 * @param disclosures - Disclosure rows.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns Disclosure section or null.
 */
export function disclosuresSection(disclosures, snapshot) {
  return disclosures.length
    ? SectionCard({
        title: `Disclosures (${disclosures.length.toLocaleString()})`,
        body: el(
          "div",
          {},
          ...disclosures.map(dis => DisclosureEventCard(dis, fmts)),
          brokerCheckAttribution(snapshot)
        ),
      })
    : null;
}

/**
 * Builds outside business activity rows.
 * @param activities - Outside business activity rows.
 * @returns OBA section or null.
 */
export function outsideActivitiesSection(activities) {
  return activities.length
    ? SectionCard({
        title: "Outside business activities",
        body: EntityList({
          rows: activities.map(o =>
            EntityRow({
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
      })
    : null;
}

/**
 * Builds the identity details card.
 * @param advisor - Advisor record.
 * @returns Details card node.
 */
export function identityCard(advisor) {
  return DetailsCard({
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
 * Builds registration application rows.
 * @param applications - Registration application rows.
 * @returns Registration applications section or null.
 */
export function registrationApplicationsSection(applications) {
  return applications.length
    ? SectionCard({
        body: [
          Heading({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: "Registration applications",
          }),
          EntityList({
            rows: applications.map(r =>
              EntityRow({
                avatar: initials(r.firm?.name || "?"),
                name: r.firm?.name || "?",
                sub: [
                  humanize(r.status),
                  r.appliedDate
                    ? `applied ${fmtDate(r.appliedDate, { mode: "short" })}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              })
            ),
          }),
        ],
      })
    : null;
}

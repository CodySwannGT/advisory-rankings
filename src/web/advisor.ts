// @ts-nocheck
// Advisor profile page.
// All UI comes from the design system — see docs/design-system.md.

import {
  api,
  refreshMe,
  logout,
  search,
  fmts,
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
  TransitionEventCard,
} from "./design-system/index.js";
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

mountThreeColumnPage({
  active: "advisors",
  refreshMe,
  logout,
  search,
  build({ center, right }) {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCard({
          title: "No advisor selected",
          body: "Pick an advisor from the feed.",
        })
      );
      return;
    }
    api(`/AdvisorProfile/${encodeURIComponent(id)}`)
      .then(d => render(d, center, right))
      .catch(err =>
        center.appendChild(
          EmptyCard({ title: "Error", body: String(err.message || err) })
        )
      );
  },
});

/**
 * Renders an advisor profile from the AdvisorProfile resource payload.
 * @param d - d used by this operation.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 * @returns Nothing; writes profile sections into the supplied columns.
 */
function render(d, center, right) {
  if (d.error) {
    center.appendChild(
      EmptyCard({ title: "Advisor not found", body: d.id || "" })
    );
    return;
  }
  const a = d.advisor;
  const profile = ProfileHead({
    initialsText: initials(d.displayName),
    imageUrl: a.headshotUrl,
    title: d.displayName,
    subtitle: advisorSubtitle(d),
    tags: advisorTags(a),
  });

  canonicalizeEntityRoute("advisor", { ...a, name: d.displayName });
  appendSections(center, [profile, ...advisorCenterSections(d)]);
  appendSections(right, advisorRightSections(d));
}

/**
 * Appends present profile sections to a column.
 * @param root - Column node.
 * @param sections - Candidate sections.
 */
function appendSections(root, sections) {
  sections.filter(Boolean).forEach(section => root.appendChild(section));
}

/**
 * Builds advisor profile badges.
 * @param advisor - Advisor record.
 * @returns Tags for ProfileHead.
 */
function advisorTags(advisor) {
  return [
    advisor.careerStatus
      ? {
          kind: careerStatusKind(advisor.careerStatus),
          label: humanize(advisor.careerStatus),
        }
      : null,
    advisor.yearsExperience
      ? { label: `${advisor.yearsExperience}y experience` }
      : null,
    advisor.finraCrd ? { label: `CRD ${advisor.finraCrd}` } : null,
  ].filter(Boolean);
}

/**
 * Maps advisor career status to a tag tone.
 * @param status - Career status value.
 * @returns Tag kind.
 */
function careerStatusKind(status) {
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
function advisorSubtitle(d) {
  const currentEh = d.career.find(c => !c.endDate);
  if (currentEh)
    return [
      [currentEh.roleTitle, currentEh.firm?.name].filter(Boolean).join(" at "),
      currentEh.branch?.name,
    ]
      .filter(Boolean)
      .join(" · ");
  if (d.career.length)
    return `Last seen at ${d.career[d.career.length - 1].firm?.name || "?"}`;
  return "";
}

/**
 * Builds center-column advisor sections.
 * @param d - AdvisorProfile payload.
 * @returns Ordered center-column sections.
 */
function advisorCenterSections(d) {
  return [
    careerSection(d),
    teamsSection(d.teams),
    licensesSection(d.licenses, d.brokerCheckSnapshot),
    designationsSection(d.designations),
    educationSection(d.education),
    disclosuresSection(d.disclosures, d.brokerCheckSnapshot),
    outsideActivitiesSection(d.outsideBusinessActivities),
    d.transitions.length
      ? SectionCard({
          title: "Transitions involving this advisor",
          body: el(
            "div",
            {},
            ...d.transitions.map(t => TransitionEventCard(t, fmts))
          ),
        })
      : null,
    SectionCard({
      title: `Coverage (${d.articles.length.toLocaleString()})`,
      body: ArticleListBlock({ articles: d.articles, fmtDate, articleSource }),
    }),
  ];
}

/**
 * Builds right-rail advisor sections.
 * @param d - AdvisorProfile payload.
 * @returns Ordered right-rail sections.
 */
function advisorRightSections(d) {
  return [
    identityCard(d.advisor),
    registrationApplicationsSection(d.registrationApplications),
  ];
}

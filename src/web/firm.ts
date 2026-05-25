// @ts-nocheck
// Firm profile page.
// All UI comes from the design system — see docs/design-system.md.

import {
  api,
  refreshMe,
  logout,
  search,
  fmts,
  fmtMoney,
  fmtDate,
  humanize,
  initials,
  getEntityIdParam,
  entityPath,
  articleSource,
  canonicalizeEntityRoute,
} from "./app.js";
import {
  mountThreeColumnPage,
  el,
  EmptyCard,
  EmptyText,
  ProfileHead,
  SectionCard,
  EntityList,
  EntityRow,
  ArticleListBlock,
  TransitionEventCard,
  DisclosureEventCard,
  clear,
} from "./design-system/index.js";
import {
  DetailErrorCard,
  PartialFailureCard,
  renderDetailLoading,
  resourceRows,
} from "./detail-state.js";
import {
  firmDetailsCard,
  regulatoryCard,
  branchesCard,
  firmTags,
  firmSubtitle,
  paginatedAdvisors,
} from "./firm-sections.js";

mountThreeColumnPage({
  active: "firms",
  refreshMe,
  logout,
  search,
  build({ center, right }) {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCard({
          title: "No firm selected",
          body: "Open a firm from the feed.",
        })
      );
      return;
    }

    renderDetailLoading({ center, right, label: "firm profile" });
    api(`/FirmProfile/${encodeURIComponent(id)}`)
      .then(d => {
        clear(center);
        clear(right);
        render(d, center, right);
      })
      .catch(err => {
        clear(center);
        clear(right);
        center.appendChild(DetailErrorCard("Could not load firm", err));
      });
  },
});

/**
 * Renders render into the page.
 * @param d - d used by this operation.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 * @returns The rendered DOM node or section.
 */
function render(d, center, right) {
  if (d.error) {
    center.appendChild(
      EmptyCard({ title: "Firm not found", body: d.id || "" })
    );
    return;
  }
  const f = d.firm;
  const profile = ProfileHead({
    initialsText: initials(f.name),
    imageUrl: f.logoUrl,
    title: f.name,
    subtitle: firmSubtitle(f),
    tags: firmTags(f),
  });

  canonicalizeEntityRoute("firm", f);
  center.appendChild(profile);
  appendSections(center, firmCenterSections(d));
  appendSections(right, firmRightSections(d));
}

/**
 * Appends only present section nodes to a profile column.
 * @param root - Column node.
 * @param sections - Candidate sections.
 */
function appendSections(root, sections) {
  sections.filter(Boolean).forEach(section => root.appendChild(section));
}

/**
 * Builds the center-column firm sections.
 * @param d - FirmProfile payload.
 * @returns Ordered center-column sections.
 */
function firmCenterSections(d) {
  const currentTeams = resourceRows(d.currentTeams);
  const transitionsIn = resourceRows(d.transitionsIn);
  const transitionsOut = resourceRows(d.transitionsOut);
  const disclosuresAtThisFirm = resourceRows(d.disclosuresAtThisFirm);
  const articles = resourceRows(d.articles);
  return [
    d.firm.notes
      ? SectionCard({ title: "About", body: el("div", {}, d.firm.notes) })
      : null,
    currentAdvisorsSection(d),
    d.pastAdvisorCount > 0
      ? SectionCard({
          title: `Past advisors (${d.pastAdvisorCount.toLocaleString()})`,
          body: paginatedAdvisors(d.firm.id, "past", { showEnd: true }),
        })
      : null,
    teamsSection(currentTeams),
    PartialFailureCard("Teams currently at this firm", d.currentTeams),
    transitionSection(
      `Recent moves to ${d.firm.short || d.firm.name}`,
      transitionsIn
    ),
    PartialFailureCard(
      `Recent moves to ${d.firm.short || d.firm.name}`,
      d.transitionsIn
    ),
    transitionSection(
      `Recent moves away from ${d.firm.short || d.firm.name}`,
      transitionsOut
    ),
    PartialFailureCard(
      `Recent moves away from ${d.firm.short || d.firm.name}`,
      d.transitionsOut
    ),
    disclosuresAtThisFirm.length
      ? SectionCard({
          title: `Disclosures filed while advisors were at ${d.firm.short || d.firm.name}`,
          body: el(
            "div",
            {},
            ...disclosuresAtThisFirm.map(dis => DisclosureEventCard(dis, fmts))
          ),
        })
      : null,
    PartialFailureCard(
      `Disclosures filed while advisors were at ${d.firm.short || d.firm.name}`,
      d.disclosuresAtThisFirm
    ),
    SectionCard({
      title: `Coverage (${articles.length.toLocaleString()})`,
      body: ArticleListBlock({ articles, fmtDate, articleSource }),
    }),
    PartialFailureCard("Coverage", d.articles),
  ];
}

/**
 * Builds the right-rail firm sections.
 * @param d - FirmProfile payload.
 * @returns Ordered right-rail sections.
 */
function firmRightSections(d) {
  return [
    firmDetailsCard(d.firm),
    regulatoryCard(d.brokerCheckSnapshot),
    branchesCard(resourceRows(d.branches)),
    PartialFailureCard("Branches", d.branches),
  ];
}

/**
 * Builds the current-advisors section with an explicit empty state.
 * @param d - FirmProfile payload.
 * @returns Current advisors section.
 */
function currentAdvisorsSection(d) {
  return d.currentAdvisorCount > 0
    ? SectionCard({
        title: `Current advisors (${d.currentAdvisorCount.toLocaleString()})`,
        body: paginatedAdvisors(d.firm.id, "current", { showStart: true }),
      })
    : SectionCard({
        title: "Current advisors (0)",
        body: EmptyText({ children: "No current advisors on file." }),
      });
}

/**
 * Builds the current-teams section when the firm has team rows.
 * @param teams - Current team rows.
 * @returns Team section or null.
 */
function teamsSection(teams) {
  return teams.length
    ? SectionCard({
        title: `Teams currently at this firm (${teams.length.toLocaleString()})`,
        body: EntityList({
          rows: teams.map(t =>
            EntityRow({
              avatar: initials(t.name),
              name: t.name,
              sub: [
                t.serviceModel ? `${humanize(t.serviceModel)} clients` : null,
                t.aum != null ? `${fmtMoney(t.aum)} AUM` : null,
                t.teamSize ? `${t.teamSize} members` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              href: entityPath("team", t),
            })
          ),
        }),
      })
    : null;
}

/**
 * Builds a transition section when move events exist.
 * @param title - Section title prefix.
 * @param transitions - Transition event rows.
 * @returns Transition section or null.
 */
function transitionSection(title, transitions) {
  return transitions.length
    ? SectionCard({
        title: `${title} (${transitions.length.toLocaleString()})`,
        body: el(
          "div",
          {},
          ...transitions.map(t => TransitionEventCard(t, fmts))
        ),
      })
    : null;
}

// @ts-nocheck
// Team profile page.
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
  DetailsCard,
  ArticleListBlock,
  SnapshotTable,
  TransitionEventCard,
  clear,
} from "./design-system/index.js";
import {
  DetailErrorCard,
  DetailNotFoundCard,
  PartialFailureCard,
  renderDetailLoading,
  resourceRows,
} from "./detail-state.js";

mountThreeColumnPage({
  active: "teams",
  refreshMe,
  logout,
  search,
  build({ center, right }) {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCard({
          title: "No team selected",
          body: "Pick a team from a firm or feed.",
        })
      );
      return;
    }
    renderDetailLoading({ center, right, label: "team profile" });
    api(`/TeamProfile/${encodeURIComponent(id)}`)
      .then(d => {
        clear(center);
        clear(right);
        render(d, center, right);
      })
      .catch(err => {
        clear(center);
        clear(right);
        center.appendChild(DetailErrorCard("Could not load team", err));
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
  const metricSnapshots = resourceRows(d.metricSnapshots);
  const currentMembers = resourceRows(d.currentMembers);
  const pastMembers = resourceRows(d.pastMembers);
  const transitions = resourceRows(d.transitions);
  const articles = resourceRows(d.articles);
  const latest = metricSnapshots[metricSnapshots.length - 1];
  const profile = ProfileHead({
    initialsText: initials(t.name),
    title: t.name,
    subtitle: teamSubtitle(d),
    tags: teamTags(t, latest),
  });
  const currentMembersSection = currentMembersCard(currentMembers);
  const pastMembersSection = pastMembersCard(pastMembers);
  const transitionsSection = transitionsCard(transitions);
  const metrics = metricHistoryCard(metricSnapshots);
  const coverage = SectionCard({
    title: `Coverage (${articles.length.toLocaleString()})`,
    body: ArticleListBlock({ articles, fmtDate, articleSource }),
  });
  const details = teamDetailsCard(t, d.currentFirm);
  const latestMetrics = latestMetricsCard(latest);

  canonicalizeEntityRoute("team", t);
  appendSections(center, [
    profile,
    currentMembersSection,
    PartialFailureCard("Current members", d.currentMembers),
    pastMembersSection,
    PartialFailureCard("Past members", d.pastMembers),
    transitionsSection,
    PartialFailureCard("Team transitions", d.transitions),
    metrics,
    PartialFailureCard("Metric history", d.metricSnapshots),
    coverage,
    PartialFailureCard("Coverage", d.articles),
  ]);
  appendSections(right, [details, latestMetrics]);
}

/**
 * Builds the current-members card, including the empty state.
 * @param members - Current team memberships.
 * @returns Current members section.
 */
function currentMembersCard(members) {
  return SectionCard({
    title: `Current members (${members.length.toLocaleString()})`,
    body: members.length
      ? memberList(members, { showStart: true })
      : EmptyText({ children: "No current members." }),
  });
}

/**
 * Builds the past-members section when historical memberships exist.
 * @param members - Past team memberships.
 * @returns Past members section or null.
 */
function pastMembersCard(members) {
  return members.length
    ? SectionCard({
        title: `Past members (${members.length.toLocaleString()})`,
        body: memberList(members, { showRange: true }),
      })
    : null;
}

/**
 * Builds the transitions section when team move events exist.
 * @param transitions - Team transition event cards.
 * @returns Transition section or null.
 */
function transitionsCard(transitions) {
  return transitions.length
    ? SectionCard({
        title: "Team transitions",
        body: el(
          "div",
          {},
          ...transitions.map(tr => TransitionEventCard(tr, fmts))
        ),
      })
    : null;
}

/**
 * Builds the metric-history section when snapshots exist.
 * @param snapshots - Team metric snapshots.
 * @returns Metric history section or null.
 */
function metricHistoryCard(snapshots) {
  return snapshots.length
    ? SectionCard({
        title: `Metric history (${snapshots.length.toLocaleString()} snapshot${snapshots.length === 1 ? "" : "s"})`,
        body: SnapshotTable({ snaps: snapshots, fmtMoney, fmtDate, humanize }),
      })
    : null;
}

/**
 * Builds the right-rail team details card.
 * @param team - Team profile record.
 * @param currentFirm - Current firm record when present.
 * @returns Team details card.
 */
function teamDetailsCard(team, currentFirm) {
  return DetailsCard({
    title: "Team details",
    pairs: [
      ["Name", team.name],
      ["Service model", humanize(team.serviceModel)],
      ["Firm program", team.firmProgram],
      ["Founded", team.foundedYear],
      ["Dissolved", team.dissolvedYear],
      [
        "Current firm",
        currentFirm
          ? el("a", { href: entityPath("firm", currentFirm) }, currentFirm.name)
          : null,
      ],
    ],
  });
}

/**
 * Builds the latest metrics card from the newest snapshot.
 * @param latest - Latest metric snapshot.
 * @returns Latest metrics details card or null.
 */
function latestMetricsCard(latest) {
  return latest
    ? DetailsCard({
        title: `Latest metrics (${fmtDate(latest.asOf)})`,
        pairs: [
          ["AUM", latest.aum != null ? fmtMoney(latest.aum) : null],
          [
            "Annual revenue",
            latest.annualRevenue != null
              ? fmtMoney(latest.annualRevenue)
              : null,
          ],
          ["Households", latest.householdCount],
          ["Team size", latest.teamSize],
          ["Source", humanize(latest.sourceType)],
        ],
      })
    : null;
}

/**
 * Appends present sections while skipping empty optional cards.
 * @param root - Column element receiving sections.
 * @param sections - Candidate section nodes.
 */
function appendSections(root, sections) {
  sections.filter(Boolean).forEach(section => root.appendChild(section));
}

/**
 * Builds profile badges for team status and metrics.
 * @param team - Team record from TeamProfile.
 * @param latest - Latest metric snapshot when present.
 * @returns Tag data for ProfileHead.
 */
function teamTags(team, latest) {
  return [
    humanize(team.serviceModel)
      ? { label: `${humanize(team.serviceModel)} clients` }
      : null,
    team.firmProgram ? { label: team.firmProgram } : null,
    latest?.aum ? { kind: "ok", label: `${fmtMoney(latest.aum)} AUM` } : null,
    latest?.teamSize ? { label: `${latest.teamSize} members` } : null,
  ].filter(Boolean);
}

/**
 * Builds the location and current-firm subtitle for a team profile.
 * @param d - TeamProfile payload.
 * @returns Subtitle text for ProfileHead.
 */
function teamSubtitle(d) {
  const where = d.currentBranch
    ? [
        d.currentBranch.buildingName || d.currentBranch.name,
        d.currentBranch.city,
        d.currentBranch.state,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  return [d.currentFirm ? `Currently at ${d.currentFirm.name}` : null, where]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Renders team members as linked advisor rows.
 * @param members - members used by this operation.
 * @param root0 - value used by this operation.
 * @param root0.showStart - show start used by this operation.
 * @param root0.showRange - show range used by this operation.
 * @returns EntityList containing member rows.
 */
function memberList(members, { showStart = false, showRange = false } = {}) {
  return EntityList({
    rows: members.map(m => {
      const a = m.advisor;
      const tail = memberTail(m, { showStart, showRange });
      return EntityRow({
        avatar: initials(a.name),
        name: a.name,
        sub: humanize(m.role || a.careerStatus) || "",
        tail,
        href: entityPath("advisor", a),
      });
    }),
  });
}

/**
 * Builds the membership date label for a member row.
 * @param member - Team membership record.
 * @param root0 - Date display options.
 * @param root0.showStart - Whether to show the start-only label.
 * @param root0.showRange - Whether to show the full start/end range.
 * @returns Tail text for the member row.
 */
function memberTail(member, { showStart = false, showRange = false } = {}) {
  if (showRange && member.startDate && member.endDate)
    return `${fmtDate(member.startDate, { mode: "short" })} – ${fmtDate(member.endDate, { mode: "short" })}`;
  if (showStart && member.startDate)
    return `since ${fmtDate(member.startDate, { mode: "short" })}`;
  return "";
}

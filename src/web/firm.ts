// @ts-nocheck
/* eslint-disable max-lines, sonarjs/no-duplicate-string, functional/immutable-data, jsdoc/require-jsdoc -- This legacy route keeps DOM section helpers local to the page module. */
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
  articlePath,
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
  Button,
  Tag,
  SourceAttribution,
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
    dueDiligenceSection(d.dueDiligence),
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
 * Builds the source-backed firm due-diligence summary.
 * @param diligence - Structured due-diligence modules from FirmProfile.
 * @returns Due-diligence summary section or null.
 */
function dueDiligenceSection(diligence) {
  if (!diligence?.modules) return null;
  const body = el("div", { class: "firm-dd" });
  const moduleEntries = dueDiligenceModules(diligence.modules);
  const grid = el(
    "div",
    { class: "firm-dd-grid" },
    ...moduleEntries.map(({ key, node }) => {
      node.dataset.firmDdStatus = moduleStatusGroup(diligence.modules[key]);
      return node;
    })
  );
  const filters = dueDiligenceFilters(grid);
  body.append(
    el(
      "div",
      { class: "firm-dd-summary" },
      metricTile(
        "Loaded modules",
        loadedModuleCount(moduleEntries),
        "source-backed"
      ),
      metricTile("Needs data", missingModuleCount(moduleEntries), "explicit"),
      metricTile(
        "Generated",
        fmtDate(diligence.generatedAt, { mode: "short" }),
        "resource"
      )
    ),
    filters,
    grid,
    dataConfidenceBlock(diligence.dataConfidence)
  );
  return SectionCard({
    title: "Firm due diligence",
    attrs: { class: "firm-dd-card" },
    body,
  });
}

/**
 * Creates ordered due-diligence module cards.
 * @param modules - Due-diligence module map.
 * @returns Renderable module entries.
 */
function dueDiligenceModules(modules) {
  return [
    {
      key: "recruitingMomentum",
      node: recruitingMomentumCard(modules.recruitingMomentum),
    },
    {
      key: "rosterFootprint",
      node: rosterFootprintCard(modules.rosterFootprint),
    },
    {
      key: "rankingPresence",
      node: rankingPresenceCard(modules.rankingPresence),
    },
    {
      key: "regulatorySnapshot",
      node: regulatorySnapshotCard(modules.regulatorySnapshot),
    },
    {
      key: "coverageTimeline",
      node: coverageTimelineCard(modules.coverageTimeline),
    },
  ].filter(entry => entry.node);
}

/**
 * Builds a compact filter control for module availability.
 * @param grid - Module grid node to filter.
 * @returns Filter control node.
 */
function dueDiligenceFilters(grid) {
  const buttons = [
    ["all", "All"],
    ["loaded", "Source-backed"],
    ["missing", "Needs data"],
  ].map(([filter, label]) =>
    Button({
      variant: filter === "all" ? "primary" : "neutral",
      children: label,
      attrs: {
        class: "firm-dd-filter",
        "data-filter": filter,
        "aria-pressed": filter === "all" ? "true" : "false",
      },
      onClick: event => applyDueDiligenceFilter(grid, event.currentTarget),
    })
  );
  return el(
    "div",
    { class: "firm-dd-filters", "aria-label": "Due diligence module filter" },
    ...buttons
  );
}

/**
 * Applies a module filter without changing resource state.
 * @param grid - Module grid node.
 * @param activeButton - Clicked filter button.
 */
function applyDueDiligenceFilter(grid, activeButton) {
  const filter = activeButton.dataset.filter || "all";
  activeButton.parentElement
    ?.querySelectorAll(".firm-dd-filter")
    .forEach(button => {
      const active = button === activeButton;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("ab-btn--primary", active);
      button.classList.toggle("ab-btn--neutral", !active);
    });
  grid.querySelectorAll(".firm-dd-module").forEach(module => {
    const status = module.dataset.firmDdStatus;
    module.hidden = filter !== "all" && status !== filter;
  });
}

/**
 * Builds a module card shell with status, provenance, and freshness labels.
 * @param title - Module title.
 * @param module - Module payload.
 * @param children - Module body children.
 * @returns Module card node.
 */
function moduleCard(title, module, ...children) {
  return el(
    "article",
    { class: `firm-dd-module firm-dd-module--${moduleStatusGroup(module)}` },
    el(
      "div",
      { class: "firm-dd-module-head" },
      el("h3", {}, title),
      statusTag(module?.status)
    ),
    module?.note ? el("p", { class: "firm-dd-note" }, module.note) : null,
    ...children,
    moduleMeta(module)
  );
}

/**
 * Builds the recruiting module.
 * @param module - Recruiting module payload.
 * @returns Module card.
 */
function recruitingMomentumCard(module) {
  return moduleCard(
    "Recruiting momentum",
    module,
    el(
      "div",
      { class: "firm-dd-stat-row" },
      metricTile(
        "Inbound",
        fmtNumber(module?.inbound?.count),
        fmtMoney(module?.inbound?.knownAum || 0)
      ),
      metricTile(
        "Outbound",
        fmtNumber(module?.outbound?.count),
        fmtMoney(module?.outbound?.knownAum || 0)
      ),
      metricTile(
        "Net moves",
        signedNumber(module?.netMoveCount),
        signedMoney(module?.netAumMoved)
      )
    ),
    module?.inbound?.unknownAumCount || module?.outbound?.unknownAumCount
      ? el(
          "p",
          { class: "firm-dd-missing" },
          `${fmtNumber((module.inbound?.unknownAumCount || 0) + (module.outbound?.unknownAumCount || 0))} move(s) have unknown AUM.`
        )
      : null,
    recentMovesList(module?.recentMoves || [])
  );
}

/**
 * Builds the roster module.
 * @param module - Roster module payload.
 * @returns Module card.
 */
function rosterFootprintCard(module) {
  return moduleCard(
    "Roster footprint",
    module,
    el(
      "div",
      { class: "firm-dd-stat-row" },
      metricTile("Current advisors", fmtNumber(module?.currentAdvisorCount)),
      metricTile("Past advisors", fmtNumber(module?.pastAdvisorCount)),
      metricTile("Teams", fmtNumber(module?.teamCount)),
      metricTile("Branches", fmtNumber(module?.branchCount))
    )
  );
}

/**
 * Builds the ranking module.
 * @param module - Ranking module payload.
 * @returns Module card.
 */
function rankingPresenceCard(module) {
  const appearances = module?.appearances || [];
  return moduleCard(
    "Ranking presence",
    module,
    appearances.length
      ? el(
          "div",
          { class: "firm-dd-list" },
          ...appearances
            .slice(0, 4)
            .map(appearance =>
              el(
                "div",
                { class: "firm-dd-list-row" },
                el(
                  "span",
                  {},
                  [
                    appearance.ranking?.year,
                    appearance.ranking?.name || "Unresolved ranking",
                    appearance.subjectType,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                ),
                el(
                  "strong",
                  {},
                  appearance.rank ? `#${appearance.rank}` : "rank pending"
                )
              )
            )
        )
      : EmptyText({
          children:
            module?.note ||
            "No ranking data is on file for this firm; this is an unavailable source state.",
        }),
    el(
      "div",
      { class: "firm-dd-stat-row" },
      metricTile("Resolved", fmtNumber(module?.resolvedCount)),
      metricTile("Unresolved", fmtNumber(module?.unresolvedCount)),
      metricTile(
        "Top rank",
        module?.topRank ? `#${module.topRank}` : "not loaded"
      )
    )
  );
}

/**
 * Builds the regulatory module.
 * @param module - Regulatory module payload.
 * @returns Module card.
 */
function regulatorySnapshotCard(module) {
  const snapshot = module?.snapshot;
  return moduleCard(
    "Regulatory snapshot",
    module,
    snapshot
      ? el(
          "div",
          { class: "firm-dd-stat-row" },
          metricTile("Disclosures", fmtNumber(snapshot.disclosureCount)),
          metricTile("BD scope", snapshot.bcScope || "not loaded"),
          metricTile("IA scope", snapshot.iaScope || "not loaded"),
          metricTile(
            "State registrations",
            fmtNumber(snapshot.registeredStateCount)
          )
        )
      : EmptyText({
          children: module?.note || "No firm BrokerCheck snapshot is loaded.",
        }),
    module?.source
      ? SourceAttribution({
          source: module.source.sourceName,
          url: module.source.sourceUrl,
          termsUrl: module.source.termsUrl,
          fetchedAt: module.source.compiledAsOf,
        })
      : null
  );
}

/**
 * Builds the coverage module.
 * @param module - Coverage module payload.
 * @returns Module card.
 */
function coverageTimelineCard(module) {
  const articles = module?.recentArticles || [];
  return moduleCard(
    "Coverage timeline",
    module,
    articles.length
      ? el(
          "div",
          { class: "firm-dd-list" },
          ...articles.slice(0, 4).map(article =>
            el(
              "a",
              {
                class: "firm-dd-list-row firm-dd-link-row",
                href: article.url || articlePath(article),
                target: article.url ? "_blank" : null,
                rel: article.url ? "noreferrer" : null,
              },
              el("span", {}, article.headline || "Untitled article"),
              el(
                "strong",
                {},
                article.publishedDate
                  ? fmtDate(article.publishedDate, { mode: "short" })
                  : "undated"
              )
            )
          )
        )
      : EmptyText({
          children: module?.note || "No source-backed coverage is loaded.",
        }),
    metricTile(
      "Articles on file",
      fmtNumber(module?.articleCount),
      "source rows"
    )
  );
}

/**
 * Builds compact source and freshness metadata for a module.
 * @param module - Due-diligence module payload.
 * @returns Metadata row.
 */
function moduleMeta(module) {
  const provenance = module?.provenance || {};
  const sourceTables = [
    provenance.sourceTable,
    ...(provenance.sourceTables || []),
  ].filter(Boolean);
  const sourceIds = provenance.sourceIds || [];
  const freshness = module?.freshness;
  return el(
    "div",
    { class: "firm-dd-meta" },
    sourceTables.length
      ? Tag({
          children: `Source: ${sourceTables.join(", ")}`,
        })
      : null,
    sourceIds.length
      ? Tag({ children: `${fmtNumber(sourceIds.length)} source row(s)` })
      : Tag({ children: "No source rows loaded" }),
    freshness?.asOf
      ? Tag({
          kind: "ok",
          children: `As of ${fmtDate(freshness.asOf, { mode: "short" })}`,
        })
      : Tag({ kind: "warn", children: "Freshness unavailable" })
  );
}

/**
 * Builds a short list of supporting move links.
 * @param moves - Recent move payloads.
 * @returns Move list or empty state.
 */
function recentMovesList(moves) {
  if (!moves.length)
    return EmptyText({
      children: "No recent move rows are loaded for this firm.",
    });
  return el(
    "div",
    { class: "firm-dd-list" },
    ...moves.map(move =>
      el(
        "div",
        { class: "firm-dd-list-row" },
        el(
          "span",
          {},
          move.subject?.id
            ? el(
                "a",
                { href: entityPath(move.subject.kind, move.subject) },
                move.subject.name
              )
            : move.subject?.name || "Unresolved move subject"
        ),
        el(
          "strong",
          {},
          [
            humanize(move.direction),
            move.moveDate ? fmtDate(move.moveDate, { mode: "short" }) : null,
          ]
            .filter(Boolean)
            .join(" · ")
        )
      )
    )
  );
}

/**
 * Builds the data-confidence notes.
 * @param confidence - Confidence payload.
 * @returns Confidence summary.
 */
function dataConfidenceBlock(confidence) {
  if (!confidence) return null;
  return el(
    "div",
    { class: "firm-dd-confidence" },
    el(
      "div",
      { class: "firm-dd-confidence-head" },
      el("strong", {}, "Data confidence"),
      statusTag(confidence.status)
    ),
    el("p", {}, confidence.note || ""),
    el(
      "div",
      { class: "firm-dd-confidence-modules" },
      ...(confidence.modules || []).map(module =>
        el(
          "span",
          { class: "firm-dd-confidence-chip" },
          `${humanize(module.name)}: ${humanize(module.status)}`
        )
      )
    )
  );
}

/**
 * Renders a small metric tile.
 * @param label - Metric label.
 * @param value - Metric value.
 * @param sub - Optional supporting text.
 * @returns Metric tile node.
 */
function metricTile(label, value, sub = "") {
  return el(
    "div",
    { class: "firm-dd-metric" },
    el("strong", {}, value ?? "not loaded"),
    el("span", {}, label),
    sub ? el("small", {}, sub) : null
  );
}

function statusTag(status) {
  const group =
    status === "loaded" ? "ok" : status === "partial" ? "warn" : "default";
  return Tag({ kind: group, children: humanize(status || "unavailable") });
}

function moduleStatusGroup(module) {
  return module?.status === "loaded" ? "loaded" : "missing";
}

function loadedModuleCount(entries) {
  return fmtNumber(
    entries.filter(({ node }) => node.dataset.firmDdStatus === "loaded").length
  );
}

function missingModuleCount(entries) {
  return fmtNumber(
    entries.filter(({ node }) => node.dataset.firmDdStatus === "missing").length
  );
}

function fmtNumber(value) {
  return value == null || value === "" ? "0" : Number(value).toLocaleString();
}

function signedNumber(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString()}`;
}

function signedMoney(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${fmtMoney(number)}`;
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

/* eslint-enable max-lines, sonarjs/no-duplicate-string, functional/immutable-data, jsdoc/require-jsdoc -- End route-local helper exception. */

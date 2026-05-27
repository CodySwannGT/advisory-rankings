/* eslint-disable max-lines, sonarjs/no-duplicate-string -- This legacy route keeps DOM section helpers local to the page module. */
// Firm profile page.
// All UI comes from the design system — see docs/design-system.md.

import type {
  FirmProfileBody,
  FirmProfileResponse,
  RouteError,
} from "../harper/resource-profile-endpoints-types.js";
import type {
  CoverageTimelineModule,
  DataConfidenceModule,
  DueDiligenceModules,
  FirmArticleStubView,
  FirmDueDiligencePayload,
  RankingAppearance,
  RankingPresenceModule,
  RecruitingMomentumModule,
  RegulatorySnapshotModule,
  RecentTransitionMove,
  RosterFootprintModule,
} from "../harper/resource-firm-due-diligence-types.js";
import type { DisclosureEventCard as DisclosureEventCardPayload } from "../harper/resource-feed-types.js";
import type {
  EntityRowOptions,
  ProfileHeadTag,
} from "./design-system/organisms-core-types.js";
import type { ArticleStubLike } from "./design-system/organisms-events-types.js";
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
  DetailNotFoundCard,
  PartialFailureCard,
  renderDetailLoading,
  renderRecoverableDetailError,
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

/**
 * Narrow callable type for design-system helpers whose producer modules
 * still opt out of TS. `molecules.ts` and `templates.ts` are still
 * file-level `@ts-nocheck`'d, and `firm-sections.ts` (which this page
 * imports) is also untyped. Their inferred shapes leak `any` across the
 * module boundary, so this single adapter restates the call signature
 * for components and helpers used as opaque DOM factories.
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const EmptyCardComponent = EmptyCard as unknown as DesignSystemComponent;
const ProfileHeadComponent = ProfileHead as unknown as DesignSystemComponent;
const ArticleListBlockComponent =
  ArticleListBlock as unknown as DesignSystemComponent;
const EntityListComponent = EntityList as unknown as DesignSystemComponent;
const EntityRowComponent = EntityRow as unknown as (
  options: EntityRowOptions & EntityRowAvatar
) => HTMLElement;
const ButtonComponent = Button as unknown as DesignSystemComponent;
const TagComponent = Tag as unknown as DesignSystemComponent;
const SourceAttributionComponent =
  SourceAttribution as unknown as DesignSystemComponent;
const EmptyTextComponent = EmptyText as unknown as DesignSystemComponent;
const firmDetailsCardComponent =
  firmDetailsCard as unknown as DesignSystemComponent;
const regulatoryCardComponent =
  regulatoryCard as unknown as DesignSystemComponent;
const branchesCardComponent = branchesCard as unknown as DesignSystemComponent;
const paginatedAdvisorsComponent =
  paginatedAdvisors as unknown as DesignSystemComponent;
const firmTagsAdapter = firmTags as unknown as (
  firm: unknown
) => readonly ProfileHeadTag[];
const firmSubtitleAdapter = firmSubtitle as unknown as (
  firm: unknown
) => string;

/** Column references provided by `mountThreeColumnPage`'s `build` callback. */
interface PageColumns {
  readonly center: HTMLElement;
  readonly right: HTMLElement;
}

/** Either a successful firm profile payload or a not-found envelope. */
type FirmProfilePayloadOrError = FirmProfileResponse | RouteError;

/** Optional firm-header fields read locally that aren't on the typed header. */
interface FirmExtraFields {
  readonly logoUrl?: string;
  readonly notes?: string;
}

/** Avatar prop accepted by EntityRow in addition to the typed options. */
interface EntityRowAvatar {
  readonly avatar?: unknown;
}

/** Minimal discriminator shape used to narrow disclosure event cards. */
interface KindHolder {
  readonly kind?: unknown;
}

/** Minimal shape used to narrow article stubs from `resourceRows`. */
interface IdHolder {
  readonly id?: unknown;
}

/** Extra article fields read locally by the coverage timeline. */
interface CoverageArticleExtras {
  readonly headline?: string;
  readonly url?: string;
}

/** Allowed entity kinds for move subject chip links. */
type MoveSubjectKind = "firm" | "advisor" | "team";

/** Subject chip shape exposed by `RecentTransitionMove.subject`. */
interface MoveSubject {
  readonly id?: string;
  readonly kind?: MoveSubjectKind;
  readonly name?: string;
}

/** Module-shape input accepted by `moduleStatusGroup`. */
interface ModuleStatusHolder {
  readonly status?: string;
}

mountThreeColumnPage({
  active: "firms",
  refreshMe,
  logout,
  search,
  build({ center, right }: PageColumns): void {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCardComponent({
          title: "No firm selected",
          body: "Open a firm from the feed.",
        })
      );
      return;
    }

    const loadFirmProfile = (): void => {
      clear(center);
      clear(right);
      renderDetailLoading({ center, right, label: "firm profile" });
      api<FirmProfilePayloadOrError>(`/FirmProfile/${encodeURIComponent(id)}`)
        .then(d => {
          clear(center);
          clear(right);
          render(d, center, right);
        })
        .catch((err: unknown) => {
          renderRecoverableDetailError({
            center,
            right,
            title: "Could not load firm",
            error: err,
            onRetry: loadFirmProfile,
          });
        });
    };

    loadFirmProfile();
  },
});

/**
 * Renders the firm profile into the page.
 * @param d - FirmProfile payload returned by the FirmProfile resource.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 */
function render(
  d: FirmProfilePayloadOrError,
  center: HTMLElement,
  right: HTMLElement
): void {
  if (isErrorPayload(d)) {
    center.appendChild(
      DetailNotFoundCard({
        title: "Firm not found",
        id: d.id,
        actionLabel: "Back to Firms",
        href: "/firms",
      })
    );
    return;
  }
  const f = d.firm;
  const profile = ProfileHeadComponent({
    initialsText: initials(f.name),
    imageUrl: (f as unknown as FirmExtraFields).logoUrl,
    title: f.name,
    subtitle: firmSubtitleAdapter(f),
    tags: firmTagsAdapter(f),
  });

  canonicalizeEntityRoute("firm", f);
  center.appendChild(profile);
  appendSections(center, firmCenterSections(d));
  appendSections(right, firmRightSections(d));
}

/**
 * Discriminates a not-found error envelope from a firm profile payload.
 * @param payload - Resource response under inspection.
 * @returns Whether the payload represents a not-found envelope.
 */
function isErrorPayload(
  payload: FirmProfilePayloadOrError
): payload is RouteError {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    Boolean(payload.error)
  );
}

/**
 * Type predicate for the DisclosureEventCard payload used by the firm
 * "Disclosures filed while at this firm" section. The producer types
 * `disclosuresAtThisFirm` as `readonly unknown[]` because it sometimes
 * resolves to an error envelope; narrow per-row here.
 * @param value - Row under inspection.
 * @returns Whether the row matches a disclosure event card.
 */
function isDisclosureEventCard(
  value: unknown
): value is DisclosureEventCardPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as KindHolder).kind === "disclosure"
  );
}

/**
 * Narrows an unknown article row to the minimal `ArticleStubLike` shape
 * accepted by `ArticleListBlock`. Rows that fail are dropped.
 * @param value - Row under inspection.
 * @returns Whether the row carries the minimum article-stub fields.
 */
function isArticleStub(value: unknown): value is ArticleStubLike {
  if (typeof value !== "object" || value === null) return false;
  const id = (value as IdHolder).id;
  return typeof id === "string";
}

/**
 * Filters a `readonly unknown[]` row array through a typed predicate.
 * Mirrors the helper used by the advisor page so we never `as`-cast
 * across the resource boundary.
 * @param rows - Unknown row array as returned by `resourceRows`.
 * @param guard - Type predicate used to narrow each row.
 * @returns Array of rows satisfying `guard`.
 */
function narrowRows<T>(
  rows: readonly unknown[],
  guard: (value: unknown) => value is T
): readonly T[] {
  return rows.filter(guard);
}

/**
 * Appends only present section nodes to a profile column.
 * @param root - Column node.
 * @param sections - Candidate sections.
 */
function appendSections(
  root: HTMLElement,
  sections: readonly (HTMLElement | null)[]
): void {
  sections.forEach(section => {
    if (section) root.appendChild(section);
  });
}

/**
 * Builds the center-column firm sections.
 * @param d - FirmProfile payload.
 * @returns Ordered center-column sections.
 */
function firmCenterSections(
  d: FirmProfileResponse
): readonly (HTMLElement | null)[] {
  const currentTeams = resourceRows(d.currentTeams);
  const transitionsIn = resourceRows(d.transitionsIn);
  const transitionsOut = resourceRows(d.transitionsOut);
  const disclosuresAtThisFirm = narrowRows(
    resourceRows(d.disclosuresAtThisFirm),
    isDisclosureEventCard
  );
  const articles = narrowRows(resourceRows(d.articles), isArticleStub);
  return [
    dueDiligenceSection(d.dueDiligence),
    (d.firm as unknown as FirmExtraFields).notes
      ? SectionCardComponent({
          title: "About",
          body: el("div", {}, (d.firm as unknown as FirmExtraFields).notes),
        })
      : null,
    currentAdvisorsSection(d),
    d.pastAdvisorCount > 0
      ? SectionCardComponent({
          title: `Past advisors (${d.pastAdvisorCount.toLocaleString()})`,
          body: paginatedAdvisorsComponent(d.firm.id, "past", {
            showEnd: true,
          }),
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
      ? SectionCardComponent({
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
    SectionCardComponent({
      title: `Coverage (${articles.length.toLocaleString()})`,
      body: ArticleListBlockComponent({ articles, fmtDate, articleSource }),
    }),
    PartialFailureCard("Coverage", d.articles),
  ];
}

/**
 * Builds the source-backed firm due-diligence summary.
 * @param diligence - Structured due-diligence modules from FirmProfile.
 * @returns Due-diligence summary section or null.
 */
function dueDiligenceSection(
  diligence: FirmDueDiligencePayload | null | undefined
): HTMLElement | null {
  if (!diligence?.modules) return null;
  const body = el("div", { class: "firm-dd" });
  const moduleEntries = dueDiligenceModules(diligence.modules);
  const emptyState = dueDiligenceEmptyState();
  const grid = el(
    "div",
    { class: "firm-dd-grid" },
    ...moduleEntries.map(({ key, node }) => {
      node.dataset.firmDdStatus = moduleStatusGroup(diligence.modules[key]);
      return node;
    })
  );
  const filters = dueDiligenceFilters(grid, emptyState);
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
    emptyState,
    dataConfidenceBlock(diligence.dataConfidence) ?? document.createComment("")
  );
  return SectionCardComponent({
    title: "Firm due diligence",
    attrs: { class: "firm-dd-card" },
    body,
  });
}

/** Renderable entry produced by `dueDiligenceModules`. */
interface ModuleEntry {
  readonly key: keyof DueDiligenceModules;
  readonly node: HTMLElement;
}

/** Pre-filter entry shape carrying a possibly-null module card node. */
interface NullableModuleEntry {
  readonly key: keyof DueDiligenceModules;
  readonly node: HTMLElement | null;
}

/**
 * Creates ordered due-diligence module cards.
 * @param modules - Due-diligence module map.
 * @returns Renderable module entries.
 */
function dueDiligenceModules(
  modules: DueDiligenceModules
): readonly ModuleEntry[] {
  const entries: readonly NullableModuleEntry[] = [
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
  ];
  return entries.filter((entry): entry is ModuleEntry => entry.node !== null);
}

/**
 * Builds a compact filter control for module availability.
 * @param grid - Module grid node to filter.
 * @param emptyState - Empty-state node to show for zero-match filters.
 * @returns Filter control node.
 */
function dueDiligenceFilters(
  grid: HTMLElement,
  emptyState: HTMLElement
): HTMLElement {
  const buttons: readonly HTMLElement[] = (
    [
      ["all", "All"],
      ["loaded", "Source-backed"],
      ["missing", "Needs data"],
    ] as const
  ).map(([filter, label]) =>
    ButtonComponent({
      variant: filter === "all" ? "primary" : "neutral",
      children: label,
      attrs: {
        class: "firm-dd-filter",
        "data-filter": filter,
        "aria-pressed": filter === "all" ? "true" : "false",
      },
      onClick: (event: Event) =>
        applyDueDiligenceFilter(
          grid,
          emptyState,
          event.currentTarget as HTMLElement
        ),
    })
  );
  const allButton = buttons[0];
  emptyState
    .querySelector("[data-firm-dd-reset]")
    ?.addEventListener("click", () => {
      applyDueDiligenceFilter(grid, emptyState, allButton);
      allButton.focus();
    });
  return el(
    "div",
    { class: "firm-dd-filters", "aria-label": "Due diligence module filter" },
    ...buttons
  );
}

/**
 * Applies a module filter without changing resource state.
 * @param grid - Module grid node.
 * @param emptyState - Empty-state node to show for zero-match filters.
 * @param activeButton - Clicked filter button.
 */
function applyDueDiligenceFilter(
  grid: HTMLElement,
  emptyState: HTMLElement,
  activeButton: HTMLElement
): void {
  const filter = activeButton.dataset.filter || "all";
  const modules = [...grid.querySelectorAll<HTMLElement>(".firm-dd-module")];
  const isVisible = (module: HTMLElement): boolean =>
    filter === "all" || module.dataset.firmDdStatus === filter;
  const visibleCount = modules.filter(isVisible).length;
  activeButton.parentElement
    ?.querySelectorAll<HTMLElement>(".firm-dd-filter")
    .forEach(button => {
      const active = button === activeButton;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.classList.toggle("ab-btn--primary", active);
      button.classList.toggle("ab-btn--neutral", !active);
    });
  modules.forEach(module => {
    module.toggleAttribute("hidden", !isVisible(module));
  });
  emptyState.toggleAttribute("hidden", visibleCount > 0);
  emptyState
    .querySelector("[data-firm-dd-empty-copy]")
    ?.replaceChildren(
      filter === "missing"
        ? "No modules currently need data."
        : "No due-diligence modules match this filter."
    );
}

/**
 * Builds the zero-match due-diligence filter empty state.
 * @returns Filter empty-state node.
 */
function dueDiligenceEmptyState(): HTMLElement {
  return el(
    "div",
    { class: "firm-dd-empty", hidden: "" },
    el("strong", {}, "No matching modules"),
    el(
      "p",
      { "data-firm-dd-empty-copy": "" },
      "No due-diligence modules match this filter."
    ),
    ButtonComponent({
      variant: "neutral",
      children: "Show all modules",
      attrs: { "data-firm-dd-reset": "" },
    })
  );
}

/** Provenance slot accepted by the local `moduleCard` shell. */
interface ModuleShellProvenance {
  readonly sourceTable?: string;
  readonly sourceTables?: readonly string[];
  readonly sourceIds?: readonly string[];
}

/** Freshness slot accepted by the local `moduleCard` shell. */
interface ModuleShellFreshness {
  readonly asOf?: unknown;
}

/** Module payload accepted by the local `moduleCard` shell. */
interface ModuleShellPayload {
  readonly status?: string;
  readonly note?: string;
  readonly provenance?: ModuleShellProvenance;
  readonly freshness?: ModuleShellFreshness;
}

/**
 * Builds a module card shell with status, provenance, and freshness labels.
 * @param title - Module title.
 * @param module - Module payload.
 * @param children - Module body children.
 * @returns Module card node.
 */
function moduleCard(
  title: string,
  module: ModuleShellPayload | null | undefined,
  ...children: readonly (HTMLElement | null)[]
): HTMLElement {
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
function recruitingMomentumCard(
  module: RecruitingMomentumModule | null | undefined
): HTMLElement {
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
          `${fmtNumber((module?.inbound?.unknownAumCount || 0) + (module?.outbound?.unknownAumCount || 0))} move(s) have unknown AUM.`
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
function rosterFootprintCard(
  module: RosterFootprintModule | null | undefined
): HTMLElement {
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
function rankingPresenceCard(
  module: RankingPresenceModule | null | undefined
): HTMLElement {
  const appearances: readonly RankingAppearance[] = module?.appearances || [];
  const topRank = module && module.status === "loaded" ? module.topRank : null;
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
      : EmptyTextComponent({
          children:
            module?.note ||
            "No ranking data is on file for this firm; this is an unavailable source state.",
        }),
    el(
      "div",
      { class: "firm-dd-stat-row" },
      metricTile("Resolved", fmtNumber(module?.resolvedCount)),
      metricTile("Unresolved", fmtNumber(module?.unresolvedCount)),
      metricTile("Top rank", topRank ? `#${topRank}` : "not loaded")
    )
  );
}

/**
 * Builds the regulatory module.
 * @param module - Regulatory module payload.
 * @returns Module card.
 */
function regulatorySnapshotCard(
  module: RegulatorySnapshotModule | null | undefined
): HTMLElement {
  const snapshot =
    module && module.status === "loaded" ? module.snapshot : null;
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
      : EmptyTextComponent({
          children: module?.note || "No firm BrokerCheck snapshot is loaded.",
        }),
    module?.source
      ? SourceAttributionComponent({
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
function coverageTimelineCard(
  module: CoverageTimelineModule | null | undefined
): HTMLElement {
  const articles: readonly FirmArticleStubView[] = module?.recentArticles || [];
  return moduleCard(
    "Coverage timeline",
    module,
    articles.length
      ? el(
          "div",
          { class: "firm-dd-list" },
          ...articles.slice(0, 4).map(article => {
            const articleAny = article as FirmArticleStubView &
              CoverageArticleExtras;
            return el(
              "a",
              {
                class: "firm-dd-list-row firm-dd-link-row",
                href: articleAny.url || articlePath(article),
                target: articleAny.url ? "_blank" : null,
                rel: articleAny.url ? "noreferrer" : null,
              },
              el("span", {}, articleAny.headline || "Untitled article"),
              el(
                "strong",
                {},
                articleAny.publishedDate
                  ? fmtDate(articleAny.publishedDate, { mode: "short" })
                  : "undated"
              )
            );
          })
        )
      : EmptyTextComponent({
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
function moduleMeta(
  module: ModuleShellPayload | null | undefined
): HTMLElement {
  const provenance = module?.provenance || {};
  const sourceTables = [
    provenance.sourceTable,
    ...(provenance.sourceTables || []),
  ].filter((s): s is string => Boolean(s));
  const sourceIds = provenance.sourceIds || [];
  const freshness = module?.freshness;
  return el(
    "div",
    { class: "firm-dd-meta" },
    helpText(
      "Source state",
      "Source state explains which loaded rows support this module and whether the module has a current freshness date."
    ),
    sourceTables.length
      ? TagComponent({
          children: `Source: ${sourceTables.join(", ")}`,
        })
      : null,
    sourceIds.length
      ? TagComponent({
          children: `${fmtNumber(sourceIds.length)} source row(s)`,
        })
      : TagComponent({ children: "No source rows loaded" }),
    freshness?.asOf
      ? TagComponent({
          kind: "ok",
          children: `As of ${fmtDate(freshness.asOf as never, { mode: "short" })}`,
        })
      : TagComponent({ kind: "warn", children: "Freshness unavailable" })
  );
}

/**
 * Builds a short list of supporting move links.
 * @param moves - Recent move payloads.
 * @returns Move list or empty state.
 */
function recentMovesList(moves: readonly RecentTransitionMove[]): HTMLElement {
  if (!moves.length)
    return EmptyTextComponent({
      children: "No recent move rows are loaded for this firm.",
    });
  return el(
    "div",
    { class: "firm-dd-list" },
    ...moves.map(move => {
      const subject = move.subject as MoveSubject | null | undefined;
      return el(
        "div",
        { class: "firm-dd-list-row" },
        el(
          "span",
          {},
          subject?.id && subject.kind
            ? el("a", { href: entityPath(subject.kind, subject) }, subject.name)
            : subject?.name || "Unresolved move subject"
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
      );
    })
  );
}

/**
 * Builds the data-confidence notes.
 * @param confidence - Confidence payload.
 * @returns Confidence summary.
 */
function dataConfidenceBlock(
  confidence: DataConfidenceModule | null | undefined
): HTMLElement | null {
  if (!confidence) return null;
  return el(
    "div",
    { class: "firm-dd-confidence" },
    el(
      "div",
      { class: "firm-dd-confidence-head" },
      el("strong", {}, "Data confidence"),
      helpText(
        "Data confidence",
        "Data confidence summarizes whether each due-diligence module is source-backed, missing data, or needs review."
      ),
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
 * Builds a compact keyboard-accessible explanation control.
 * @param label - Due-diligence term being explained.
 * @param explanation - Public explanation copy.
 * @returns Help text disclosure.
 */
function helpText(label: string, explanation: string): HTMLElement {
  return el(
    "details",
    { class: "firm-dd-help" },
    el("summary", { "aria-label": `${label} explanation` }, "?"),
    el("p", {}, explanation)
  );
}

/**
 * Renders a small metric tile.
 * @param label - Metric label.
 * @param value - Metric value.
 * @param sub - Optional supporting text.
 * @returns Metric tile node.
 */
function metricTile(
  label: string,
  value: string | number | null | undefined,
  sub: string = ""
): HTMLElement {
  return el(
    "div",
    { class: "firm-dd-metric" },
    el("strong", {}, value ?? "not loaded"),
    el("span", {}, label),
    sub ? el("small", {}, sub) : null
  );
}

/**
 * Builds a status tag for a module status string.
 * @param status - Module status.
 * @returns Tag node.
 */
function statusTag(status: string | null | undefined): HTMLElement {
  const group =
    status === "loaded" ? "ok" : status === "partial" ? "warn" : "default";
  return TagComponent({
    kind: group,
    children: humanize(status || "unavailable"),
  });
}

/**
 * Returns the canonical status group for a due-diligence module.
 * @param module - Module payload.
 * @returns "loaded" or "missing".
 */
function moduleStatusGroup(
  module: ModuleStatusHolder | null | undefined
): "loaded" | "missing" {
  return module?.status === "loaded" ? "loaded" : "missing";
}

/**
 * Counts loaded modules from rendered entries.
 * @param entries - Renderable module entries.
 * @returns Count string.
 */
function loadedModuleCount(entries: readonly ModuleEntry[]): string {
  return fmtNumber(
    entries.filter(({ node }) => node.dataset.firmDdStatus === "loaded").length
  );
}

/**
 * Counts modules currently missing source data.
 * @param entries - Renderable module entries.
 * @returns Count string.
 */
function missingModuleCount(entries: readonly ModuleEntry[]): string {
  return fmtNumber(
    entries.filter(({ node }) => node.dataset.firmDdStatus === "missing").length
  );
}

/**
 * Formats a count using locale-aware separators.
 * @param value - Raw numeric or string value.
 * @returns Formatted count string.
 */
function fmtNumber(value: number | string | null | undefined): string {
  return value == null || value === "" ? "0" : Number(value).toLocaleString();
}

/**
 * Formats a signed integer.
 * @param value - Raw value.
 * @returns Signed integer string.
 */
function signedNumber(value: number | null | undefined): string {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString()}`;
}

/**
 * Formats a signed money amount.
 * @param value - Raw amount.
 * @returns Signed money string.
 */
function signedMoney(value: number | null | undefined): string {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${fmtMoney(number)}`;
}

/**
 * Builds the right-rail firm sections.
 * @param d - FirmProfile payload.
 * @returns Ordered right-rail sections.
 */
function firmRightSections(
  d: FirmProfileBody
): readonly (HTMLElement | null)[] {
  return [
    firmDetailsCardComponent(d.firm),
    regulatoryCardComponent(d.brokerCheckSnapshot),
    branchesCardComponent(resourceRows(d.branches)),
    PartialFailureCard("Branches", d.branches),
  ];
}

/**
 * Builds the current-advisors section with an explicit empty state.
 * @param d - FirmProfile payload.
 * @returns Current advisors section.
 */
function currentAdvisorsSection(d: FirmProfileResponse): HTMLElement {
  return d.currentAdvisorCount > 0
    ? SectionCardComponent({
        title: `Current advisors (${d.currentAdvisorCount.toLocaleString()})`,
        body: paginatedAdvisorsComponent(d.firm.id, "current", {
          showStart: true,
        }),
      })
    : SectionCardComponent({
        title: "Current advisors (0)",
        body: EmptyTextComponent({ children: "No current advisors on file." }),
      });
}

/** Minimal team row shape rendered by `teamsSection`. */
interface FirmTeamRow {
  readonly id?: string;
  readonly name?: string;
  readonly serviceModel?: string | null;
  readonly aum?: number | null;
  readonly teamSize?: number | null;
}

/**
 * Builds the current-teams section when the firm has team rows.
 * @param teams - Current team rows.
 * @returns Team section or null.
 */
function teamsSection(teams: readonly unknown[]): HTMLElement | null {
  if (!teams.length) return null;
  const typed = teams as readonly FirmTeamRow[];
  return SectionCardComponent({
    title: `Teams currently at this firm (${teams.length.toLocaleString()})`,
    body: EntityListComponent({
      rows: typed.map(t =>
        EntityRowComponent({
          avatar: initials(t.name ?? ""),
          name: t.name ?? undefined,
          sub: [
            t.serviceModel ? `${humanize(t.serviceModel)} clients` : null,
            t.aum != null ? `${fmtMoney(t.aum)} AUM` : null,
            t.teamSize ? `${t.teamSize} members` : null,
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · "),
          href: entityPath("team", t),
        })
      ),
    }),
  });
}

/**
 * Builds a transition section when move events exist.
 * @param title - Section title prefix.
 * @param transitions - Transition event rows.
 * @returns Transition section or null.
 */
function transitionSection(
  title: string,
  transitions: readonly unknown[]
): HTMLElement | null {
  return transitions.length
    ? SectionCardComponent({
        title: `${title} (${transitions.length.toLocaleString()})`,
        body: el(
          "div",
          {},
          ...transitions.map(t => TransitionEventCard(t as never, fmts))
        ),
      })
    : null;
}

/* eslint-enable max-lines, sonarjs/no-duplicate-string -- End route-local helper exception. */

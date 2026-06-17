import {
  SectionCard,
  EmptyCard,
  Button,
  Tag,
  el,
  clear,
} from "./design-system/index.js";
import {
  BRANCH_FILTER_KEYS,
  emptyBranchFilters,
  formBranchFilters,
  writeBranchFilters,
  type BranchFilters,
} from "./branches-url.js";
import {
  activeFilter,
  advisorCountLabel,
  branchAnchor,
  branchCoverageContext,
  branchLevelLabel,
  branchSourceContext,
  coverageGapCount,
  coverageLabel,
  coverageTagKind,
  emptyStateCopy,
  field,
  firmHref,
  legendRow,
  locationLabel,
  metric,
  rowField,
  rowSubtitle,
  selectField,
  sourceTypeCount,
} from "./branches-view-helpers.js";
import type { BranchExplorerState } from "./branches.js";
import type { BranchDirectoryRow } from "../harper/resource-directory-types.js";

/**
 *
 */
interface RenderBranchExplorerOptions {
  readonly state: BranchExplorerState;
  readonly center: HTMLElement;
  readonly right: HTMLElement;
  readonly reload: () => void;
  readonly loadMore: () => void;
}

export const renderBranchExplorer = (
  options: RenderBranchExplorerOptions
): void => {
  const { state, center, right, reload, loadMore } = options;
  clear(center);
  clear(right);
  center.appendChild(headerCard(state));
  center.appendChild(filterCard(state.filters, reload));
  center.appendChild(resultsCard(state, loadMore));
  right.appendChild(summaryCard(state));
  right.appendChild(filterSummaryCard(state.filters));
  right.appendChild(coverageLegendCard());
};

const headerCard = (state: BranchExplorerState): HTMLElement => {
  return SectionCard({
    title: "Branch network explorer",
    attrs: { class: "branches-header" },
    body: [
      el(
        "p",
        { class: "branches-lede" },
        "Public branch rows with firm context, source status, advisor-count coverage, and reusable filters."
      ),
      el(
        "div",
        { class: "metric-grid" },
        metric("Matching branches", state.total),
        metric("Shown", state.items.length),
        metric("Coverage gaps", coverageGapCount(state.items)),
        metric("Sources", sourceTypeCount(state.items))
      ),
    ],
  });
};

const filterCard = (
  filters: BranchFilters,
  reload: () => void
): HTMLElement => {
  const form = el(
    "form",
    {
      class: "branches-filter-grid",
      onSubmit: (event: Event) => {
        event.preventDefault();
        writeBranchFilters(
          formBranchFilters(event.currentTarget as HTMLFormElement)
        );
        reload();
      },
    },
    field("Search", "q", filters.q, "Branch, market, address, or firm"),
    field("Firm", "firm", filters.firm, "Firm name or id"),
    field("State", "state", filters.state, "NY"),
    field("City or market", "city", filters.city, "New York"),
    field("Source type", "sourceType", filters.sourceType, "brokercheck"),
    selectField("Level", "level", filters.level),
    field("Minimum advisors", "minAdvisorCount", filters.minAdvisorCount, "1"),
    el(
      "div",
      { class: "branches-filter-actions" },
      Button({ variant: "primary", children: "Apply filters", type: "submit" }),
      Button({
        variant: "ghost",
        children: "Clear",
        onClick: () => {
          writeBranchFilters(emptyBranchFilters());
          reload();
        },
      })
    )
  );
  return SectionCard({
    title: "Filters",
    attrs: { class: "branches-filter-card" },
    body: form,
  });
};

const resultsCard = (
  state: BranchExplorerState,
  loadMore: () => void
): HTMLElement => {
  if (!state.items.length) return EmptyCard(emptyStateCopy(state));
  return SectionCard({
    title: "Branch rows",
    attrs: { class: "branches-results-card" },
    body: [
      el("div", { class: "branches-list" }, ...state.items.map(branchRow)),
      state.nextCursor
        ? el(
            "div",
            { class: "branches-load-more" },
            Button({
              variant: "neutral",
              children: "Load more",
              onClick: loadMore,
            })
          )
        : null,
    ],
  });
};

const branchRow = (row: BranchDirectoryRow): HTMLElement => {
  return el(
    "article",
    {
      class: "branches-row",
      "data-branch-id": row.id,
      "data-coverage-status": row.coverageStatus,
    },
    rowMain(row),
    rowField("Firm", row.firmName ?? "Unavailable"),
    rowField("Location", locationLabel(row)),
    rowField("Current advisors", advisorCountLabel(row)),
    rowActions(row)
  );
};

const rowMain = (row: BranchDirectoryRow): HTMLElement => {
  return el(
    "div",
    { class: "branches-row-main" },
    el(
      "a",
      { class: "branches-row-title", href: branchAnchor(row) },
      row.displayName
    ),
    el("span", { class: "branches-row-subtitle" }, rowSubtitle(row)),
    el(
      "div",
      { class: "branches-row-tags" },
      Tag({
        kind: coverageTagKind(row.coverageStatus),
        children: coverageLabel(row),
      }),
      Tag({ children: branchLevelLabel(row) })
    ),
    el("p", { class: "branches-row-context" }, branchCoverageContext(row)),
    el(
      "p",
      { class: "branches-row-context branches-row-source-context" },
      branchSourceContext(row)
    )
  );
};

const rowActions = (row: BranchDirectoryRow): HTMLElement => {
  return el(
    "div",
    { class: "branches-row-actions" },
    row.firmId
      ? el("a", { href: firmHref(row), class: "branches-row-action" }, "Firm")
      : null,
    row.firmId
      ? el(
          "a",
          {
            href: `/advisors?firm=${encodeURIComponent(row.firmId)}`,
            class: "branches-row-action",
          },
          "Advisors"
        )
      : null
  );
};

const summaryCard = (state: BranchExplorerState): HTMLElement => {
  return SectionCard({
    title: "Explorer summary",
    body: el(
      "div",
      { class: "branches-summary-grid" },
      metric("Total matches", state.total),
      metric("Loaded rows", state.items.length),
      metric(
        "With advisors",
        state.items.filter(row => row.currentAdvisorCount > 0).length
      ),
      metric("Partial or unavailable", coverageGapCount(state.items))
    ),
  });
};

const filterSummaryCard = (filters: BranchFilters): HTMLElement => {
  const active = BRANCH_FILTER_KEYS.filter(key => filters[key]);
  return SectionCard({
    title: "URL state",
    body: active.length
      ? el(
          "div",
          { class: "branches-active-filters" },
          ...active.map(key => activeFilter(key, filters))
        )
      : el("p", { class: "branches-muted" }, "No filters are active."),
  });
};

const coverageLegendCard = (): HTMLElement => {
  return SectionCard({
    title: "Coverage states",
    body: el(
      "div",
      { class: "branches-legend" },
      legendRow(
        "Advisor links available",
        "Firm and active advisor links are present."
      ),
      legendRow(
        "Advisor links incomplete",
        "Branch exists, but advisor linkage is incomplete."
      ),
      legendRow(
        "Branch context unavailable",
        "Firm context could not be resolved."
      )
    ),
  });
};

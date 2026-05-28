// Top-level firm due-diligence section with filter controls and module grid.

import type {
  DueDiligenceModules,
  FirmDueDiligencePayload,
} from "../../harper/resource-firm-due-diligence-types.js";
import { fmtDate } from "../app.js";
import { el } from "../design-system/index.js";
import {
  ButtonComponent,
  COPY_NEEDS_DATA,
  COPY_NO_MATCHING_MODULES,
  COPY_SOURCE_BACKED,
  ModuleEntry,
  NullableModuleEntry,
  SectionCardComponent,
  STATUS_LOADED,
  STATUS_MISSING,
} from "./shared.js";
import {
  fmtNumber,
  helpText,
  metricTile,
  moduleStatusGroup,
  sectionTitleWithHelp,
} from "./helpers.js";
import { dataConfidenceBlock } from "./module-shell.js";
import {
  coverageTimelineCard,
  rankingPresenceCard,
  recruitingMomentumCard,
  regulatorySnapshotCard,
  rosterFootprintCard,
} from "./modules.js";

/**
 * Builds the source-backed firm due-diligence summary.
 * @param diligence - Structured due-diligence modules from FirmProfile.
 * @returns Due-diligence summary section or null.
 */
export function dueDiligenceSection(
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
    title: sectionTitleWithHelp(
      "Firm due diligence",
      "Firm due diligence shows which public source rows support each trust check and where more data is needed."
    ),
    attrs: { class: "firm-dd-card" },
    body,
  });
}

/**
 * Creates ordered due-diligence module cards.
 * @param modules - Due-diligence module map.
 * @returns Renderable module entries.
 */
export function dueDiligenceModules(
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
export function dueDiligenceFilters(
  grid: HTMLElement,
  emptyState: HTMLElement
): HTMLElement {
  const buttons: readonly HTMLElement[] = (
    [
      ["all", "All"],
      [STATUS_LOADED, COPY_SOURCE_BACKED],
      [STATUS_MISSING, COPY_NEEDS_DATA],
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
    el("div", { class: "firm-dd-filter-buttons" }, ...buttons),
    el(
      "div",
      { class: "firm-dd-filter-help" },
      helpText(
        COPY_SOURCE_BACKED,
        "Source-backed means a due-diligence module has public rows or records that support the summary shown here."
      ),
      helpText(
        COPY_NEEDS_DATA,
        "Needs data means the module is intentionally visible, but AdvisorBook does not yet have enough public source rows to support it."
      )
    )
  );
}

/**
 * Applies a module filter without changing resource state.
 * @param grid - Module grid node.
 * @param emptyState - Empty-state node to show for zero-match filters.
 * @param activeButton - Clicked filter button.
 */
export function applyDueDiligenceFilter(
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
      filter === STATUS_MISSING
        ? "No modules currently need data."
        : COPY_NO_MATCHING_MODULES
    );
}

/**
 * Builds the zero-match due-diligence filter empty state.
 * @returns Filter empty-state node.
 */
export function dueDiligenceEmptyState(): HTMLElement {
  return el(
    "div",
    { class: "firm-dd-empty", hidden: "" },
    el("strong", {}, "No matching modules"),
    el("p", { "data-firm-dd-empty-copy": "" }, COPY_NO_MATCHING_MODULES),
    ButtonComponent({
      variant: "neutral",
      children: "Show all modules",
      attrs: { "data-firm-dd-reset": "" },
    })
  );
}

/**
 * Counts loaded modules from rendered entries.
 * @param entries - Renderable module entries.
 * @returns Count string.
 */
export function loadedModuleCount(entries: readonly ModuleEntry[]): string {
  return fmtNumber(
    entries.filter(({ node }) => node.dataset.firmDdStatus === STATUS_LOADED)
      .length
  );
}

/**
 * Counts modules currently missing source data.
 * @param entries - Renderable module entries.
 * @returns Count string.
 */
export function missingModuleCount(entries: readonly ModuleEntry[]): string {
  return fmtNumber(
    entries.filter(({ node }) => node.dataset.firmDdStatus === STATUS_MISSING)
      .length
  );
}

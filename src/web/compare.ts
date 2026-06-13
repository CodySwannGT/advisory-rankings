import type {
  AdvisorComparisonItem,
  AdvisorComparisonPayload,
} from "../types/advisor-comparison.js";
import {
  api,
  refreshMe,
  logout,
  search,
  fmtDate,
  humanize,
  initials,
} from "./app.js";
import {
  mountFullWidthPage,
  clear,
  el,
  ProfileHead,
  SectionCard,
  AsyncStateCard,
  Button,
  Tag,
} from "./design-system/index.js";
import { runDelayedRouteRequest } from "./route-loading.js";
import { comparisonSections, firmName } from "./compare-sections.js";
import { reportPacketAction } from "./compare-packet-action.js";
import { privateOverlayMount } from "./compare-private-overlay.js";
import { compareAddAdvisorControl } from "./compare-add-advisor.js";
import { brokerCheckSourceNode } from "./compare-brokercheck-source.js";
import {
  advisorComparisonPathFromLocation,
  comparisonColumnHeader,
  comparisonSelectionDetails,
  moveComparisonItem,
  updateComparisonSelection,
  type ComparisonColumnActions,
} from "./compare-selection.js";

/**
 *
 */
type Component = (...args: readonly unknown[]) => HTMLElement;

const ProfileHeadComponent = ProfileHead as unknown as Component;
const SectionCardComponent = SectionCard as unknown as Component;
const AsyncStateCardComponent = AsyncStateCard as unknown as Component;
const ButtonComponent = Button as unknown as Component;
const TagComponent = Tag as unknown as Component;

/**
 *
 */
interface PageColumns {
  readonly center: HTMLElement;
}

const PAGE_TITLE = "Advisor comparison";

mountFullWidthPage({
  active: "advisors",
  refreshMe,
  logout,
  search,
  pageTitle: PAGE_TITLE,
  build({ center }: PageColumns): void {
    const loadComparison = (): void => {
      clear(center);
      center.appendChild(
        SectionCardComponent({
          title: "Loading advisor comparison",
          body: el(
            "p",
            { class: "muted" },
            "Fetching public diligence evidence..."
          ),
        })
      );

      runDelayedRouteRequest({
        container: center,
        title: "Loading comparison",
        body: "Still fetching advisor diligence evidence. Retry if this takes longer than expected.",
        onRetry: loadComparison,
        request: () =>
          api<AdvisorComparisonPayload>(advisorComparisonPathFromLocation()),
        onSuccess: payload => renderComparison(center, payload),
        onError: error => {
          console.error("Comparison route failed to load", error);
          clear(center);
          center.appendChild(
            AsyncStateCardComponent({
              kind: "error",
              title: "Could not load comparison",
              body: "Retry the request or choose a fresh advisor pair.",
              actionLabel: "Retry",
              onAction: loadComparison,
            })
          );
        },
      });
    };

    loadComparison();
  },
});

/**
 * Renders the comparison page payload.
 * @param center - Full-width page root.
 * @param payload - AdvisorComparison response.
 */
function renderComparison(
  center: HTMLElement,
  payload: AdvisorComparisonPayload
): void {
  const selectedIds = payload.ids ?? [];
  const selectedDirectoryHref = `/advisors?ids=${selectedIds.map(encodeURIComponent).join(",")}`;
  const recoveryCard =
    payload.selection.status === "under_limit"
      ? [
          compareStartCard(
            underLimitStartCopy(payload.items.length),
            selectedDirectoryHref,
            selectedIds
          ),
        ]
      : [];

  clear(center);

  if (!payload.items.length) {
    center.appendChild(compareStartCard(undefined, "/advisors", selectedIds));
    return;
  }

  center.append(
    comparisonHero(payload),
    selectionNotice(payload),
    ...recoveryCard,
    SectionCardComponent({
      title: "Due diligence evidence",
      body: comparisonTable(payload.items, {
        remove: id =>
          updateComparisonSelection(
            nextPayload => renderComparison(center, nextPayload),
            payload,
            payload.items.filter(item => item.id !== id)
          ),
        move: (id, direction) =>
          updateComparisonSelection(
            nextPayload => renderComparison(center, nextPayload),
            payload,
            moveComparisonItem(payload.items, id, direction)
          ),
        firmName,
      }),
      attrs: { class: "comparison-card" },
    }),
    privateOverlayMount(payload.items)
  );
}

/**
 * Renders a human-usable starting point for cold `/compare` visits.
 * @param copy - Introductory action copy.
 * @param browseHref - Advisor directory href for Browse actions.
 * @param selectedIds - Currently selected advisor ids.
 * @returns Compare empty-state section.
 */
function compareStartCard(
  copy = "Search for an advisor or browse the directory, then use Add to comparison from an advisor profile or directory row.",
  browseHref = "/advisors",
  selectedIds: readonly string[] = []
): HTMLElement {
  return SectionCardComponent({
    title: "Choose advisors to compare",
    attrs: { class: "comparison-start" },
    body: [
      el("p", { class: "comparison-start-copy" }, copy),
      el(
        "div",
        { class: "comparison-start-actions" },
        ButtonComponent({
          variant: "primary",
          children: "Browse advisors",
          onClick: () => {
            window.location.href = browseHref;
          },
          attrs: {
            class: "comparison-start-button",
          },
        }),
        el(
          "a",
          { class: "comparison-start-link", href: browseHref },
          "Open advisor directory"
        )
      ),
      el(
        "ol",
        { class: "comparison-start-steps", "aria-label": "Comparison steps" },
        el("li", {}, "Find an advisor by name, firm, or team."),
        el("li", {}, "Add two to four advisors to the comparison."),
        el("li", {}, "Review diligence evidence side by side.")
      ),
      compareAddAdvisorControl(selectedIds),
    ],
  });
}

/**
 * Builds recovery copy for an under-limit comparison selection.
 * @param selectedCount - Number of selected advisor columns.
 * @returns User-facing recovery guidance.
 */
function underLimitStartCopy(selectedCount: number): string {
  const advisorLabel = selectedCount === 1 ? "advisor" : "advisors";
  return `You have selected ${selectedCount} ${advisorLabel}. Browse the directory to add another advisor and complete the comparison.`;
}

/**
 * Builds the comparison page hero from selected advisors.
 * @param payload - AdvisorComparison response.
 * @returns Hero profile head.
 */
function comparisonHero(payload: AdvisorComparisonPayload): HTMLElement {
  const found = payload.items.filter(item => item.status === "found");
  const names = found.map(item => item.displayName).join(" vs ");
  return el(
    "div",
    { class: "comparison-hero" },
    ProfileHeadComponent({
      initialsText: initials(names || PAGE_TITLE),
      title: PAGE_TITLE,
      headingLevel: 2,
      subtitle: names || "Public diligence evidence",
      tags: [
        { label: `${payload.items.length} selected` },
        {
          label: `Generated ${fmtDate(payload.generatedAt, { mode: "short" })}`,
        },
      ],
    }),
    reportPacketAction(payload.ids)
  );
}

/**
 * Renders selection status details when the request needed normalization.
 * @param payload - AdvisorComparison response.
 * @returns Status notice.
 */
function selectionNotice(payload: AdvisorComparisonPayload): HTMLElement {
  const { selection } = payload;
  const details = comparisonSelectionDetails(selection);

  return el(
    "div",
    { class: "comparison-status", "data-status": selection.status },
    TagComponent({
      kind: selection.status === "ready" ? "ok" : "warn",
      children: humanize(selection.status) || selection.status,
    }),
    details.length
      ? el("p", {}, details.join(" "))
      : el("p", {}, "Ready for side-by-side review.")
  );
}

/**
 * Builds the evidence table for all compared advisors.
 * @param items - Advisor comparison items.
 * @param actions - Selection mutation callbacks.
 * @returns Scrollable comparison table wrapper.
 */
function comparisonTable(
  items: readonly AdvisorComparisonItem[],
  actions: ComparisonColumnActions
): HTMLElement {
  const sections = comparisonSections(items);
  return el(
    "div",
    { class: "comparison-table-wrap" },
    el(
      "table",
      { class: "comparison-table" },
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          el("th", { scope: "col" }, "Evidence"),
          ...items.map((item, index) =>
            comparisonColumnHeader(item, index, items.length, actions)
          )
        )
      ),
      el(
        "tbody",
        {},
        ...sections.map(section =>
          el(
            "tr",
            {},
            el("th", { scope: "row" }, section.label),
            ...section.values.map((value, index) =>
              el(
                "td",
                { "data-advisor-label": items[index].displayName },
                comparisonCell(section.label, items[index], value)
              )
            )
          )
        )
      )
    )
  );
}

/**
 * Builds a comparison value cell with required BrokerCheck provenance.
 * @param section - Section label.
 * @param item - Compared advisor item.
 * @param value - Rendered section value.
 * @returns Cell content nodes.
 */
function comparisonCell(
  section: string,
  item: AdvisorComparisonItem,
  value: string
): HTMLElement {
  const hasValue = Boolean(value);
  return el(
    "div",
    { class: "comparison-cell" },
    el(
      "span",
      { class: hasValue ? "comparison-cell-value" : "comparison-missing" },
      hasValue ? value : neutralMissingState(section)
    ),
    brokerCheckSourceNode(section, item)
  );
}

/**
 * Neutral copy for missing values in a comparison row.
 * @param section - Section label.
 * @returns Missing-state copy.
 */
function neutralMissingState(section: string): string {
  return `No ${section.toLowerCase()} evidence available`;
}

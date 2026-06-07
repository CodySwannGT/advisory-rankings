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
  SourceAttribution,
} from "./design-system/index.js";
import { runDelayedRouteRequest } from "./route-loading.js";
import { comparisonSections, firmName } from "./compare-sections.js";
import { reportPacketAction } from "./compare-packet-action.js";
import { privateOverlayMount } from "./compare-private-overlay.js";
import {
  advisorComparisonPathFromLocation,
  comparisonColumnHeader,
  comparisonSelectionDetails,
  moveComparisonItem,
  updateComparisonSelection,
  type ComparisonColumnActions,
} from "./compare-selection.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const ProfileHeadComponent = ProfileHead as unknown as Component;
const SectionCardComponent = SectionCard as unknown as Component;
const AsyncStateCardComponent = AsyncStateCard as unknown as Component;
const ButtonComponent = Button as unknown as Component;
const TagComponent = Tag as unknown as Component;
const SourceAttributionComponent = SourceAttribution as unknown as Component;

const BROKERCHECK_SOURCE = "FINRA BrokerCheck";
const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";
const BROKERCHECK_SECTION_LABELS = new Set(["Regulatory", "Career"]);

/** Full-width page columns supplied by the design-system shell. */
interface PageColumns {
  readonly center: HTMLElement;
}

/** Browser page title for the advisor comparison route. */
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
      center.appendChild(loadingCard());

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
  const recoveryCard =
    payload.selection.status === "under_limit"
      ? [compareStartCard(underLimitStartCopy(payload.items.length))]
      : [];

  clear(center);

  if (!payload.items.length) {
    center.appendChild(compareStartCard());
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
 * @returns Compare empty-state section.
 */
function compareStartCard(
  copy = "Search for an advisor or browse the directory, then use Add to comparison from an advisor profile or directory row."
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
            window.location.href = "/advisors";
          },
          attrs: {
            class: "comparison-start-button",
          },
        }),
        el(
          "a",
          { class: "comparison-start-link", href: "/advisors" },
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
 * Renders BrokerCheck source or an explicit neutral missing-state.
 * @param section - Section label.
 * @param item - Compared advisor item.
 * @returns Attribution or missing-state node.
 */
function brokerCheckSourceNode(
  section: string,
  item: AdvisorComparisonItem
): HTMLElement | null {
  if (!BROKERCHECK_SECTION_LABELS.has(section)) return null;
  const snapshot = item.regulatory.brokerCheckSnapshot;
  if (!snapshot) {
    return el(
      "span",
      { class: "comparison-brokercheck-missing" },
      "No BrokerCheck snapshot loaded for this advisor."
    );
  }
  return SourceAttributionComponent({
    source: BROKERCHECK_SOURCE,
    url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(snapshot.subjectCrd)}`,
    termsUrl: BROKERCHECK_TERMS_URL,
    fetchedAt: snapshot.fetchedAt,
    attrs: { class: "comparison-source-attribution" },
  });
}

/**
 * Neutral copy for missing values in a comparison row.
 * @param section - Section label.
 * @returns Missing-state copy.
 */
function neutralMissingState(section: string): string {
  return `No ${section.toLowerCase()} evidence available`;
}

/**
 * Loading card for the comparison route.
 * @returns Loading section.
 */
function loadingCard(): HTMLElement {
  return SectionCardComponent({
    title: "Loading advisor comparison",
    body: el("p", { class: "muted" }, "Fetching public diligence evidence..."),
  });
}

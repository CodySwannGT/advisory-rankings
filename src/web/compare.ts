// Advisor comparison page.
// Renders the public AdvisorComparison resource as a side-by-side evidence
// table for shareable /compare?ids=... links.

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
  EmptyCard,
  ProfileHead,
  SectionCard,
  AsyncStateCard,
  Tag,
  SourceAttribution,
} from "./design-system/index.js";
import { runDelayedRouteRequest } from "./route-loading.js";
import { comparisonSections, firmName } from "./compare-sections.js";

/**
 *
 */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const EmptyCardComponent = EmptyCard as unknown as DesignSystemComponent;
const ProfileHeadComponent = ProfileHead as unknown as DesignSystemComponent;
const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const AsyncStateCardComponent =
  AsyncStateCard as unknown as DesignSystemComponent;
const TagComponent = Tag as unknown as DesignSystemComponent;
const SourceAttributionComponent =
  SourceAttribution as unknown as DesignSystemComponent;

const BROKERCHECK_SOURCE = "FINRA BrokerCheck";
const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";
const BROKERCHECK_SECTION_LABELS = new Set(["Regulatory", "Career"]);

/**
 *
 */
interface PageColumns {
  readonly center: HTMLElement;
}

/**
 *
 */
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
        request: () => api<AdvisorComparisonPayload>(comparisonPath()),
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
 * Builds the AdvisorComparison resource path from the current URL.
 * @returns Resource URL with normalized ids query when available.
 */
function comparisonPath(): string {
  const params = new URLSearchParams(location.search);
  const ids = params.get("ids") ?? repeatedIds(params).join(",");
  const qs = new URLSearchParams();
  if (ids) qs.set("ids", ids);
  return qs.size ? `/AdvisorComparison?${qs.toString()}` : "/AdvisorComparison";
}

/**
 * Reads repeated id params from a URLSearchParams bag.
 * @param params - Current location params.
 * @returns Repeated id values.
 */
function repeatedIds(params: URLSearchParams): readonly string[] {
  return params
    .getAll("id")
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Renders the comparison page payload.
 * @param center - Full-width page root.
 * @param payload - AdvisorComparison response.
 */
function renderComparison(
  center: HTMLElement,
  payload: AdvisorComparisonPayload
): void {
  clear(center);

  if (!payload.items.length) {
    center.appendChild(
      EmptyCardComponent({
        title: "Choose advisors to compare",
        body: "Add two to four advisor ids to the URL with ?ids=advisor-a,advisor-b.",
      })
    );
    return;
  }

  center.append(
    comparisonHero(payload),
    selectionNotice(payload),
    SectionCardComponent({
      title: "Due diligence evidence",
      body: comparisonTable(payload.items),
      attrs: { class: "comparison-card" },
    })
  );
}

/**
 * Builds the comparison page hero from selected advisors.
 * @param payload - AdvisorComparison response.
 * @returns Hero profile head.
 */
function comparisonHero(payload: AdvisorComparisonPayload): HTMLElement {
  const found = payload.items.filter(item => item.status === "found");
  const names = found.map(item => item.displayName).join(" vs ");
  return ProfileHeadComponent({
    initialsText: initials(names || PAGE_TITLE),
    title: PAGE_TITLE,
    subtitle: names || "Public diligence evidence",
    tags: [
      { label: `${payload.items.length} selected` },
      { label: `Generated ${fmtDate(payload.generatedAt, { mode: "short" })}` },
    ],
  });
}

/**
 * Renders selection status details when the request needed normalization.
 * @param payload - AdvisorComparison response.
 * @returns Status notice.
 */
function selectionNotice(payload: AdvisorComparisonPayload): HTMLElement {
  const { selection } = payload;
  const details = [
    selection.status === "under_limit"
      ? `Add at least ${selection.min} advisors for a complete comparison.`
      : null,
    selection.truncated
      ? `Showing the first ${selection.max} advisors from this URL.`
      : null,
    selection.duplicateIds.length
      ? `Duplicate ids ignored: ${selection.duplicateIds.join(", ")}.`
      : null,
    selection.missingIds.length
      ? `Missing ids: ${selection.missingIds.join(", ")}.`
      : null,
  ].filter(Boolean);

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
 * @returns Scrollable comparison table wrapper.
 */
function comparisonTable(items: readonly AdvisorComparisonItem[]): HTMLElement {
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
          ...items.map(item =>
            el(
              "th",
              { scope: "col" },
              el("span", { class: "comparison-name" }, item.displayName),
              el("span", { class: "comparison-firm" }, firmName(item))
            )
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
              el("td", {}, comparisonCell(section.label, items[index], value))
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

import type {
  AdvisorComparisonItem,
  AdvisorComparisonPayload,
} from "../types/advisor-comparison.js";
import { api, fmtDate, humanize, logout, refreshMe, search } from "./app.js";
import { comparisonSections, firmName } from "./compare-sections.js";
import {
  advisorComparisonPathFromLocation,
  comparisonSelectionDetails,
} from "./compare-selection.js";
import {
  AsyncStateCard,
  SectionCard,
  Tag,
  clear,
  el,
  mountFullWidthPage,
} from "./design-system/index.js";
import { runDelayedRouteRequest } from "./route-loading.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const AsyncStateCardComponent = AsyncStateCard as unknown as Component;
const SectionCardComponent = SectionCard as unknown as Component;
const TagComponent = Tag as unknown as Component;

/** Full-width page columns supplied by the design-system shell. */
interface PageColumns {
  readonly center: HTMLElement;
}

const PAGE_TITLE = "Report packet";

mountFullWidthPage({
  active: "advisors",
  refreshMe,
  logout,
  search,
  pageTitle: PAGE_TITLE,
  build({ center }: PageColumns): void {
    const loadPacket = (): void => {
      clear(center);
      center.appendChild(loadingCard());

      runDelayedRouteRequest({
        container: center,
        title: "Loading packet",
        body: "Still fetching advisor comparison data. Retry if this takes longer than expected.",
        onRetry: loadPacket,
        request: () =>
          api<AdvisorComparisonPayload>(advisorComparisonPathFromLocation()),
        onSuccess: payload => renderPacket(center, payload),
        onError: error => {
          console.error("Report packet route failed to load", error);
          clear(center);
          center.appendChild(
            AsyncStateCardComponent({
              kind: "error",
              title: "Could not load report packet",
              body: "Retry the request or choose a fresh advisor selection.",
              actionLabel: "Retry",
              onAction: loadPacket,
            })
          );
        },
      });
    };

    loadPacket();
  },
});

/**
 * Renders the report packet route payload.
 * @param center - Full-width page root.
 * @param payload - AdvisorComparison response.
 */
function renderPacket(
  center: HTMLElement,
  payload: AdvisorComparisonPayload
): void {
  clear(center);
  center.append(packetHero(payload), packetSummary(payload));
}

/**
 * Builds the packet page hero.
 * @param payload - AdvisorComparison response.
 * @returns Hero profile head.
 */
function packetHero(payload: AdvisorComparisonPayload): HTMLElement {
  const names = payload.items
    .filter(item => item.status === "found")
    .map(item => item.displayName)
    .join(" vs ");
  return el(
    "section",
    { class: "report-packet-hero" },
    el("h2", {}, names || "Public comparison packet"),
    el(
      "div",
      { class: "profile-meta" },
      TagComponent({ children: `${payload.items.length} selected` }),
      TagComponent({
        children: `Generated ${fmtDate(payload.generatedAt, { mode: "short" })}`,
      })
    )
  );
}

/**
 * Builds the public packet summary and caveat surface.
 * @param payload - AdvisorComparison response.
 * @returns Summary card.
 */
function packetSummary(payload: AdvisorComparisonPayload): HTMLElement {
  const sections = comparisonSections(payload.items);
  return SectionCardComponent({
    title: "Packet summary",
    attrs: { class: "report-packet-summary" },
    body: [
      selectionStatus(payload),
      el(
        "dl",
        { class: "report-packet-metadata" },
        metadataRow(
          "Generated",
          fmtDate(payload.generatedAt, { mode: "long" })
        ),
        metadataRow(
          "Selection",
          humanize(payload.selection.status) || payload.selection.status
        ),
        metadataRow("Requested ids", payload.selection.requestedIds.join(", "))
      ),
      el(
        "div",
        { class: "report-packet-advisors" },
        ...payload.items.map((item, index) =>
          packetAdvisor(item, sections, index)
        )
      ),
    ],
  });
}

/**
 * Builds the route-level selection status block.
 * @param payload - AdvisorComparison response.
 * @returns Selection status element.
 */
function selectionStatus(payload: AdvisorComparisonPayload): HTMLElement {
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
      : el("p", {}, "Ready for packet review.")
  );
}

/**
 * Builds one advisor summary row for the packet shell.
 * @param item - Compared advisor item.
 * @param sections - Shared comparison evidence sections.
 * @param index - Advisor index into each evidence section.
 * @returns Advisor summary card.
 */
function packetAdvisor(
  item: AdvisorComparisonItem,
  sections: ReturnType<typeof comparisonSections>,
  index: number
): HTMLElement {
  return el(
    "article",
    {
      class: "report-packet-advisor",
      "data-advisor-id": item.id,
      "data-status": item.status,
    },
    el("h3", {}, item.displayName),
    el(
      "p",
      { class: "report-packet-advisor-subtitle" },
      item.status === "found" ? firmName(item) : "Advisor not found"
    ),
    el(
      "dl",
      { class: "report-packet-evidence" },
      ...sections.map(section =>
        packetEvidenceRow(
          section.label,
          section.values[index] || missingEvidence(section.label)
        )
      )
    ),
    packetAttribution(item)
  );
}

/**
 * Builds one public evidence definition row.
 * @param label - Evidence section label.
 * @param value - Evidence summary.
 * @returns Definition row.
 */
function packetEvidenceRow(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "report-packet-evidence-row" },
    el("dt", {}, label),
    el("dd", {}, value || missingEvidence(label))
  );
}

/**
 * Builds a compact public attribution block for one advisor.
 * @param item - Compared advisor item.
 * @returns Attribution block.
 */
function packetAttribution(item: AdvisorComparisonItem): HTMLElement {
  const brokerCheck = item.attribution.brokerCheck;
  const brokerCheckText = brokerCheck
    ? `BrokerCheck snapshot loaded ${fmtDate(brokerCheck.fetchedAt, { mode: "short" })}`
    : "No BrokerCheck snapshot loaded for this advisor.";
  const articleText = item.attribution.articles.length
    ? `${item.attribution.articles.length} article reference${item.attribution.articles.length === 1 ? "" : "s"}`
    : "No article references loaded.";
  const assertionText = item.attribution.assertions.length
    ? `${item.attribution.assertions.length} field assertion${item.attribution.assertions.length === 1 ? "" : "s"}`
    : "No source-backed field assertions loaded.";
  const researchText = item.attribution.researchSources.length
    ? `${item.attribution.researchSources.length} research source check${item.attribution.researchSources.length === 1 ? "" : "s"}`
    : "No research source checks loaded.";

  return el(
    "section",
    { class: "report-packet-attribution" },
    el("h4", {}, "Attribution"),
    el(
      "ul",
      {},
      el("li", {}, brokerCheckText),
      el("li", {}, articleText),
      el("li", {}, assertionText),
      el("li", {}, researchText)
    )
  );
}

/**
 * Neutral missing-state copy for report packet evidence rows.
 * @param label - Evidence section label.
 * @returns Missing-state copy.
 */
function missingEvidence(label: string): string {
  return `No ${label.toLowerCase()} evidence available.`;
}

/**
 * Builds one metadata definition row.
 * @param label - Metadata label.
 * @param value - Metadata value.
 * @returns Definition list nodes wrapped in a fragment-like span.
 */
function metadataRow(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "report-packet-metadata-row" },
    el("dt", {}, label),
    el("dd", {}, value || "None")
  );
}

/**
 * Loading card for the packet route.
 * @returns Loading section.
 */
function loadingCard(): HTMLElement {
  return SectionCardComponent({
    title: "Loading report packet",
    body: el("p", { class: "muted" }, "Fetching public comparison data..."),
  });
}

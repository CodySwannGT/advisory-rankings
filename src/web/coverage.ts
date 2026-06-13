import { api, refreshMe, logout, search, fmtDate } from "./app.js";
import {
  mountThreeColumnPage,
  SectionCard,
  EmptyCard,
  SkeletonCard,
  DetailsCard,
  Tag,
  el,
  clear,
} from "./design-system/index.js";
import { showDelayedRouteLoadingFeedback } from "./route-loading.js";
import type {
  DataCoverageMetric,
  DataCoverageResponse,
  DataCoverageSection,
} from "../harper/resource-data-coverage.js";

/**
 *
 */
interface CoverageDestination {
  readonly href: string;
  readonly label: string;
  readonly body: string;
}

/** Fields stored for the active coverage request generation. */
interface CoverageRequestFields {
  readonly requestId: number;
  readonly stopLoadingFeedback: (() => void) | null;
}

/** Mutable request-generation holder for coverage dashboard loads. */
class CoverageRequestState {
  readonly #fields = new Map<
    keyof CoverageRequestFields,
    CoverageRequestFields[keyof CoverageRequestFields]
  >([
    ["requestId", 0],
    ["stopLoadingFeedback", null],
  ]);

  /**
   * Starts the next request generation and clears stale loading feedback.
   * @returns The next request id.
   */
  nextRequestId(): number {
    this.stopLoadingFeedback();
    const requestId = this.get("requestId") + 1;
    this.set("requestId", requestId);
    return requestId;
  }

  /**
   * Records loading feedback cleanup for the latest request.
   * @param stopLoadingFeedback - Cleanup function for delayed feedback.
   */
  setLoadingFeedback(stopLoadingFeedback: () => void): void {
    this.set("stopLoadingFeedback", stopLoadingFeedback);
  }

  /**
   * Checks whether a request still owns the dashboard.
   * @param requestId - Request id captured when the request started.
   * @returns True when the request can update the DOM.
   */
  isCurrent(requestId: number): boolean {
    return requestId === this.get("requestId");
  }

  /**
   * Clears loading feedback for the current request.
   */
  stopLoadingFeedback(): void {
    this.get("stopLoadingFeedback")?.();
    this.set("stopLoadingFeedback", null);
  }

  /**
   * Reads a typed request-state field.
   * @param key - Field name.
   * @returns Stored field value.
   */
  private get<K extends keyof CoverageRequestFields>(
    key: K
  ): CoverageRequestFields[K] {
    return this.#fields.get(key) as CoverageRequestFields[K];
  }

  /**
   * Writes a typed request-state field.
   * @param key - Field name.
   * @param value - New field value.
   */
  private set<K extends keyof CoverageRequestFields>(
    key: K,
    value: CoverageRequestFields[K]
  ): void {
    this.#fields.set(key, value);
  }
}

const SECTION_DESTINATIONS: Readonly<Record<string, CoverageDestination>> = {
  "public-entity-groups": {
    href: "/advisors",
    label: "Browse public advisors",
    body: "Entity counts come from public directory resources.",
  },
  rankings: {
    href: "/rankings?resolved=unresolved",
    label: "Open rankings",
    body: "Ranking gaps open on the public rankings browser slice for profiles still needing a match.",
  },
  "branch-coverage": {
    href: "/branches",
    label: "Open branches",
    body: "Branch coverage opens on the public branch explorer, where partial advisor linkage is labeled separately from no offices.",
  },
  recruiting: {
    href: "/recruiting",
    label: "Open recruiting",
    body: "Recruiting coverage opens on the public market map.",
  },
  "research-freshness": {
    href: "/research/freshness?sourceType=web_research&staleDays=30&status=&missingField=&limit=25",
    label: "Open research queue",
    body: "Freshness pressure opens on the public web-research queue for advisor checks due within the default window.",
  },
};

const coverageRequestState = new CoverageRequestState();

mountThreeColumnPage({
  active: "coverage",
  refreshMe,
  logout,
  search,
  pageTitle: "Data coverage",
  build({ center, right }) {
    center.append(SkeletonCard(), SkeletonCard());
    loadCoverage(center, right);
  },
});

/**
 * Loads public data coverage and renders the dashboard.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function loadCoverage(center: HTMLElement, right: HTMLElement): void {
  const requestId = coverageRequestState.nextRequestId();
  const stopLoadingFeedback = showDelayedRouteLoadingFeedback({
    container: center,
    title: "Loading coverage",
    body: "Still fetching public data-depth rollups. Retry if this takes longer than expected.",
    onRetry: () => loadCoverage(center, right),
  });
  coverageRequestState.setLoadingFeedback(stopLoadingFeedback);
  api<DataCoverageResponse>("/DataCoverage")
    .then(data => {
      if (!finishCurrentCoverageRequest(requestId)) return;
      clear(center);
      clear(right);
      renderCoverage(data, center, right);
    })
    .catch((error: unknown) => {
      if (!finishCurrentCoverageRequest(requestId)) return;
      clear(center);
      center.appendChild(
        EmptyCard({
          title: "Could not load coverage",
          body: errorMessage(error),
        })
      );
    });
}

/**
 * Completes the latest coverage request and ignores stale retry completions.
 * @param requestId - Request id captured when the request started.
 * @returns True when the request is still current.
 */
function finishCurrentCoverageRequest(requestId: number): boolean {
  if (!coverageRequestState.isCurrent(requestId)) return false;
  coverageRequestState.stopLoadingFeedback();
  return true;
}

/**
 * Renders the full dashboard payload.
 * @param data - Public data coverage response.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function renderCoverage(
  data: DataCoverageResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  center.appendChild(headerCard(data));
  center.append(...data.sections.map(sectionCard));
  right.appendChild(provenanceCard(data));
  right.appendChild(limitationsCard(data));
}

/**
 * Builds the dashboard summary card.
 * @param data - Public data coverage response.
 * @returns Header section card.
 */
function headerCard(data: DataCoverageResponse): HTMLElement {
  return SectionCard({
    title: "Public data coverage",
    attrs: { class: "coverage-header" },
    body: [
      el(
        "p",
        { class: "coverage-lede" },
        "Public rollups for the AdvisorBook surfaces visitors can inspect without signing in."
      ),
      el(
        "div",
        { class: "coverage-stat-grid" },
        coverageStat("Sections", String(data.sections.length)),
        coverageStat("Metrics", String(metricCount(data))),
        coverageStat("Limitations", String(data.limitations.length)),
        coverageStat("Generated", fmtDate(data.generatedAt))
      ),
    ],
  });
}

/**
 * Builds one coverage section card.
 * @param section - Coverage section.
 * @returns Section card element.
 */
function sectionCard(section: DataCoverageSection): HTMLElement {
  const destination = SECTION_DESTINATIONS[section.id];
  return SectionCard({
    title: section.label,
    attrs: { class: "coverage-section", "data-coverage-section": section.id },
    body: [
      destination ? destinationCopy(destination) : null,
      el(
        "div",
        { class: "coverage-metric-grid" },
        ...section.metrics.map(metricCard)
      ),
    ],
  });
}

/**
 * Builds one metric card.
 * @param metric - Coverage metric.
 * @returns Metric article element.
 */
function metricCard(metric: DataCoverageMetric): HTMLElement {
  const limited = Boolean(metric.limitation);
  return el(
    "article",
    {
      class: limited
        ? "coverage-metric coverage-metric--limited"
        : "coverage-metric",
      "data-coverage-metric": metric.id,
    },
    el("span", { class: "coverage-metric-label" }, metric.label),
    el("strong", { class: "coverage-metric-value" }, metricValue(metric.value)),
    el("span", { class: "coverage-metric-source" }, metric.source),
    metric.publicResource
      ? el("span", { class: "coverage-metric-resource" }, metric.publicResource)
      : null,
    metric.limitation
      ? el("p", { class: "coverage-metric-limitation" }, metric.limitation)
      : null
  );
}

/**
 * Builds source and resource provenance details.
 * @param data - Public data coverage response.
 * @returns Right-rail provenance card.
 */
function provenanceCard(data: DataCoverageResponse): HTMLElement {
  return SectionCard({
    title: "Coverage sources",
    body: [
      DetailsCard({
        title: "Public resources",
        pairs: data.provenance.publicResources.map(resource => [
          resource,
          resourceLabel(resource),
        ]),
      }),
      el(
        "div",
        { class: "coverage-tag-list" },
        ...data.provenance.sourceTables.map(source =>
          Tag({ children: source, kind: "neutral" })
        )
      ),
    ],
  });
}

/**
 * Builds the limitations rail card.
 * @param data - Public data coverage response.
 * @returns Right-rail limitations card.
 */
function limitationsCard(data: DataCoverageResponse): HTMLElement {
  const limitations = uniqueStrings(data.limitations);
  if (limitations.length === 0) {
    return SectionCard({
      title: "Coverage caveats",
      body: "No source limitations were reported for this coverage snapshot.",
    });
  }
  return SectionCard({
    title: "Coverage caveats",
    attrs: { class: "coverage-limitations" },
    body: el(
      "ul",
      { class: "coverage-limitation-list" },
      ...limitations.map(item => el("li", {}, item))
    ),
  });
}

/**
 * Builds destination copy and link for a coverage section.
 * @param destination - Public destination metadata.
 * @returns Destination block.
 */
function destinationCopy(destination: CoverageDestination): HTMLElement {
  return el(
    "div",
    { class: "coverage-destination" },
    el("p", {}, destination.body),
    el("a", { href: destination.href }, destination.label)
  );
}

/**
 * Builds one top-level stat.
 * @param label - Stat label.
 * @param value - Stat value.
 * @returns Stat element.
 */
function coverageStat(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "coverage-stat" },
    el("span", { class: "coverage-stat-label" }, label),
    el("strong", {}, value)
  );
}

/**
 * Counts all metrics in the response.
 * @param data - Public data coverage response.
 * @returns Total metric count.
 */
function metricCount(data: DataCoverageResponse): number {
  return data.sections.reduce(
    (sum, section) => sum + section.metrics.length,
    0
  );
}

/**
 * Formats metric values for dashboard display.
 * @param value - Metric value.
 * @returns Printable metric value.
 */
function metricValue(value: DataCoverageMetric["value"]): string {
  if (value == null) return "Unavailable";
  if (typeof value === "number") return value.toLocaleString();
  if (/^\d{4}-\d{2}-\d{2}T/u.test(value)) return fmtDate(value);
  return value;
}

/**
 * Returns a concise label for known public resources.
 * @param resource - Resource path.
 * @returns Human-facing resource label.
 */
function resourceLabel(resource: string): string {
  if (resource === "/RankingsExplorer") return "Rankings";
  if (resource === "/RecruitingMarket") return "Recruiting";
  if (resource === "/PublicBranches") return "Branch explorer";
  if (resource === "/AdvisorResearchQueue") return "Research freshness";
  if (resource === "/Feed") return "Home feed";
  if (resource === "/Search") return "Global search";
  return "Public directory";
}

/**
 * Deduplicates display strings while preserving order.
 * @param values - Candidate strings.
 * @returns Unique strings.
 */
function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

/**
 * Extracts a printable message from an unknown error.
 * @param error - Caught error.
 * @returns Human-readable error.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

import type { WatchlistItem } from "../harper/resource-recruiting-watchlist.js";
import type { RecruitingMarketResponse } from "../harper/resource-recruiting-market-types.js";
import { api, fmtDate, logout, refreshMe, search } from "./app.js";
import {
  AsyncStateCard,
  SectionCard,
  Tag,
  clear,
  el,
  mountFullWidthPage,
} from "./design-system/index.js";
import { buildRecruitingResourceQuery } from "./recruiting-query.js";
import {
  fmtNumber,
  netValue,
  statusTag,
  summaryValue,
} from "./recruiting-section-cells.js";
import { runDelayedRouteRequest } from "./route-loading.js";

/** Design-system component signature normalized for this route module. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const AsyncStateCardComponent = AsyncStateCard as unknown as Component;
const SectionCardComponent = SectionCard as unknown as Component;
const TagComponent = Tag as unknown as Component;

/** Full-width page columns supplied by the design-system shell. */
interface PageColumns {
  readonly center: HTMLElement;
}

const DEFAULT_LIMIT = 30;
const PAGE_TITLE = "Recruiting Shortlist Brief";

mountFullWidthPage({
  active: "recruiting",
  refreshMe,
  logout,
  search,
  pageTitle: PAGE_TITLE,
  build({ center }: PageColumns): void {
    const loadBrief = (): void => {
      clear(center);
      center.appendChild(loadingCard());
      runDelayedRouteRequest({
        container: center,
        title: "Loading shortlist brief",
        body: "Still fetching public recruiting evidence. Retry if this takes longer than expected.",
        onRetry: loadBrief,
        request: () =>
          api<RecruitingMarketResponse>(
            `/RecruitingMarket${buildRecruitingResourceQuery(location.search, DEFAULT_LIMIT)}`
          ),
        onSuccess: payload => renderBrief(center, payload),
        onError: () => {
          clear(center);
          center.appendChild(
            AsyncStateCardComponent({
              kind: "error",
              title: "Could not load shortlist brief",
              body: "Retry the request or open the Recruiting Market Map with the same firm filters.",
              actionLabel: "Retry",
              onAction: loadBrief,
            })
          );
        },
      });
    };
    loadBrief();
  },
});

/**
 * Renders the shortlist packet from the public RecruitingMarket payload.
 * @param center - Full-width page container.
 * @param payload - RecruitingMarket response.
 */
function renderBrief(
  center: HTMLElement,
  payload: RecruitingMarketResponse
): void {
  clear(center);
  center.append(briefHero(payload), summaryCard(payload), firmsCard(payload));
}

/**
 * Builds the route-level packet header.
 * @param payload - RecruitingMarket response.
 * @returns Header node.
 */
function briefHero(payload: RecruitingMarketResponse): HTMLElement {
  const queries = payload.filters.watchlistFirmQueries;
  return el(
    "section",
    { class: "shortlist-brief-hero" },
    el("h2", {}, queries.length ? queries.join(" / ") : "No firms selected"),
    el(
      "div",
      { class: "profile-meta" },
      TagComponent({ children: `${queries.length} firm queries` }),
      TagComponent({
        children: `Generated ${fmtDate(payload.generatedAt, { mode: "short" })}`,
      }),
      TagComponent({ children: "Public data only" })
    )
  );
}

/**
 * Builds aggregate summary and replay actions.
 * @param payload - RecruitingMarket response.
 * @returns Summary card.
 */
function summaryCard(payload: RecruitingMarketResponse): HTMLElement {
  return SectionCardComponent({
    title: "Brief summary",
    attrs: { class: "shortlist-brief-summary" },
    body: [
      el(
        "div",
        { class: "watchlist-summary" },
        metricBlock(
          "Inbound",
          summaryValue(payload.watchlist?.summary.inbound)
        ),
        metricBlock(
          "Outbound",
          summaryValue(payload.watchlist?.summary.outbound)
        ),
        metricBlock(
          "Net",
          netValue(
            payload.watchlist?.summary.netKnownAum ?? 0,
            payload.watchlist?.summary.netMoveCount ?? 0
          )
        )
      ),
      el(
        "p",
        { class: "shortlist-brief-note" },
        "This brief replays public recruiting, branch, firm profile, and coverage evidence. It excludes private watchlists, ratings, correction internals, analyst discrepancy rows, and reviewer notes."
      ),
      linkList([
        ["Open Recruiting Market Map", `/recruiting${location.search}`],
        ["Open Data Coverage", "/coverage"],
        [
          "RecruitingMarket JSON",
          `/RecruitingMarket${buildRecruitingResourceQuery(location.search, DEFAULT_LIMIT)}`,
        ],
      ]),
    ],
  });
}

/**
 * Builds firm-level sections for each selected query.
 * @param payload - RecruitingMarket response.
 * @returns Firm sections card.
 */
function firmsCard(payload: RecruitingMarketResponse): HTMLElement {
  const items = payload.watchlist?.items ?? [];
  return SectionCardComponent({
    title: "Selected firms",
    attrs: { class: "shortlist-brief-firms" },
    body: items.length
      ? el("div", { class: "shortlist-firm-list" }, ...items.map(shortlistFirm))
      : el(
          "p",
          { class: "shortlist-brief-note" },
          "Add repeated firm query parameters to create a replayable shortlist brief."
        ),
  });
}

/**
 * Builds one firm/query section.
 * @param item - Public watchlist item.
 * @returns Firm section.
 */
function shortlistFirm(item: WatchlistItem): HTMLElement {
  return el(
    "article",
    { class: "shortlist-firm" },
    el(
      "header",
      { class: "shortlist-firm-header" },
      el(
        "div",
        { class: "shortlist-firm-title" },
        el("h3", {}, firmName(item)),
        el("p", {}, `Query: ${item.query}`)
      ),
      el("div", { class: "tag-list" }, ...item.sourceStatus.map(statusTag))
    ),
    el(
      "div",
      { class: "watchlist-metrics" },
      metricBlock("Inbound", summaryValue(item.inbound)),
      metricBlock("Outbound", summaryValue(item.outbound)),
      metricBlock("Net", netValue(item.netKnownAum, item.netMoveCount))
    ),
    coverageGrid(item),
    evidenceLinks(item)
  );
}

/**
 * Builds public branch/source coverage metrics for one firm.
 * @param item - Public watchlist item.
 * @returns Coverage node.
 */
function coverageGrid(item: WatchlistItem): HTMLElement {
  return el(
    "div",
    { class: "shortlist-coverage-grid" },
    coverageMetric("Moves", fmtNumber(item.sourceCoverage.moveCount)),
    coverageMetric(
      "Source-backed",
      `${fmtNumber(item.sourceCoverage.sourceBackedCount)} / ${fmtNumber(item.sourceCoverage.moveCount)}`
    ),
    coverageMetric("Branches", nullableCount(item.branchCoverage.branchCount)),
    coverageMetric(
      "Current advisors",
      nullableCount(item.branchCoverage.currentAdvisorCount)
    ),
    coverageMetric(
      "Missing fields",
      `${fmtNumber(item.inbound.unknownAumCount + item.outbound.unknownAumCount)} AUM, ${fmtNumber(item.inbound.missingT12Count + item.outbound.missingT12Count)} T12`
    ),
    el(
      "p",
      { class: "shortlist-coverage-limitation" },
      item.branchCoverage.limitation
    )
  );
}

/**
 * Builds public evidence links for one firm.
 * @param item - Public watchlist item.
 * @returns Link list.
 */
function evidenceLinks(item: WatchlistItem): HTMLElement {
  const links: ReadonlyArray<readonly [string, string | null]> = [
    ["Recruiting replay", item.evidenceLinks.recruiting],
    ["Firm profile", item.evidenceLinks.firmProfile],
    ["Branch explorer", item.evidenceLinks.branchExplorer],
    ["Data coverage", item.evidenceLinks.dataCoverage],
    ["Recruiting resource", item.evidenceLinks.recruitingResource],
    ["Public branches resource", item.evidenceLinks.publicBranchesResource],
  ];
  return linkList(
    links.filter((link): link is readonly [string, string] => Boolean(link[1]))
  );
}

/**
 * Builds a metric tile.
 * @param label - Metric label.
 * @param value - Metric body.
 * @returns Metric node.
 */
function metricBlock(label: string, value: Node): HTMLElement {
  return el(
    "div",
    { class: "watchlist-metric" },
    el("span", { class: "watchlist-metric-label" }, label),
    value
  );
}

/**
 * Builds a compact coverage metric.
 * @param label - Metric label.
 * @param value - Display value.
 * @returns Metric node.
 */
function coverageMetric(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "shortlist-coverage-metric" },
    el("span", {}, label),
    el("strong", {}, value)
  );
}

/**
 * Builds a wrapping public-link list.
 * @param links - Link labels and hrefs.
 * @returns Link list node.
 */
function linkList(
  links: ReadonlyArray<readonly [string, string]>
): HTMLElement {
  return el(
    "div",
    { class: "shortlist-link-list" },
    ...links.map(([label, href]) => el("a", { href }, label))
  );
}

/**
 * Returns the public firm display name.
 * @param item - Public watchlist item.
 * @returns Firm or unresolved label.
 */
function firmName(item: WatchlistItem): string {
  if (!item.firm) return `Unresolved: ${item.query}`;
  const short = "short" in item.firm ? item.firm.short : undefined;
  return short || item.firm.name || `Unresolved: ${item.query}`;
}

/**
 * Formats nullable counts without implying zero when coverage is unknown.
 * @param value - Nullable count.
 * @returns Display value.
 */
function nullableCount(value: number | null): string {
  return value == null ? "Unknown" : fmtNumber(value);
}

/**
 * Builds the initial route loading card.
 * @returns Loading state.
 */
function loadingCard(): HTMLElement {
  return SectionCardComponent({
    title: "Loading shortlist brief",
    body: "Fetching public recruiting evidence for the selected firms.",
  });
}

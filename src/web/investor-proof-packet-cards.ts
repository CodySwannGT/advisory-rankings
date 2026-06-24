import { fmtDate } from "./app.js";
import {
  SectionCard,
  DetailsCard,
  Tag,
  el,
  clear,
} from "./design-system/index.js";
import {
  metricSourceText,
  publicResourceLabel,
  sourceTableLabel,
} from "./investor-proof-packet-labels.js";
import type {
  InvestorProofLink,
  InvestorProofPacketResponse,
} from "../harper/resource-investor-proof-packet.js";
import type { DataCoverageMetric } from "../harper/resource-data-coverage.js";

const PACKET_RESOURCE = "/InvestorProofPacket";
const BLOCKED_PRIVATE_ROUTES: readonly string[] = [
  "/UserWatchlists",
  "/UserRating",
  "/AdvisorCorrectionRequest",
  "/User/",
];
const UNSUPPORTED_CLAIMS: readonly string[] = [
  "No private watchlists, ratings, analyst notes, credentials, revenue, retention, customer pipeline, or source-rights conclusions are included.",
  "Unknown, missing, stale, and unavailable states stay visible instead of being converted into positive investor claims.",
];
const NUMBER_FORMAT = new Intl.NumberFormat();

/**
 * Renders the investor proof packet.
 * @param packet - Public packet payload.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
export function renderInvestorProofPacket(
  packet: InvestorProofPacketResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  clear(center);
  clear(right);
  center.appendChild(summaryCard(packet));
  center.appendChild(coverageCard(packet.coverage.keyMetrics));
  center.appendChild(freshnessCard(packet));
  center.appendChild(proofLinksCard(packet.proofLinks));
  right.appendChild(limitationsCard(packet));
  right.appendChild(provenanceCard(packet));
  right.appendChild(boundaryCard());
}

/**
 * Builds the packet summary.
 * @param packet - Public packet payload.
 * @returns Summary card.
 */
function summaryCard(packet: InvestorProofPacketResponse): HTMLElement {
  return SectionCard({
    title: "Public investor proof",
    attrs: { class: "investor-proof-header" },
    body: [
      el(
        "p",
        { class: "investor-proof-lede" },
        "A shareable public snapshot of AdvisorBook coverage, freshness pressure, source-backed replay links, and known limitations."
      ),
      el(
        "div",
        { class: "investor-proof-stat-grid" },
        stat("Generated", fmtDate(packet.generatedAt)),
        stat("Coverage metrics", String(packet.coverage.keyMetrics.length)),
        stat("Proof links", String(packet.proofLinks.length)),
        stat("Unavailable states", String(packet.unavailable.length))
      ),
    ],
  });
}

/**
 * Builds the public coverage metric section.
 * @param metrics - Key DataCoverage metrics.
 * @returns Coverage card.
 */
function coverageCard(metrics: readonly DataCoverageMetric[]): HTMLElement {
  return SectionCard({
    title: "Coverage metrics",
    attrs: { class: "investor-proof-coverage" },
    body:
      metrics.length === 0
        ? "Coverage metrics are unavailable."
        : el(
            "div",
            { class: "investor-proof-metric-grid" },
            ...metrics.map(metricCard)
          ),
  });
}

/**
 * Builds one coverage metric tile.
 * @param metric - Coverage metric.
 * @returns Metric tile.
 */
function metricCard(metric: DataCoverageMetric): HTMLElement {
  return el(
    "article",
    {
      class: metric.limitation
        ? "investor-proof-metric investor-proof-metric--limited"
        : "investor-proof-metric",
      "data-investor-proof-metric": metric.id,
    },
    el("span", { class: "investor-proof-metric-label" }, metric.label),
    el(
      "strong",
      { class: "investor-proof-metric-value" },
      metricValue(metric.value)
    ),
    el(
      "span",
      { class: "investor-proof-metric-source" },
      metricSourceText(metric)
    ),
    metric.limitation
      ? el("p", { class: "investor-proof-limitation" }, metric.limitation)
      : null
  );
}

/**
 * Builds the research freshness pressure section.
 * @param packet - Public packet payload.
 * @returns Freshness card.
 */
function freshnessCard(packet: InvestorProofPacketResponse): HTMLElement {
  return SectionCard({
    title: "Freshness pressure",
    attrs: { class: "investor-proof-freshness" },
    body: [
      el(
        "div",
        { class: "investor-proof-stat-grid" },
        stat("Due profiles", fmtNumber(packet.freshness.totalDue)),
        stat("Shown", fmtNumber(packet.freshness.returned)),
        stat(
          "Priority groups",
          fmtNumber(packet.freshness.priorityGroups.length)
        ),
        stat(
          "Advisor links",
          fmtNumber(packet.freshness.representativeAdvisors.length)
        )
      ),
      packet.freshness.priorityGroups.length > 0
        ? el(
            "div",
            { class: "investor-proof-tag-list" },
            ...packet.freshness.priorityGroups.map(group =>
              Tag({
                children: `${group.label}: ${fmtNumber(group.count)}`,
                kind: group.count > 0 ? "warn" : "neutral",
              })
            )
          )
        : null,
      packet.freshness.representativeAdvisors.length > 0
        ? el(
            "div",
            { class: "investor-proof-link-list" },
            ...packet.freshness.representativeAdvisors.map(advisorLink)
          )
        : null,
      packet.freshness.limitation
        ? el(
            "p",
            { class: "investor-proof-limitation" },
            packet.freshness.limitation
          )
        : null,
    ],
  });
}

/**
 * Builds a representative advisor proof link.
 * @param advisor - Public research queue advisor.
 * @returns Advisor link row.
 */
function advisorLink(
  advisor: InvestorProofPacketResponse["freshness"]["representativeAdvisors"][number]
): HTMLElement {
  return el(
    "a",
    { class: "investor-proof-link-row", href: advisor.profileUrl },
    el("strong", {}, advisor.advisorName),
    el("span", {}, advisor.firm?.name ?? "Firm unavailable"),
    el(
      "span",
      {},
      advisor.finraCrd ? `FINRA CRD ${advisor.finraCrd}` : "CRD unavailable"
    )
  );
}

/**
 * Builds the representative replay links section.
 * @param links - Public proof links.
 * @returns Proof link card.
 */
function proofLinksCard(links: readonly InvestorProofLink[]): HTMLElement {
  return SectionCard({
    title: "Replay links",
    attrs: { class: "investor-proof-links" },
    body: el(
      "div",
      { class: "investor-proof-link-list" },
      ...links.map(linkRow)
    ),
  });
}

/**
 * Builds one representative replay link row.
 * @param link - Public proof link.
 * @returns Link row.
 */
function linkRow(link: InvestorProofLink): HTMLElement {
  return el(
    "a",
    {
      class: link.limitation
        ? "investor-proof-link-row investor-proof-link-row--limited"
        : "investor-proof-link-row",
      href: link.url,
      "data-investor-proof-link": link.id,
    },
    el("strong", {}, link.label),
    el(
      "span",
      {},
      `${publicResourceLabel(link.publicResource)} backed by ${sourceTableLabel(link.sourceTable)}`
    ),
    el("span", {}, link.limitation ?? sourceIdsText(link.sourceIds))
  );
}

/**
 * Builds the limitation rail.
 * @param packet - Public packet payload.
 * @returns Limitations card.
 */
function limitationsCard(packet: InvestorProofPacketResponse): HTMLElement {
  return SectionCard({
    title: "Limitations",
    attrs: { class: "investor-proof-limitations" },
    body:
      packet.unavailable.length === 0
        ? "No unavailable states were reported for this packet."
        : el(
            "ul",
            { class: "investor-proof-limitation-list" },
            ...packet.unavailable.map(item => el("li", {}, item))
          ),
  });
}

/**
 * Builds the public provenance rail.
 * @param packet - Public packet payload.
 * @returns Provenance card.
 */
function provenanceCard(packet: InvestorProofPacketResponse): HTMLElement {
  return SectionCard({
    title: "Public resources",
    body: DetailsCard({
      title: "Packet inputs",
      pairs: [
        ["Packet resource", publicResourceLabel(PACKET_RESOURCE)],
        ["Generated", fmtDate(packet.generatedAt)],
        [
          "Resources",
          provenanceValue(
            packet.provenance.publicResources.map(publicResourceLabel)
          ),
        ],
        [
          "Source records",
          provenanceValue(packet.provenance.sourceTables.map(sourceTableLabel)),
        ],
      ],
    }),
  });
}

/**
 * Builds the private-data boundary rail.
 * @returns Boundary card.
 */
function boundaryCard(): HTMLElement {
  return SectionCard({
    title: "Boundary",
    attrs: { class: "investor-proof-boundary" },
    body: [
      el(
        "div",
        { class: "investor-proof-tag-list" },
        ...BLOCKED_PRIVATE_ROUTES.map(route =>
          Tag({ children: route, kind: "neutral" })
        )
      ),
      el(
        "ul",
        { class: "investor-proof-limitation-list" },
        ...UNSUPPORTED_CLAIMS.map(claim => el("li", {}, claim))
      ),
    ],
  });
}

/**
 * Builds one summary statistic.
 * @param label - Statistic label.
 * @param value - Display value.
 * @returns Stat tile.
 */
function stat(label: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "investor-proof-stat" },
    el("span", { class: "investor-proof-stat-label" }, label),
    el("strong", {}, value)
  );
}

/**
 * Formats DataCoverage metric values.
 * @param value - Metric value.
 * @returns Display value.
 */
function metricValue(value: DataCoverageMetric["value"]): string {
  if (typeof value === "number") return fmtNumber(value);
  if (value === null) return "Unavailable";
  if (isDateValue(value)) return fmtDate(value);
  return String(value);
}

/**
 * Formats integer count values.
 * @param value - Numeric count.
 * @returns Localized count label.
 */
function fmtNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

/**
 * Builds a wrapping value for long provenance lists.
 * @param values - Provenance values.
 * @returns Wrapped provenance span.
 */
function provenanceValue(values: readonly string[]): HTMLElement {
  return el(
    "span",
    { class: "investor-proof-provenance-value" },
    [...new Set(values)].join(", ")
  );
}

/**
 * Detects ISO-like date strings for compact metric display.
 * @param value - Metric value.
 * @returns True when the value can be rendered as a date.
 */
function isDateValue(value: DataCoverageMetric["value"]): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

/**
 * Formats source id provenance.
 * @param sourceIds - Source ids from the packet payload.
 * @returns Display copy.
 */
function sourceIdsText(sourceIds: readonly string[]): string {
  return sourceIds.length === 0
    ? "Opens a live public page"
    : `${fmtNumber(sourceIds.length)} source-backed record${sourceIds.length === 1 ? "" : "s"}`;
}

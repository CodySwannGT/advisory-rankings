import { api, refreshMe, logout, search, humanize, fmtDate } from "./app.js";
import {
  mountThreeColumnPage,
  SectionCard,
  AsyncStateCard,
  DetailsCard,
  Tag,
  el,
  clear,
} from "./design-system/index.js";
import type { RegulatoryDiscrepancyQueueResponse } from "../harper/resource-regulatory-discrepancy-queue.js";

const NOT_LINKED = "Not linked";

/** One rendered queue item from the discrepancy queue resource. */
type QueueItem = RegulatoryDiscrepancyQueueResponse["items"][number];

mountThreeColumnPage({
  active: "regulatory",
  refreshMe,
  logout,
  search,
  pageTitle: "Regulatory discrepancy queue",
  build({ center, right }) {
    loadQueue(center, right);
  },
});

/**
 * Loads the queue resource and renders its current state.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function loadQueue(center: HTMLElement, right: HTMLElement): void {
  clear(center);
  clear(right);
  center.appendChild(
    SectionCard({
      title: "Loading discrepancy queue",
      body: "Fetching open regulatory discrepancies.",
    })
  );
  api<RegulatoryDiscrepancyQueueResponse>("/RegulatoryDiscrepancyQueue")
    .then(payload => renderQueue(payload, center, right))
    .catch((error: unknown) => renderError(error, center, right));
}

/**
 * Renders either the signed-out state or the authenticated queue.
 * @param payload - Queue resource payload.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function renderQueue(
  payload: RegulatoryDiscrepancyQueueResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  clear(center);
  clear(right);
  if (!payload.authenticated) {
    center.appendChild(
      AsyncStateCard({
        kind: "permission",
        title: "Sign in to review discrepancies",
        body: "Only authenticated analyst sessions can view source conflict details.",
        actionLabel: "Sign in",
        onAction: () => {
          location.href = "/login.html";
        },
      })
    );
    return;
  }
  center.appendChild(summaryCard(payload));
  center.append(...payload.items.map(discrepancyCard));
  right.appendChild(severityCard(payload));
  right.appendChild(actionsCard(payload));
}

/**
 * Builds the top summary card.
 * @param payload - Queue resource payload.
 * @returns Summary card.
 */
function summaryCard(payload: RegulatoryDiscrepancyQueueResponse): HTMLElement {
  return SectionCard({
    title: "Open source conflicts",
    body: el(
      "div",
      { class: "metric-grid" },
      metric("Open", payload.summary.totalOpen),
      metric("High severity", payload.summary.highSeverity),
      metric("Last refreshed", fmtDate(payload.generatedAt))
    ),
  });
}

/**
 * Builds one discrepancy detail card.
 * @param item - Queue row to render.
 * @returns Discrepancy card.
 */
function discrepancyCard(item: QueueItem): HTMLElement {
  return SectionCard({
    title: item.advisorName,
    attrs: { class: "regulatory-discrepancy-card" },
    body: [
      el(
        "div",
        { class: "chip-row" },
        Tag({ children: humanize(item.severity), kind: "danger" }),
        Tag({ children: humanize(item.status) }),
        item.firmName ? Tag({ children: item.firmName }) : null
      ),
      DetailsCard({
        title: "Compared values",
        pairs: [
          ["Field", humanize(item.fieldName)],
          [item.advisorHub.sourceName, item.advisorHub.value ?? "Missing"],
          [item.brokerCheck.sourceName, item.brokerCheck.value ?? "Missing"],
          ["Docket", item.event.docketNumber ?? NOT_LINKED],
          ["Regulator", item.event.regulator ?? NOT_LINKED],
        ],
      }),
      DetailsCard({
        title: "Provenance",
        pairs: [
          ["AdvisorHub ref", item.advisorHub.sourceRef ?? NOT_LINKED],
          ["BrokerCheck ref", item.brokerCheck.sourceRef ?? NOT_LINKED],
          ["Disclosure ids", item.event.disclosureIds.join(", ") || "None"],
          [
            "Disclosure status",
            item.event.disclosureStatuses.join(", ") || "None",
          ],
        ],
      }),
      actionList(item),
    ],
  });
}

/**
 * Builds the non-mutating list of review decisions.
 * @param item - Queue row to render actions for.
 * @returns Review actions block.
 */
function actionList(item: QueueItem): HTMLElement {
  return el(
    "div",
    { class: "details-card" },
    el("h3", { class: "card-subtitle" }, "Review actions"),
    el(
      "div",
      { class: "chip-row" },
      ...item.availableActions.map(action =>
        Tag({ children: humanize(action) })
      )
    )
  );
}

/**
 * Builds the severity summary rail card.
 * @param payload - Queue resource payload.
 * @returns Severity card.
 */
function severityCard(
  payload: RegulatoryDiscrepancyQueueResponse
): HTMLElement {
  return SectionCard({
    title: "Severity mix",
    body: Object.entries(payload.summary.severities).map(([severity, count]) =>
      el("p", {}, `${humanize(severity)}: ${count}`)
    ),
  });
}

/**
 * Builds the decision taxonomy rail card.
 * @param payload - Queue resource payload.
 * @returns Actions card.
 */
function actionsCard(payload: RegulatoryDiscrepancyQueueResponse): HTMLElement {
  const actions = [
    ...new Set(payload.items.flatMap(item => item.availableActions)),
  ];
  return SectionCard({
    title: "Available decisions",
    body: actions.length
      ? actions.map(action => el("p", {}, humanize(action)))
      : "No open decisions.",
  });
}

/**
 * Builds one metric cell.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric element.
 */
function metric(label: string, value: string | number): HTMLElement {
  return el(
    "div",
    { class: "metric" },
    el("span", { class: "metric-label" }, label),
    el("strong", {}, String(value))
  );
}

/**
 * Renders a recoverable load error.
 * @param error - Failed request.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function renderError(
  error: unknown,
  center: HTMLElement,
  right: HTMLElement
): void {
  console.error("Regulatory discrepancy queue failed to load", error);
  clear(center);
  clear(right);
  center.appendChild(
    AsyncStateCard({
      kind: "transient",
      title: "Could not load discrepancy queue",
      body: "Retry the request to refresh open source conflicts.",
      actionLabel: "Retry",
      onAction: () => loadQueue(center, right),
    })
  );
}

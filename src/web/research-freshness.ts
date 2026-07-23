import { api, refreshMe, logout, search, humanize, fmtDate } from "./app.js";
import {
  mountThreeColumnPage,
  SectionCard,
  AsyncStateCard,
  DetailsCard,
  Button,
  Tag,
  el,
  clear,
} from "./design-system/index.js";
import {
  filterControlsCard,
  queueResourcePath,
  readQueueFilters,
  writeQueueFilters,
} from "./research-freshness-filters.js";
import type { AdvisorResearchQueueResponse } from "../harper/resource-advisor-research-queue.js";

/** One rendered queue item from the AdvisorResearchQueue resource. */
type QueueItem = AdvisorResearchQueueResponse["items"][number];

const SOURCE_TABLE_LABELS: Readonly<Record<string, string>> = {
  AdvisorResearchCheck: "Source check",
};

const queuePopstate: Readonly<
  Record<"reload", (() => void) | null> & Record<"listenerInstalled", boolean>
> = { reload: null as (() => void) | null, listenerInstalled: false };

mountThreeColumnPage({
  active: "research",
  refreshMe,
  logout,
  search,
  pageTitle: "Research freshness queue",
  build({ center, right }) {
    installQueuePopstateReload(() => loadQueue(center, right));
    loadQueue(center, right);
  },
});

/**
 * Installs one history navigation reload callback for queue filters.
 * @param reloadQueue - Reloads the queue after browser history navigation.
 */
function installQueuePopstateReload(reloadQueue: () => void): void {
  Object.assign(queuePopstate, { reload: reloadQueue });
  if (queuePopstate.listenerInstalled) return;
  window.addEventListener("popstate", onQueuePopstate);
  Object.assign(queuePopstate, { listenerInstalled: true });
}

/** Reloads the research queue after browser history navigation. */
function onQueuePopstate(): void {
  queuePopstate.reload?.();
}

/**
 * Loads the public research freshness queue.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function loadQueue(center: HTMLElement, right: HTMLElement): void {
  clear(center);
  clear(right);
  center.appendChild(
    SectionCard({
      title: "Loading research queue",
      body: "Fetching public-source advisor checks due for review.",
    })
  );
  api<AdvisorResearchQueueResponse>(queueResourcePath(readQueueFilters()))
    .then(payload => renderQueue(payload, center, right))
    .catch((error: unknown) => renderError(error, center, right));
}

/**
 * Renders the queue payload into the page shell.
 * @param payload - Queue response from the resource.
 * @param center - Main page column.
 * @param right - Right rail column.
 */
function renderQueue(
  payload: AdvisorResearchQueueResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  clear(center);
  clear(right);
  center.appendChild(summaryCard(payload));
  center.appendChild(
    priorityGroupsCard(payload, () => loadQueue(center, right))
  );
  if (payload.items.length === 0) {
    center.appendChild(
      AsyncStateCard({
        kind: "empty",
        title: "No due advisor checks",
        body: "The current research queue filters did not return advisors due for public-source review.",
      })
    );
  } else {
    center.appendChild(queueRowsCard(payload.items));
  }
  right.appendChild(
    filterControlsCard(readQueueFilters(), () => loadQueue(center, right))
  );
  right.appendChild(filterSummaryCard(payload));
  right.appendChild(statusCard(payload));
  right.appendChild(missingFieldsCard(payload));
}

/**
 * Builds the page summary card.
 * @param payload - Queue response from the resource.
 * @returns Summary card.
 */
function summaryCard(payload: AdvisorResearchQueueResponse): HTMLElement {
  return SectionCard({
    title: "Due advisor research",
    attrs: { class: "research-queue-header" },
    body: [
      el(
        "p",
        { class: "rankings-lede" },
        "Public-safe queue rows for stale or missing advisor source checks."
      ),
      el(
        "div",
        { class: "metric-grid" },
        metric("Due", payload.summary.totalDue),
        metric("Shown", payload.summary.returned),
        metric("Source", label(payload.filters.sourceType)),
        metric("Generated", fmtDate(payload.generatedAt))
      ),
    ],
  });
}

/**
 * Builds the compact advisor queue row list.
 * @param items - Due advisor queue items.
 * @returns Queue rows section.
 */
function queueRowsCard(items: readonly QueueItem[]): HTMLElement {
  return SectionCard({
    title: "Advisor queue rows",
    attrs: { class: "research-queue-rows-card" },
    body: el("div", { class: "research-queue-list" }, ...items.map(queueRow)),
  });
}

/**
 * Builds one compact advisor research queue row.
 * @param item - Due advisor queue item.
 * @returns Advisor queue row.
 */
function queueRow(item: QueueItem): HTMLElement {
  return el(
    "article",
    {
      class: "research-queue-row",
      "data-advisor-id": item.advisorId,
      "aria-label": `${item.advisorName} research queue row`,
    },
    el(
      "div",
      { class: "research-queue-row-identity" },
      el(
        "a",
        { class: "research-queue-row-name", href: item.profileUrl },
        item.advisorName
      ),
      el("span", { class: "research-queue-row-firm" }, firmContext(item)),
      el(
        "span",
        { class: "research-queue-row-crd" },
        `FINRA CRD ${item.finraCrd ?? "Not available"}`
      )
    ),
    el(
      "div",
      { class: "research-queue-row-status" },
      Tag({ children: label(item.sourceType), kind: "ok" }),
      Tag({ children: label(item.status ?? "never_checked") })
    ),
    queueRowField("Missing fields", missingFields(item)),
    queueRowField("Freshness", freshnessText(item)),
    queueRowField("Source check", provenanceText(item)),
    queueRowAction(item)
  );
}

/**
 * Builds the advisor profile action for one research queue row.
 * @param item Due advisor queue item.
 * @returns Advisor profile link.
 */
function queueRowAction(item: QueueItem): HTMLElement {
  return el(
    "a",
    { class: "research-queue-row-action", href: item.profileUrl },
    "Open advisor profile"
  );
}

/**
 * Builds one labeled compact row field.
 * @param name - Field label.
 * @param value - Field value.
 * @returns Row field.
 */
function queueRowField(name: string, value: string): HTMLElement {
  return el(
    "div",
    { class: "research-queue-row-field" },
    el("span", { class: "research-queue-row-label" }, name),
    el("span", { class: "research-queue-row-value" }, value)
  );
}

/**
 * Builds the active filter summary rail card.
 * @param payload - Queue response from the resource.
 * @returns Filter summary card.
 */
function filterSummaryCard(payload: AdvisorResearchQueueResponse): HTMLElement {
  return SectionCard({
    title: "Queue filters",
    body: DetailsCard({
      title: "Active defaults",
      pairs: [
        ["Source type", label(payload.filters.sourceType)],
        ["Stale days", String(payload.filters.staleDays)],
        ["Status", label(payload.filters.status ?? "any")],
        ["Missing field", label(payload.filters.missingField ?? "any")],
        ["Limit", String(payload.filters.limit)],
      ],
    }),
  });
}

/**
 * Builds shortcut controls for replaying priority queue slices.
 * @param payload - Queue response from the resource.
 * @param onChange - Reloads the queue after URL-backed filters change.
 * @returns Priority group card.
 */
function priorityGroupsCard(
  payload: AdvisorResearchQueueResponse,
  onChange: () => void
): HTMLElement {
  return SectionCard({
    title: "Priority groups",
    body: payload.summary.priorityGroups.map(group =>
      el(
        "p",
        { class: "research-priority-group" },
        Button({
          variant: "ghost",
          children: group.label,
          attrs: {
            class: "research-priority-group-button",
            disabled: group.count === 0 ? "true" : undefined,
          },
          onClick: () => {
            writeQueueFilters({
              sourceType: group.filters.sourceType,
              staleDays: String(group.filters.staleDays),
              status: group.filters.status ?? "",
              missingField: group.filters.missingField ?? "",
              limit: String(group.filters.limit),
            });
            onChange();
          },
        }),
        `: ${group.count}`
      )
    ),
  });
}

/**
 * Builds the status-count rail card.
 * @param payload - Queue response from the resource.
 * @returns Status summary card.
 */
function statusCard(payload: AdvisorResearchQueueResponse): HTMLElement {
  return SectionCard({
    title: "Status counts",
    body: countRows(payload.summary.statusCounts, "No returned statuses."),
  });
}

/**
 * Builds the missing-field summary rail card.
 * @param payload - Queue response from the resource.
 * @returns Missing-field summary card.
 */
function missingFieldsCard(payload: AdvisorResearchQueueResponse): HTMLElement {
  return SectionCard({
    title: "Missing fields",
    body: countRows(
      payload.summary.missingFieldCounts,
      "No missing public fields in returned rows."
    ),
  });
}

/**
 * Renders count records as readable rail rows.
 * @param counts - Counts keyed by raw field/status value.
 * @param emptyText - Empty fallback copy.
 * @returns Paragraph rows or empty copy.
 */
function countRows(
  counts: Readonly<Record<string, number>>,
  emptyText: string
): HTMLElement | readonly HTMLElement[] | string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return emptyText;
  return entries.map(([label, count]) =>
    el("p", {}, `${humanize(label) ?? label}: ${count}`)
  );
}

/**
 * Formats missing public fields for one queue row.
 * @param item - Due advisor queue item.
 * @returns Human-readable missing-field list.
 */
function missingFields(item: QueueItem): string {
  return item.missingFields.length
    ? item.missingFields.map(label).join(", ")
    : "None";
}

/**
 * Formats current firm context for one queue row.
 * @param item - Due advisor queue item.
 * @returns Firm name and role title, or a fallback.
 */
function firmContext(item: QueueItem): string {
  if (!item.firm) return "No current firm";
  return [item.firm.name, item.firm.roleTitle].filter(Boolean).join(" - ");
}

/**
 * Formats freshness timing into one scan-friendly row value.
 * @param item - Due advisor queue item.
 * @returns Freshness summary.
 */
function freshnessText(item: QueueItem): string {
  const lastChecked =
    item.daysSinceLastCheck === null
      ? "Never checked"
      : `${fmtDate(item.lastCheckedAt)} (${item.daysSinceLastCheck} days)`;
  return `${lastChecked}; next ${fmtDate(item.nextCheckAfter)}`;
}

/**
 * Formats provenance into one scan-friendly row value.
 * @param item - Due advisor queue item.
 * @returns Provenance summary.
 */
function provenanceText(item: QueueItem): string {
  const sourceIds = item.provenance.sourceIds.join(", ") || "No source row";
  return `${sourceTableLabel(item.provenance.sourceTable)}: ${sourceIds}`;
}

/**
 * Converts source table identifiers into queue-facing labels.
 * @param sourceTable - Raw source table name from the queue resource.
 * @returns Human-readable source label.
 */
function sourceTableLabel(sourceTable: string): string {
  return SOURCE_TABLE_LABELS[sourceTable] || label(sourceTable);
}

/**
 * Builds one compact metric cell.
 * @param labelText - Metric label.
 * @param value - Metric value.
 * @returns Metric element.
 */
function metric(labelText: string, value: string | number): HTMLElement {
  return el(
    "div",
    { class: "metric" },
    el("span", { class: "metric-label" }, labelText),
    " ",
    el("strong", {}, formatMetricValue(value))
  );
}

/**
 * Formats compact metric values while preserving string labels.
 * @param value - Metric value to display.
 * @returns Display value.
 */
function formatMetricValue(value: string | number): string {
  return typeof value === "number" ? value.toLocaleString() : value;
}

/**
 * Converts raw identifiers to non-empty display labels.
 * @param value - Raw value to format.
 * @returns Display label.
 */
function label(value: unknown): string {
  return humanize(value) ?? String(value ?? "Unknown");
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
  console.error("Research freshness queue failed to load", error);
  clear(center);
  clear(right);
  center.appendChild(
    AsyncStateCard({
      kind: "transient",
      title: "Could not load research queue",
      body: "Retry the request to refresh due advisor source checks.",
      actionLabel: "Retry",
      onAction: () => loadQueue(center, right),
    })
  );
}

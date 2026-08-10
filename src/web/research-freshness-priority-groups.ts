import type { AdvisorResearchQueueResponse } from "../harper/resource-advisor-research-queue.js";
import { Button, el } from "./design-system/index.js";
import { writeQueueFilters } from "./research-freshness-filters.js";

/** One priority-group summary from the research queue response. */
type PriorityGroup =
  AdvisorResearchQueueResponse["summary"]["priorityGroups"][number];

/**
 * Builds one priority-group shortcut row.
 * @param group - Priority group summary.
 * @param onChange - Reloads the queue after filters change.
 * @returns Priority group row.
 */
export function priorityGroupRow(
  group: PriorityGroup,
  onChange: () => void
): HTMLElement {
  return el(
    "p",
    { class: "research-priority-group" },
    Button({
      variant: "ghost",
      children: group.label,
      attrs: {
        class: "research-priority-group-button",
        disabled: group.count === 0 ? "true" : undefined,
      },
      onClick: () => applyPriorityGroupFilters(group, onChange),
    }),
    `: ${group.count}`
  );
}

/**
 * Applies one priority group to the queue filters.
 * @param group - Priority group summary.
 * @param onChange - Reloads the queue after filters change.
 */
function applyPriorityGroupFilters(
  group: PriorityGroup,
  onChange: () => void
): void {
  writeQueueFilters({
    sourceType: group.filters.sourceType,
    staleDays: String(group.filters.staleDays),
    status: group.filters.status ?? "",
    missingField: group.filters.missingField ?? "",
    limit: String(group.filters.limit),
  });
  onChange();
}

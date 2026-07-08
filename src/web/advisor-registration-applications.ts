import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import { registrationApplicationsSection } from "./advisor-sections.js";
import {
  isRegistrationApplicationRow,
  narrowRows,
} from "./advisor-row-predicates.js";
import { PartialFailureCard, resourceRows } from "./detail-state.js";

/**
 * Appends registration application cards to the sidebar.
 * @param right - Right sidebar column.
 * @param d - Advisor profile payload returned by the AdvisorProfile resource.
 */
export function appendRegistrationApplications(
  right: HTMLElement,
  d: AdvisorProfilePayload
): void {
  appendIfPresent(
    right,
    registrationApplicationsSection(
      narrowRows(
        resourceRows(d.registrationApplications),
        isRegistrationApplicationRow
      )
    )
  );
  appendIfPresent(
    right,
    PartialFailureCard("Registration applications", d.registrationApplications)
  );
}

/**
 * Appends a card when the detail resource returned displayable data.
 * @param root - Parent element.
 * @param node - Optional card node.
 */
function appendIfPresent(root: HTMLElement, node: HTMLElement | null): void {
  if (node) root.appendChild(node);
}

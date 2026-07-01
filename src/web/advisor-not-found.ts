import { DetailNotFoundCard } from "./detail-state.js";

/**
 * Renders the advisor-not-found state.
 * @param center - Main content column.
 * @param id - Missing advisor id when the resource included one.
 */
export function renderAdvisorNotFound(
  center: HTMLElement,
  id: string | undefined
): void {
  center.appendChild(
    DetailNotFoundCard({
      title: "Advisor not found",
      id,
      actionLabel: "Back to Advisors",
      href: "/advisors",
    })
  );
}

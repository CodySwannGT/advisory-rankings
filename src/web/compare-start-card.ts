import { Button, el, SectionCard } from "./design-system/index.js";
import { compareInlineAddControl } from "./compare-add-control.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as Component;
const ButtonComponent = Button as unknown as Component;

/**
 * Renders a human-usable starting point for cold `/compare` visits.
 * @param copy - Introductory action copy.
 * @param selectedIds - Advisor ids already selected for under-limit recovery.
 * @returns Compare empty-state section.
 */
export function compareStartCard(
  copy = "Search for an advisor or browse the directory, then use Add to comparison from an advisor profile or directory row.",
  selectedIds: readonly string[] = []
): HTMLElement {
  const browseHref = selectedIds.length
    ? `/advisors?ids=${selectedIds.map(encodeURIComponent).join(",")}`
    : "/advisors";
  const primaryAction = selectedIds.length
    ? compareInlineAddControl(selectedIds)
    : compareBrowseActions(browseHref);
  return SectionCardComponent({
    title: "Choose advisors to compare",
    attrs: { class: "comparison-start" },
    body: [
      el("p", { class: "comparison-start-copy" }, copy),
      primaryAction,
      el(
        "ol",
        { class: "comparison-start-steps", "aria-label": "Comparison steps" },
        el("li", {}, "Find an advisor by name, firm, or team."),
        el("li", {}, "Add two to four advisors to the comparison."),
        el("li", {}, "Review diligence evidence side by side.")
      ),
    ],
  });
}

/**
 * Builds recovery copy for an under-limit comparison selection.
 * @param selectedCount - Number of selected advisor columns.
 * @returns User-facing recovery guidance.
 */
export function underLimitStartCopy(selectedCount: number): string {
  const advisorLabel = selectedCount === 1 ? "advisor" : "advisors";
  return `You have selected ${selectedCount} ${advisorLabel}. Add another advisor here to complete the comparison.`;
}

/**
 * Builds cold-start browse actions for an empty comparison route.
 * @param browseHref - Advisor directory href.
 * @returns Action row.
 */
function compareBrowseActions(browseHref: string): HTMLElement {
  return el(
    "div",
    { class: "comparison-start-actions" },
    ButtonComponent({
      variant: "primary",
      children: "Browse advisors",
      onClick: () => {
        window.location.href = browseHref;
      },
      attrs: {
        class: "comparison-start-button",
      },
    }),
    el(
      "a",
      { class: "comparison-start-link", href: browseHref },
      "Open advisor directory"
    )
  );
}

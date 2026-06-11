import { fmts } from "./app.js";
import { compareEntryAction } from "./compare-entry.js";
import { SectionCard, TransitionEventCard } from "./design-system/index.js";

/** Uniform adapter signature for untyped design-system components. */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const TransitionEventCardComponent =
  TransitionEventCard as unknown as DesignSystemComponent;

/**
 * Builds the public comparison entry point for an advisor profile.
 * @param advisorId - Advisor id to add to `/compare?ids=...`.
 * @returns Compare action card.
 */
export function compareAdvisorCard(advisorId: string): HTMLElement {
  return SectionCardComponent({
    title: "Compare advisor",
    attrs: { class: "compare-entry-card" },
    body: compareEntryAction({
      advisorId,
      label: "Add to comparison",
      className: "compare-entry-button--profile",
    }),
  });
}

/**
 * Builds one transition event card through the design-system adapter.
 * @param transition - Transition row payload.
 * @returns Rendered transition event card.
 */
export function transitionEventCard(transition: unknown): HTMLElement {
  return TransitionEventCardComponent(transition, fmts);
}

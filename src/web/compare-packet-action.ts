import { Button, el } from "./design-system/index.js";
import { reportPacketUrl } from "./compare-selection.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const ButtonComponent = Button as unknown as Component;

/**
 * Builds the comparison-page action that opens the matching report packet.
 * @param ids - Ordered advisor ids in the current comparison.
 * @returns Packet action container.
 */
export function reportPacketAction(ids: readonly string[]): HTMLElement {
  return el(
    "div",
    { class: "comparison-hero-actions" },
    ButtonComponent({
      variant: "primary",
      children: "Report packet",
      onClick: () => {
        window.location.href = reportPacketUrl(ids);
      },
      attrs: {
        class: "comparison-packet-button",
        "aria-label": "Open report packet for selected advisors",
      },
    })
  );
}

import type { AdvisorComparisonItem } from "../types/advisor-comparison.js";
import { el, SourceAttribution } from "./design-system/index.js";

/** Design-system component signature normalized at this boundary. */
type Component = (...args: readonly unknown[]) => HTMLElement;

const SourceAttributionComponent = SourceAttribution as unknown as Component;
const BROKERCHECK_SOURCE = "FINRA BrokerCheck";
const BROKERCHECK_TERMS_URL = "https://brokercheck.finra.org/terms";
const BROKERCHECK_SECTION_LABELS = new Set(["Regulatory", "Career"]);

/**
 * Renders BrokerCheck source or an explicit neutral missing-state.
 * @param section - Section label.
 * @param item - Compared advisor item.
 * @returns Attribution or missing-state node.
 */
export function brokerCheckSourceNode(
  section: string,
  item: AdvisorComparisonItem
): HTMLElement | null {
  if (!BROKERCHECK_SECTION_LABELS.has(section)) return null;
  const snapshot = item.regulatory.brokerCheckSnapshot;
  if (!snapshot) {
    return el(
      "span",
      { class: "comparison-brokercheck-missing" },
      "No BrokerCheck snapshot loaded for this advisor."
    );
  }
  return SourceAttributionComponent({
    source: BROKERCHECK_SOURCE,
    url: `https://brokercheck.finra.org/individual/summary/${encodeURIComponent(snapshot.subjectCrd)}`,
    termsUrl: BROKERCHECK_TERMS_URL,
    fetchedAt: snapshot.fetchedAt,
    attrs: { class: "comparison-source-attribution" },
  });
}

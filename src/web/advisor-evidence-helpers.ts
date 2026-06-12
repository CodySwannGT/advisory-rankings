// Shared helpers for advisor evidence cards.

import { humanize } from "./app.js";
import { el, Heading, SectionCard, Tag } from "./design-system/index.js";

/** Uniform callable shape for design-system components imported from JS. */
export type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

/** Evidence card tone mapped to the design-system tag palette. */
export type EvidenceTone = "ok" | "warn" | "neutral";

/** Confidence buckets emitted by AdvisorProfile evidence summaries. */
export type ConfidenceLevel = "asserted" | "inferred" | "derived";

/** Copy and tone for an advisor evidence state row. */
export interface EvidenceState {
  readonly label: string;
  readonly tone: EvidenceTone;
  readonly body: string;
}

/** SectionCard adapter with a stable HTMLElement return type. */
export const SectionCardComponent =
  SectionCard as unknown as DesignSystemComponent;

/**
 * Builds a section title with inline explanatory help.
 * @param label - Visible title copy.
 * @param explanation - Help text for the disclosure.
 * @returns Title node.
 */
export function sectionTitleWithHelp(
  label: string,
  explanation: string
): HTMLElement {
  return el(
    "span",
    { class: "advisor-evidence-title" },
    el("span", {}, label),
    el(
      "details",
      { class: "advisor-evidence-help" },
      el("summary", { "aria-label": `${label} explanation` }, "i"),
      el("p", {}, explanation)
    )
  );
}

/**
 * Builds the evidence state copy and status tag row.
 * @param state - State copy and tone.
 * @returns State header node.
 */
export function evidenceStateHeader(state: EvidenceState): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-state" },
    el("p", {}, state.body),
    Tag({ kind: tagTone(state.tone), children: state.label })
  );
}

/**
 * Builds a titled evidence metric grid.
 * @param title - Grid title.
 * @param keys - Count keys in display order.
 * @param counts - Count payload.
 * @param formatLabel - Label formatter for each count key.
 * @returns Count grid node.
 */
export function evidenceCountGrid<K extends string>(
  title: string,
  keys: readonly K[],
  counts: Readonly<Partial<Record<K, number>>>,
  formatLabel: (key: K) => string = readableLabel
): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-group" },
    Heading({
      level: 3,
      attrs: { class: "card-subtitle" },
      children: title,
    }),
    el(
      "div",
      { class: "advisor-evidence-metrics" },
      ...keys.map(key =>
        evidenceMetric(
          formatLabel(key),
          formatNumber(numericCount(counts[key]))
        )
      )
    )
  );
}

/**
 * Builds a single label/value evidence metric.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric node.
 */
export function evidenceMetric(
  label: string | number | null | undefined,
  value: string | number | null | undefined
): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-metric" },
    el("strong", {}, value),
    el("span", {}, label)
  );
}

/**
 * Maps evidence tone to a design-system tag kind.
 * @param tone - Evidence tone.
 * @returns Tag kind.
 */
export function tagTone(tone: EvidenceTone): "ok" | "warn" | "default" {
  return tone === "ok" ? "ok" : tone === "warn" ? "warn" : "default";
}

/**
 * Normalizes an unknown count value for display math.
 * @param value - Count-like value.
 * @returns Non-negative finite count.
 */
export function numericCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Formats an unknown count value for metric display.
 * @param value - Count-like value.
 * @returns Localized count string.
 */
export function formatNumber(value: unknown): string {
  return numericCount(value).toLocaleString();
}

/**
 * Converts a machine key to human-readable copy.
 * @param value - Raw key.
 * @returns Display label.
 */
export function readableLabel(value: string): string {
  return humanize(value) || value;
}

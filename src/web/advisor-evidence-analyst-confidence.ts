// Analyst-only advisor fact-confidence detail card.

import type { ConfidenceSummary } from "../types/advisor-profile.js";
import { humanize } from "./app.js";
import { el, Heading, SectionCard, Tag } from "./design-system/index.js";

/**
 *
 */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;
/**
 *
 */
type EvidenceTone = "ok" | "warn" | "neutral";
/**
 *
 */
type ConfidenceLevel = "asserted" | "inferred" | "derived";

/**
 *
 */
interface EvidenceState {
  readonly label: string;
  readonly tone: EvidenceTone;
  readonly body: string;
}

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = [
  "asserted",
  "inferred",
  "derived",
];

/**
 * Builds the analyst confidence card.
 * @param confidence - Confidence payload.
 * @returns Confidence card.
 */
export function analystFactConfidenceSection(
  confidence: ConfidenceSummary
): HTMLElement {
  const total = numericCount(confidence.total);
  return SectionCardComponent({
    title: sectionTitleWithHelp(
      "Fact confidence",
      "Fact confidence groups advisor facts by how directly each fact is supported by public source rows."
    ),
    attrs: { class: "advisor-evidence-card advisor-evidence-card--neutral" },
    body: el(
      "div",
      { class: "advisor-evidence" },
      confidence.hasData
        ? confidenceLoadedBody(confidence, total)
        : confidenceEmptyBody(confidence)
    ),
  });
}

/**
 * Builds loaded confidence body nodes.
 * @param confidence - Confidence payload.
 * @param total - Total rows.
 * @returns Body nodes.
 */
function confidenceLoadedBody(
  confidence: ConfidenceSummary,
  total: number
): readonly (HTMLElement | null)[] {
  return [
    evidenceStateHeader({
      label: `${formatNumber(total)} total`,
      tone: "ok",
      body: "Advisor facts are grouped by assertion confidence.",
    }),
    confidenceDistribution(confidence, total),
    evidenceCountGrid(
      "Distribution",
      CONFIDENCE_LEVELS,
      confidence,
      confidenceLabel
    ),
  ];
}

/**
 * Builds empty confidence body nodes.
 * @param confidence - Confidence payload.
 * @returns Body nodes.
 */
function confidenceEmptyBody(
  confidence: ConfidenceSummary
): readonly HTMLElement[] {
  return [
    evidenceStateHeader({
      label: "No confidence data",
      tone: "warn",
      body: "No confidence rows yet. Fact confidence will appear after source-backed assertions are loaded.",
    }),
    evidenceCountGrid(
      "Distribution",
      CONFIDENCE_LEVELS,
      confidence,
      confidenceLabel
    ),
  ];
}

/**
 * Builds a title with help text.
 * @param label - Title label.
 * @param explanation - Help copy.
 * @returns Title node.
 */
function sectionTitleWithHelp(label: string, explanation: string): HTMLElement {
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
 * Builds a state row.
 * @param state - State copy and tone.
 * @returns State node.
 */
function evidenceStateHeader(state: EvidenceState): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-state" },
    el("p", {}, state.body),
    Tag({ kind: tagTone(state.tone), children: state.label })
  );
}

/**
 * Builds a named count grid.
 * @param title - Grid title.
 * @param keys - Count keys in display order.
 * @param counts - Count payload.
 * @param formatLabel - Optional label formatter.
 * @returns Count grid node.
 */
function evidenceCountGrid<K extends string>(
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
 * Builds a metric tile.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric node.
 */
function evidenceMetric(
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
 * Builds the confidence bar.
 * @param confidence - Confidence payload.
 * @param total - Total rows.
 * @returns Bar node.
 */
function confidenceDistribution(
  confidence: ConfidenceSummary,
  total: number
): HTMLElement | null {
  if (!total) return null;
  return el(
    "div",
    {
      class: "advisor-confidence-bar",
      "aria-label": "Fact confidence distribution",
    },
    ...CONFIDENCE_LEVELS.map(level =>
      el("span", {
        class: `advisor-confidence-bar__segment advisor-confidence-bar__segment--${level}`,
        style: `flex-grow:${numericCount(confidence[level])};`,
        title: `${confidenceLabel(level)}: ${formatNumber(numericCount(confidence[level]))}`,
      })
    )
  );
}

/**
 * Converts confidence level copy.
 * @param level - Confidence level.
 * @returns Display label.
 */
function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "asserted":
      return "Direct source";
    case "inferred":
      return "Supported inference";
    case "derived":
      return "Calculated";
  }
}

/**
 * Maps card tone to tag tone.
 * @param tone - Evidence tone.
 * @returns Tag kind.
 */
function tagTone(tone: EvidenceTone): "ok" | "warn" | "default" {
  return tone === "ok" ? "ok" : tone === "warn" ? "warn" : "default";
}

/**
 * Converts a value to a count.
 * @param value - Count-like value.
 * @returns Non-negative count.
 */
function numericCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Formats a count.
 * @param value - Count-like value.
 * @returns Localized count.
 */
function formatNumber(value: unknown): string {
  return numericCount(value).toLocaleString();
}

/**
 * Converts a machine key.
 * @param value - Raw key.
 * @returns Display label.
 */
function readableLabel(value: string): string {
  return humanize(value) || value;
}

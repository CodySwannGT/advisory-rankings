// Analyst-only advisor fact-confidence detail card.

import type { ConfidenceSummary } from "../types/advisor-profile.js";
import { el } from "./design-system/index.js";
import {
  type ConfidenceLevel,
  SectionCardComponent,
  evidenceCountGrid,
  evidenceStateHeader,
  formatNumber,
  numericCount,
  sectionTitleWithHelp,
} from "./advisor-evidence-helpers.js";
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

// Analyst-only advisor freshness detail card.

import type {
  EvidenceFreshness,
  ResearchSourceTypeKey,
  ResearchStatusKey,
} from "../types/advisor-profile.js";
import { fmtDate, humanize } from "./app.js";
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
interface EvidenceState {
  readonly label: string;
  readonly tone: EvidenceTone;
  readonly body: string;
}

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;
const RESEARCH_STATUSES: readonly ResearchStatusKey[] = [
  "success",
  "no_new_data",
  "ambiguous",
  "failed",
];
const RESEARCH_SOURCE_TYPES: readonly ResearchSourceTypeKey[] = [
  "web_research",
  "firm_bio",
  "rankings",
  "press",
];

/**
 * Builds the analyst freshness card.
 * @param freshness - Freshness payload.
 * @returns Freshness card.
 */
export function analystEvidenceFreshnessSection(
  freshness: EvidenceFreshness
): HTMLElement {
  const state = evidenceFreshnessState(freshness);
  return SectionCardComponent({
    title: sectionTitleWithHelp(
      "Evidence freshness",
      "Evidence freshness explains when public-source checks last ran and whether any checks need review."
    ),
    attrs: {
      class: `advisor-evidence-card advisor-evidence-card--${state.tone}`,
    },
    body: el(
      "div",
      { class: "advisor-evidence" },
      evidenceStateHeader(state),
      evidenceDateGrid(freshness),
      evidenceCountGrid(
        "Status counts",
        RESEARCH_STATUSES,
        freshness.statusCounts
      ),
      evidenceCountGrid(
        "Source coverage",
        RESEARCH_SOURCE_TYPES,
        freshness.sourceTypeCoverage
      )
    ),
  });
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
 * Builds date metrics.
 * @param freshness - Freshness payload.
 * @returns Date grid.
 */
function evidenceDateGrid(freshness: EvidenceFreshness): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-metrics" },
    evidenceMetric(
      "Last checked",
      freshness.lastCheckedAt
        ? fmtDate(freshness.lastCheckedAt, { mode: "short" })
        : "Not yet checked"
    ),
    evidenceMetric(
      "Next check",
      freshness.nearestNextCheckAfter
        ? fmtDate(freshness.nearestNextCheckAfter, { mode: "short" })
        : "Not scheduled"
    )
  );
}

/**
 * Builds a named count grid.
 * @param title - Grid title.
 * @param keys - Count keys in display order.
 * @param counts - Count payload.
 * @returns Count grid node.
 */
function evidenceCountGrid<K extends string>(
  title: string,
  keys: readonly K[],
  counts: Readonly<Partial<Record<K, number>>>
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
          readableLabel(key),
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
 * Resolves freshness state.
 * @param freshness - Freshness payload.
 * @returns State copy.
 */
function evidenceFreshnessState(freshness: EvidenceFreshness): EvidenceState {
  if (!freshness.hasData) {
    return {
      label: "No data",
      tone: "warn",
      body: "No evidence checks yet. Freshness will appear after public source checks run.",
    };
  }
  return evidenceFreshnessDataState(freshness);
}

/**
 * Resolves loaded freshness state.
 * @param freshness - Freshness payload.
 * @returns State copy.
 */
function evidenceFreshnessDataState(
  freshness: EvidenceFreshness
): EvidenceState {
  const failed = numericCount(freshness.statusCounts?.failed);
  const ambiguous = numericCount(freshness.statusCounts?.ambiguous);
  if (failed || ambiguous) {
    return {
      label: "Warning",
      tone: "warn",
      body: `${formatNumber(failed + ambiguous)} check${failed + ambiguous === 1 ? "" : "s"} need review across failed or ambiguous evidence.`,
    };
  }
  if (isPastDate(freshness.nearestNextCheckAfter)) {
    return {
      label: "Stale",
      tone: "warn",
      body: "The next evidence check is past due. Treat profile facts as needing refresh.",
    };
  }
  return {
    label: "Current",
    tone: "ok",
    body: "Evidence checks are loaded with no failed or ambiguous statuses.",
  };
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

/**
 * Checks whether a date is past.
 * @param value - Date-like value.
 * @returns True when past.
 */
function isPastDate(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

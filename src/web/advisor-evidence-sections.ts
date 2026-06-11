// Advisor profile evidence sections.

import type {
  AdvisorProfilePayload,
  ConfidenceSummary,
  EvidenceFreshness,
  ResearchSourceTypeKey,
  ResearchStatusKey,
} from "../types/advisor-profile.js";
import { fmtDate, humanize } from "./app.js";
import { el, Heading, SectionCard, Tag } from "./design-system/index.js";

/**
 * Narrow callable type for design-system helpers whose source files still opt
 * out of TS. Mirrors the adapter convention used in `detail-state.ts` so
 * call sites can pass typed option bags without `any` leakage.
 */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;

/** Evidence card tone — drives the surface variant and tag color. */
type EvidenceTone = "ok" | "warn" | "neutral";

/** Compact state copy rendered in the header of an evidence card. */
interface EvidenceState {
  readonly label: string;
  readonly tone: EvidenceTone;
  readonly body: string;
}

/** Mount targets for responsive evidence card placement. */
interface ResponsiveEvidenceSections {
  readonly desktopRoot: HTMLElement;
  readonly mobileRoot: HTMLElement;
  readonly sections: readonly HTMLElement[];
}

/** Keys printed in the confidence distribution grid. */
type ConfidenceLevel = "asserted" | "inferred" | "derived";

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
const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = [
  "asserted",
  "inferred",
  "derived",
];

/**
 * Builds advisor evidence cards shared by desktop rail and mobile center flow.
 * @param profile - AdvisorProfile payload.
 * @returns Evidence freshness and confidence sections.
 */
export function advisorEvidenceProfileSections(
  profile: AdvisorProfilePayload
): readonly HTMLElement[] {
  return [
    evidenceFreshnessSection(profile.evidenceFreshness),
    factConfidenceSection(profile.confidenceSummary),
  ];
}

/**
 * Moves one advisor evidence DOM set between desktop and mobile slots.
 * @param options - Responsive evidence mount targets.
 * @param options.desktopRoot - Desktop right-rail evidence slot.
 * @param options.mobileRoot - Mobile center-column evidence slot.
 * @param options.sections - Evidence cards to move between slots.
 */
export function mountResponsiveEvidenceSections({
  desktopRoot,
  mobileRoot,
  sections,
}: ResponsiveEvidenceSections): void {
  const mobileQuery = window.matchMedia("(max-width: 800px)");
  const syncEvidencePlacement = (): void => {
    const target = mobileQuery.matches ? mobileRoot : desktopRoot;
    sections.forEach(section => target.appendChild(section));
  };

  syncEvidencePlacement();
  mobileQuery.addEventListener("change", syncEvidencePlacement);
}

/**
 * Builds the evidence freshness card.
 * @param freshness - Evidence freshness summary.
 * @returns Evidence freshness section.
 */
function evidenceFreshnessSection(freshness: EvidenceFreshness): HTMLElement {
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
 * Builds the fact confidence card.
 * @param confidence - Confidence summary payload.
 * @returns Fact confidence section.
 */
function factConfidenceSection(confidence: ConfidenceSummary): HTMLElement {
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
        ? [
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
          ]
        : [
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
          ]
    ),
  });
}

/**
 * Builds a heading label with a keyboard-focusable explanation affordance.
 * @param label - Term being explained.
 * @param explanation - Public explanation copy.
 * @returns Heading content.
 */
function sectionTitleWithHelp(label: string, explanation: string): HTMLElement {
  return el(
    "span",
    { class: "advisor-evidence-title" },
    el("span", {}, label),
    helpText(label, explanation)
  );
}

/**
 * Builds a keyboard-focusable explanation affordance for evidence terms.
 * @param label - Term being explained.
 * @param explanation - Public explanation copy.
 * @returns Help text disclosure.
 */
function helpText(label: string, explanation: string): HTMLElement {
  return el(
    "details",
    { class: "advisor-evidence-help" },
    el("summary", { "aria-label": `${label} explanation` }, "i"),
    el("p", {}, explanation)
  );
}

/**
 * Builds a compact state header for evidence cards.
 * @param state - State copy and tone.
 * @returns Header node.
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
 * Builds last-check and next-check metric tiles.
 * @param freshness - Evidence freshness summary.
 * @returns Date metric grid.
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
 * @param formatLabel - Optional display formatter for count keys.
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

/** Leaf text values accepted by the local metric helper. */
type MetricText = string | number | null | undefined;

/**
 * Builds one evidence metric tile.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric node.
 */
function evidenceMetric(label: MetricText, value: MetricText): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-metric" },
    el("strong", {}, value),
    el("span", {}, label)
  );
}

/**
 * Builds a confidence distribution bar.
 * @param confidence - Confidence summary.
 * @param total - Total confidence rows.
 * @returns Distribution node or null.
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
 * Resolves freshness state copy from the payload.
 * @param freshness - Evidence freshness summary.
 * @returns State copy and tone.
 */
function evidenceFreshnessState(freshness: EvidenceFreshness): EvidenceState {
  if (!freshness.hasData) {
    return {
      label: "No data",
      tone: "warn",
      body: "No evidence checks yet. Freshness will appear after public source checks run.",
    };
  }

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
 * Converts machine confidence levels into reader-facing labels.
 * @param level - Confidence level returned by the API.
 * @returns Plain-language confidence label.
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
 * Maps evidence tone to the shared tag tone.
 * @param tone - Evidence tone.
 * @returns Tag kind.
 */
function tagTone(tone: EvidenceTone): "ok" | "warn" | "default" {
  return tone === "ok" ? "ok" : tone === "warn" ? "warn" : "default";
}

/**
 * Converts a value to a safe non-negative count.
 * @param value - Count-like value.
 * @returns Numeric count.
 */
function numericCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Formats a compact count.
 * @param value - Count-like value.
 * @returns Localized count.
 */
function formatNumber(value: unknown): string {
  return numericCount(value).toLocaleString();
}

/**
 * Converts machine keys into a non-empty display label.
 * @param value - Raw key.
 * @returns Human-readable label.
 */
function readableLabel(value: string): string {
  return humanize(value) || value;
}

/**
 * Checks whether a date-like string is before now.
 * @param value - Date-like value.
 * @returns True when the date is in the past.
 */
function isPastDate(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

// @ts-nocheck
// Advisor profile evidence sections.

import { fmtDate, humanize } from "./app.js";
import { el, Heading, SectionCard, Tag } from "./design-system/index.js";

const RESEARCH_STATUSES = ["success", "no_new_data", "ambiguous", "failed"];
const RESEARCH_SOURCE_TYPES = ["web_research", "firm_bio", "rankings", "press"];
const CONFIDENCE_LEVELS = ["asserted", "inferred", "derived"];

/**
 * Builds mobile advisor evidence cards for the center column.
 * @param profile - AdvisorProfile payload.
 * @returns Mobile-only evidence cards.
 */
export function mobileEvidenceProfileSections(profile) {
  return el(
    "div",
    { class: "advisor-mobile-evidence" },
    ...advisorEvidenceProfileSections(profile)
  );
}

/**
 * Builds advisor evidence cards shared by desktop rail and mobile center flow.
 * @param profile - AdvisorProfile payload.
 * @returns Evidence freshness and confidence sections.
 */
export function advisorEvidenceProfileSections(profile) {
  return [
    evidenceFreshnessSection(profile.evidenceFreshness),
    factConfidenceSection(profile.confidenceSummary),
  ];
}

/**
 * Builds the evidence freshness card.
 * @param freshness - Evidence freshness summary.
 * @returns Evidence freshness section.
 */
function evidenceFreshnessSection(freshness = {}) {
  const state = evidenceFreshnessState(freshness);
  return SectionCard({
    title: "Evidence freshness",
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
function factConfidenceSection(confidence = {}) {
  const total = numericCount(confidence.total);
  return SectionCard({
    title: "Fact confidence",
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
            evidenceCountGrid("Distribution", CONFIDENCE_LEVELS, confidence),
          ]
        : [
            evidenceStateHeader({
              label: "No data",
              tone: "warn",
              body: "No confidence rows yet. Fact confidence will appear after source-backed assertions are loaded.",
            }),
            evidenceCountGrid("Distribution", CONFIDENCE_LEVELS, confidence),
          ]
    ),
  });
}

/**
 * Builds a compact state header for evidence cards.
 * @param state - State copy and tone.
 * @returns Header node.
 */
function evidenceStateHeader(state) {
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
function evidenceDateGrid(freshness = {}) {
  return el(
    "div",
    { class: "advisor-evidence-metrics" },
    evidenceMetric(
      "Last checked",
      freshness.lastCheckedAt
        ? fmtDate(freshness.lastCheckedAt, { mode: "short" })
        : "not loaded"
    ),
    evidenceMetric(
      "Next check",
      freshness.nearestNextCheckAfter
        ? fmtDate(freshness.nearestNextCheckAfter, { mode: "short" })
        : "not scheduled"
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
function evidenceCountGrid(title, keys, counts = {}) {
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
        evidenceMetric(humanize(key), formatNumber(numericCount(counts[key])))
      )
    )
  );
}

/**
 * Builds one evidence metric tile.
 * @param label - Metric label.
 * @param value - Metric value.
 * @returns Metric node.
 */
function evidenceMetric(label, value) {
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
function confidenceDistribution(confidence, total) {
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
        title: `${humanize(level)}: ${formatNumber(numericCount(confidence[level]))}`,
      })
    )
  );
}

/**
 * Resolves freshness state copy from the payload.
 * @param freshness - Evidence freshness summary.
 * @returns State copy and tone.
 */
function evidenceFreshnessState(freshness = {}) {
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
    label: "Loaded",
    tone: "ok",
    body: "Evidence checks are loaded with no failed or ambiguous statuses.",
  };
}

/**
 * Maps evidence tone to the shared tag tone.
 * @param tone - Evidence tone.
 * @returns Tag kind.
 */
function tagTone(tone) {
  return tone === "ok" ? "ok" : tone === "warn" ? "warn" : "default";
}

/**
 * Converts a value to a safe non-negative count.
 * @param value - Count-like value.
 * @returns Numeric count.
 */
function numericCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Formats a compact count.
 * @param value - Count-like value.
 * @returns Localized count.
 */
function formatNumber(value) {
  return numericCount(value).toLocaleString();
}

/**
 * Checks whether a date-like string is before now.
 * @param value - Date-like value.
 * @returns True when the date is in the past.
 */
function isPastDate(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

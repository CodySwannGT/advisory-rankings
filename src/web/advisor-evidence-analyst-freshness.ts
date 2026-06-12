// Analyst-only advisor freshness detail card.

import type {
  EvidenceFreshness,
  ResearchSourceTypeKey,
  ResearchStatusKey,
} from "../types/advisor-profile.js";
import { fmtDate } from "./app.js";
import { el } from "./design-system/index.js";
import {
  type EvidenceState,
  SectionCardComponent,
  evidenceCountGrid,
  evidenceMetric,
  evidenceStateHeader,
  formatNumber,
  numericCount,
  sectionTitleWithHelp,
} from "./advisor-evidence-helpers.js";
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
 * Checks whether a date is past.
 * @param value - Date-like value.
 * @returns True when past.
 */
function isPastDate(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

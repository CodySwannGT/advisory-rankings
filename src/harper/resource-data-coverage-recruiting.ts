import type { ResourceIndex } from "./resource-data.js";
import type {
  DataCoverageMetric,
  DataCoverageSection,
} from "./resource-data-coverage.js";
import { sourceCoverage } from "./resource-recruiting-market-coverage.js";
import {
  recruitingMoves,
  summarizeMoves,
} from "./resource-recruiting-market-helpers.js";

const ARTICLE_TRANSITION_MENTION_SOURCE = "ArticleTransitionEventMention";
const MISSING_LOCATION_WARNING =
  "Some recruiting moves cannot resolve a branch location.";
const MISSING_SOURCE_WARNING =
  "Some recruiting moves do not have source article mentions.";
const RECRUITING_MARKET_RESOURCE = "/RecruitingMarket";

/**
 * Builds recruiting metrics from the same move model as `/RecruitingMarket`.
 * @param db Shared Harper resource index.
 * @returns Recruiting coverage section.
 */
export function recruitingSection(db: ResourceIndex): DataCoverageSection {
  const moves = recruitingMoves(db);
  const summary = summarizeMoves(moves);
  const coverage = sourceCoverage(moves);
  return {
    id: "recruiting",
    label: "Recruiting coverage",
    metrics: [
      metric(
        "moves",
        "Moves",
        summary.count,
        "TransitionEvent",
        RECRUITING_MARKET_RESOURCE,
        summary.count === 0 ? "No public recruiting moves are loaded." : null
      ),
      metric(
        "source-backed-moves",
        "Source-backed moves",
        coverage.sourceBackedCount,
        ARTICLE_TRANSITION_MENTION_SOURCE,
        RECRUITING_MARKET_RESOURCE,
        warningIf(coverage.missingSourceCount, MISSING_SOURCE_WARNING)
      ),
      metric(
        "missing-location",
        "Moves missing location",
        coverage.missingLocationCount,
        "Branch",
        RECRUITING_MARKET_RESOURCE,
        warningIf(coverage.missingLocationCount, MISSING_LOCATION_WARNING)
      ),
    ],
  };
}

/**
 * Creates one recruiting coverage metric.
 * @param id Stable metric identifier.
 * @param label Human-readable metric label.
 * @param value Numeric or missing metric value.
 * @param source Source table, resource field, or probe.
 * @param publicResource Public resource associated with the metric.
 * @param limitation Missing value explanation.
 * @returns Data coverage metric.
 */
function metric(
  id: string,
  label: string,
  value: number | string | null,
  source: string,
  publicResource: string | null,
  limitation: string | null = null
): DataCoverageMetric {
  return { id, label, value, source, publicResource, limitation };
}

/**
 * Returns a limitation message when the related missing count is positive.
 * @param count Missing or incomplete record count.
 * @param message Limitation message.
 * @returns Message when count is positive, otherwise null.
 */
function warningIf(count: number, message: string): string | null {
  return count > 0 ? message : null;
}

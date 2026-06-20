import type { HarperDate } from "../types/harper-schema.js";
import { fmtMoney, humanize } from "./app-formatters.js";
import type { MetricSnapshotView } from "./team-sections.js";

/**
 *
 */
interface MetricContinuityItem {
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly date?: HarperDate;
  readonly order: number;
  readonly provenance: readonly string[];
  readonly trust: string;
}

const PUBLIC_TIMELINE_PRIVACY =
  "Public view excludes watchlists, ratings, correction internals, analyst discrepancies, reviewer notes, and authenticated raw-table data.";

/**
 * Converts one metric snapshot into a continuity timeline row.
 * @param snapshot - Public metric snapshot row.
 * @returns Render-ready continuity item.
 */
export function metricContinuityItem(
  snapshot: MetricSnapshotView
): MetricContinuityItem {
  return {
    kind: "Metric snapshot",
    title: metricTitle(snapshot),
    body: metricSourceSummary(snapshot.sourceType),
    date: snapshot.asOf,
    order: 30,
    provenance: metricProvenance(snapshot),
    trust:
      "Use as a public metric snapshot, not a live balance sheet; open details for source limits.",
  };
}

/**
 * Formats the primary metric snapshot title.
 * @param snapshot - Public metric snapshot row.
 * @returns Metric title copy.
 */
function metricTitle(snapshot: MetricSnapshotView): string {
  const metrics = [
    snapshot.aum != null ? `${fmtMoney(snapshot.aum)} AUM` : null,
    snapshot.teamSize != null ? `${snapshot.teamSize} members` : null,
    snapshot.householdCount != null
      ? `${snapshot.householdCount} households`
      : null,
    snapshot.annualRevenue != null
      ? `${fmtMoney(snapshot.annualRevenue)} revenue`
      : null,
  ].filter((part): part is string => part != null);
  return metrics.length ? metrics.join(" · ") : "Team metric snapshot";
}

/**
 * Formats the default-visible metric source summary.
 * @param sourceType - Optional raw metric source type.
 * @returns Public source summary.
 */
function metricSourceSummary(sourceType: string | null | undefined): string {
  return sourceType
    ? `Published profile metrics from ${sourceTypeCopy(sourceType)} source data.`
    : "Published profile metrics from available public summary fields.";
}

/**
 * Formats expandable metric audit notes.
 * @param snapshot - Public metric snapshot row.
 * @returns Provenance notes.
 */
function metricProvenance(snapshot: MetricSnapshotView): readonly string[] {
  return [
    snapshot.asOf
      ? "Date note: snapshot as-of date."
      : "Date note: snapshot date unavailable; position is approximate.",
    metricSourceDetail(snapshot.sourceType),
    "Evidence unavailable; metric snapshots render from public profile summary fields.",
    PUBLIC_TIMELINE_PRIVACY,
  ];
}

/**
 * Formats the expanded metric source note.
 * @param sourceType - Optional raw metric source type.
 * @returns Source detail copy.
 */
function metricSourceDetail(sourceType: string | null | undefined): string {
  return sourceType
    ? `Source: ${sourceTypeCopy(sourceType)} public profile metric snapshot.`
    : "Source: public profile summary fields.";
}

/**
 * Formats a metric source for mid-sentence public copy.
 * @param sourceType - Raw metric source type.
 * @returns Human-readable source type.
 */
function sourceTypeCopy(sourceType: string): string {
  const formatted = humanize(sourceType) || sourceType;
  return formatted.toLowerCase();
}

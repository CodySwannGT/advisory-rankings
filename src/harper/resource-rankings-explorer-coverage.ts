import type { HarperDate } from "../types/harper-schema.js";
import type {
  CoverageBucket,
  CoverageSampleRow,
  RankingExplorerEntry,
  RankingsCoverage,
  SourceStatusBucket,
} from "./resource-rankings-explorer-types.js";

/**
 * Builds the rankings-coverage summary the explorer UI renders: per-category buckets, gap
 * breakdowns by source status, and an empty-state message when there is no data.
 * @param entries Resolved ranking explorer entries to summarise.
 * @returns The coverage summary with buckets sorted for display.
 */
export function rankingsCoverage(
  entries: readonly RankingExplorerEntry[]
): RankingsCoverage {
  const grouped = Map.groupBy(entries, coverageKey);
  const buckets = Array.from(grouped, ([key, items]) =>
    items.reduce(mergeCoverageEntry, emptyCoverageBucket(key, items[0]!))
  );
  return {
    totalEntries: entries.length,
    buckets: [...buckets].sort(compareCoverageBuckets),
    gapBuckets: sourceStatusBuckets(entries),
    emptyState:
      entries.length === 0
        ? "No rankings are loaded for this coverage view."
        : null,
  };
}

/**
 * Seeds a fresh coverage bucket with category/year metadata pulled from a representative entry.
 * @param key Stable coverage key used for grouping (category:year).
 * @param entry Representative entry whose ranking metadata seeds the bucket.
 * @returns An empty coverage bucket ready to accumulate entries.
 */
function emptyCoverageBucket(
  key: string,
  entry: RankingExplorerEntry
): CoverageBucket {
  return {
    key,
    category: entry.ranking.name,
    year: entry.ranking.year,
    query: coverageQuery(entry),
    total: 0,
    resolved: 0,
    unresolved: 0,
    missingFirm: 0,
    missingMarket: 0,
    missingScore: 0,
    latestLoadedAt: null,
    sourceLabels: [],
    sampleRows: [],
  };
}

/**
 * Reducer that folds one entry's resolution, gap, source, and sample data into a coverage bucket.
 * @param bucket Accumulator bucket.
 * @param entry Entry being merged in.
 * @returns The updated bucket.
 */
function mergeCoverageEntry(
  bucket: CoverageBucket,
  entry: RankingExplorerEntry
): CoverageBucket {
  return {
    ...bucket,
    total: bucket.total + 1,
    resolved: bucket.resolved + (entry.resolutionStatus === "resolved" ? 1 : 0),
    unresolved:
      bucket.unresolved + (entry.resolutionStatus === "resolved" ? 0 : 1),
    missingFirm: bucket.missingFirm + (entry.firm ? 0 : 1),
    missingMarket: bucket.missingMarket + (entry.location.state ? 0 : 1),
    missingScore: bucket.missingScore + (hasMissingScore(entry) ? 1 : 0),
    latestLoadedAt: latestDate(bucket.latestLoadedAt, entry.source.loadedAt),
    sourceLabels: withUnique(bucket.sourceLabels, entry.source.label),
    sampleRows: withSample(bucket.sampleRows, entry),
  };
}

/**
 * Internal pairing of one source-status code with the entry that produced it, used while
 * expanding each entry's multi-status array into a flat list before grouping.
 */
interface StatusEntryPair {
  readonly status: string;
  readonly entry: RankingExplorerEntry;
}

/**
 * Groups entries by each source-status code they emit and builds the gap-bucket list shown in the UI.
 * @param entries Entries to summarise.
 * @returns Source-status buckets sorted by descending count.
 */
function sourceStatusBuckets(
  entries: readonly RankingExplorerEntry[]
): readonly SourceStatusBucket[] {
  const pairs: readonly StatusEntryPair[] = entries.flatMap(entry =>
    entry.sourceStatus.map(status => ({ status, entry }))
  );
  const grouped = Map.groupBy(pairs, pair => pair.status);
  const buckets = Array.from(grouped, ([status, items]) =>
    items.reduce<SourceStatusBucket>(mergeStatusBucket, {
      status,
      count: 0,
      query: sourceStatusQuery(status),
      sourceLabels: [],
      sampleRows: [],
    })
  );
  return [...buckets].sort(
    (left, right) =>
      right.count - left.count || left.status.localeCompare(right.status)
  );
}

/**
 * Reducer that folds one status/entry pair into the matching source-status bucket.
 * @param bucket Accumulator bucket.
 * @param pair Status/entry pair to merge.
 * @returns The updated bucket.
 */
function mergeStatusBucket(
  bucket: SourceStatusBucket,
  pair: StatusEntryPair
): SourceStatusBucket {
  return {
    ...bucket,
    count: bucket.count + 1,
    sourceLabels: withUnique(bucket.sourceLabels, pair.entry.source.label),
    sampleRows: withSample(bucket.sampleRows, pair.entry),
  };
}

/**
 * Appends a sample row capped at three so each bucket shows a few exemplars without bloating responses.
 * @param samples Existing sample rows.
 * @param entry Candidate entry to sample from.
 * @returns Samples extended by `entry` when there is still room.
 */
function withSample(
  samples: readonly CoverageSampleRow[],
  entry: RankingExplorerEntry
): readonly CoverageSampleRow[] {
  if (samples.length >= 3) return samples;
  return [
    ...samples,
    {
      id: entry.id,
      label: entry.subject.displayName,
      firmText: entry.firmText,
      sourceLabel: entry.source.label,
      sourceStatus: entry.sourceStatus,
    },
  ];
}

/**
 * Adds `value` to `values` only when it is non-empty and not already present, preserving order.
 * @param values Existing values.
 * @param value Candidate value.
 * @returns The (possibly extended) value array.
 */
function withUnique(
  values: readonly string[],
  value: string | null | undefined
): readonly string[] {
  if (!value || values.includes(value)) return values;
  return [...values, value];
}

/**
 * Computes the stable group key used to bucket entries by ranking category and year.
 * @param entry Entry to key.
 * @returns A `category:year` key with safe fallbacks.
 */
function coverageKey(entry: RankingExplorerEntry): string {
  return `${entry.ranking.name || "Unknown ranking"}:${entry.ranking.year ?? "unknown"}`;
}

/**
 * Builds the rankings-page query string that drills into the bucket's category and year.
 * @param entry Entry providing the category and year.
 * @returns A relative URL pre-filtered to this slice.
 */
function coverageQuery(entry: RankingExplorerEntry): string {
  return queryString({
    category: entry.ranking.name,
    year: entry.ranking.year,
  });
}

/**
 * Maps a source-status code to the rankings-page query that surfaces the affected rows.
 * @param status The source-status code.
 * @returns A relative URL to the rankings page, filtered when the status implies resolution gaps.
 */
function sourceStatusQuery(status: string): string {
  if (status === "unresolved-entity" || status === "unresolved-firm")
    return queryString({ resolved: "unresolved" });
  return queryString({});
}

/**
 * Serialises a sparse param record into a `/rankings?...` URL, omitting null/empty params.
 * @param params Param map; null, undefined, and "" values are stripped.
 * @returns The rankings URL, with no query string when no params apply.
 */
function queryString(
  params: Readonly<Record<string, string | number | null | undefined>>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/rankings?${text}` : "/rankings";
}

/**
 * Reports whether any score on `entry` is in a non-loaded state, used for the missing-score gap counter.
 * @param entry Entry to inspect.
 * @returns True when at least one score has status other than `loaded`.
 */
function hasMissingScore(entry: RankingExplorerEntry): boolean {
  return Object.values(entry.scores).some(score => score.status !== "loaded");
}

/**
 * Returns whichever of the two HarperDate values is lexicographically later, treating nulls as missing.
 * @param left Existing latest date.
 * @param right Candidate date.
 * @returns The later of the two, or null when both are missing.
 */
function latestDate(
  left: HarperDate | null,
  right: HarperDate | null | undefined
): HarperDate | null {
  const candidates: readonly HarperDate[] = [left, right ?? null].filter(
    (value): value is HarperDate => value != null
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) =>
    String(current).localeCompare(String(latest)) > 0 ? current : latest
  );
}

/**
 * Comparator that orders coverage buckets alphabetically by category and then descending by year.
 * @param left Left bucket.
 * @param right Right bucket.
 * @returns Standard comparator result.
 */
function compareCoverageBuckets(
  left: CoverageBucket,
  right: CoverageBucket
): number {
  return (
    String(left.category).localeCompare(String(right.category)) ||
    Number(right.year ?? 0) - Number(left.year ?? 0)
  );
}

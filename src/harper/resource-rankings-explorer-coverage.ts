/* eslint-disable jsdoc/require-jsdoc -- Private resource helpers are covered through the public endpoint. */
import type { HarperDate } from "../types/harper-schema.js";
import type {
  CoverageBucket,
  CoverageSampleRow,
  RankingExplorerEntry,
  RankingsCoverage,
  SourceStatusBucket,
} from "./resource-rankings-explorer-types.js";

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
        ? "No ranking rows are loaded for this coverage slice."
        : null,
  };
}

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

interface StatusEntryPair {
  readonly status: string;
  readonly entry: RankingExplorerEntry;
}

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

function withUnique(
  values: readonly string[],
  value: string | null | undefined
): readonly string[] {
  if (!value || values.includes(value)) return values;
  return [...values, value];
}

function coverageKey(entry: RankingExplorerEntry): string {
  return `${entry.ranking.name || "Unknown ranking"}:${entry.ranking.year ?? "unknown"}`;
}

function coverageQuery(entry: RankingExplorerEntry): string {
  return queryString({
    category: entry.ranking.name,
    year: entry.ranking.year,
  });
}

function sourceStatusQuery(status: string): string {
  if (status === "unresolved-entity" || status === "unresolved-firm")
    return queryString({ resolved: "unresolved" });
  return queryString({});
}

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

function hasMissingScore(entry: RankingExplorerEntry): boolean {
  return Object.values(entry.scores).some(score => score.status !== "loaded");
}

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

function compareCoverageBuckets(
  left: CoverageBucket,
  right: CoverageBucket
): number {
  return (
    String(left.category).localeCompare(String(right.category)) ||
    Number(right.year ?? 0) - Number(left.year ?? 0)
  );
}

/* eslint-enable jsdoc/require-jsdoc -- End local helper exception. */

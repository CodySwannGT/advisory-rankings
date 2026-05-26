/* eslint-disable jsdoc/require-jsdoc -- Private resource helpers are covered through the public endpoint. */
// @ts-nocheck
import { resolveFirm } from "./resource-routing.js";

export function parseFilters(target, db) {
  const firmQuery = target?.get?.("firm") || null;
  const firm = firmQuery ? resolveFirm(db, firmQuery) : null;
  return {
    category: clean(target?.get?.("category")),
    city: clean(target?.get?.("city"))?.toLowerCase() || null,
    firmId: firm?.id ?? null,
    firmQuery,
    limit: boundedNumber(target?.get?.("limit"), 50, 1, 200),
    resolved: resolvedFilter(target?.get?.("resolved")),
    sort: sortFilter(target?.get?.("sort")),
    state: normalizeState(target?.get?.("state")),
    year: normalizeYear(target?.get?.("year")),
  };
}

export function filteredEntries(entries, filters) {
  return entries.filter(entry =>
    filterPredicates(entry, filters).every(Boolean)
  );
}

function filterPredicates(entry, filters) {
  return [
    !filters.category || entry.ranking.name === filters.category,
    !filters.year || entry.ranking.year === filters.year,
    !filters.state || entry.location.state === filters.state,
    !filters.city ||
      String(entry.location.city || "")
        .toLowerCase()
        .includes(filters.city),
    !filters.firmId || entry.firm?.id === filters.firmId,
    !filters.resolved || entry.resolutionStatus === filters.resolved,
  ];
}

export function sortEntries(entries, sort) {
  const direction = sort.startsWith("-") ? -1 : 1;
  const key = sort.replace(/^-/, "");
  return [...entries].sort((left, right) => {
    const leftValue = left._sort[key] ?? "";
    const rightValue = right._sort[key] ?? "";
    if (["rank", "scale", "growth"].includes(key))
      return compareNumeric(leftValue, rightValue, direction);
    if (typeof leftValue === "number" && typeof rightValue === "number")
      return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });
}

function compareNumeric(left, right, direction) {
  const leftMissing = !Number.isFinite(left);
  const rightMissing = !Number.isFinite(right);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return (left - right) * direction;
}

export function summarize(entries) {
  const firms = new Set(entries.map(entry => entry.firm?.id).filter(Boolean));
  const states = new Set(
    entries.map(entry => entry.location.state).filter(Boolean)
  );
  return {
    totalEntries: entries.length,
    resolvedEntries: entries.filter(row => row.resolutionStatus === "resolved")
      .length,
    unresolvedEntries: entries.filter(
      row => row.resolutionStatus !== "resolved"
    ).length,
    representedFirms: firms.size,
    representedStates: states.size,
  };
}

export function rankingsCoverage(entries) {
  const buckets = new Map();
  for (const entry of entries) addCoverageEntry(buckets, entry);
  return {
    totalEntries: entries.length,
    buckets: [...buckets.values()].sort(compareCoverageBuckets),
    gapBuckets: sourceStatusBuckets(entries),
    emptyState:
      entries.length === 0
        ? "No ranking rows are loaded for this coverage slice."
        : null,
  };
}

function addCoverageEntry(buckets, entry) {
  const key = coverageKey(entry);
  const bucket =
    buckets.get(key) ||
    buckets
      .set(key, {
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
      })
      .get(key);
  bucket.total += 1;
  bucket.resolved += entry.resolutionStatus === "resolved" ? 1 : 0;
  bucket.unresolved += entry.resolutionStatus === "resolved" ? 0 : 1;
  bucket.missingFirm += entry.firm ? 0 : 1;
  bucket.missingMarket += entry.location.state ? 0 : 1;
  bucket.missingScore += hasMissingScore(entry) ? 1 : 0;
  bucket.latestLoadedAt = latestDate(
    bucket.latestLoadedAt,
    entry.source.loadedAt
  );
  appendUnique(bucket.sourceLabels, entry.source.label);
  appendSample(bucket.sampleRows, entry);
}

function sourceStatusBuckets(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    for (const status of entry.sourceStatus) {
      const bucket =
        buckets.get(status) ||
        buckets
          .set(status, {
            status,
            count: 0,
            query: sourceStatusQuery(status),
            sourceLabels: [],
            sampleRows: [],
          })
          .get(status);
      bucket.count += 1;
      appendUnique(bucket.sourceLabels, entry.source.label);
      appendSample(bucket.sampleRows, entry);
    }
  }
  return [...buckets.values()].sort(
    (left, right) =>
      right.count - left.count || left.status.localeCompare(right.status)
  );
}

function appendSample(samples, entry) {
  if (samples.length >= 3) return;
  samples.push({
    id: entry.id,
    label: entry.subject.displayName,
    firmText: entry.firmText,
    sourceLabel: entry.source.label,
    sourceStatus: entry.sourceStatus,
  });
}

function appendUnique(values, value) {
  if (value && !values.includes(value)) values.push(value);
}

function coverageKey(entry) {
  return `${entry.ranking.name || "Unknown ranking"}:${entry.ranking.year || "unknown"}`;
}

function coverageQuery(entry) {
  return queryString({
    category: entry.ranking.name,
    year: entry.ranking.year,
  });
}

function sourceStatusQuery(status) {
  if (status === "unresolved-entity" || status === "unresolved-firm")
    return queryString({ resolved: "unresolved" });
  return queryString({});
}

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `/rankings?${text}` : "/rankings";
}

function hasMissingScore(entry) {
  return Object.values(entry.scores).some(score => score.status !== "loaded");
}

function latestDate(left, right) {
  if (!right) return left;
  if (!left) return right;
  return String(right).localeCompare(String(left)) > 0 ? right : left;
}

function compareCoverageBuckets(left, right) {
  return (
    String(left.category).localeCompare(String(right.category)) ||
    Number(right.year || 0) - Number(left.year || 0)
  );
}

export function topFirms(entries) {
  const byFirm = new Map();
  for (const entry of entries) addFirmEntry(byFirm, entry);
  return [...byFirm.values()].sort(
    (left, right) =>
      right.count - left.count || left.firmText.localeCompare(right.firmText)
  );
}

function addFirmEntry(byFirm, entry) {
  const key = entry.firm?.id || entry.firmText || "Unknown firm";
  const row =
    byFirm.get(key) ||
    byFirm
      .set(key, {
        firm: entry.firm,
        firmText: entry.firmText || entry.firm?.name || "Unknown firm",
        count: 0,
        sourceIds: [],
      })
      .get(key);
  row.count += 1;
  row.sourceIds.push(entry.id);
}

export function facets(entries) {
  return {
    categories: uniqueSorted(entries.map(entry => entry.ranking.name)),
    years: uniqueSorted(entries.map(entry => entry.ranking.year)).sort(
      (left, right) => right - left
    ),
    firms: uniqueSorted(entries.map(entry => entry.firmText).filter(Boolean)),
    states: uniqueSorted(
      entries.map(entry => entry.location.state).filter(Boolean)
    ),
  };
}

export function publicEntry(entry) {
  const { _sort, ...publicRow } = entry;
  return publicRow;
}

export function publicFilters(filters) {
  return {
    category: filters.category,
    city: filters.city,
    firmId: filters.firmId,
    firmQuery: filters.firmQuery,
    limit: filters.limit,
    resolved: filters.resolved,
    sort: filters.sort,
    state: filters.state,
    year: filters.year,
  };
}

export function normalizeState(value) {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

function clean(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function boundedNumber(value, fallback, min, max) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function resolvedFilter(value) {
  return ["resolved", "unresolved"].includes(value) ? value : null;
}

function sortFilter(value) {
  return [
    "rank",
    "-rank",
    "scale",
    "-scale",
    "growth",
    "-growth",
    "firm",
    "location",
    "name",
  ].includes(value)
    ? value
    : "rank";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(value => value != null))].sort(
    (left, right) => String(left).localeCompare(String(right))
  );
}

/* eslint-enable jsdoc/require-jsdoc -- End local helper exception. */

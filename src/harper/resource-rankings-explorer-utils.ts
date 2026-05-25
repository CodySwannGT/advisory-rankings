/* eslint-disable jsdoc/require-jsdoc, functional/immutable-data -- Private resource helpers are covered through the public endpoint. */
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

/* eslint-enable jsdoc/require-jsdoc, functional/immutable-data -- End local helper exception. */

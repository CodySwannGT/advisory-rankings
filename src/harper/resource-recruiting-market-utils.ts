/**
 * Small, pure utility functions shared by the recruiting-market resource and
 * its aggregation helpers. Kept in a dedicated module so neither
 * `resource-recruiting-market.ts` nor `resource-recruiting-market-helpers.ts`
 * exceeds the project's per-file line budget.
 */

import type { RouteTarget } from "../types/harper-resource.js";
import type { WatchlistTarget } from "./resource-recruiting-watchlist.js";

/**
 * Coerces an unknown query value into a bounded integer.
 * @param value - Raw query value (string, number, null, or undefined).
 * @param fallback - Value returned when `value` is missing or non-numeric.
 * @param min - Inclusive lower bound applied after coercion.
 * @param max - Inclusive upper bound applied after coercion.
 * @returns The bounded integer, or `fallback` when no valid number was supplied.
 */
export function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

/**
 * Normalizes a state query value to an uppercase trimmed string.
 * @param value - Raw query value pulled from the request target.
 * @returns Uppercase state code, or null when the value was empty.
 */
export function normalizeState(value: unknown): string | null {
  return value ? String(value).trim().toUpperCase() : null;
}

/**
 * Normalizes a four-digit year query value to a string.
 * @param value - Raw query value pulled from the request target.
 * @returns Four-digit year string, or null when the value was not numeric.
 */
export function normalizeYear(value: unknown): string | null {
  return /^\d{4}$/.test(String(value ?? "")) ? String(value) : null;
}

/**
 * Builds a stable descending date comparator keyed by an arbitrary field
 * name. Used for sorting moves and articles by `moveDate`/`publishedDate`.
 * @param field - Field name to compare on each row.
 * @returns Comparator suitable for `Array.prototype.sort`.
 */
export function dateDesc<TField extends string>(
  field: TField
): <T extends { readonly [K in TField]?: unknown }>(
  left: T,
  right: T
) => number {
  return (left, right) =>
    String(right[field] ?? "").localeCompare(String(left[field] ?? ""));
}

/**
 * Reads a single named value off the request target's `get` method.
 * @param target - Route target Harper handed to the resource.
 * @param name - Query parameter name to read.
 * @returns Raw value, or undefined when the target lacks a `get` accessor.
 */
export function readQuery(
  target: RouteTarget | undefined,
  name: string
): unknown {
  const watchTarget = toWatchlistTarget(target);
  return watchTarget.get?.(name);
}

/**
 * Adapts a `RouteTarget` to the structural `WatchlistTarget` shape expected
 * by the watchlist module. The `Id` branch of `RouteTarget` carries no
 * `get`/`getAll` methods; for non-object targets the function returns an
 * empty bag so callers can safely chain `.get?.(...)`.
 *
 * No `as` cast: the returned object is built by reading the optional
 * function properties through `Reflect.get` and a typed predicate.
 * @param target - The route target Harper handed to the resource.
 * @returns A structurally-typed watchlist target view.
 */
export function toWatchlistTarget(
  target: RouteTarget | undefined
): WatchlistTarget {
  if (target == null || typeof target !== "object") return {};
  return {
    get: readMethod(target),
    getAll: readIterableMethod(target),
  };
}

/**
 * Wraps the `get` method on a request target so callers see a typed
 * `(name: string) => unknown` shape, hiding the Harper class internals.
 * @param target - Source object that may expose a `get` method.
 * @returns Bound `get` accessor, or undefined when the method is absent.
 */
function readMethod(target: object): ((name: string) => unknown) | undefined {
  const value: unknown = Reflect.get(target, "get");
  if (typeof value !== "function") return undefined;
  return (key: string) => Reflect.apply(value, target, [key]);
}

/**
 * Wraps the `getAll` method on a request target so callers see a typed
 * iterable accessor. Returns an empty iterable when the underlying call
 * yields a non-iterable value.
 * @param target - Source object that may expose a `getAll` method.
 * @returns Bound `getAll` accessor, or undefined when the method is absent.
 */
function readIterableMethod(
  target: object
): ((name: string) => Iterable<unknown>) | undefined {
  const value: unknown = Reflect.get(target, "getAll");
  if (typeof value !== "function") return undefined;
  return (key: string) => {
    const result: unknown = Reflect.apply(value, target, [key]);
    return isIterable(result) ? result : [];
  };
}

/**
 * Typed predicate for iterable values returned by Harper request targets.
 * @param value - Candidate value to test.
 * @returns True when the value implements the iterable protocol.
 */
function isIterable(value: unknown): value is Iterable<unknown> {
  if (value == null) return false;
  if (typeof value !== "object" && typeof value !== "string") return false;
  return Symbol.iterator in Object(value);
}

/**
 * Normalizes a `Date`-or-string value to an ISO-8601 string.
 * @param value - Candidate date value pulled from a row.
 * @returns ISO-8601 string, or null when the value was missing/empty.
 */
export function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Typed predicate that filters out empty and non-string values from
 * mixed arrays so downstream `.join(...)` and `.filter(...)` chains
 * narrow to `string`.
 * @param value - Candidate value pulled from a mixed array.
 * @returns True when the value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

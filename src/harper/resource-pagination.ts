/**
 * Pagination utilities shared by every Harper Resource endpoint.
 *
 * Cursors are opaque to clients but readable in logs: we pack the last seen
 * (sortKey, id) pair into a base64url token so paging stays stable even when
 * rows are inserted between two adjacent records.
 *
 * Date columns arrive in two flavours depending on transport — `Date`
 * instances in-process and ISO-8601 strings over REST — so `dateMs()` and
 * `inverseDateKey()` accept the union.
 */
import type { RouteTarget } from "../types/harper-resource.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Output of `parsePagination()` — raw cursor string as it arrived on the query. */
export interface PaginationOptions {
  readonly cursor: string | null;
  readonly limit: number;
}

/** Decoded cursor payload produced by `decodeCursor()`. */
export interface DecodedCursor {
  readonly sortKey: string;
  readonly id: string;
}

/**
 * Input to `paginate()`. Callers pass the already-decoded cursor (from
 * `decodeCursor()`), not the raw string — `paginate` doesn't re-decode
 * because some endpoints synthesize cursors from internal state.
 */
export interface PaginateInput {
  readonly cursor: DecodedCursor | null;
  readonly limit: number;
}

/** Return shape from `paginate()` — a page of items plus the next cursor. */
export interface Paged<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Subset of Harper route-target shape parsePagination() inspects. */
interface PaginationTargetShape {
  readonly limit?: number;
  readonly get?: (name: string) => unknown;
}

/** Minimal row shape `paginate()`'s default idOf reads through. */
interface RowWithId {
  readonly id: string;
}

/** Date-like input accepted by the date helpers in this module. */
export type DateLike = Date | string | number | null | undefined;

/**
 * Parses pagination from a Harper route target. Tolerates both the proxy-like
 * `RequestTarget` (where `target.get("limit")` returns the raw query value)
 * and the pre-parsed shape Harper sometimes emits as `target.limit: number`.
 * @param target - Route target or request target to normalize.
 * @returns Parsed cursor + clamped limit.
 */
export function parsePagination(
  target: RouteTarget | null | undefined
): PaginationOptions {
  const t = target as PaginationTargetShape | null | undefined;
  const hasGetter = typeof t?.get === "function";
  const cursorRaw = hasGetter ? t.get("cursor") : null;
  const cursor =
    typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;
  const targetLimit = hasGetter ? t.get("limit") : null;
  // Harper also pre-parses `?limit=` onto target.limit as a number.
  const limitRaw =
    targetLimit ?? (typeof t?.limit === "number" ? t.limit : null);
  const parsed = parseInt(String(limitRaw ?? ""), 10);
  const limit = Math.min(parsed > 0 ? parsed : DEFAULT_LIMIT, MAX_LIMIT);
  return { cursor, limit };
}

/**
 * Encodes cursor sort keys into a URL-safe token.
 * @param sortKey - Stable sort key value.
 * @param id - Entity identifier.
 * @returns Encoded cursor token.
 */
export function encodeCursor(
  sortKey: string | null | undefined,
  id: string | null | undefined
): string {
  const raw = `${sortKey ?? ""}\x00${id ?? ""}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

/**
 * Encodes a non-negative integer offset into a URL-safe cursor token so
 * Harper-native `search({ limit, offset })` pagination can round-trip the
 * page boundary through the existing opaque-cursor contract without
 * exposing a numeric offset to clients. Used by the rewritten
 * `/PublicAdvisors` and `/Feed` resources whose page boundary is a
 * stable Harper sort-then-skip position rather than a `(sortKey, id)`
 * pair. The legacy `(sortKey, id)` cursors stay in
 * {@link encodeCursor}/{@link decodeCursor} for `/PublicFirms` and
 * `/PublicTeams` until those endpoints migrate.
 * @param offset - Zero-based row offset to encode.
 * @returns Opaque base64url cursor token.
 */
export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(String(Math.max(0, Math.trunc(offset))), "utf8").toString(
    "base64url"
  );
}

/**
 * Decodes an offset cursor produced by {@link encodeOffsetCursor}. Invalid
 * or missing cursors decode to `0` (first page) so a torn cursor does not
 * 500 the request — clients see the same data they would with no cursor.
 * @param cursor - Opaque cursor from the previous page, or null.
 * @returns Non-negative integer offset.
 */
export function decodeOffsetCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    // Reject partial-numeric payloads like "12x": `parseInt` would
    // accept the prefix and let a malformed cursor advance pagination.
    if (!/^\d+$/.test(raw)) return 0;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

/**
 * Decodes a cursor token back into its sort key and row id.
 * @param cursor - Pagination cursor from the previous page, or null.
 * @returns Decoded cursor payload, or null when invalid.
 */
export function decodeCursor(
  cursor: string | null | undefined
): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf("\x00");
    if (idx < 0) return null;
    return { sortKey: raw.slice(0, idx), id: raw.slice(idx + 1) };
  } catch {
    return null;
  }
}

/**
 * Packs a date into a fixed-width string that lex-compares in
 * reverse-chronological order — newest first. Used as the sort key for
 * advisor employment rows so we can paginate "most-recent first" with the
 * same string-cursor machinery `paginate()` uses.
 * @param date - Date-like value to compare.
 * @returns Lex-comparable reverse-chronological key.
 */
export function inverseDateKey(date: DateLike): string {
  const ms = dateMs(date);
  // 14 digits comfortably covers any plausible epoch-ms value
  // (Number.MAX_SAFE_INTEGER is 16 digits).
  const inv = 99999999999999n - BigInt(Math.max(0, ms));
  return String(inv).padStart(14, "0");
}

/**
 * Slices a pre-sorted array after the cursor and returns at most `limit`
 * items plus the next cursor. `keyOf(row)` must produce the same value
 * the input array was sorted by, AND the sort must be lexical-ascending
 * on `(keyOf, idOf)`.
 * @param sorted - Rows already sorted for pagination.
 * @param options - Pagination input.
 * @param options.cursor - Decoded cursor payload (from `decodeCursor()`), or null for the first page.
 * @param options.limit - Maximum items to return.
 * @param keyOf - Callback that returns a row sort key.
 * @param idOf - Callback that returns a row identifier.
 * @returns Sliced items plus the next cursor.
 */
export function paginate<T>(
  sorted: readonly T[],
  { cursor, limit }: PaginateInput,
  keyOf: (row: T) => string | null | undefined,
  idOf: (row: T) => string = (r: T): string => (r as RowWithId).id
): Paged<T> {
  const start = cursor ? cursorStart(sorted, cursor, keyOf, idOf) : 0;
  const items = sorted.slice(start, start + limit);
  const more = start + limit < sorted.length;
  const last = items[items.length - 1];
  const nextCursor =
    more && last ? encodeCursor(keyOf(last) ?? "", idOf(last)) : null;
  return { items, nextCursor };
}

/**
 * Finds the first row after an opaque pagination cursor.
 * @param sorted - Rows sorted by the same key encoded in the cursor.
 * @param decoded - Decoded cursor payload, or null when no cursor was supplied.
 * @param keyOf - Callback that returns the row sort key.
 * @param idOf - Callback that returns the row ID.
 * @returns Array index where the next page should begin.
 */
function cursorStart<T>(
  sorted: readonly T[],
  decoded: DecodedCursor,
  keyOf: (row: T) => string | null | undefined,
  idOf: (row: T) => string
): number {
  const { sortKey, id } = decoded;
  const index = sorted.findIndex(row => {
    const key = keyOf(row) ?? "";
    return key > sortKey || (key === sortKey && idOf(row) > id);
  });
  return index >= 0 ? index : sorted.length;
}

/**
 * Converts Date-like values into millisecond timestamps for sorting.
 * @param v - Date value from Harper or REST JSON.
 * @returns Millisecond epoch timestamp, or 0 for unparseable input.
 */
export function dateMs(v: DateLike): number {
  if (v == null) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Builds an ascending comparator over the named date-like field.
 * @param key - Field name to read from each row.
 * @returns A `(a, b) => number` comparator suitable for `Array.prototype.sort`.
 */
export const cmpAsc =
  <K extends string>(key: K) =>
  (
    a: Readonly<Partial<Record<K, DateLike>>>,
    b: Readonly<Partial<Record<K, DateLike>>>
  ): number =>
    dateMs(a[key]) - dateMs(b[key]);

/**
 * Builds a descending comparator over the named date-like field.
 * @param key - Field name to read from each row.
 * @returns A `(a, b) => number` comparator suitable for `Array.prototype.sort`.
 */
export const cmpDesc =
  <K extends string>(key: K) =>
  (
    a: Readonly<Partial<Record<K, DateLike>>>,
    b: Readonly<Partial<Record<K, DateLike>>>
  ): number =>
    dateMs(b[key]) - dateMs(a[key]);

/**
 * Collects rows from a Harper search cursor (an async iterable) into one array.
 * @param iter - Async iterable to collect.
 * @returns Collected rows.
 */
async function collect<T>(iter: AsyncIterable<T>): Promise<readonly T[]> {
  return Array.fromAsync(iter);
}

/** Minimal subset of a Harper table needed by `all()`. */
interface HarperTableSearchable<T> {
  readonly search: (
    query: Readonly<Record<string, unknown>>
  ) => AsyncIterable<T>;
}

/**
 * Reads every row from a Harper table regardless of transport.
 * @param table - Harper table reference.
 * @returns All rows.
 */
export async function all<T = Readonly<Record<string, unknown>>>(
  table: HarperTableSearchable<T>
): Promise<readonly T[]> {
  return collect(table.search({}));
}

/**
 * Builds a lookup map for rows keyed by one field.
 * @param rows - Rows to index.
 * @param key - Object key used for indexing.
 * @returns Map keyed by the chosen field.
 */
export function indexBy<T, K extends keyof T>(
  rows: readonly T[],
  key: K
): ReadonlyMap<T[K], T> {
  return new Map(rows.map(row => [row[key], row]));
}

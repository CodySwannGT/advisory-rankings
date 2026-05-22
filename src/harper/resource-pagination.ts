// @ts-nocheck
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/**
 * Parses pagination from source data.
 * @param target - Route target or request target to normalize.
 * @returns The parsed value.
 */
export function parsePagination(target) {
  const cursor =
    target && typeof target.get === "function"
      ? target.get("cursor") || null
      : null;
  const targetLimit =
    target && typeof target.get === "function" ? target.get("limit") : null;
  // Harper also pre-parses `?limit=` onto target.limit as a number.
  const limitRaw =
    targetLimit == null && target && typeof target.limit === "number"
      ? target.limit
      : targetLimit;
  const parsed = parseInt(limitRaw, 10);
  const limit = Math.min(parsed > 0 ? parsed : DEFAULT_LIMIT, MAX_LIMIT);
  return { cursor, limit };
}

// Cursor encoding: opaque to clients, but readable in logs. Pack the
// last seen sort key + id so we can resume on inserts that land
// between two adjacent records.
/**
 * Encodes cursor sort keys into a URL-safe token.
 * @param sortKey - Stable sort key value.
 * @param id - Entity identifier.
 * @returns Encoded cursor token.
 */
export function encodeCursor(sortKey, id) {
  const raw = `${sortKey ?? ""}\x00${id ?? ""}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}
/**
 * Decodes a cursor token back into sort key and row id.
 * @param cursor - Pagination cursor from the previous page.
 * @returns Encoded cursor token.
 */
export function decodeCursor(cursor) {
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

// Pack a date into a fixed-width string that lex-compares in
// reverse-chronological order — newest first.  Used as the sort key
// for advisor employment rows so we can paginate "most-recent first"
// with the same string-cursor machinery `paginate` uses.
/**
 * Builds a sortable key where newer dates compare first.
 * @param date - Date-like value to compare.
 * @returns Encoded cursor token.
 */
export function inverseDateKey(date) {
  const ms = dateMs(date);
  // 14 digits comfortably covers any plausible epoch-ms value
  // (Number.MAX_SAFE_INTEGER is 16 digits).
  const inv = 99999999999999n - BigInt(Math.max(0, ms));
  return String(inv).padStart(14, "0");
}

// Slice a pre-sorted array after the cursor and return at most `limit`
// items plus the next cursor.  `keyOf(row)` must produce the same value
// the input array was sorted by, AND the sort must be lexical-ascending
// on (keyOf, idOf).
/**
 * Slices sorted rows with deterministic cursor tie-breaking.
 * @param sorted - Rows already sorted for pagination.
 * @param root0 - Cursor and limit options.
 * @param root0.cursor - Pagination cursor from the previous page.
 * @param root0.limit - Requested page size before clamping.
 * @param keyOf - Callback that returns a row sort key.
 * @param idOf - Callback that returns a row identifier.
 * @returns Encoded cursor token.
 */
export function paginate(sorted, { cursor, limit }, keyOf, idOf = r => r.id) {
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
 * @param root0 - Decoded cursor payload.
 * @param root0.sortKey - Last emitted sort key.
 * @param root0.id - Last emitted row ID.
 * @param keyOf - Callback that returns the row sort key.
 * @param idOf - Callback that returns the row ID.
 * @returns Array index where the next page should begin.
 */
function cursorStart(sorted, { sortKey, id }, keyOf, idOf) {
  const index = sorted.findIndex(row => {
    const key = keyOf(row) ?? "";
    return key > sortKey || (key === sortKey && idOf(row) > id);
  });
  return index >= 0 ? index : sorted.length;
}

/**
 * Converts Date-like values into millisecond timestamps for sorting.
 * @param v - Date value from Harper or REST JSON.
 * @returns Encoded cursor token.
 */
export function dateMs(v) {
  if (v == null) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
}
export const cmpAsc = key => (a, b) => dateMs(a[key]) - dateMs(b[key]);
export const cmpDesc = key => (a, b) => dateMs(b[key]) - dateMs(a[key]);

/**
 * Collects rows from Harper search cursors into one array.
 * @param iter - Async iterable to collect.
 * @returns Encoded cursor token.
 */
async function collect(iter) {
  return Array.fromAsync(iter);
}

/**
 * Reads every row from a Harper table regardless of transport.
 * @param table - Harper table name.
 * @returns Encoded cursor token.
 */
export async function all(table) {
  return collect(table.search({}));
}

/**
 * Builds a lookup map for rows keyed by one field.
 * @param rows - Rows to transform or search.
 * @param key - Object key used for indexing.
 * @returns Encoded cursor token.
 */
export function indexBy(rows, key) {
  return new Map(rows.map(row => [row[key], row]));
}

import { all } from "./resource-pagination.js";

/** Minimal subset of a Harper table needed by `all()`. */
interface HarperTableSearchable<T> {
  readonly search: (
    query: Readonly<Record<string, unknown>>
  ) => AsyncIterable<T>;
}

/**
 * Reads every row from a Harper table with a local row type.
 * @param table - Harper table reference.
 * @returns All rows cast to the caller's row type.
 */
export async function allRows<T>(table: unknown): Promise<ReadonlyArray<T>> {
  return all<T>(table as HarperTableSearchable<T>);
}

/**
 * Reads an optional Harper table that may be absent during rolling deploys.
 * @param table - Harper table handle, when this schema has the table.
 * @returns Rows from the table, or an empty array when unavailable.
 */
export async function optionalAll<T>(
  table: unknown
): Promise<ReadonlyArray<T>> {
  return table ? allRows<T>(table) : [];
}

/**
 * Reads rows matching a single indexed attribute via the table's own
 * `search()`, using the same static table handle the rest of the directory
 * resources rely on (not a dynamic `tables` lookup). This is the bounded
 * counterpart to {@link allRows} for hot paths that must avoid full scans.
 * @param table - Harper table reference (statically resolved from `tables`).
 * @param attribute - Indexed attribute name to filter on.
 * @param value - Value the attribute must equal.
 * @returns Matching rows cast to the caller's row type.
 */
export async function rowsByAttribute<T>(
  table: unknown,
  attribute: string,
  value: string
): Promise<ReadonlyArray<T>> {
  const searchable = table as HarperTableSearchable<T>;
  return Array.fromAsync(
    searchable.search({ conditions: [{ attribute, value }] })
  );
}

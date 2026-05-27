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

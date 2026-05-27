/**
 *
 */
interface FirmSourceCliOptions {
  readonly json: boolean;
  readonly write: boolean;
}

/**
 *
 */
type WriteRows = (
  table: string,
  rows: readonly Record<string, unknown>[]
) => Promise<number>;

/**
 * Writes or counts each firm-source table and returns per-table touched counts.
 * @param tables - Ordered table names to process.
 * @param rows - Mapped row bundle keyed by table name.
 * @param options - CLI output and write-mode flags.
 * @param writeRows - Persistence callback for one table.
 * @returns Per-table write or dry-run counts.
 */
export async function touchFirmSourceTables<Table extends string>(
  tables: readonly Table[],
  rows: { readonly [Key in Table]: readonly Record<string, unknown>[] },
  options: FirmSourceCliOptions,
  writeRows: WriteRows
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    tables.map(async table => {
      const tableRows = rows[table];
      const touched = options.write
        ? await writeRows(table, tableRows)
        : tableRows.length;
      if (!options.json) {
        console.log(
          `  ${options.write ? "upsert" : "dry"} ${table}: ${tableRows.length} (${touched} ${options.write ? "touched" : "mapped"})`
        );
      }
      return [table, touched] as const;
    })
  );
  return Object.fromEntries(entries);
}

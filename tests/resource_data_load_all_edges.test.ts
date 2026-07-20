import { describe, expect, it } from "vitest";

import { loadAll, RESOURCE_TABLE_NAMES } from "../src/harper/resource-data.js";

type TestRow = Readonly<Record<string, unknown>>;

interface TestTable {
  readonly search: () => AsyncIterable<TestRow>;
}

const tableWithRows = (rows: readonly TestRow[]): TestTable => ({
  search: async function* () {
    for (const row of rows) yield row;
  },
});

const installTables = (
  overrides: Readonly<Record<string, readonly TestRow[]>>
) => {
  (globalThis as { tables?: Record<string, TestTable> }).tables =
    Object.fromEntries(
      RESOURCE_TABLE_NAMES.map(tableName => [
        tableName,
        tableWithRows(overrides[tableName] ?? []),
      ])
    );
};

describe("resource-data loadAll edges", () => {
  it("does not index BrokerCheck snapshots without subject ids", async () => {
    const globals = globalThis as { tables?: Record<string, TestTable> };
    const previousTables = globals.tables;

    try {
      installTables({
        BrokerCheckSnapshot: [
          { id: "advisor-snapshot-without-subject", subjectKind: "individual" },
          { id: "firm-snapshot-without-subject", subjectKind: "firm" },
        ],
      });

      const db = await loadAll();

      expect(db.bcSnaps).toHaveLength(2);
      expect(db.bcSnapByAdvisor.size).toBe(0);
      expect(db.bcSnapByFirm.size).toBe(0);
    } finally {
      globals.tables = previousTables;
    }
  });
});

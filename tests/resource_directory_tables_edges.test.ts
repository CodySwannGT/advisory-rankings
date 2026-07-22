import { describe, expect, it } from "vitest";

import {
  allRows,
  optionalAll,
  rowsByAttribute,
} from "../src/harper/resource-directory-tables.js";

describe("directory table helpers", () => {
  it("returns an empty row set when an optional table is absent", async () => {
    await expect(optionalAll(undefined)).resolves.toEqual([]);
  });

  it("reads all rows and indexed rows through Harper search cursors", async () => {
    const table = searchableTable([
      { id: "advisor-a", firmId: "firm-a" },
      { id: "advisor-b", firmId: "firm-b" },
    ]);

    await expect(allRows(table)).resolves.toEqual([
      { id: "advisor-a", firmId: "firm-a" },
      { id: "advisor-b", firmId: "firm-b" },
    ]);
    await expect(rowsByAttribute(table, "firmId", "firm-b")).resolves.toEqual([
      { id: "advisor-b", firmId: "firm-b" },
    ]);
    expect(table.queries).toEqual([
      {},
      { conditions: [{ attribute: "firmId", value: "firm-b" }] },
    ]);
  });
});

function searchableTable<T extends Record<string, string>>(rows: readonly T[]) {
  const queries: Readonly<Record<string, unknown>>[] = [];
  return {
    queries,
    search(query: Readonly<Record<string, unknown>>): AsyncIterable<T> {
      queries.push(query);
      return matchingRows(rows, query);
    },
  };
}

async function* matchingRows<T extends Record<string, string>>(
  rows: readonly T[],
  query: Readonly<Record<string, unknown>>
): AsyncIterable<T> {
  const [condition] =
    (query.conditions as
      | readonly [{ readonly attribute: keyof T; readonly value: string }]
      | undefined) ?? [];
  for (const row of rows) {
    if (!condition || row[condition.attribute] === condition.value) yield row;
  }
}

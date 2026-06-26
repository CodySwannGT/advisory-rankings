import { describe, expect, it } from "vitest";
import {
  currentUserId,
  deleteRow,
  positiveInt,
  textValue,
  writeRow,
  type SearchableTable,
} from "../src/harper/resource-user-watchlists-store.js";

const emptySearch = async function* (): AsyncIterable<Record<string, unknown>> {
  yield* [];
};

function table(
  methods: Partial<SearchableTable<Record<string, unknown>>>
): SearchableTable<Record<string, unknown>> {
  return { search: emptySearch, ...methods };
}

describe("user watchlist store fallbacks", () => {
  it("writes through insert and create when put is unavailable", async () => {
    const inserted: Record<string, unknown>[] = [];
    const created: Record<string, unknown>[] = [];

    await writeRow(
      table({
        insert: async row => {
          inserted.push(row);
        },
      }),
      {
        id: "inserted",
      }
    );
    await writeRow(
      table({
        create: async row => {
          created.push(row);
        },
      }),
      {
        id: "created",
      }
    );

    expect(inserted).toEqual([{ id: "inserted" }]);
    expect(created).toEqual([{ id: "created" }]);
  });

  it("throws a tagged service error when no write method is available", async () => {
    await expect(
      writeRow(table({}), { id: "unwritten" })
    ).rejects.toMatchObject({
      message: "User watchlist writes are unavailable",
      status: 503,
    });
  });

  it("deletes through remove when delete is unavailable", async () => {
    const removed: string[] = [];

    await deleteRow(
      table({
        remove: async id => {
          removed.push(id);
        },
      }),
      "entry-1"
    );

    expect(removed).toEqual(["entry-1"]);
  });

  it("throws a tagged service error when no delete method is available", async () => {
    await expect(deleteRow(table({}), "entry-1")).rejects.toMatchObject({
      message: "User watchlist deletes are unavailable",
      status: 503,
    });
  });

  it("derives user ids from fallback identity fields", () => {
    expect(
      currentUserId({ getCurrentUser: () => ({ email: "a@example.com" }) })
    ).toBe("a@example.com");
    expect(
      currentUserId({ getCurrentUser: () => ({ username: "advisor" }) })
    ).toBe("advisor");
    expect(currentUserId({ getCurrentUser: () => ({ id: "" }) })).toBeNull();
    expect(currentUserId({})).toBeNull();
  });

  it("normalizes text and positive integer inputs", () => {
    expect(textValue("  saved list  ", 6)).toBe("saved ");
    expect(textValue(null, 6)).toBe("");
    expect(positiveInt("12px")).toBe(12);
    expect(positiveInt(undefined)).toBeUndefined();
  });
});

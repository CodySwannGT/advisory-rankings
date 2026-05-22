import { describe, expect, it } from "vitest";

/**
 * Handles resource for this workflow.
 * @returns The computed value.
 */
class Resource {
  /**
   * Gets context for downstream processing.
   * @returns The loaded result.
   */
  getContext() {
    return null;
  }
}
(globalThis as any).Resource = Resource;
(globalThis as any).tables = {};

const resources = await import("../src/harper/resources.js");

describe("resource pagination helpers", () => {
  it("round-trips cursors", () => {
    const cursor = resources.encodeCursor("smith", "abc-123");
    expect(resources.decodeCursor(cursor)).toEqual({
      sortKey: "smith",
      id: "abc-123",
    });
    expect(
      resources.decodeCursor("not-a-real-cursor!!!")?.sortKey
    ).toBeUndefined();
  });

  it("walks all rows without skips or duplicates", () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      id: `id-${String(i).padStart(4, "0")}`,
      k: `${String.fromCharCode(97 + (i % 26))}-${String(i).padStart(4, "0")}`,
    })).sort((a, b) => a.k.localeCompare(b.k));
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    while (true) {
      const res = resources.paginate(
        rows,
        { cursor: resources.decodeCursor(cursor), limit: 50 },
        (r: any) => r.k
      );
      seen.push(...res.items.map((r: any) => r.id));
      pages++;
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    expect(pages).toBe(5);
    expect(seen).toEqual(rows.map(r => r.id));
    expect(new Set(seen)).toHaveProperty("size", 250);
  });

  it("uses id tie-breaks and clamps limits", () => {
    const rows = [
      { id: "a", k: "smith" },
      { id: "b", k: "smith" },
      { id: "c", k: "smith" },
      { id: "d", k: "taylor" },
    ];
    const first = resources.paginate(
      rows,
      { cursor: null, limit: 2 },
      (r: any) => r.k
    );
    const second = resources.paginate(
      rows,
      { cursor: resources.decodeCursor(first.nextCursor), limit: 2 },
      (r: any) => r.k
    );
    expect([...first.items, ...second.items].map((r: any) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(resources.parsePagination({ get: () => "500" })).toEqual({
      cursor: "500",
      limit: 100,
    });
  });

  it("sorts inverse dates newest first", () => {
    const keys = ["2020-01-01", "2026-05-03"].map(resources.inverseDateKey);
    expect(keys[1] < keys[0]).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import type {
  UserWatchlistEntryRow,
  UserWatchlistRow,
} from "../src/types/harper-schema.js";

class Resource {}

(globalThis as any).Resource = Resource;
(globalThis as any).databases = {};

const rows = {
  lists: [] as UserWatchlistRow[],
  entries: [] as UserWatchlistEntryRow[],
};

const matches = (row: Record<string, unknown>, query?: any): boolean =>
  (query?.conditions ?? []).every(
    (condition: any) => row[condition.attribute] === condition.value
  );

const tableFor = <Row extends { id: string }>(name: "lists" | "entries") => ({
  get: async (id: string) => rows[name].find(row => row.id === id) ?? null,
  put: async (row: Row) => {
    const index = rows[name].findIndex(candidate => candidate.id === row.id);
    if (index === -1) rows[name].push(row as any);
    else rows[name][index] = row as any;
  },
  delete: async (id: string) => {
    rows[name] = rows[name].filter(row => row.id !== id) as any;
  },
  async *search(query?: any) {
    for (const row of rows[name]) {
      if (matches(row as Record<string, unknown>, query)) yield row as Row;
    }
  },
});

(globalThis as any).tables = {
  UserWatchlist: tableFor<UserWatchlistRow>("lists"),
  UserWatchlistEntry: tableFor<UserWatchlistEntryRow>("entries"),
};

const { UserWatchlists } =
  await import("../src/harper/resource-user-watchlists.js");

const resourceFor = (user: unknown) => {
  const resource = new UserWatchlists();
  Object.assign(resource, { getCurrentUser: () => user });
  return resource;
};

describe("UserWatchlists edge cases", () => {
  beforeEach(() => {
    rows.lists = [
      { id: "list-a", userId: "user-1", name: "Alpha" },
      { id: "list-b", userId: "user-1", name: "Beta" },
      { id: "list-c", userId: "user-2", name: "Other" },
    ];
    rows.entries = [
      {
        id: "list-b:advisor-2",
        listId: "list-b",
        advisorId: "advisor-2",
        rank: undefined,
        note: undefined,
      },
      {
        id: "list-b:advisor-1",
        listId: "list-b",
        advisorId: "advisor-1",
        rank: 1,
        note: "Core holding",
      },
    ];
  });

  it("returns a stable unauthenticated read response", async () => {
    await expect(resourceFor(null).get()).resolves.toEqual({
      authenticated: false,
      lists: [],
    });
  });

  it("scopes reads to the target list and sanitizes entries", async () => {
    await expect(
      resourceFor({ id: "user-1" }).get({ id: "list-b" })
    ).resolves.toEqual({
      authenticated: true,
      lists: [
        {
          id: "list-b",
          name: "Beta",
          entries: [
            {
              id: "list-b:advisor-2",
              listId: "list-b",
              advisorId: "advisor-2",
              rank: null,
              note: "",
            },
            {
              id: "list-b:advisor-1",
              listId: "list-b",
              advisorId: "advisor-1",
              rank: 1,
              note: "Core holding",
            },
          ],
        },
      ],
    });
  });

  it("rejects unsupported mutation actions", async () => {
    await expect(
      resourceFor({ id: "user-1" }).post({ action: "archive" })
    ).rejects.toMatchObject({
      message: "Unsupported watchlist action",
      status: 400,
    });
  });

  it("validates list and advisor identifiers on mutations", async () => {
    await expect(
      resourceFor({ id: "user-1" }).post({ action: "rename", listId: "" })
    ).rejects.toMatchObject({ message: "watchlist id required", status: 400 });
    await expect(
      resourceFor({ id: "user-1" }).post({
        action: "addEntry",
        listId: "list-a",
        advisorId: "",
      })
    ).rejects.toMatchObject({ message: "advisor id required", status: 400 });
  });

  it("rejects missing entries during entry updates and deletes", async () => {
    await expect(
      resourceFor({ id: "user-1" }).post({
        action: "updateEntry",
        listId: "list-a",
        advisorId: "missing",
      })
    ).rejects.toMatchObject({
      message: "watchlist entry not found",
      status: 404,
    });
    await expect(
      resourceFor({ id: "user-1" }).post({
        action: "deleteEntry",
        listId: "list-a",
        advisorId: "missing",
      })
    ).rejects.toMatchObject({
      message: "watchlist entry not found",
      status: 404,
    });
  });

  it("handles create, rename, update, and delete mutation success paths", async () => {
    const resource = resourceFor({ email: "user-1" });

    const created = await resource.post({ action: "", name: " Gamma " });
    expect(created.list.name).toBe("Gamma");
    expect(rows.lists).toContainEqual({
      id: created.list.id,
      userId: "user-1",
      name: "Gamma",
    });

    await expect(
      resource.post({ action: "rename", id: "list-a", name: "Renamed" })
    ).resolves.toMatchObject({ list: { id: "list-a", name: "Renamed" } });
    await expect(
      resource.post({
        action: "updateEntry",
        listId: "list-b",
        advisorId: "advisor-1",
        rank: "3",
        note: "Updated note",
      })
    ).resolves.toMatchObject({
      list: {
        id: "list-b",
        entries: expect.arrayContaining([
          expect.objectContaining({
            advisorId: "advisor-1",
            rank: 3,
            note: "Updated note",
          }),
        ]),
      },
    });
    await expect(
      resource.post({ action: "delete", id: "list-b" })
    ).resolves.toEqual({
      authenticated: true,
      deleted: true,
      listId: "list-b",
    });
    expect(rows.lists.some(row => row.id === "list-b")).toBe(false);
    expect(rows.entries.some(row => row.listId === "list-b")).toBe(false);
  });
});

import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it } from "vitest";
/* eslint-disable jsdoc/require-jsdoc, sonarjs/no-duplicate-string -- Compact resource fixture test. */

class Resource {
  user: unknown = null;

  getCurrentUser() {
    return this.user;
  }
}

(globalThis as any).Resource = Resource;

const rows: any[] = [];
const lists: any[] = [];
const entries: any[] = [];

const table = (source: any[]) => ({
  get: async (id: string) => source.find(row => row.id === id) ?? null,
  search: (query: TableQuery = {}) => matchingRows(source, query.conditions),
  put: async (row: any) => {
    const index = source.findIndex(existing => existing.id === row.id);
    if (index >= 0) source[index] = row;
    else source.push(row);
    return row;
  },
  delete: async (id: string) => {
    const index = source.findIndex(existing => existing.id === id);
    if (index >= 0) source.splice(index, 1);
  },
});

type TableQuery = Readonly<{
  readonly conditions?: ReadonlyArray<{
    readonly attribute: string;
    readonly value: unknown;
  }>;
}>;

async function* matchingRows(
  source: any[],
  conditions: TableQuery["conditions"]
) {
  const matches = conditions?.length
    ? source.filter(row => matchesConditions(row, conditions))
    : source;
  for (const row of matches) yield row;
}

function matchesConditions(row: any, conditions: TableQuery["conditions"]) {
  return conditions?.every(c => row[c.attribute] === c.value) ?? true;
}

(globalThis as any).tables = {
  UserRating: table(rows),
  UserList: table(lists),
  UserListEntry: table(entries),
};
(globalThis as any).databases = {
  data: {
    UserList: table(lists),
    UserListEntry: table(entries),
  },
};

const resources = await import("../src/harper/resource-user-rating.js");
const watchlistResources =
  await import("../src/harper/resource-user-watchlists.js");

const target = (id: string) => ({ id, toString: () => id });

describe("AdvisorRating resource", () => {
  beforeEach(() => {
    rows.length = 0;
    lists.length = 0;
    entries.length = 0;
  });

  it("does not leak private ratings to signed-out users", async () => {
    rows.push({
      id: "user-a-advisor-a",
      userId: "user-a",
      advisorId: "advisor-a",
      ratingInt: 5,
      reviewText: "Private note",
    });

    const endpoint = new resources.AdvisorRating() as any;

    await expect(endpoint.get(target("advisor-a"))).resolves.toEqual({
      authenticated: false,
      rating: null,
    });
    await expect(
      endpoint.post(target("advisor-a"), { ratingInt: 4 })
    ).rejects.toMatchObject({ status: 401 });
  });

  it("saves and reloads only the current user's advisor rating", async () => {
    rows.push({
      id: "user-b-advisor-a",
      userId: "user-b",
      advisorId: "advisor-a",
      ratingInt: 2,
      reviewText: "Other user",
    });
    const endpoint = new resources.AdvisorRating() as any;
    endpoint.user = { username: "user-a" };

    await expect(
      endpoint.post(target("advisor-a"), {
        ratingInt: 5,
        responsiveness: 4,
        transparency: 3,
        performance: 6,
        planningDepth: 1,
        reviewText: "  Strong fit for private client recruiting.  ",
      })
    ).resolves.toEqual({
      authenticated: true,
      rating: {
        advisorId: "advisor-a",
        ratingInt: 5,
        responsiveness: 4,
        transparency: 3,
        performance: null,
        planningDepth: 1,
        reviewText: "Strong fit for private client recruiting.",
      },
    });

    await expect(endpoint.get(target("advisor-a"))).resolves.toMatchObject({
      authenticated: true,
      rating: {
        advisorId: "advisor-a",
        ratingInt: 5,
        reviewText: "Strong fit for private client recruiting.",
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.userId === "user-b")?.ratingInt).toBe(2);
  });

  it("persists reviewText-only POST payloads", async () => {
    const endpoint = new resources.AdvisorRating() as any;
    endpoint.user = { username: "user-a" };

    await expect(
      endpoint.post(target("advisor-a"), { reviewText: "Just a note" })
    ).resolves.toMatchObject({
      authenticated: true,
      rating: {
        advisorId: "advisor-a",
        ratingInt: null,
        reviewText: "Just a note",
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reviewText).toBe("Just a note");
  });
});

describe("UserWatchlists resource", () => {
  beforeEach(() => {
    rows.length = 0;
    lists.length = 0;
    entries.length = 0;
  });

  it("requires sign-in for mutations and returns empty private state", async () => {
    const endpoint = new watchlistResources.UserWatchlists() as any;

    await expect(endpoint.get()).resolves.toEqual({
      authenticated: false,
      lists: [],
    });
    await expect(
      endpoint.post({ action: "create", name: "Targets" })
    ).rejects.toMatchObject({ status: 401 });
  });

  it("creates, renames, adds, reorders, annotates, and deletes entries", async () => {
    const endpoint = new watchlistResources.UserWatchlists() as any;
    endpoint.user = { username: "user-a" };

    const created = await endpoint.post({
      action: "create",
      name: "  Recruiting targets  ",
    });
    const listId = created.list.id;

    await expect(
      endpoint.post({ action: "rename", listId, name: "Priority advisors" })
    ).resolves.toMatchObject({
      authenticated: true,
      list: { id: listId, name: "Priority advisors", entries: [] },
    });

    await endpoint.post({
      action: "addEntry",
      listId,
      advisorId: "advisor-b",
      rank: 2,
      note: "Second call",
    });
    await expect(
      endpoint.post({
        action: "addEntry",
        listId,
        advisorId: "advisor-a",
        rank: 1,
        note: "Top fit",
      })
    ).resolves.toMatchObject({
      list: {
        entries: [
          { advisorId: "advisor-a", rank: 1, note: "Top fit" },
          { advisorId: "advisor-b", rank: 2, note: "Second call" },
        ],
      },
    });

    await expect(
      endpoint.post({
        action: "updateEntry",
        listId,
        advisorId: "advisor-b",
        rank: 3,
        note: "Promoted after review",
      })
    ).resolves.toMatchObject({
      list: {
        entries: [
          { advisorId: "advisor-a", rank: 1 },
          { advisorId: "advisor-b", rank: 3, note: "Promoted after review" },
        ],
      },
    });

    await expect(
      endpoint.post({ action: "deleteEntry", listId, advisorId: "advisor-a" })
    ).resolves.toMatchObject({
      authenticated: true,
      deleted: true,
      list: { entries: [{ advisorId: "advisor-b" }] },
    });
  });

  it("isolates watchlists by server-side current user", async () => {
    lists.push({ id: "list-a", userId: "user-a", name: "A" });
    lists.push({ id: "list-b", userId: "user-b", name: "B" });
    entries.push({
      id: "list-a:advisor-a",
      listId: "list-a",
      advisorId: "advisor-a",
      rank: 1,
      note: "private",
    });
    const endpoint = new watchlistResources.UserWatchlists() as any;
    endpoint.user = { username: "user-b" };

    await expect(endpoint.get()).resolves.toEqual({
      authenticated: true,
      lists: [{ id: "list-b", name: "B", entries: [] }],
    });
    await expect(
      endpoint.post({ action: "rename", listId: "list-a", name: "Stolen" })
    ).rejects.toMatchObject({ status: 404 });
    expect(lists.find(row => row.id === "list-a")?.name).toBe("A");
  });

  it("keeps watchlist tables statically bound for Harper jsResource packaging", async () => {
    const source = await readFile(
      "src/harper/resource-user-watchlists-store.ts",
      "utf8"
    );

    expect(source).toContain("tables.UserList");
    expect(source).toContain("tables.UserListEntry");
    expect(source).toContain("databases.data?.UserList");
    expect(source).toContain("databases.data?.UserListEntry");
    expect(source).not.toContain("Reflect.get(tables");
  });

  it("falls back to the default Harper database registry when tables are unbound", async () => {
    const endpoint = new watchlistResources.UserWatchlists() as any;
    endpoint.user = { username: "user-a" };
    const originalUserList = (globalThis as any).tables.UserList;
    const originalUserListEntry = (globalThis as any).tables.UserListEntry;
    delete (globalThis as any).tables.UserList;
    delete (globalThis as any).tables.UserListEntry;
    try {
      const created = await endpoint.post({
        action: "create",
        name: "Database fallback",
      });

      await expect(endpoint.get()).resolves.toMatchObject({
        authenticated: true,
        lists: [{ id: created.list.id, name: "Database fallback" }],
      });
    } finally {
      (globalThis as any).tables.UserList = originalUserList;
      (globalThis as any).tables.UserListEntry = originalUserListEntry;
    }
  });
});
/* eslint-enable jsdoc/require-jsdoc, sonarjs/no-duplicate-string -- Compact resource fixture test. */

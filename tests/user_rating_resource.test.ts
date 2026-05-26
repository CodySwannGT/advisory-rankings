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

(globalThis as any).tables = {
  UserRating: {
    get: async (id: string) => rows.find(row => row.id === id) ?? null,
    search: ({
      conditions,
    }: { conditions?: Array<{ attribute: string; value: unknown }> } = {}) =>
      (async function* () {
        const matches = conditions?.length
          ? rows.filter(row =>
              conditions.every(c => row[c.attribute] === c.value)
            )
          : rows;
        for (const row of matches) yield row;
      })(),
    put: async (row: any) => {
      const index = rows.findIndex(existing => existing.id === row.id);
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return row;
    },
  },
};

const resources = await import("../src/harper/resource-user-rating.js");

const target = (id: string) => ({ id, toString: () => id });

describe("AdvisorRating resource", () => {
  beforeEach(() => {
    rows.length = 0;
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
/* eslint-enable jsdoc/require-jsdoc, sonarjs/no-duplicate-string -- Compact resource fixture test. */

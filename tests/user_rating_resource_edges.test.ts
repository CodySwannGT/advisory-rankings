import { beforeEach, describe, expect, it } from "vitest";
import type { UserRatingRow } from "../src/types/harper-schema.js";

(globalThis as { Resource?: new () => unknown }).Resource = class {};

const { AdvisorRating } = await import("../src/harper/resource-user-rating.js");
const USER_ID = "user-1";
const ADVISOR_ID = "advisor-1";

async function* rows(
  values: readonly UserRatingRow[]
): AsyncIterable<UserRatingRow> {
  yield* values;
}

function resource(
  user: Record<string, unknown> | null
): InstanceType<typeof AdvisorRating> & { getCurrentUser: () => unknown } {
  const instance = new AdvisorRating() as InstanceType<typeof AdvisorRating> & {
    getCurrentUser: () => unknown;
  };
  instance.getCurrentUser = () => user;
  return instance;
}

beforeEach(() => {
  (globalThis as { tables?: unknown }).tables = {};
});

describe("AdvisorRating resource edges", () => {
  it("returns signed-out state without touching the table", async () => {
    await expect(resource(null).get({ id: ADVISOR_ID })).resolves.toEqual({
      authenticated: false,
      rating: null,
    });
  });

  it("ignores mismatched rows returned by primary-key lookup", async () => {
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: () => rows([]),
      get: async () => ({
        id: `${USER_ID}:${ADVISOR_ID}`,
        userId: USER_ID,
        advisorId: "other-advisor",
        ratingInt: 5,
      }),
    };

    await expect(
      resource({ id: USER_ID }).get({ id: ADVISOR_ID })
    ).resolves.toEqual({
      authenticated: true,
      rating: null,
    });
  });

  it("falls back to search and normalizes sparse rating rows", async () => {
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: () =>
        rows([
          {
            id: `${USER_ID}:${ADVISOR_ID}`,
            userId: USER_ID,
            advisorId: ADVISOR_ID,
            reviewText: undefined,
          },
        ]),
    };

    await expect(
      resource({ email: USER_ID }).get({ id: ADVISOR_ID })
    ).resolves.toMatchObject({
      authenticated: true,
      rating: {
        advisorId: ADVISOR_ID,
        ratingInt: null,
        reviewText: "",
      },
    });
  });

  it("saves through insert when put is unavailable", async () => {
    const saved: UserRatingRow[] = [];
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: () => rows([]),
      insert: row => {
        saved.push(row);
      },
    };

    await expect(
      resource({ username: USER_ID }).post(
        { id: ADVISOR_ID },
        { ratingInt: "5", responsiveness: "9", reviewText: "  helpful  " }
      )
    ).resolves.toMatchObject({
      authenticated: true,
      rating: {
        advisorId: ADVISOR_ID,
        ratingInt: 5,
        responsiveness: null,
        reviewText: "helpful",
      },
    });
    expect(saved).toHaveLength(1);
  });

  it("saves body-only advisor ids through create when insert is unavailable", async () => {
    const saved: UserRatingRow[] = [];
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: () => rows([]),
      create: row => {
        saved.push(row);
      },
    };

    await expect(
      resource({ id: USER_ID }).post({
        advisorId: ADVISOR_ID,
        planningDepth: 4,
      })
    ).resolves.toMatchObject({
      authenticated: true,
      rating: {
        advisorId: ADVISOR_ID,
        planningDepth: 4,
      },
    });
    expect(saved[0]?.id).toBe(`${USER_ID}:${ADVISOR_ID}`);
  });

  it("rejects missing advisor ids and signed-out writes", async () => {
    await expect(resource({ id: USER_ID }).get()).rejects.toMatchObject({
      message: "advisor id required",
      status: 400,
    });
    await expect(
      resource({ id: USER_ID }).post({ reviewText: "missing advisor" })
    ).rejects.toMatchObject({
      message: "advisor id required",
      status: 400,
    });
    await expect(
      resource(null).post({ id: ADVISOR_ID }, { ratingInt: 3 })
    ).rejects.toMatchObject({
      message: "Sign in required",
      status: 401,
    });
  });

  it("reports unavailable writes with a tagged service error", async () => {
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: () => rows([]),
    };

    await expect(
      resource({ id: USER_ID }).post({ id: ADVISOR_ID }, { reviewText: "" })
    ).rejects.toMatchObject({
      message: "UserRating writes are unavailable",
      status: 503,
    });
  });

  it("wraps table read failures with a tagged server error", async () => {
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: async function* () {
        yield* [];
        throw "search failed";
      },
    };

    await expect(
      resource({ id: USER_ID }).get({ id: ADVISOR_ID })
    ).rejects.toMatchObject({
      message: "Failed to load private rating: search failed",
      status: 500,
    });
  });

  it("wraps table write failures with a tagged server error", async () => {
    (globalThis as { tables: Record<string, unknown> }).tables.UserRating = {
      search: () => rows([]),
      insert: () => {
        throw "insert failed";
      },
    };

    await expect(
      resource({ id: USER_ID }).post({ id: ADVISOR_ID }, { ratingInt: 4 })
    ).rejects.toMatchObject({
      message: "Failed to save private rating: insert failed",
      status: 500,
    });
  });
});

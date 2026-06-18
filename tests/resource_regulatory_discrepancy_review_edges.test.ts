import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { RegulatoryDiscrepancyRow } from "../src/types/harper-schema.js";

type DiscrepancyTable = {
  readonly get?: (id: string) => Promise<RegulatoryDiscrepancyRow | undefined>;
  readonly search: () => AsyncIterable<RegulatoryDiscrepancyRow>;
  readonly put?: (row: RegulatoryDiscrepancyRow) => Promise<void>;
  readonly insert?: (row: RegulatoryDiscrepancyRow) => Promise<void>;
  readonly create?: (row: RegulatoryDiscrepancyRow) => Promise<void>;
};

const baseRow: RegulatoryDiscrepancyRow = {
  advisorId: "advisor-1",
  brokerCheckValue: "BrokerCheck",
  fieldName: "firmName",
  id: "disc-1",
  severity: "medium",
  status: "open",
};

const routeTarget = {
  id: "disc-1",
  get: (name: string): string | undefined =>
    name === "id" ? "disc-1" : undefined,
};

let table: DiscrepancyTable;
let ReviewResource: new () => {
  getCurrentUser?: () => unknown;
  get: (target?: unknown) => Promise<unknown>;
  post: (...args: readonly unknown[]) => Promise<{
    readonly discrepancy: RegulatoryDiscrepancyRow;
  }>;
};

async function* rows(
  values: ReadonlyArray<RegulatoryDiscrepancyRow>
): AsyncIterable<RegulatoryDiscrepancyRow> {
  yield* values;
}

describe("RegulatoryDiscrepancyReview", () => {
  beforeAll(async () => {
    Object.assign(globalThis, {
      Resource: class {},
      tables: {},
    });
    ({ RegulatoryDiscrepancyReview: ReviewResource } =
      await import("../src/harper/resource-regulatory-discrepancy-review.js"));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T08:00:00.000Z"));
    table = {
      get: async id => (id === baseRow.id ? baseRow : undefined),
      put: vi.fn(async () => undefined),
      search: () => rows([baseRow]),
    };
    Object.assign(globalThis, {
      tables: { RegulatoryDiscrepancy: table },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists a route-target review with the active user id", async () => {
    const resource = new ReviewResource();
    resource.getCurrentUser = () => ({ id: "analyst-1" });

    const response = await resource.post(routeTarget, {
      reviewerNote: "  prefers BrokerCheck  ",
      status: "accepted_brokercheck",
    });

    expect(response.discrepancy).toMatchObject({
      id: "disc-1",
      reviewerId: "analyst-1",
      reviewerNote: "prefers BrokerCheck",
      reviewedAt: "2026-06-18T08:00:00.000Z",
      status: "accepted_brokercheck",
    });
    expect(table.put).toHaveBeenCalledWith(response.discrepancy);
  });

  it("falls back to searched rows, body ids, note aliases, and insert writes", async () => {
    const inserted = vi.fn(async () => undefined);
    table = {
      insert: inserted,
      search: () => rows([baseRow]),
    };
    Object.assign(globalThis, {
      tables: { RegulatoryDiscrepancy: table },
    });
    const resource = new ReviewResource();
    resource.getCurrentUser = () => ({ email: "analyst@example.com" });

    const response = await resource.post({
      id: "disc-1",
      note: "not actually conflicting",
      status: "not_a_conflict",
    });

    expect(response.discrepancy).toMatchObject({
      reviewerId: "analyst@example.com",
      reviewerNote: "not actually conflicting",
      status: "not_a_conflict",
    });
    expect(inserted).toHaveBeenCalledWith(response.discrepancy);
  });

  it("falls back to create writes when put and insert are unavailable", async () => {
    const created = vi.fn(async () => undefined);
    table = {
      create: created,
      search: () => rows([baseRow]),
    };
    Object.assign(globalThis, {
      tables: { RegulatoryDiscrepancy: table },
    });
    const resource = new ReviewResource();
    resource.getCurrentUser = () => ({ username: "analyst" });

    const response = await resource.post(routeTarget, {
      status: "needs_followup",
    });

    expect(response.discrepancy).toMatchObject({
      reviewerId: "analyst",
      reviewerNote: "",
      status: "needs_followup",
    });
    expect(created).toHaveBeenCalledWith(response.discrepancy);
  });

  it("reports unavailable writes after validating a supported review", async () => {
    table = {
      search: () => rows([baseRow]),
    };
    Object.assign(globalThis, {
      tables: { RegulatoryDiscrepancy: table },
    });
    const resource = new ReviewResource();
    resource.getCurrentUser = () => ({ id: "analyst-1" });

    await expect(
      resource.post(routeTarget, { status: "accepted_advisorhub" })
    ).rejects.toThrow("RegulatoryDiscrepancy writes are unavailable");
  });

  it("rejects unauthenticated reads and unsupported review statuses", async () => {
    const resource = new ReviewResource();

    await expect(resource.get(routeTarget)).rejects.toThrow("Sign in required");

    resource.getCurrentUser = () => ({ username: "analyst" });
    await expect(
      resource.post(routeTarget, { status: "still_open" })
    ).rejects.toThrow("unsupported review status");
  });
});

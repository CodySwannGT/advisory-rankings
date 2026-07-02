import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdvisorCorrectionRequestRow } from "../src/types/harper-schema.js";

interface FakeTable {
  readonly rows: Map<string, AdvisorCorrectionRequestRow>;
  readonly get: (
    id: string
  ) => Promise<AdvisorCorrectionRequestRow | undefined>;
  readonly put: (row: AdvisorCorrectionRequestRow) => Promise<void>;
  readonly search: () => AsyncIterable<AdvisorCorrectionRequestRow>;
}

interface TestResource {
  getCurrentUser?: () => unknown;
  post: (...args: readonly unknown[]) => Promise<{
    readonly request: AdvisorCorrectionRequestRow;
  }>;
}

const REQUEST_ID = "correction:submitter:existing";
const REVIEWER_NOTE = "Confirmed from public filing";

let table: FakeTable;

beforeEach(() => {
  table = createTable([
    {
      id: REQUEST_ID,
      advisorId: "advisor-1",
      fieldName: "firmName",
      displayedValue: "Old Firm",
      proposedValue: "New Firm",
      submitterId: "submitter",
      submitterNote: "",
      sourceType: "",
      sourceRef: "",
      sourceContext: "",
      status: "pending",
    },
  ]);
  vi.stubGlobal("Resource", class {});
  vi.stubGlobal("tables", { AdvisorCorrectionRequest: table });
});

describe("AdvisorCorrectionRequest edge paths", () => {
  it("rejects a review body that omits the correction request id", async () => {
    const resource = await correctionRequestResource({
      id: "reviewer",
      role: "analyst",
    });

    await expect(resource.post({ status: "accepted" })).rejects.toMatchObject({
      message: "correction request id required",
      status: 400,
    });
  });

  it("requires a non-pending status when a route id marks the call as review", async () => {
    const resource = await correctionRequestResource({
      id: "reviewer",
      role: "analyst",
    });

    await expect(
      resource.post(routeTarget(REQUEST_ID), { reviewerNote: "Looks right" })
    ).rejects.toMatchObject({
      message: "review status required",
      status: 400,
    });
  });

  it("falls back from reviewerNote to note for analyst reviews", async () => {
    const resource = await correctionRequestResource({
      id: "reviewer",
      role: { role: "analyst" },
    });

    const response = await resource.post({
      id: REQUEST_ID,
      status: "accepted",
      note: REVIEWER_NOTE,
    });

    expect(response.request.status).toBe("accepted");
    expect(response.request.reviewerId).toBe("reviewer");
    expect(response.request.reviewerNote).toBe(REVIEWER_NOTE);
    expect(table.rows.get(REQUEST_ID)?.reviewerNote).toBe(REVIEWER_NOTE);
  });

  it("treats missing and malformed current-user roles as non-analyst", async () => {
    const user = vi
      .fn()
      .mockReturnValueOnce({ id: "reviewer" })
      .mockReturnValueOnce(null);
    const resource = await correctionRequestResource(user);

    await expect(
      resource.post({ id: REQUEST_ID, status: "accepted" })
    ).rejects.toMatchObject({
      message: "Analyst role required",
      status: 403,
    });

    const malformedRole = await correctionRequestResource({
      id: "reviewer",
      role: { role: 42 },
    });
    await expect(
      malformedRole.post({ id: REQUEST_ID, status: "accepted" })
    ).rejects.toMatchObject({
      message: "Analyst role required",
      status: 403,
    });
  });

  it("validates required text fields before creating a request", async () => {
    const resource = await correctionRequestResource({ id: "submitter" });

    await expect(
      resource.post({
        advisorId: "advisor-1",
        fieldName: " ",
        proposedValue: "Corrected value",
      })
    ).rejects.toMatchObject({
      message: "field name required",
      status: 400,
    });
  });
});

function createTable(rows: readonly AdvisorCorrectionRequestRow[]): FakeTable {
  const storedRows = new Map(rows.map(row => [row.id, row]));
  return {
    rows: storedRows,
    get: async id => storedRows.get(id),
    put: async row => {
      storedRows.set(row.id, row);
    },
    search: async function* () {
      yield* storedRows.values();
    },
  };
}

async function correctionRequestResource(
  user: unknown | (() => unknown)
): Promise<TestResource> {
  const { AdvisorCorrectionRequest } =
    await import("../src/harper/resource-advisor-correction-request.js");
  const resource = new AdvisorCorrectionRequest() as TestResource;
  resource.getCurrentUser = typeof user === "function" ? user : () => user;
  return resource;
}

function routeTarget(id: string): {
  readonly id: string;
  readonly get: () => string;
} {
  return { id, get: () => id };
}

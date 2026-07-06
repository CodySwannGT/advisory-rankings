import { describe, expect, it, vi } from "vitest";

import type { AdvisorCorrectionRequestRow } from "../src/types/harper-schema.js";

const loadTables = vi.fn();

vi.mock("../src/harper/resource-data.js", () => ({ loadTables }));

const { correctionRequestQueue } =
  await import("../src/harper/resource-advisor-correction-queue.js");

describe("advisor correction request queue edges", () => {
  it("sorts tied pending requests and normalizes optional queue fields", async () => {
    loadTables.mockResolvedValue({
      byAdvisor: new Map([
        [
          "advisor-1",
          {
            id: "advisor-1",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        ],
      ]),
      byFirm: new Map([["firm-1", { id: "firm-1", name: "Analyst Firm" }]]),
      employments: [
        {
          advisorId: "advisor-1",
          firmId: "firm-1",
          startDate: null,
        },
      ],
    });

    const response = await correctionRequestQueue(
      table([
        correctionRow({
          id: "request-b",
          advisorId: "advisor-1",
          createdAt: "not-a-date",
          displayedValue: "",
          sourceRef: "",
          submitterNote: "",
        }),
        correctionRow({
          id: "request-a",
          advisorId: "missing-advisor",
          createdAt: "not-a-date",
          sourceType: "public-record",
          updatedAt: "2026-01-02",
        }),
        correctionRow({
          id: "reviewed-request",
          status: "accepted",
        }),
      ])
    );

    expect(response.summary.pending).toBe(2);
    expect(response.summary.oldestAgeDays).toBeNull();
    expect(response.items.map(item => item.id)).toEqual([
      "request-a",
      "request-b",
    ]);
    expect(response.items[0]).toMatchObject({
      advisorName: "missing-advisor",
      firmName: null,
      sourceType: "public-record",
      updatedAt: "2026-01-02",
      ageDays: null,
    });
    expect(response.items[1]).toMatchObject({
      advisorName: "Ada Lovelace",
      firmName: "Analyst Firm",
      displayedValue: null,
      submitterNote: null,
      sourceRef: null,
    });
  });
});

function table(rows: readonly AdvisorCorrectionRequestRow[]): {
  readonly search: (
    query?: Readonly<Record<string, unknown>>
  ) => AsyncIterable<AdvisorCorrectionRequestRow>;
} {
  return {
    search: async function* (query) {
      const condition = (
        query?.conditions as
          | readonly [{ readonly attribute: string; readonly value: string }]
          | undefined
      )?.[0];
      for (const row of rows) {
        if (
          !condition ||
          Reflect.get(row, condition.attribute) === condition.value
        ) {
          yield row;
        }
      }
    },
  };
}

function correctionRow(
  overrides: Partial<AdvisorCorrectionRequestRow>
): AdvisorCorrectionRequestRow {
  return {
    id: "request",
    advisorId: "advisor-1",
    fieldName: "firmName",
    displayedValue: "Old Firm",
    proposedValue: "New Firm",
    submitterId: "submitter",
    submitterNote: "Please fix",
    sourceType: "",
    sourceRef: "source",
    sourceContext: "",
    status: "pending",
    ...overrides,
  };
}

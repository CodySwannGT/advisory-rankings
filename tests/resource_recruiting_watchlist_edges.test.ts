import { describe, expect, it } from "vitest";

import type { ResourceIndex } from "../src/harper/resource-data.js";
import type {
  WatchlistFilters,
  WatchlistMove,
} from "../src/harper/resource-recruiting-watchlist.js";
import type { FirmRow } from "../src/types/harper-schema.js";

import {
  firmIdsForFilter,
  watchlistFilters,
  watchlistPayload,
} from "../src/harper/resource-recruiting-watchlist.js";

const EXAMPLE_FIRM: FirmRow = {
  id: "firm-example",
  name: "Example Wealth LLC",
  channel: "ria",
};
const PRIMARY_FIRM_ID = "firm-primary";

const dbFor = (firm: FirmRow, byFirm = new Map<string, FirmRow>()) =>
  ({
    firms: [firm],
    branches: [],
    employments: [],
    byFirm,
  }) as unknown as ResourceIndex;

describe("recruiting watchlist edge cases", () => {
  it("parses single-value firm filters without getAll support", () => {
    const filters = watchlistFilters(
      {
        get: name => (name === "firm" ? " , Example Wealth LLC,  ," : ""),
      },
      dbFor(EXAMPLE_FIRM, new Map([[EXAMPLE_FIRM.id, EXAMPLE_FIRM]]))
    );

    expect(filters).toEqual([{ query: EXAMPLE_FIRM.name, firm: EXAMPLE_FIRM }]);
  });

  it("falls back to the primary firm id only when no watchlist firms resolve", () => {
    const unresolvedFilters: WatchlistFilters = {
      firmId: PRIMARY_FIRM_ID,
      watchItems: [{ query: "Missing Firm", firm: null }],
    };
    const resolvedFilters: WatchlistFilters = {
      firmId: PRIMARY_FIRM_ID,
      watchItems: [{ query: EXAMPLE_FIRM.name, firm: EXAMPLE_FIRM }],
    };

    expect(firmIdsForFilter(unresolvedFilters)).toEqual([PRIMARY_FIRM_ID]);
    expect(firmIdsForFilter(resolvedFilters)).toEqual([EXAMPLE_FIRM.id]);
    expect(firmIdsForFilter({ firmId: null, watchItems: [] })).toEqual([]);
  });

  it("keeps a resolved firm when compact firm-chip lookup misses", () => {
    const inboundMove: WatchlistMove = {
      id: "move-inbound",
      toFirm: { id: EXAMPLE_FIRM.id, name: EXAMPLE_FIRM.name },
      aumMoved: "125000000",
      productionT12: "750000",
      sourceStatus: ["verified"],
    };
    const outboundMove: WatchlistMove = {
      id: "move-outbound",
      fromFirm: { id: EXAMPLE_FIRM.id, name: EXAMPLE_FIRM.name },
      aumMoved: "",
      productionT12: null,
      sourceStatus: ["missing-source", "missing-location"],
    };

    const payload = watchlistPayload(
      dbFor(EXAMPLE_FIRM),
      [inboundMove, outboundMove],
      {
        firmId: null,
        watchItems: [{ query: EXAMPLE_FIRM.name, firm: EXAMPLE_FIRM }],
      },
      "2026-08-13T07:00:00.000Z"
    );

    expect(payload).toMatchObject({
      count: 1,
      summary: {
        inbound: {
          count: 1,
          knownAum: 125_000_000,
          unknownAumCount: 0,
          missingT12Count: 0,
        },
        outbound: {
          count: 1,
          knownAum: 0,
          unknownAumCount: 1,
          missingT12Count: 1,
        },
        netMoveCount: 0,
        netKnownAum: 125_000_000,
      },
      items: [
        {
          query: EXAMPLE_FIRM.name,
          firm: EXAMPLE_FIRM,
          sourceCoverage: {
            moveCount: 2,
            sourceBackedCount: 1,
            missingSourceCount: 1,
            missingLocationCount: 1,
          },
          sourceMoveIds: ["move-inbound", "move-outbound"],
          sourceStatus: ["missing-location", "missing-source", "verified"],
        },
      ],
    });
  });
});

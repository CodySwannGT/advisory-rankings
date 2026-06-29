import { beforeEach, describe, expect, it, vi } from "vitest";

const harperMocks = vi.hoisted(() => ({
  op: vi.fn(),
  sql: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../src/lib/harper.js", () => harperMocks);

const { createHarperOpAdvisorSearchIndexHandle } =
  await import("../src/lib/advisor-search-index.js");

describe("Harper operations advisor search index handle edges", () => {
  beforeEach(() => {
    harperMocks.op.mockReset();
    harperMocks.sql.mockReset();
    harperMocks.upsert.mockReset();
  });

  it("escapes SQL reads and narrows raw rows", async () => {
    harperMocks.sql
      .mockResolvedValueOnce([
        {
          id: "advisor-1",
          legalName: "Jane Q. Advisor",
          firstName: "Jane",
          lastName: null,
          preferredName: 42,
        },
      ])
      .mockResolvedValueOnce([
        { id: "token-1", advisorId: "advisor-1", token: "jane", kind: "name" },
      ])
      .mockResolvedValueOnce([]);

    const handle = createHarperOpAdvisorSearchIndexHandle();

    await expect(handle.getAdvisor("advisor'1")).resolves.toEqual({
      id: "advisor-1",
      legalName: "Jane Q. Advisor",
      firstName: "Jane",
      lastName: null,
      preferredName: null,
    });
    await expect(handle.listTokensForAdvisor("advisor'1")).resolves.toEqual([
      { id: "token-1", advisorId: "advisor-1", token: "jane", kind: "name" },
    ]);
    await expect(handle.getAdvisor("missing")).resolves.toBeNull();
    expect(harperMocks.sql.mock.calls[0]?.[0]).toContain("advisor''1");
    expect(harperMocks.sql.mock.calls[1]?.[0]).toContain("advisor''1");
  });

  it("skips empty writes and sends non-empty rows to Harper", async () => {
    const handle = createHarperOpAdvisorSearchIndexHandle();

    await handle.upsertTokens([]);
    await handle.deleteTokens([]);

    expect(harperMocks.upsert).not.toHaveBeenCalled();
    expect(harperMocks.op).not.toHaveBeenCalled();

    await handle.upsertTokens([
      { id: "token-1", advisorId: "advisor-1", token: "jane", kind: "name" },
    ]);
    await handle.deleteTokens(["token-1"]);

    expect(harperMocks.upsert).toHaveBeenCalledWith("AdvisorSearchIndex", [
      { id: "token-1", advisorId: "advisor-1", token: "jane", kind: "name" },
    ]);
    expect(harperMocks.op).toHaveBeenCalledWith({
      operation: "delete",
      database: "data",
      table: "AdvisorSearchIndex",
      hash_values: ["token-1"],
    });
  });
});

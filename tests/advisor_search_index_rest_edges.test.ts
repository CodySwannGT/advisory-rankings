import { describe, expect, it, vi } from "vitest";

import {
  createRestAdvisorSearchIndexHandle,
  type AdvisorSearchIndexRow,
} from "../src/lib/advisor-search-index.js";

const makeRest = () => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
});

const tokenRow = (index: number): AdvisorSearchIndexRow => ({
  id: `token-${index}`,
  advisorId: "advisor-1",
  token: `token-${index}`,
  kind: "name",
});

describe("createRestAdvisorSearchIndexHandle edge cases", () => {
  it("coerces malformed REST advisor and token rows defensively", async () => {
    const rest = makeRest();
    rest.get
      .mockResolvedValueOnce([
        {
          id: 123,
          legalName: "Example Advisor",
          firstName: 42,
          lastName: null,
          preferredName: ["not", "a", "string"],
        },
      ])
      .mockResolvedValueOnce([
        { id: 123, advisorId: null, token: undefined, kind: 99 },
        null,
        ["not", "a", "record"],
      ]);
    const handle = createRestAdvisorSearchIndexHandle(rest as any);

    await expect(handle.getAdvisor("advisor-1")).resolves.toEqual({
      id: "123",
      legalName: "Example Advisor",
      firstName: null,
      lastName: null,
      preferredName: null,
    });
    await expect(handle.listTokensForAdvisor("advisor-1")).resolves.toEqual([
      { id: "123", advisorId: "", token: "", kind: "99" },
      { id: "", advisorId: "", token: "", kind: "" },
      { id: "", advisorId: "", token: "", kind: "" },
    ]);
  });

  it("treats non-array REST reads as empty results", async () => {
    const rest = makeRest();
    rest.get.mockResolvedValueOnce({ id: "advisor-1" }).mockResolvedValueOnce({
      id: "token-1",
    });
    const handle = createRestAdvisorSearchIndexHandle(rest as any);

    await expect(handle.getAdvisor("advisor-1")).resolves.toBeNull();
    await expect(handle.listTokensForAdvisor("advisor-1")).resolves.toEqual([]);
  });

  it("does not write or delete empty batches", async () => {
    const rest = makeRest();
    const handle = createRestAdvisorSearchIndexHandle(rest as any);

    await handle.upsertTokens([]);
    await handle.deleteTokens([]);

    expect(rest.put).not.toHaveBeenCalled();
    expect(rest.delete).not.toHaveBeenCalled();
  });

  it("reports PUT failures with the failing batch size", async () => {
    const rest = makeRest();
    rest.put.mockResolvedValue(true).mockResolvedValueOnce(false);
    const handle = createRestAdvisorSearchIndexHandle(rest as any);

    await expect(
      handle.upsertTokens(
        Array.from({ length: 26 }, (_unused, index) => tokenRow(index))
      )
    ).rejects.toThrow(
      "advisor-search-index: 1/25 AdvisorSearchIndex PUTs failed"
    );
  });

  it("continues DELETE batches until a later batch fails", async () => {
    const rest = makeRest();
    rest.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const handle = createRestAdvisorSearchIndexHandle(rest as any);

    await expect(handle.deleteTokens(["token-1", "token-2"])).rejects.toThrow(
      "advisor-search-index: 1/2 AdvisorSearchIndex DELETEs failed"
    );
  });
});

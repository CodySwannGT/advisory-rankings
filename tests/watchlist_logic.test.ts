import { describe, expect, it } from "vitest";

import {
  addEntryBody,
  canMutate,
  createListBody,
  deleteEntryBody,
  deleteListBody,
  nextRank,
  normalizeWatchlistResponse,
  reorderEntries,
  renameListBody,
  signInGuidance,
  updateEntryBody,
} from "../src/web/watchlist-logic.js";

describe("watchlist request bodies", () => {
  it("builds a create-list body from a trimmed name", () => {
    expect(createListBody("  Top targets  ")).toEqual({
      action: "create",
      name: "Top targets",
    });
  });

  it("builds a rename-list body", () => {
    expect(renameListBody("list-1", "  Renamed ")).toEqual({
      action: "rename",
      listId: "list-1",
      name: "Renamed",
    });
  });

  it("builds a delete-list body", () => {
    expect(deleteListBody("list-1")).toEqual({
      action: "delete",
      listId: "list-1",
    });
  });

  it("builds an add-entry body with a 1-based rank and trimmed note", () => {
    expect(addEntryBody("list-1", "advisor-9", 2, "  watch closely ")).toEqual({
      action: "addEntry",
      listId: "list-1",
      advisorId: "advisor-9",
      rank: 2,
      note: "watch closely",
    });
  });

  it("omits the note when blank but keeps an explicit empty string", () => {
    expect(addEntryBody("list-1", "advisor-9", 1, "")).toEqual({
      action: "addEntry",
      listId: "list-1",
      advisorId: "advisor-9",
      rank: 1,
      note: "",
    });
  });

  it("builds an update-entry body for note edits", () => {
    expect(updateEntryBody("list-1", "advisor-9", 3, "new note")).toEqual({
      action: "updateEntry",
      listId: "list-1",
      advisorId: "advisor-9",
      rank: 3,
      note: "new note",
    });
  });

  it("builds a delete-entry body", () => {
    expect(deleteEntryBody("list-1", "advisor-9")).toEqual({
      action: "deleteEntry",
      listId: "list-1",
      advisorId: "advisor-9",
    });
  });
});

describe("reorderEntries", () => {
  const entries = [
    { id: "e1", listId: "l", advisorId: "a", rank: 1, note: "" },
    { id: "e2", listId: "l", advisorId: "b", rank: 2, note: "" },
    { id: "e3", listId: "l", advisorId: "c", rank: 3, note: "" },
  ] as const;

  it("moves an entry up and reassigns contiguous 1-based ranks", () => {
    const moved = reorderEntries(entries, "b", "up");
    expect(moved.map(entry => entry.advisorId)).toEqual(["b", "a", "c"]);
    expect(moved.map(entry => entry.rank)).toEqual([1, 2, 3]);
  });

  it("moves an entry down", () => {
    const moved = reorderEntries(entries, "b", "down");
    expect(moved.map(entry => entry.advisorId)).toEqual(["a", "c", "b"]);
    expect(moved.map(entry => entry.rank)).toEqual([1, 2, 3]);
  });

  it("is a no-op when moving the first entry up", () => {
    const moved = reorderEntries(entries, "a", "up");
    expect(moved.map(entry => entry.advisorId)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when moving the last entry down", () => {
    const moved = reorderEntries(entries, "c", "down");
    expect(moved.map(entry => entry.advisorId)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when the advisor is not on the list", () => {
    const moved = reorderEntries(entries, "missing", "up");
    expect(moved.map(entry => entry.advisorId)).toEqual(["a", "b", "c"]);
  });
});

describe("nextRank", () => {
  it("places a new advisor one past the current entry count", () => {
    expect(nextRank([])).toBe(1);
    expect(
      nextRank([
        { id: "e1", listId: "l", advisorId: "a", rank: 1, note: "" },
        { id: "e2", listId: "l", advisorId: "b", rank: 2, note: "" },
      ])
    ).toBe(3);
  });

  it("ignores any gaps in stored rank values and counts entries", () => {
    expect(
      nextRank([
        { id: "e1", listId: "l", advisorId: "a", rank: 5, note: "" },
        { id: "e2", listId: "l", advisorId: "b", rank: null, note: "" },
      ])
    ).toBe(3);
  });
});

describe("auth gating", () => {
  it("allows mutation only for an authenticated session", () => {
    expect(canMutate({ authenticated: true })).toBe(true);
    expect(canMutate({ authenticated: false })).toBe(false);
    expect(canMutate(null)).toBe(false);
    expect(canMutate({ authUnavailable: true })).toBe(false);
  });

  it("offers a safe sign-in path without leaking private data", () => {
    const guidance = signInGuidance();
    expect(guidance.href).toBe("/login");
    expect(guidance.label.toLowerCase()).toContain("sign in");
    expect(guidance.message.toLowerCase()).toContain("sign in");
    // The guidance must never embed list/advisor identifiers.
    expect(guidance.message).not.toMatch(/list-|advisor-/);
  });
});

describe("normalizeWatchlistResponse", () => {
  it("returns authenticated lists sorted by saved rank with default notes", () => {
    const view = normalizeWatchlistResponse({
      authenticated: true,
      lists: [
        {
          id: "list-1",
          name: "Targets",
          entries: [
            { id: "e2", listId: "list-1", advisorId: "b", rank: 2, note: "x" },
            { id: "e1", listId: "list-1", advisorId: "a", rank: 1, note: null },
          ],
        },
      ],
    });
    expect(view.authenticated).toBe(true);
    expect(view.lists[0]?.entries.map(entry => entry.advisorId)).toEqual([
      "a",
      "b",
    ]);
    expect(view.lists[0]?.entries[0]?.note).toBe("");
  });

  it("treats malformed payloads as an unauthenticated empty view", () => {
    expect(normalizeWatchlistResponse(null)).toEqual({
      authenticated: false,
      lists: [],
    });
    expect(normalizeWatchlistResponse({ lists: "nope" })).toEqual({
      authenticated: false,
      lists: [],
    });
  });
});

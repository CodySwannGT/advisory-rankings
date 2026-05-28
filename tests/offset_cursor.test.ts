import { describe, expect, it } from "vitest";

import {
  decodeOffsetCursor,
  encodeOffsetCursor,
} from "../src/harper/resource-pagination.js";

describe("offset cursor codec", () => {
  it("round-trips small offsets", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(0))).toBe(0);
    expect(decodeOffsetCursor(encodeOffsetCursor(1))).toBe(1);
    expect(decodeOffsetCursor(encodeOffsetCursor(50))).toBe(50);
    expect(decodeOffsetCursor(encodeOffsetCursor(12_345))).toBe(12_345);
  });

  it("treats null and empty cursors as offset 0", () => {
    expect(decodeOffsetCursor(null)).toBe(0);
    expect(decodeOffsetCursor(undefined)).toBe(0);
    expect(decodeOffsetCursor("")).toBe(0);
  });

  it("decodes garbage cursors to offset 0 instead of throwing", () => {
    expect(decodeOffsetCursor("@@@not-valid@@@")).toBe(0);
  });

  it("clamps negative or non-integer encode inputs to a stable token", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(-5))).toBe(0);
    expect(decodeOffsetCursor(encodeOffsetCursor(3.7))).toBe(3);
  });

  it("emits URL-safe tokens (base64url alphabet only)", () => {
    const token = encodeOffsetCursor(987_654);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

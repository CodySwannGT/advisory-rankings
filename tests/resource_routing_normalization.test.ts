import { describe, expect, it } from "vitest";

import { normalizeRouteTarget } from "../src/harper/resource-routing-normalization.js";

describe("resource routing normalization", () => {
  it("uses an object target string fallback when id is absent", () => {
    const target = {
      toString: () => "/firm-directory",
    };

    expect(normalizeRouteTarget(target)).toBe("firm-directory");
  });

  it("extracts UUIDs from slugged route targets", () => {
    expect(
      normalizeRouteTarget(
        "/advisor/ada-lovelace-123e4567-e89b-12d3-a456-426614174000"
      )
    ).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
});

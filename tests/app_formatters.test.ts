import { describe, expect, it } from "vitest";

import { initials } from "../src/web/app-formatters.js";

describe("app formatters", () => {
  it("uses letters only for display-name initials", () => {
    expect(initials('Anupam Johri "AJ"')).toBe("AA");
    expect(initials('"AJ"')).toBe("AJ");
    expect(initials("!!!")).toBe("?");
  });
});

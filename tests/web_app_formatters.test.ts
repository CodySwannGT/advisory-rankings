import { describe, expect, it } from "vitest";

import { initials } from "../src/web/app-formatters.js";

describe("web app formatters", () => {
  it("strips nickname punctuation from avatar initials", () => {
    expect(initials('Anupam Johri "AJ"')).toMatch(/^[A-Z]{1,2}$/u);
    expect(initials('Anupam Johri "AJ"')).toBe("AA");
  });
});

import { describe, expect, it } from "vitest";
import { deriveDek } from "../src/harper/resource-feed.js";

describe("resource feed article summaries", () => {
  it("renders enriched transition subjects as readable text", () => {
    const dek = deriveDek({}, [
      {
        kind: "transition",
        subject: { kind: "team", name: "The Taylor Group" },
        fromFirm: { short: "Morgan Stanley" },
        toFirm: { short: "Wells Fargo" },
        aumMoved: 5_940_000_000,
      },
    ]);

    expect(dek).toBe(
      "The Taylor Group moves from Morgan Stanley to Wells Fargo ($5.94B AUM)."
    );
    expect(dek).not.toContain("[object Object]");
  });
});

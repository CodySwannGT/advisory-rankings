import { describe, expect, it } from "vitest";
import { deriveDek } from "../src/harper/resource-feed.js";

describe("resource feed article summaries", () => {
  it("falls back to body previews without cutting short snippets", () => {
    expect(deriveDek({ bodyText: "Brief advisor move note" }, [])).toBe(
      "Brief advisor move note…"
    );
  });

  it("keeps long unbroken body previews intact through the snippet boundary", () => {
    const unbrokenText = "a".repeat(260);

    expect(deriveDek({ bodyText: unbrokenText }, [])).toBe(
      `${"a".repeat(240)}…`
    );
  });

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

  it("uses transition subject kind and id fallbacks in display text", () => {
    expect(
      deriveDek({}, [
        {
          kind: "transition",
          subject: { kind: "firm", id: "firm-only" },
          fromFirm: { short: "Old Firm" },
          toFirm: { short: "New Firm" },
        },
      ])
    ).toBe("firm moves from Old Firm to New Firm.");

    expect(
      deriveDek({}, [
        {
          kind: "transition",
          subject: { id: "solo-id" },
          fromFirm: { short: "Old Firm" },
          toFirm: { short: "New Firm" },
        },
      ])
    ).toBe("solo-id moves from Old Firm to New Firm.");
  });
});

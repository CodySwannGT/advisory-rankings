import { describe, expect, it } from "vitest";
import { articleId, firmId, slugify, uid } from "../src/lib/ids.js";

describe("deterministic ids", () => {
  it("matches the established UUIDv5 namespace", () => {
    expect(uid("advisor:cjt")).toBe("4fbd3720-bde5-5cd5-b1a2-7b37424ad7ea");
    expect(firmId("Morgan Stanley")).toBe(
      "8e106b7e-efcc-5aed-8827-fd0ea645b6df"
    );
    expect(
      articleId(
        "https://www.advisorhub.com/6b-morgan-stanley-team-jumps-to-wells-fargo-advisors-in-nyc/"
      )
    ).toBe("0940d374-3476-56c8-9b1e-86701f84a9f2");
  });

  it("keeps Python slug rules", () => {
    expect(slugify("Hennion & Walsh, LLC")).toBe("hennion_and_walsh_llc");
  });
});

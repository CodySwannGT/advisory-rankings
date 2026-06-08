import { describe, expect, it } from "vitest";

import { buildRecruitingResourceQuery } from "../src/web/recruiting-query.js";

describe("buildRecruitingResourceQuery", () => {
  it("preserves recruiting filters while adding the requested limit", () => {
    expect(
      buildRecruitingResourceQuery(
        "?firm=Morgan%20Stanley&firm=UBS&firmId=firm-1&state=NY&year=2026&direction=inbound&ignored=x",
        30
      )
    ).toBe(
      "?firm=Morgan+Stanley&firm=UBS&firmId=firm-1&state=NY&year=2026&direction=inbound&limit=30"
    );
  });
});

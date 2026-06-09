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

  it("drops blank and unsupported filters while replacing any caller limit", () => {
    expect(
      buildRecruitingResourceQuery(
        "?firm=&firm=UBS&state=&year=2026&direction=outbound&limit=500&page=4",
        12
      )
    ).toBe("?firm=UBS&year=2026&direction=outbound&limit=12");
  });

  it("returns only the requested limit when no supported filters are present", () => {
    expect(buildRecruitingResourceQuery("?ignored=x", 25)).toBe("?limit=25");
  });
});

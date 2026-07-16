import { describe, expect, it } from "vitest";
import { RBC_SOURCE_ADAPTER, buildRbcSearchUrl } from "../src/lib/rbc.js";
import {
  STIFEL_SOURCE_ADAPTER,
  buildStifelSearchUrl,
} from "../src/lib/stifel.js";
import { UBS_SOURCE_ADAPTER, buildUbsSearchUrl } from "../src/lib/ubs.js";

describe("firm source adapter URL builders", () => {
  it("builds RBC source adapter URLs from the shared search URL builder", () => {
    const directUrl = buildRbcSearchUrl({
      input: "Charlotte",
      limit: 20,
      offset: 40,
    });

    expect(RBC_SOURCE_ADAPTER.buildSearchUrl("Charlotte", 20, 40)).toBe(
      directUrl
    );
  });

  it("builds Stifel source adapter URLs from the shared search URL builder", () => {
    const directUrl = buildStifelSearchUrl({
      input: "MO",
      limit: 25,
      offset: 50,
    });

    expect(STIFEL_SOURCE_ADAPTER.buildSearchUrl("MO", 25, 50)).toBe(directUrl);
  });

  it("builds UBS source adapter URLs from the shared search URL builder", () => {
    const directUrl = buildUbsSearchUrl({
      input: "Boston",
      limit: 10,
      offset: 30,
    });

    expect(UBS_SOURCE_ADAPTER.buildSearchUrl("Boston", 10, 30)).toBe(directUrl);
  });
});

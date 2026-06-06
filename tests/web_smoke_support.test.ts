import { describe, expect, it } from "vitest";
import { normalizeSmokeBaseUrl } from "./web_smoke_support.js";

describe("normalizeSmokeBaseUrl", () => {
  it("removes trailing slashes from deployed targets", () => {
    expect(
      normalizeSmokeBaseUrl(
        "https://advisory-rankings-de.cody-swann-org.harperfabric.com/"
      )
    ).toBe("https://advisory-rankings-de.cody-swann-org.harperfabric.com");
  });

  it("keeps slashless and trailing-slash targets route-equivalent", () => {
    const slashless = "https://example.test";
    const trailingSlash = "https://example.test/";
    const routes = ["/", "/Search", "/firms"] as const;

    const slashlessUrls = routes.map(
      route => `${normalizeSmokeBaseUrl(slashless)}${route}`
    );
    const trailingSlashUrls = routes.map(
      route => `${normalizeSmokeBaseUrl(trailingSlash)}${route}`
    );

    expect(trailingSlashUrls).toEqual(slashlessUrls);
    expect(trailingSlashUrls).toEqual([
      "https://example.test/",
      "https://example.test/Search",
      "https://example.test/firms",
    ]);
  });
});

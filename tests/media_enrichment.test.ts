import { describe, expect, it } from "vitest";
import {
  absoluteHttpUrl,
  extractMediaCandidates,
  parseDuckDuckGoResults,
  unwrapDuckDuckGoUrl,
} from "../src/lib/media-enrichment.js";

describe("media enrichment helpers", () => {
  it("normalizes and filters URLs", () => {
    expect(absoluteHttpUrl("/logo.png", "https://example.com/about")).toBe(
      "https://example.com/logo.png"
    );
    expect(
      absoluteHttpUrl("mailto:hello@example.com", "https://example.com")
    ).toBeNull();
  });

  it("parses DuckDuckGo result links", () => {
    const wrapped =
      "/l/?uddg=https%3A%2F%2Fexample.com%2Fadvisor-profile&rut=abc";
    expect(unwrapDuckDuckGoUrl(wrapped)).toBe(
      "https://example.com/advisor-profile"
    );
    expect(
      parseDuckDuckGoResults(
        `<a class="result__a" href="${wrapped}">Profile</a>`
      )
    ).toEqual(["https://example.com/advisor-profile"]);
  });

  it("scores firm logos and advisor headshots from HTML", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/generic-share.jpg">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <img alt="Example Wealth logo" src="/assets/example-logo.png">
          <img alt="Alex Example headshot" src="/assets/alex.jpg">
        </body>
      </html>
    `;

    expect(
      extractMediaCandidates(
        html,
        "https://example.com/team",
        "Example Wealth",
        "firm"
      )[0]
    ).toMatchObject({
      url: "https://example.com/assets/example-logo.png",
    });
    expect(
      extractMediaCandidates(
        html,
        "https://example.com/team",
        "Alex Example",
        "advisor"
      )[0]
    ).toMatchObject({
      url: "https://example.com/assets/alex.jpg",
    });
  });
});

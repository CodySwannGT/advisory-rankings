import { describe, expect, it } from "vitest";
import {
  absoluteHttpUrl,
  extractMediaCandidates,
  parseDuckDuckGoResults,
  unwrapDuckDuckGoUrl,
} from "../src/lib/media-enrichment.js";

const EXAMPLE_TEAM_URL = "https://example.com/team";

describe("media enrichment helpers", () => {
  it("normalizes and filters URLs", () => {
    expect(absoluteHttpUrl("/logo.png", "https://example.com/about")).toBe(
      "https://example.com/logo.png"
    );
    expect(
      absoluteHttpUrl("mailto:hello@example.com", "https://example.com")
    ).toBeNull();
    expect(absoluteHttpUrl("/logo.png", "not a url")).toBeNull();
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
        EXAMPLE_TEAM_URL,
        "Example Wealth",
        "firm"
      )[0]
    ).toMatchObject({
      url: "https://example.com/assets/example-logo.png",
    });
    expect(
      extractMediaCandidates(
        html,
        EXAMPLE_TEAM_URL,
        "Alex Example",
        "advisor"
      )[0]
    ).toMatchObject({
      url: "https://example.com/assets/alex.jpg",
    });
  });

  it("keeps the strongest candidate for duplicate image URLs", () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="/assets/example-logo.png">
        </head>
        <body>
          <img
            alt="Example Wealth logo"
            class="brand-logo"
            src="/assets/example-logo.png"
          >
        </body>
      </html>
    `;

    expect(
      extractMediaCandidates(html, EXAMPLE_TEAM_URL, "Example Wealth", "firm")
    ).toEqual([
      {
        url: "https://example.com/assets/example-logo.png",
        sourceUrl: EXAMPLE_TEAM_URL,
        score: 6,
        reason: "img:Example Wealth logo brand-logo /assets/example-logo.png",
      },
    ]);
  });
});

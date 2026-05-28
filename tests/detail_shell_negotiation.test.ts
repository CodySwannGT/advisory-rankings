import { describe, expect, it } from "vitest";

import {
  detailShellResponse,
  matchLegacyDetailShell,
  prefersHtmlDocument,
  requestHeadersFromContext,
  shellFileForResource,
} from "../src/harper/detail-shell-negotiation.js";

/** Accept header a real Chromium document navigation sends. */
const BROWSER_DOCUMENT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

/** Shell file names, named once to satisfy no-duplicate-string. */
const ADVISOR_SHELL = "advisor.html";
const FIRM_SHELL = "firm.html";
const TEAM_SHELL = "team.html";
const ARTICLE_SHELL = "article.html";

describe("matchLegacyDetailShell", () => {
  it.each([
    ["/AdvisorProfile/does-not-exist", ADVISOR_SHELL],
    ["/FirmProfile/does-not-exist", FIRM_SHELL],
    ["/TeamProfile/does-not-exist", TEAM_SHELL],
    ["/ArticleView/does-not-exist", ARTICLE_SHELL],
    ["/AdvisorProfile/abc-123", ADVISOR_SHELL],
    ["/ArticleView/abc-123/", ARTICLE_SHELL],
    ["/FirmProfile/abc-123?ref=share", FIRM_SHELL],
  ])("maps %s to %s", (url, expected) => {
    expect(matchLegacyDetailShell(url)).toBe(expected);
  });

  it.each([
    "/AdvisorProfile",
    "/AdvisorProfile/",
    "/advisors/jane-advisor-abc",
    "/Feed",
    "/FirmAdvisors/abc-123",
    "/AdvisorProfile/abc/extra",
    "/SomethingElse/abc",
    "/",
  ])("returns null for non-detail path %s", url => {
    expect(matchLegacyDetailShell(url)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(matchLegacyDetailShell(undefined)).toBeNull();
    expect(matchLegacyDetailShell("")).toBeNull();
  });
});

describe("prefersHtmlDocument", () => {
  it("serves the shell for a real browser document navigation", () => {
    expect(
      prefersHtmlDocument({
        accept: BROWSER_DOCUMENT_ACCEPT,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
      })
    ).toBe(true);
  });

  it("serves the shell for an HTML Accept even without Fetch-Metadata", () => {
    expect(prefersHtmlDocument({ accept: "text/html" })).toBe(true);
  });

  it("does NOT serve the shell for the SPA's api() JSON fetch", () => {
    expect(
      prefersHtmlDocument({
        accept: "application/json",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
      })
    ).toBe(false);
  });

  it("does NOT serve the shell for application/json even with a wildcard", () => {
    expect(prefersHtmlDocument({ accept: "application/json, */*" })).toBe(
      false
    );
  });

  it("does NOT serve the shell for a generic wildcard-only API client", () => {
    // curl/SDK default Accept: */* keeps the JSON payload (non-browser access).
    expect(prefersHtmlDocument({ accept: "*/*" })).toBe(false);
    expect(
      prefersHtmlDocument({ accept: "*/*", "sec-fetch-mode": "cors" })
    ).toBe(false);
  });

  it("does NOT serve the shell for a legacy XHR marker even with an HTML Accept", () => {
    expect(
      prefersHtmlDocument({
        accept: BROWSER_DOCUMENT_ACCEPT,
        "x-requested-with": "XMLHttpRequest",
      })
    ).toBe(false);
  });

  it("serves the shell on an HTML Accept regardless of a proxy-rewritten Sec-Fetch-Dest", () => {
    // The Fabric edge can deliver a real navigation as sec-fetch-dest: empty;
    // the HTML Accept must still win so the shell is served.
    expect(
      prefersHtmlDocument({
        accept: BROWSER_DOCUMENT_ACCEPT,
        "sec-fetch-dest": "empty",
      })
    ).toBe(true);
  });

  it("serves the shell on a document Fetch-Metadata hint without an HTML Accept", () => {
    expect(
      prefersHtmlDocument({ accept: "*/*", "sec-fetch-dest": "document" })
    ).toBe(true);
  });

  it("does NOT serve the shell when no Accept and no navigation hints exist", () => {
    expect(prefersHtmlDocument({})).toBe(false);
  });

  it("reads headers case-insensitively and supports array values", () => {
    expect(
      prefersHtmlDocument({
        Accept: ["text/html", "*/*"],
        "Sec-Fetch-Dest": "document",
      })
    ).toBe(true);
  });
});

describe("shellFileForResource", () => {
  it.each([
    ["AdvisorProfile", ADVISOR_SHELL],
    ["FirmProfile", FIRM_SHELL],
    ["TeamProfile", TEAM_SHELL],
    ["ArticleView", ARTICLE_SHELL],
  ])("maps %s to %s", (resource, expected) => {
    expect(shellFileForResource(resource)).toBe(expected);
  });

  it.each(["Feed", "FirmAdvisors", "Search", ""])(
    "returns null for non-detail resource %s",
    resource => {
      expect(shellFileForResource(resource)).toBeNull();
    }
  );
});

describe("requestHeadersFromContext", () => {
  it("reads headers exposed as a Harper `headers.asObject` bag", () => {
    const ctx = { headers: { asObject: { accept: "text/html" } } };
    expect(requestHeadersFromContext(ctx)).toEqual({ accept: "text/html" });
  });

  it("reads headers exposed via a `headers.get()` accessor", () => {
    const map = new Map([
      ["accept", "text/html"],
      ["sec-fetch-dest", "document"],
    ]);
    const ctx = { headers: { get: (name: string) => map.get(name) } };
    expect(requestHeadersFromContext(ctx)).toMatchObject({
      accept: "text/html",
      "sec-fetch-dest": "document",
    });
  });

  it("reads headers nested under requestContext (cache/source context)", () => {
    const ctx = {
      requestContext: { headers: { asObject: { accept: "application/json" } } },
    };
    expect(requestHeadersFromContext(ctx)).toEqual({
      accept: "application/json",
    });
  });

  it("returns an empty bag when no headers are present", () => {
    expect(requestHeadersFromContext({})).toEqual({});
    expect(requestHeadersFromContext(undefined)).toEqual({});
  });
});

describe("detailShellResponse", () => {
  const browserContext = {
    headers: {
      asObject: {
        accept: BROWSER_DOCUMENT_ACCEPT,
        "sec-fetch-dest": "document",
      },
    },
  };

  it("returns the shell as a text/html content response for a browser nav", async () => {
    const loaded: string[] = [];
    const response = await detailShellResponse(
      browserContext,
      "AdvisorProfile",
      async file => {
        loaded.push(file);
        return "<!DOCTYPE html><html>advisor shell</html>";
      }
    );
    expect(loaded).toEqual([ADVISOR_SHELL]);
    expect(response).toEqual({
      contentType: "text/html; charset=utf-8",
      data: "<!DOCTYPE html><html>advisor shell</html>",
    });
  });

  it("returns null (and never reads a shell) for the SPA JSON fetch", async () => {
    let read = false;
    const response = await detailShellResponse(
      { headers: { asObject: { accept: "application/json" } } },
      "AdvisorProfile",
      async () => {
        read = true;
        return "x";
      }
    );
    expect(response).toBeNull();
    expect(read).toBe(false);
  });

  it("returns null for a resource without a shell", async () => {
    const response = await detailShellResponse(
      browserContext,
      "Feed",
      async () => "x"
    );
    expect(response).toBeNull();
  });
});

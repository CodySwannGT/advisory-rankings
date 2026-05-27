import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type MediaRow,
  discoverMedia,
  mediaField,
  nameFor,
} from "../src/lib/media-backfill.js";

const FIRM_NAME = "Example Wealth";
const FIRM_SOURCE_URL = "https://example.com/about";

const htmlResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });

const imageHeadResponse = (init: ResponseInit = {}) =>
  new Response(null, {
    status: 200,
    headers: { "content-type": "image/png" },
    ...init,
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("media-backfill row helpers", () => {
  it("selects the right name and media field per mode", () => {
    expect(nameFor({ legalName: "Avery Advisor" }, "advisor")).toBe(
      "Avery Advisor"
    );
    expect(nameFor({ name: FIRM_NAME }, "firm")).toBe(FIRM_NAME);
    // Non-string fields fall back to empty string.
    expect(nameFor({ legalName: 123 } as unknown as MediaRow, "advisor")).toBe(
      ""
    );
    expect(nameFor({}, "firm")).toBe("");

    expect(mediaField("advisor")).toBe("headshotUrl");
    expect(mediaField("firm")).toBe("logoUrl");
  });
});

describe("discoverMedia search + fetch + reachability", () => {
  const searchPageWithResults = (...urls: ReadonlyArray<string>) => {
    const links = urls
      .map(
        url =>
          `<a class="result__a" href="/l/?uddg=${encodeURIComponent(url)}">link</a>`
      )
      .join("");
    return htmlResponse(`<html><body>${links}</body></html>`);
  };

  const sourcePageWithLogo = (logoUrl: string) =>
    htmlResponse(
      `<html><body><img alt="Example Wealth logo" src="${logoUrl}"></body></html>`
    );

  const sourcePageWithHeadshot = (imageUrl: string, name: string) =>
    htmlResponse(
      `<html><body><img alt="${name} headshot" src="${imageUrl}"></body></html>`
    );

  it("returns null when search returns no usable HTML", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("server down", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const row: MediaRow = { id: "firm-1", name: "Example Wealth Inc" };
    await expect(discoverMedia(row, "firm", undefined)).resolves.toBeNull();
    // Search URL should encode the firm-style query with the cleaned suffix.
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain("Example%20Wealth");
    expect(requested).not.toContain("Inc%22");
  });

  it("skips blocked source hosts and bad search urls before fetching pages", async () => {
    const fetchMock = vi
      .fn()
      // Search response includes blocked hosts plus one allowed host and an unparseable URL.
      .mockResolvedValueOnce(
        searchPageWithResults(
          "https://www.linkedin.com/in/avery",
          "https://www.facebook.com/avery",
          "https://www.dnb.com/business-directory/company-profiles.advisor.html",
          "https://example.com/team/avery"
        )
      )
      // Source page request returns a strong headshot match.
      .mockResolvedValueOnce(
        sourcePageWithHeadshot("/images/avery.jpg", "Avery Advisor Smith")
      )
      // HEAD verification on the candidate image.
      .mockResolvedValueOnce(imageHeadResponse());
    vi.stubGlobal("fetch", fetchMock);

    const row: MediaRow = {
      id: "adv-1",
      legalName: "Avery Advisor Smith",
      _currentFirmName: FIRM_NAME,
    };
    const candidate = await discoverMedia(row, "advisor", undefined);
    expect(candidate).toMatchObject({
      url: "https://example.com/images/avery.jpg",
    });
    // The advisor-mode query should include the firm hint.
    const searchUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(searchUrl).toContain("Example%20Wealth");
    // Only one source page (the allowed host) should have been fetched after the search.
    const sourceCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        typeof url === "string" && url.startsWith("https://example.com")
    );
    expect(sourceCalls).toHaveLength(2); // GET page + HEAD image
  });

  it("uses the explicit source url and skips DuckDuckGo when supplied", async () => {
    const fetchMock = vi
      .fn()
      // Source page only — no search request expected.
      .mockResolvedValueOnce(sourcePageWithLogo("/logo.png"))
      .mockResolvedValueOnce(imageHeadResponse());
    vi.stubGlobal("fetch", fetchMock);

    const row: MediaRow = { id: "firm-9", name: FIRM_NAME };
    const candidate = await discoverMedia(row, "firm", FIRM_SOURCE_URL);
    expect(candidate).toMatchObject({
      url: "https://example.com/logo.png",
      sourceUrl: FIRM_SOURCE_URL,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(FIRM_SOURCE_URL);
    // DuckDuckGo search should not be called at all.
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("https://duckduckgo.com")
      )
    ).toBe(false);
  });

  it("skips non-html responses, low-score pages, and unreachable images", async () => {
    const lowScoreHtml = htmlResponse(
      `<html><body><img alt="unrelated graphic" src="/banner.png"></body></html>`
    );
    const nonHtml = new Response("not html", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const fetchMock = vi
      .fn()
      // First call: explicit source — JSON content-type, returns null html.
      .mockResolvedValueOnce(nonHtml);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      discoverMedia(
        { id: "f", name: "Example" },
        "firm",
        "https://example.com/json"
      )
    ).resolves.toBeNull();

    // Second scenario: html with no high-confidence candidate.
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(lowScoreHtml);
    await expect(
      discoverMedia(
        { id: "f", name: FIRM_NAME },
        "firm",
        "https://example.com/team"
      )
    ).resolves.toBeNull();

    // Third scenario: strong candidate but HEAD fails AND extension fallback fails.
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(sourcePageWithLogo("/api/img/12345"))
      .mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(
      discoverMedia({ id: "f", name: FIRM_NAME }, "firm", FIRM_SOURCE_URL)
    ).resolves.toBeNull();
  });

  it("falls back to image extension when HEAD throws", async () => {
    const fetchMock = vi.fn();
    // Source page succeeds.
    fetchMock.mockResolvedValueOnce(sourcePageWithLogo("/assets/logo.svg"));
    // HEAD throws (e.g. CORS, network) — fallback should still accept the .svg path.
    fetchMock.mockRejectedValueOnce(new Error("network blocked"));
    vi.stubGlobal("fetch", fetchMock);

    const candidate = await discoverMedia(
      { id: "f", name: FIRM_NAME },
      "firm",
      FIRM_SOURCE_URL
    );
    expect(candidate).toMatchObject({
      url: "https://example.com/assets/logo.svg",
    });
  });

  it("returns null when fetch throws on the search request", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("DNS fail"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      discoverMedia({ id: "f", name: "Example" }, "firm", undefined)
    ).resolves.toBeNull();
  });

  it("skips source pages whose body fetch fails before continuing", async () => {
    const fetchMock = vi.fn();
    // Search returns two allowed hosts.
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        `<html><body>
          <a class="result__a" href="/l/?uddg=${encodeURIComponent("https://broken.example/team")}">a</a>
          <a class="result__a" href="/l/?uddg=${encodeURIComponent("https://example.com/team")}">b</a>
        </body></html>`
      )
    );
    // First source page errors out.
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    // Second source page yields a strong logo candidate.
    fetchMock.mockResolvedValueOnce(
      htmlResponse(
        `<html><body><img alt="Example Wealth logo" src="/logo.png"></body></html>`
      )
    );
    fetchMock.mockResolvedValueOnce(imageHeadResponse());
    vi.stubGlobal("fetch", fetchMock);

    const candidate = await discoverMedia(
      { id: "f", name: FIRM_NAME },
      "firm",
      undefined
    );
    expect(candidate).toMatchObject({
      url: "https://example.com/logo.png",
    });
  });
});

import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB_ROOT = resolve("harper-app/web");
const QUICK_TIMEOUT = 2_000;

describe("detail async states", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("shows advisor detail skeletons before a delayed profile resolves", async () => {
    const page = await browser.newPage();
    let releaseAdvisor: () => void = () => {};
    const advisorReleased = new Promise<void>(resolveRelease => {
      releaseAdvisor = resolveRelease;
    });

    await page.route("**/Me", async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/AdvisorProfile/advisor-1", async route => {
      await advisorReleased;
      await route.fulfill({ json: missingAdvisor("advisor-1") });
    });

    await page.goto(`${baseUrl}/advisor.html?id=advisor-1`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByLabel("Loading advisor profile").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.locator(".detail-loading-card").count()).toBe(4);

    releaseAdvisor();
    await page.getByText("Advisor not found").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.close();
  });

  it("renders route-level detail errors without removing navigation", async () => {
    const page = await browser.newPage();

    await page.route("**/Me", async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/FirmProfile/firm-1", async route => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary outage" }),
      });
    });

    await page.goto(`${baseUrl}/firm.html?id=firm-1`, {
      waitUntil: "domcontentloaded",
    });

    const errorCard = page.getByText("Could not load firm");
    await errorCard.waitFor({
      timeout: QUICK_TIMEOUT,
    });
    const firmsNav = page.locator(".nav a", { hasText: "Firms" });
    await firmsNav.waitFor();
    expect(await errorCard.isVisible()).toBe(true);
    expect(await firmsNav.isVisible()).toBe(true);
    await page.close();
  });

  it("keeps article content visible when related sections fail", async () => {
    const page = await browser.newPage();

    await page.route("**/Me", async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/ArticleView/article-1", async route => {
      await route.fulfill({ json: articleWithPartialFailures() });
    });

    await page.goto(`${baseUrl}/article.html?id=article-1`, {
      waitUntil: "domcontentloaded",
    });

    const headline = page.getByText("Advisor moves in test market");
    await headline.waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.getByText("Article body could not load").waitFor();
    await page.getByText("Extracted facts could not load").waitFor();
    await page.getByText("Mentioned advisors could not load").waitFor();
    const metadataHeading = page.getByRole("heading", {
      name: "Article metadata",
    });
    await metadataHeading.waitFor();
    expect(await headline.isVisible()).toBe(true);
    expect(await metadataHeading.isVisible()).toBe(true);
    await page.close();
  });
});

/**
 * Starts a static server for generated web assets.
 * @returns Static HTTP server.
 */
async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const filePath = request.url?.split("?")[0] || "/";
    const resolvedPath = resolveStaticPath(filePath);

    try {
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(await readFile(resolvedPath));
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return server;
}

/**
 * Resolves a URL path to a generated web asset.
 * @param urlPath - Incoming request path.
 * @returns Local static file path.
 */
function resolveStaticPath(urlPath: string): string {
  const cleanPath = normalize(decodeURIComponent(urlPath)).replace(
    /^(\.\.(\/|\\|$))+/,
    ""
  );
  const relativePath =
    cleanPath === sep || cleanPath === "." || cleanPath === "/"
      ? "index.html"
      : cleanPath.replace(/^[/\\]+/, "");
  const candidate = resolve(WEB_ROOT, relativePath);
  if (!candidate.startsWith(`${WEB_ROOT}${sep}`) && candidate !== WEB_ROOT) {
    return join(WEB_ROOT, "404.html");
  }
  return candidate;
}

/**
 * Maps static file extensions to content types.
 * @param filePath - Local file path.
 * @returns HTTP content type.
 */
function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

/**
 * Builds the standard resource envelope for a missing advisor.
 * @param id - Requested advisor id.
 * @returns AdvisorProfile not-found response.
 */
function missingAdvisor(id: string) {
  return { error: "not found", id };
}

/**
 * Builds an ArticleView payload with successful primary content and failed
 * related sections.
 * @returns ArticleView response.
 */
function articleWithPartialFailures() {
  return {
    article: {
      id: "article-1",
      headline: "Advisor moves in test market",
      dek: "Primary article metadata loaded.",
      category: "transitions",
      publishedDate: "2026-05-24",
      modifiedDate: "2026-05-24",
      authors: ["AdvisorBook"],
      url: "https://example.com/article-1",
    },
    body: { error: "body unavailable" },
    eventCards: { error: "events unavailable" },
    firms: [],
    teams: [],
    advisors: { error: "advisors unavailable" },
    provenance: { error: "provenance unavailable" },
  };
}

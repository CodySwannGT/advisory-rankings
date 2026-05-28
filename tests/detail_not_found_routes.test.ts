import { createServer, type Server } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  matchLegacyDetailShell,
  prefersHtmlDocument,
} from "../src/harper/detail-shell-negotiation.js";

const WEB_ROOT = resolve("harper-app/web");
const SHOTS = resolve("tests/screenshots");
const TIMEOUT = 8_000;
const RAW_JSON_PREFIX = '{"error":"not found"';

/** One invalid-detail-route regression case. */
interface NotFoundCase {
  readonly path: string;
  readonly title: string;
  readonly cta: string;
  readonly screenshot: string;
}

const notFoundCases: readonly NotFoundCase[] = [
  {
    path: "/AdvisorProfile/does-not-exist",
    title: "Advisor not found",
    cta: "Back to Advisors",
    screenshot: "issue-280-advisor-not-found.png",
  },
  {
    path: "/FirmProfile/does-not-exist",
    title: "Firm not found",
    cta: "Back to Firms",
    screenshot: "issue-280-firm-not-found.png",
  },
  {
    path: "/TeamProfile/does-not-exist",
    title: "Team not found",
    cta: "Back to Teams",
    screenshot: "issue-280-team-not-found.png",
  },
  {
    path: "/ArticleView/does-not-exist",
    title: "Article not found",
    cta: "Back to Articles",
    screenshot: "issue-280-article-not-found.png",
  },
];

describe("invalid detail routes render the in-app not-found UI (issue #280)", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startNegotiatingServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    await mkdir(SHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((res, rej) => {
      server.close(error => (error ? rej(error) : res()));
    });
  });

  it.each(notFoundCases)(
    "serves the shell and renders the not-found card for $path",
    async testCase => {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      try {
        await page.route("**/Me", async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.goto(`${baseUrl}${testCase.path}`, {
          waitUntil: "networkidle",
        });

        // The route-specific not-found card renders.
        await page
          .getByText(testCase.title, { exact: false })
          .first()
          .waitFor({ timeout: TIMEOUT });

        // A recovery action is offered.
        const recovery = page
          .getByRole("button", { name: testCase.cta })
          .or(page.getByRole("link", { name: testCase.cta }));
        expect(await recovery.count()).toBeGreaterThan(0);

        // Raw backend JSON is never shown as page body text.
        const bodyText = await page.locator("body").innerText();
        expect(bodyText).not.toContain(RAW_JSON_PREFIX);

        await page.screenshot({
          path: join(SHOTS, testCase.screenshot),
          fullPage: true,
        });
      } finally {
        await page.close();
      }
    }
  );

  it("renders the not-found card on a mobile viewport too", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.goto(`${baseUrl}/AdvisorProfile/does-not-exist`, {
        waitUntil: "networkidle",
      });
      await page
        .getByText("Advisor not found", { exact: false })
        .first()
        .waitFor({ timeout: TIMEOUT });
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toContain(RAW_JSON_PREFIX);
      await page.screenshot({
        path: join(SHOTS, "issue-280-advisor-not-found-mobile.png"),
        fullPage: true,
      });
    } finally {
      await page.close();
    }
  });

  it("preserves the JSON envelope for the SPA's application/json fetch", async () => {
    const response = await fetch(`${baseUrl}/AdvisorProfile/does-not-exist`, {
      headers: { Accept: "application/json" },
    });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ error: "not found" });
  });
});

/**
 * Starts a static server that reproduces the deployed Harper behaviour: the
 * legacy detail data-routes are content-negotiated through the real
 * negotiation module — serving the HTML shell for browser document
 * navigations and the JSON not-found envelope for the SPA's `application/json`
 * data fetch — while every other path is served from the generated web root.
 * @returns A listening server.
 */
async function startNegotiatingServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    const shell = matchLegacyDetailShell(url.pathname);
    if (shell) {
      if (prefersHtmlDocument(request.headers)) {
        const body = await readFile(join(WEB_ROOT, shell));
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(body);
        return;
      }
      const id = url.pathname.split("/")[2] || "";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found", id }));
      return;
    }

    try {
      const filePath = staticFilePath(url.pathname);
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });

  await new Promise<void>(res => server.listen(0, "127.0.0.1", res));
  return server;
}

/**
 * Resolves a request path to a generated web asset, guarding against traversal.
 * @param pathname - Request pathname.
 * @returns Absolute file path under the web root.
 */
function staticFilePath(pathname: string): string {
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(WEB_ROOT, normalized);
  if (!filePath.startsWith(`${WEB_ROOT}${sep}`) && filePath !== WEB_ROOT) {
    throw new Error("static path escapes web root");
  }
  return filePath;
}

/**
 * Returns a content type for a browser-loaded static asset.
 * @param filePath - Static asset path.
 * @returns HTTP content type.
 */
function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

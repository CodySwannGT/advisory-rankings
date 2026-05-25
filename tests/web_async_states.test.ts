import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB_ROOT = resolve("harper-app/web");
const QUICK_TIMEOUT = 2_000;
const browserDescribe =
  process.env.RUN_WEB_ASYNC_STATES === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

browserDescribe("web async states", () => {
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

  it("shows safe sign-in recovery copy for auth failures", async () => {
    const page = await browser.newPage();
    let loginRequested = false;

    await page.route("**/Me", async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/Login", async route => {
      loginRequested = true;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "internal authorization policy denied" }),
      });
    });

    await page.goto(`${baseUrl}/login.html`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill("user@example.test");
    await page.locator('input[name="password"]').fill("bad-password");
    await page.locator('button[type="submit"]').click();

    await page
      .getByText(/Check your account access or return to public pages/u)
      .waitFor({ timeout: QUICK_TIMEOUT });
    expect(loginRequested).toBe(true);
    expect(await page.getByText("internal authorization policy").count()).toBe(
      0
    );
    await page.close();
  }, 30_000);

  it("shows feed loading skeletons before a delayed response resolves", async () => {
    const page = await browser.newPage();
    let releaseFeed: () => void = () => {};
    const feedReleased = new Promise<void>(resolveRelease => {
      releaseFeed = resolveRelease;
    });

    await page.route("**/Me", async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/Feed", async route => {
      await feedReleased;
      await route.fulfill({ json: { items: [] } });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    const skeletons = page.locator(".ab-skeleton");
    await skeletons.first().waitFor({ timeout: QUICK_TIMEOUT });
    expect(await skeletons.count()).toBe(8);

    releaseFeed();
    await page.getByText("No articles yet").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.close();
  });

  it("renders a recoverable feed error when the response fails", async () => {
    const page = await browser.newPage();

    await page.route("**/Me", async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/Feed", async route => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary outage" }),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    await page.getByText("Could not load feed").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.getByText(/GET \/Feed .* 503/).waitFor();
    expect(await page.getByText("Could not load feed").count()).toBe(1);
    await page.locator(".nav a", { hasText: "Home" }).waitFor();
    await page.close();
  });

  it("shows session recovery guidance while preserving public content", async () => {
    const page = await browser.newPage();

    await page.route("**/Me", async route => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "permission denied" }),
      });
    });
    await page.route("**/Feed", async route => {
      await route.fulfill({ json: { items: [] } });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    await page.getByText("No articles yet").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page
      .getByText("Sign in again or continue browsing public pages")
      .waitFor({
        timeout: QUICK_TIMEOUT,
      });
    expect(await page.getByText("permission denied").count()).toBe(0);
    await page.close();
  });
});

/**
 * Starts a static server rooted at generated web assets.
 * @returns Local static server for browser tests.
 */
async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const filePath = request.url?.split("?")[0] || "/";
    const resolvedPath = resolveStaticPath(filePath);

    try {
      const file = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(file);
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
 * Resolves a request path to a generated asset path.
 * @param urlPath - Request URL path.
 * @returns Absolute static file path.
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
 * Maps static file extensions to browser content types.
 * @param filePath - Static file path.
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

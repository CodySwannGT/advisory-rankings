import { createServer, type Server } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DEV_BASE = "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const WEB_ROOT = resolve("harper-app/web");
const SHOTS = resolve("tests/screenshots");
const REGRESSION_TIMEOUT = 60_000;
const DIGEST_ROW_SELECTOR = ".regulatory-digest-row";
const browserDescribe =
  process.env.RUN_WEB_REGULATORY_DIGEST_REGRESSION === "1"
    ? describe.sequential
    : describe.skip;

browserDescribe("regulatory digest public-data regression", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startRouteShellServer();
    baseUrl = baseUrlOf(server);
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-http2"],
    });
    await mkdir(SHOTS, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("renders digest rows from deployed public resources on desktop and mobile", async () => {
    const desktop = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await routePublicResources(desktop);
      await routePublicResources(mobile);

      const desktopFacts = await digestFacts(desktop, baseUrl);
      await desktop.screenshot({
        path: join(SHOTS, "regulatory-digest-regression-desktop.png"),
        fullPage: true,
      });

      const mobileFacts = await digestFacts(mobile, baseUrl);
      await mobile.screenshot({
        path: join(SHOTS, "regulatory-digest-regression-mobile.png"),
        fullPage: true,
      });

      expect(desktopFacts.digestCount).toBeGreaterThan(0);
      expect(desktopFacts.eventCount).toBeGreaterThan(0);
      expect(desktopFacts.firstDigestText).toMatch(
        /Event date|source published|source date unavailable/i
      );
      expect(desktopFacts.evidenceHrefs.some(isPublicEvidenceHref)).toBe(true);
      expect(desktopFacts.privateHrefCount).toBe(0);
      expect(desktopFacts.overflow).toBe(false);
      expect(mobileFacts.digestCount).toBeGreaterThan(0);
      expect(mobileFacts.overflow).toBe(false);

      console.log(
        "[EVIDENCE: regulatory-digest-regression]",
        JSON.stringify({
          desktop: desktopFacts,
          mobile: mobileFacts,
          proxyBase: DEV_BASE,
        })
      );
    } finally {
      await desktop.close();
      await mobile.close();
    }
  });
});

interface DigestFacts {
  readonly digestCount: number;
  readonly eventCount: number;
  readonly evidenceHrefs: readonly string[];
  readonly firstDigestText: string;
  readonly overflow: boolean;
  readonly privateHrefCount: number;
}

async function digestFacts(page: Page, baseUrl: string): Promise<DigestFacts> {
  await page.goto(`${baseUrl}/regulatory`, { waitUntil: "domcontentloaded" });
  const digestRows = page.locator(DIGEST_ROW_SELECTOR);
  await digestRows.first().waitFor({ timeout: REGRESSION_TIMEOUT });
  await page
    .locator(".card-title")
    .filter({ hasText: /Compliance events/i })
    .first()
    .waitFor({ timeout: REGRESSION_TIMEOUT });

  return await page.evaluate(selector => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
    const evidenceHrefs = [
      ...document.querySelectorAll<HTMLAnchorElement>(`${selector} a`),
    ].map(link => link.getAttribute("href") ?? "");

    return {
      digestCount: document.querySelectorAll(selector).length,
      eventCount: document.querySelectorAll(".event-card.disclosure").length,
      evidenceHrefs,
      firstDigestText:
        document.querySelector(selector)?.textContent?.trim() ?? "",
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      privateHrefCount: links.filter(link =>
        (link.getAttribute("href") ?? "").includes("/regulatory/discrepancies")
      ).length,
    };
  }, DIGEST_ROW_SELECTOR);
}

async function routePublicResources(page: Page): Promise<void> {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route("**/{Feed,ArticleView,AdvisorProfile,FirmProfile}**", proxy);
}

async function proxy(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  await route.fulfill({
    response: await route.fetch({
      url: `${DEV_BASE}${url.pathname}${url.search}`,
      timeout: REGRESSION_TIMEOUT,
    }),
  });
}

function isPublicEvidenceHref(href: string): boolean {
  return /^\/(advisors|firms|articles)\//u.test(href);
}

function baseUrlOf(localServer: Server): string {
  const address = localServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function startRouteShellServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const url = request.url ?? "/";
    const resolvedPath = resolveStaticPath(url);
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

function resolveStaticPath(url: string): string {
  const pathname = new URL(url, "http://local.test").pathname;
  const shell = routeShell(pathname);
  const relative =
    shell ?? (pathname === "/" ? "index.html" : pathname.slice(1));
  const normalized = normalize(relative);
  if (normalized.startsWith("..") || normalized.includes(`..${sep}`)) {
    return join(WEB_ROOT, "404.html");
  }
  return resolve(WEB_ROOT, normalized);
}

function routeShell(pathname: string): string | null {
  if (pathname === "/regulatory") return "regulatory.html";
  if (pathname.startsWith("/articles/")) return "article.html";
  if (pathname.startsWith("/advisors/")) return "advisor.html";
  if (pathname.startsWith("/firms/")) return "firm.html";
  return null;
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

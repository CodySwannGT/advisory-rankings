import { createServer, type Server } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DEV_BASE = "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const FIRST_SAMPLE_ID = "dd893ee1-92ff-5b63-9e45-c39d63c50904";
const SECOND_SAMPLE_ID = "a5550239-6c67-5289-937d-6669653cc0da";
const SOURCE_TRIAGE_PATH =
  "/source-triage?category=unknown&reason=no-event-cards";
const WEB_ROOT = resolve("harper-app/web");
const SHOTS = resolve("tests/screenshots");
const REGRESSION_TIMEOUT = 60_000;
const browserDescribe =
  process.env.RUN_WEB_SOURCE_TRIAGE_REGRESSION === "1"
    ? describe.sequential
    : describe.skip;

browserDescribe("source article triage public-data regression", () => {
  let browser: Browser | undefined;
  let server: Server | undefined;
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
      if (!server) {
        resolveClose();
        return;
      }
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("replays filtered triage rows and linked ArticleView gaps on desktop and mobile", async () => {
    if (!browser) {
      throw new Error("Browser was not initialized");
    }
    const desktop = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });

    try {
      await routePublicResources(desktop);
      await routePublicResources(mobile);

      const desktopFacts = await sourceTriageFacts(desktop, baseUrl);
      await desktop.screenshot({
        path: join(SHOTS, "source-triage-regression-desktop.png"),
        fullPage: true,
      });

      const mobileFacts = await sourceTriageFacts(mobile, baseUrl);
      await mobile.screenshot({
        path: join(SHOTS, "source-triage-regression-mobile.png"),
        fullPage: true,
      });

      const firstDetail = await articleDetailFacts(desktop, FIRST_SAMPLE_ID);
      const secondDetail = await articleDetailFacts(desktop, SECOND_SAMPLE_ID);

      expect(desktopFacts.visibleIds).toContain(FIRST_SAMPLE_ID);
      expect(desktopFacts.visibleIds).toContain(SECOND_SAMPLE_ID);
      expect(desktopFacts.selectedCategory).toBe("unknown");
      expect(desktopFacts.selectedReason).toBe("no-event-cards");
      expect(desktopFacts.bodyMissingRows).toBeGreaterThanOrEqual(2);
      expect(desktopFacts.firstRowText).toContain(
        "Provenance2 total, 2 candidate"
      );
      expect(desktopFacts.articleViewHrefs[0]).toContain(FIRST_SAMPLE_ID);
      expect(desktopFacts.overflow).toBe(false);
      expect(mobileFacts.visibleIds).toEqual(desktopFacts.visibleIds);
      expect(mobileFacts.overflow).toBe(false);
      expect(firstDetail).toMatchObject({
        eventCards: 0,
        firms: 1,
        advisors: 0,
        teams: 0,
        hasBody: false,
        candidateProvenance: 2,
      });
      expect(secondDetail).toMatchObject({
        eventCards: 0,
        firms: 0,
        advisors: 0,
        teams: 0,
        hasBody: false,
        candidateProvenance: 0,
      });

      console.log(
        "[EVIDENCE: source-triage-public-data]",
        JSON.stringify({
          desktop: desktopFacts,
          mobile: mobileFacts,
          firstDetail,
          secondDetail,
          proxyBase: DEV_BASE,
        })
      );
    } finally {
      await desktop.unrouteAll({ behavior: "ignoreErrors" });
      await mobile.unrouteAll({ behavior: "ignoreErrors" });
      await desktop.close();
      await mobile.close();
    }
  });
});

interface SourceTriageFacts {
  readonly articleViewHrefs: readonly string[];
  readonly bodyMissingRows: number;
  readonly firstRowText: string;
  readonly overflow: boolean;
  readonly selectedCategory: string;
  readonly selectedReason: string;
  readonly visibleIds: readonly string[];
}

interface ArticleDetailFacts {
  readonly advisors: number;
  readonly candidateProvenance: number;
  readonly eventCards: number;
  readonly firms: number;
  readonly hasBody: boolean;
  readonly teams: number;
}

async function sourceTriageFacts(
  page: Page,
  baseUrl: string
): Promise<SourceTriageFacts> {
  await page.goto(`${baseUrl}${SOURCE_TRIAGE_PATH}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator("h1")
    .filter({ hasText: "Source Article Triage" })
    .waitFor({ timeout: REGRESSION_TIMEOUT });
  await page
    .locator(`a[href*="${FIRST_SAMPLE_ID}"]`)
    .first()
    .waitFor({ timeout: REGRESSION_TIMEOUT });

  return await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(".source-triage-row"),
    ];
    const articleViewHrefs = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".source-triage-row a[href^='/articles/']"
      ),
    ].map(link => link.getAttribute("href") ?? "");
    return {
      articleViewHrefs,
      bodyMissingRows: rows.filter(row =>
        row.textContent?.includes("BodyMissing")
      ).length,
      firstRowText: rows[0]?.textContent ?? "",
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      selectedCategory:
        document.querySelector<HTMLSelectElement>('select[name="category"]')
          ?.value ?? "",
      selectedReason:
        document.querySelector<HTMLSelectElement>('select[name="reason"]')
          ?.value ?? "",
      visibleIds: articleViewHrefs
        .map(href => /[0-9a-f-]{36}$/u.exec(href)?.[0] ?? "")
        .filter(Boolean),
    };
  });
}

async function articleDetailFacts(
  page: Page,
  articleId: string
): Promise<ArticleDetailFacts> {
  const response = await page.request.get(
    `${DEV_BASE}/ArticleView/${articleId}`
  );
  const payload = await response.json();
  expect(response.status()).toBe(200);
  return {
    advisors: payload.advisors.length,
    candidateProvenance: payload.provenance.filter(
      (row: { readonly confidence?: string }) =>
        String(row.confidence ?? "").toLowerCase() !== "high"
    ).length,
    eventCards: payload.eventCards.length,
    firms: payload.firms.length,
    hasBody: Boolean(payload.body?.text?.trim() || payload.body?.html?.trim()),
    teams: payload.teams.length,
  };
}

async function routePublicResources(page: Page): Promise<void> {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route("**/{SourceArticleTriage,ArticleView}**", proxy);
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
  if (pathname === "/source-triage") return "source-triage.html";
  if (pathname.startsWith("/articles/")) return "article.html";
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

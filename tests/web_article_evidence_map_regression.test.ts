import { createServer, type Server } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DEV_BASE = "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const ARTICLE_ID = "fd51289e-5817-5f6d-8642-ebcd87bd54a9";
const WEB_ROOT = resolve("harper-app/web");
const SHOTS = resolve("tests/screenshots");
const REGRESSION_TIMEOUT = 60_000;
const browserDescribe =
  process.env.RUN_WEB_ARTICLE_EVIDENCE_MAP_REGRESSION === "1"
    ? describe.sequential
    : describe.skip;

browserDescribe("article evidence map public-data regression", () => {
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

  it("renders map groups from deployed ArticleView data on desktop and mobile", async () => {
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

      const desktopFacts = await articleMapFacts(desktop, baseUrl);
      await desktop.screenshot({
        path: join(SHOTS, "article-evidence-map-regression-desktop.png"),
        fullPage: true,
      });

      const mobileFacts = await articleMapFacts(mobile, baseUrl);
      await mobile.screenshot({
        path: join(SHOTS, "article-evidence-map-regression-mobile.png"),
        fullPage: true,
      });

      const profileTitle = await followFirstProfileLink(desktop);

      expect(desktopFacts.articleId).toBe(ARTICLE_ID);
      expect(desktopFacts.groupTitles).toEqual([
        "Connected entities",
        "Extracted facts",
        "Event signals",
        "Source status",
        "Next steps",
      ]);
      expect(desktopFacts.connectedCount).toBeGreaterThan(0);
      expect(desktopFacts.provenanceCount).toBeGreaterThan(0);
      expect(desktopFacts.originalSourceVisible).toBe(true);
      expect(
        desktopFacts.profileHrefs.some(href => href.startsWith("/firms/"))
      ).toBe(true);
      expect(desktopFacts.overflow).toBe(false);
      expect(mobileFacts.connectedCount).toBe(desktopFacts.connectedCount);
      expect(mobileFacts.provenanceCount).toBe(desktopFacts.provenanceCount);
      expect(mobileFacts.overflow).toBe(false);
      expect(profileTitle).toMatch(/Wells Fargo/i);

      console.log(
        "[EVIDENCE: article-evidence-map-groups]",
        JSON.stringify({
          desktop: desktopFacts,
          mobile: mobileFacts,
          followedProfileTitle: profileTitle,
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

interface ArticleMapFacts {
  readonly articleId: string;
  readonly connectedCount: number;
  readonly groupTitles: readonly string[];
  readonly originalSourceVisible: boolean;
  readonly overflow: boolean;
  readonly profileHrefs: readonly string[];
  readonly provenanceCount: number;
  readonly sourceBackedFactsVisible: boolean;
}

async function articleMapFacts(
  page: Page,
  baseUrl: string
): Promise<ArticleMapFacts> {
  await page.goto(`${baseUrl}/article.html?id=${ARTICLE_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("heading", { name: "Article evidence map" })
    .waitFor({ timeout: REGRESSION_TIMEOUT });

  return await page.evaluate(articleId => {
    const groups = [
      ...document.querySelectorAll<HTMLElement>(".article-evidence-map-group"),
    ];
    const groupTitles = groups.map(
      group => group.querySelector("h3")?.textContent?.trim() ?? ""
    );
    const countByTitle = (title: string): number =>
      Number(
        groups
          .find(group => group.querySelector("h3")?.textContent === title)
          ?.querySelector(".article-evidence-map-count")
          ?.textContent?.trim() ?? "0"
      );
    const profileHrefs = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".article-evidence-map a"
      ),
    ]
      .map(link => link.getAttribute("href") ?? "")
      .filter(href => /^\/(firms|advisors|teams)\//u.test(href));

    return {
      articleId,
      connectedCount: countByTitle("Connected entities"),
      groupTitles,
      originalSourceVisible:
        document.body.textContent?.includes("Original source") ?? false,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      profileHrefs,
      provenanceCount: countByTitle("Extracted facts"),
      sourceBackedFactsVisible:
        document.body.textContent?.includes("Source-backed facts") ?? false,
    };
  }, ARTICLE_ID);
}

async function followFirstProfileLink(page: Page): Promise<string> {
  const profileLink = page
    .locator(".article-evidence-map a[href^='/firms/']")
    .first();
  await profileLink.click();
  await page
    .getByText(/Wells Fargo/u)
    .first()
    .waitFor({ timeout: REGRESSION_TIMEOUT });
  return (
    (await page
      .getByText(/Wells Fargo/u)
      .first()
      .textContent()) ?? ""
  ).trim();
}

async function routePublicResources(page: Page): Promise<void> {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route(
    "**/{ArticleView,FirmProfile,AdvisorProfile,TeamProfile}**",
    proxy
  );
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
  if (pathname.startsWith("/articles/")) return "article.html";
  if (pathname.startsWith("/advisors/")) return "advisor.html";
  if (pathname.startsWith("/firms/")) return "firm.html";
  if (pathname.startsWith("/teams/")) return "team.html";
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

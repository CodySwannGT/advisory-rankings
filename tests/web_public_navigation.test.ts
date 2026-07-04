import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page, type Route } from "playwright";

const WEB_ROOT = join(process.cwd(), "harper-app", "web");
const LOGIN_SHELL = join(process.cwd(), "harper-app", "login", "shell.html");
const RESEARCH_QUEUE_PATH = "/research/freshness";
const DISCREPANCIES_PATH = "/regulatory/discrepancies";
const PUBLIC_DATA_TIMESTAMP = "2026-07-04T00:00:00.000Z";

let server: Server;
let baseUrl: string;
let browser: Browser;

describe("public navigation", () => {
  beforeAll(async () => {
    server = await startStaticServer();
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new TypeError("Expected local HTTP server address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  });

  it("hides analyst destinations and keeps public rails identical", async () => {
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
    });
    try {
      await routeMe(page, { authenticated: false });
      const home = await browseEvidence(page, "/");
      const firms = await browseEvidence(page, "/firms.html");

      expect(home.items).toEqual(firms.items);
      expect(home.items.map(item => item.label)).toEqual([
        "Home",
        "Firms",
        "Branches",
        "Coverage",
        "Investor proof",
        "MCP gallery",
        "Source triage",
        "Recruiting",
        "Rankings",
        "Advisors",
        "Teams",
        "Watchlists",
        "Compliance",
      ]);
      expect(home.topNavHrefs).not.toContain(RESEARCH_QUEUE_PATH);
      expect(home.browseHrefs).not.toContain(RESEARCH_QUEUE_PATH);
      expect(home.browseHrefs).not.toContain(DISCREPANCIES_PATH);
      expect(home.namedIconCount).toBe(home.items.length);
      expect(home.rawIconText).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("shows analyst destinations for elevated sessions", async () => {
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
    });
    try {
      await routeMe(page, {
        authenticated: true,
        username: "analyst@example.test",
        role: "analyst",
      });
      const home = await browseEvidence(page, "/");

      expect(home.browseHrefs).toContain(RESEARCH_QUEUE_PATH);
      expect(home.browseHrefs).toContain(DISCREPANCIES_PATH);
      expect(home.items.at(-2)?.label).toBe("Research queue");
      expect(home.items.at(-1)?.label).toBe("Discrepancies");
    } finally {
      await page.close();
    }
  });

  it("opens advertised login and corrections routes from desktop and mobile navigation", async () => {
    const cases = [
      {
        name: "desktop",
        viewport: { width: 1600, height: 900 },
        openNav: async (_page: Page): Promise<void> => {},
      },
      {
        name: "mobile",
        viewport: { width: 390, height: 844 },
        openNav: async (page: Page): Promise<void> => {
          await page.locator("button.nav-burger").click();
        },
      },
    ] as const;

    for (const testCase of cases) {
      const page = await browser.newPage({ viewport: testCase.viewport });
      try {
        await expectRouteClick(page, testCase.openNav, {
          heading: "Sign in",
          href: "/login",
          name: `${testCase.name} login`,
        });
        await expectRouteClick(page, testCase.openNav, {
          heading: "Correction request inbox",
          href: "/corrections",
          name: `${testCase.name} corrections`,
        });
      } finally {
        await page.close();
      }
    }
  });

  it("marks only the current public destination active", async () => {
    const cases = [
      {
        path: "/login",
        viewport: { width: 1366, height: 900 },
        expectedBrowseCurrent: null,
        expectedTopCurrent: null,
      },
      {
        path: "/coverage",
        viewport: { width: 1366, height: 900 },
        expectedBrowseCurrent: "Coverage",
        expectedTopCurrent: null,
      },
      {
        path: "/source-triage",
        viewport: { width: 390, height: 844 },
        expectedBrowseCurrent: "Source triage",
        expectedTopCurrent: null,
      },
    ] as const;

    for (const testCase of cases) {
      const page = await browser.newPage({ viewport: testCase.viewport });
      try {
        await routeMe(page, { authenticated: false });
        await routePublicData(page);
        await page.goto(`${baseUrl}${testCase.path}`, {
          waitUntil: "domcontentloaded",
        });
        await page.locator(".nav").waitFor();

        const evidence = await activeNavigationEvidence(page);
        expect(evidence.topCurrent, testCase.path).toBe(
          testCase.expectedTopCurrent
        );
        expect(evidence.browseCurrent, testCase.path).toBe(
          testCase.expectedBrowseCurrent
        );
        expect(evidence.homeTopActive, testCase.path).toBe(false);
      } finally {
        await page.close();
      }
    }
  });
});

/**
 * Routes the session resource for a browser page.
 * @param page - Browser page under test.
 * @param payload - `/Me` envelope to expose.
 */
async function routeMe(
  page: Page,
  payload: Readonly<Record<string, unknown>>
): Promise<void> {
  await page.route("**/Me", async (route: Route) => {
    await route.fulfill({ json: payload });
  });
}

/**
 * Routes public data resources used by the active-navigation routes.
 * @param page - Browser page under test.
 */
async function routePublicData(page: Page): Promise<void> {
  await page.route("**/DataCoverage", async (route: Route) => {
    await route.fulfill({
      json: {
        generatedAt: PUBLIC_DATA_TIMESTAMP,
        sections: [],
        keyMetrics: [],
        limitations: [],
      },
    });
  });
  await page.route("**/SourceArticleTriage**", async (route: Route) => {
    await route.fulfill({
      json: {
        generatedAt: PUBLIC_DATA_TIMESTAMP,
        categories: [],
        reasons: [],
        items: [],
        total: 0,
      },
    });
  });
}

/**
 * Reads navigation evidence from one rendered page.
 * @param page - Browser page under test.
 * @param path - Local path to visit.
 * @returns Browse rail and top-nav evidence.
 */
async function browseEvidence(
  page: Page,
  path: string
): Promise<{
  readonly browseHrefs: readonly string[];
  readonly items: readonly { readonly label: string; readonly href: string }[];
  readonly namedIconCount: number;
  readonly rawIconText: readonly string[];
  readonly topNavHrefs: readonly string[];
}> {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.locator(".left .card").first().waitFor();
  return page.evaluate(() => {
    const card = document.querySelector(".left .card");
    const browseLinks = [...(card?.querySelectorAll("a") ?? [])];
    const items = browseLinks.map(link => ({
      label: link.textContent?.trim() ?? "",
      href: link.getAttribute("href") ?? "",
    }));
    const avatars = [...(card?.querySelectorAll(".avatar") ?? [])];
    return {
      browseHrefs: items.map(item => item.href),
      items,
      namedIconCount:
        card?.querySelectorAll('.ab-icon:not([data-icon="text"]) svg').length ??
        0,
      rawIconText: avatars
        .map(avatar => avatar.textContent?.trim() ?? "")
        .filter(Boolean),
      topNavHrefs: [...document.querySelectorAll(".nav-links a")].map(
        link => link.getAttribute("href") ?? ""
      ),
    };
  });
}

/**
 * Reads active-link evidence from top navigation and Browse rail.
 * @param page - Browser page under test.
 * @returns Current active navigation labels.
 */
async function activeNavigationEvidence(page: Page): Promise<{
  readonly browseCurrent: string | null;
  readonly homeTopActive: boolean;
  readonly topCurrent: string | null;
}> {
  return page.evaluate(() => {
    const topCurrent = document
      .querySelector(".nav .nav-links a.active")
      ?.textContent?.trim();
    const browseCurrent = document
      .querySelector('.left .card a[aria-current="page"]')
      ?.textContent?.trim();
    const homeTopActive =
      document
        .querySelector('.nav .nav-links a[href="/"]')
        ?.classList.contains("active") ?? false;
    return {
      browseCurrent: browseCurrent || null,
      homeTopActive,
      topCurrent: topCurrent || null,
    };
  });
}

/**
 * Opens the app shell and follows one advertised navigation link.
 * @param page - Browser page under test.
 * @param openNav - Viewport-specific navigation opener.
 * @param route - Clean route and expected route heading.
 * @param route.heading - Expected route-level heading.
 * @param route.href - Clean route path to click.
 * @param route.name - Assertion label for the route and viewport.
 */
async function expectRouteClick(
  page: Page,
  openNav: (page: Page) => Promise<void>,
  route: {
    readonly heading: string;
    readonly href: string;
    readonly name: string;
  }
): Promise<void> {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await openNav(page);

  const responsePromise = page.waitForResponse(
    response => response.url() === `${baseUrl}${route.href}`
  );
  await page.locator(`a[href="${route.href}"]`).first().click();
  const response = await responsePromise;

  await page.getByRole("heading", { level: 1, name: route.heading }).waitFor();
  const bodyText = await page.locator("body").innerText();

  expect(response.status(), route.name).toBe(200);
  expect(page.url(), route.name).toBe(`${baseUrl}${route.href}`);
  expect(bodyText.trim(), route.name).not.toBe("Not found");
}

/**
 * Starts a local web server for generated web assets and mocked public APIs.
 * @returns Static server for generated web assets.
 */
async function startStaticServer(): Promise<Server> {
  const localServer = createServer(async (request, response) => {
    const url = request.url || "/";
    if (url.startsWith("/Feed")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ items: [], nextCursor: null, total: 0 }));
      return;
    }
    if (url.startsWith("/PublicFirms")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ items: [], nextCursor: null, total: 0 }));
      return;
    }
    if (url.startsWith("/Search")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ advisors: [], firms: [], teams: [] }));
      return;
    }
    if (url.startsWith("/AdvisorCorrectionRequest")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ items: [], nextCursor: null, total: 0 }));
      return;
    }
    if (url.startsWith("/DataCoverage")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          generatedAt: PUBLIC_DATA_TIMESTAMP,
          sections: [],
          keyMetrics: [],
          limitations: [],
        })
      );
      return;
    }
    if (url.startsWith("/SourceArticleTriage")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          generatedAt: PUBLIC_DATA_TIMESTAMP,
          categories: [],
          reasons: [],
          items: [],
          total: 0,
        })
      );
      return;
    }

    const resolvedPath = resolveStaticPath(url);
    try {
      const body = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    localServer.once("error", rejectListen);
    localServer.listen(0, "127.0.0.1", () => {
      localServer.off("error", rejectListen);
      resolveListen();
    });
  });
  return localServer;
}

/**
 * Resolves a request path under the generated web root.
 * @param url - Incoming request URL.
 * @returns Safe local filesystem path.
 */
function resolveStaticPath(url: string): string {
  const pathname = new URL(url, "http://local.test").pathname;
  if (pathname === "/login") return LOGIN_SHELL;
  if (pathname === "/corrections") {
    return resolve(WEB_ROOT, "correction-inbox.html");
  }
  const cleanRoute = resolve(WEB_ROOT, `${pathname.slice(1)}.html`);
  if (!extname(pathname) && pathname !== "/") return cleanRoute;
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalized = normalize(relative);
  if (normalized.startsWith("..") || normalized.includes(`..${sep}`)) {
    return join(WEB_ROOT, "404.html");
  }
  return resolve(WEB_ROOT, normalized);
}

/**
 * Returns the content type for a generated web asset.
 * @param path - Local file path.
 * @returns HTTP content type.
 */
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

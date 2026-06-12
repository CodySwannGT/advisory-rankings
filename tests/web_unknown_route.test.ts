import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

const WEB_ROOT = join(process.cwd(), "harper-app", "web");
const UNKNOWN_ROUTE = "/this-page-does-not-exist";

let server: Server;
let baseUrl: string;
let browser: Browser;

describe("unknown route shell", () => {
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

  it.each([
    ["desktop", { width: 1366, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ])(
    "renders app chrome and recovery search on %s",
    async (_name, viewport) => {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(`${baseUrl}${UNKNOWN_ROUTE}`, {
          waitUntil: "networkidle",
        });

        await page.getByRole("navigation").waitFor();
        await page.getByRole("heading", { name: "Page not found" }).waitFor();
        await page.getByText("We couldn't find that page").waitFor();
        await expectHomeLink(page);
        await exerciseGlobalSearch(page);
        expect(await shellMetrics(page)).toMatchObject({
          hasFooter: true,
          isBareNotFound: false,
          hasHorizontalOverflow: false,
        });
      } finally {
        await page.close();
      }
    }
  );
});

/**
 * Confirms the recovery action returns to the public feed route.
 * @param page Browser page rendering the unknown-route shell.
 */
async function expectHomeLink(page: Page): Promise<void> {
  const homeLink = page.getByRole("link", { name: "Go to Home" });
  expect(await homeLink.count()).toBe(1);
  expect(await homeLink.getAttribute("href")).toBe("/");
}

/**
 * Exercises the shared navbar search on the unknown-route page.
 * @param page Browser page rendering the unknown-route shell.
 */
async function exerciseGlobalSearch(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: /search/i }).fill("stone");
  await page.getByText("Avery Stone").waitFor();
}

/**
 * Reads layout and shell state from the rendered document.
 * @param page Browser page rendering the unknown-route shell.
 * @returns Shell metrics used by the regression assertions.
 */
function shellMetrics(page: Page): Promise<{
  readonly hasFooter: boolean;
  readonly isBareNotFound: boolean;
  readonly hasHorizontalOverflow: boolean;
}> {
  return page.evaluate(() => ({
    hasFooter: Boolean(document.querySelector("footer")),
    isBareNotFound: document.body.textContent?.trim() === "Not found",
    hasHorizontalOverflow:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  }));
}

/**
 * Starts a local web server that mirrors Harper's unknown-document fallback.
 * @returns Static server for generated web assets.
 */
async function startStaticServer(): Promise<Server> {
  const localServer = createServer(async (request, response) => {
    if (request.url?.startsWith("/Me")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ authenticated: false }));
      return;
    }
    if (request.url?.startsWith("/Search")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(searchPayload()));
      return;
    }

    const resolvedPath = resolveStaticPath(request.url || "/");
    try {
      const body = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(body);
    } catch {
      const acceptsHtml = String(request.headers.accept || "").includes(
        "text/html"
      );
      const notFoundBody = await readFile(join(WEB_ROOT, "404.html"));
      response.writeHead(404, {
        "Content-Type": acceptsHtml
          ? "text/html; charset=utf-8"
          : "text/plain; charset=utf-8",
      });
      response.end(acceptsHtml ? notFoundBody : "Not found");
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
 * Resolves a request URL to a generated web asset path.
 * @param requestUrl Incoming HTTP request URL.
 * @returns Absolute asset path.
 */
function resolveStaticPath(requestUrl: string): string {
  const path = new URL(requestUrl, "http://127.0.0.1").pathname;
  const cleanPath = normalize(decodeURIComponent(path)).replace(
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
 * Maps local static files to response content types.
 * @param filePath Resolved static asset path.
 * @returns HTTP content type.
 */
function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "text/html; charset=utf-8";
  }
}

/**
 * Search envelope returned to the navbar search organism.
 * @returns Minimal `/Search` response with one advisor result.
 */
function searchPayload(): unknown {
  return {
    q: "stone",
    items: [
      {
        kind: "advisor",
        id: "avery-stone",
        name: "Avery Stone",
        sub: "Example Wealth",
      },
    ],
    counts: { firms: 0, advisors: 1, teams: 0, total: 1 },
  };
}

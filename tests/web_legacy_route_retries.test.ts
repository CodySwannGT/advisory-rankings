import { createServer, type Server } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB_ROOT = resolve("harper-app/web");
const SHOTS = resolve("tests/screenshots");
const QUICK_TIMEOUT = 4_000;
// Boot recovery may auto-reload several times before booting or falling back.
const BOOT_TIMEOUT = 25_000;
const ACME_ADVISORY = "Acme Advisory";
const SUPPORTED_TEAM_SERVICE_MODELS = ["", "uhnw", "hnw"];

/** Browser retry fixture for one legacy public route. */
interface RetryRouteCase {
  readonly name: string;
  readonly path: string;
  readonly resource: string;
  readonly errorTitle: string;
  readonly paginated?: boolean;
  readonly successText: string;
  readonly successPayload: unknown;
  readonly screenshotName: string;
}

const retryRouteCases: readonly RetryRouteCase[] = [
  {
    name: "firm directory",
    path: "/firms",
    resource: "/PublicFirms",
    errorTitle: "Couldn't load more",
    paginated: true,
    successText: ACME_ADVISORY,
    screenshotName: "issue-277-firms-retry.png",
    successPayload: {
      items: [
        {
          id: "firm-1",
          name: ACME_ADVISORY,
          channel: "ria",
          hqCity: "Austin",
          hqState: "TX",
        },
      ],
      nextCursor: null,
      total: 1,
    },
  },
  {
    name: "team directory",
    path: "/teams",
    resource: "/PublicTeams",
    errorTitle: "Couldn't load more",
    paginated: true,
    successText: "Summit Wealth Team",
    screenshotName: "issue-277-teams-retry.png",
    successPayload: {
      items: [
        {
          id: "team-1",
          name: "Summit Wealth Team",
          currentFirmName: ACME_ADVISORY,
          serviceModel: "uhnw",
        },
      ],
      nextCursor: null,
      total: 1,
    },
  },
  {
    name: "compliance events",
    path: "/regulatory",
    resource: "/Feed",
    errorTitle: "Could not load compliance events",
    successText: "Jane Advisor",
    screenshotName: "issue-277-regulatory-retry.png",
    successPayload: {
      items: [
        {
          eventCards: [
            {
              kind: "disclosure",
              disclosureType: "regulatory",
              regulator: "FINRA",
              regulatorState: "NY",
              status: "resolved",
              advisor: { id: "advisor-1", name: "Jane Advisor" },
              allegationText: "Test regulatory disclosure.",
            },
          ],
        },
      ],
    },
  },
];

describe("legacy directory and compliance route retries", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    await mkdir(SHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it.each(retryRouteCases)(
    "retries $name after a transient resource failure",
    async routeCase => {
      const page = await browser.newPage();
      let requestCount = 0;

      try {
        await page.route("**/Me", async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(`**${routeCase.resource}**`, async route => {
          requestCount += 1;
          if (requestCount === 1) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: "temporary outage" }),
            });
            return;
          }
          await route.fulfill({ json: routeCase.successPayload });
        });

        await page.goto(`${baseUrl}${routeCase.path}`, {
          waitUntil: "domcontentloaded",
        });

        await page.getByText(routeCase.errorTitle).waitFor({
          timeout: QUICK_TIMEOUT,
        });
        if (!routeCase.paginated) {
          expect(await page.getByText("temporary outage").count()).toBe(0);
        }

        await page
          .getByRole("button", {
            name: routeCase.paginated ? "Load more" : "Retry",
          })
          .dispatchEvent("click");
        await page.getByText(routeCase.successText).first().waitFor({
          timeout: QUICK_TIMEOUT,
        });

        expect(requestCount).toBe(2);
        expect(await page.getByText(routeCase.errorTitle).count()).toBe(0);
        await page.screenshot({
          path: join(SHOTS, routeCase.screenshotName),
          fullPage: true,
        });
      } finally {
        await page.close();
      }
    },
    BOOT_TIMEOUT
  );

  it("only offers service model filters backed by public team data", async () => {
    const page = await browser.newPage();
    const selectedRequests: string[] = [];

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.route("**/PublicTeams?**", async route => {
        const url = new URL(route.request().url());
        const serviceModel = url.searchParams.get("serviceModel") ?? "";
        selectedRequests.push(serviceModel);
        await route.fulfill({
          json: {
            items: [
              {
                id: "team-uhnw",
                name: "Taylor Group",
                currentFirmName: ACME_ADVISORY,
                serviceModel: "uhnw",
              },
            ],
            nextCursor: null,
            total: 1,
          },
        });
      });

      await page.goto(`${baseUrl}/teams`, { waitUntil: "domcontentloaded" });
      const serviceModel = page.locator('[name="serviceModel"]');
      await serviceModel.waitFor({ timeout: QUICK_TIMEOUT });
      const values = await serviceModel
        .locator("option")
        .evaluateAll(options =>
          options.map(option => option.getAttribute("value") ?? "")
        );

      expect(values).toEqual(SUPPORTED_TEAM_SERVICE_MODELS);
      expect(values).not.toEqual(
        expect.arrayContaining(["ensemble", "solo", "hybrid", "family_office"])
      );

      await serviceModel.selectOption("uhnw");
      await page.waitForURL(
        url => url.searchParams.get("serviceModel") === "uhnw"
      );
      await page.getByText("Taylor Group").waitFor({ timeout: QUICK_TIMEOUT });
      await page.getByText("1 matching teams").waitFor({
        timeout: QUICK_TIMEOUT,
      });

      expect(selectedRequests).toContain("uhnw");
    } finally {
      await page.close();
    }
  });

  it("explains empty service model results only for service-model-only filters", async () => {
    const page = await browser.newPage();

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.route("**/PublicTeams?**", async route => {
        await route.fulfill({
          json: {
            items: [],
            nextCursor: null,
            total: 0,
          },
        });
      });

      await page.goto(`${baseUrl}/teams`, { waitUntil: "domcontentloaded" });
      await page.locator('[name="serviceModel"]').selectOption("uhnw");
      await page
        .getByText("No current public teams have that service model.")
        .waitFor({ timeout: QUICK_TIMEOUT });

      await page.goto(`${baseUrl}/teams?q=Taylor&serviceModel=uhnw`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByText("No teams match the selected filters.")
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await page
          .getByText("No current public teams have that service model.")
          .count()
      ).toBe(0);
    } finally {
      await page.close();
    }
  });

  it("auto-recovers when a transient module reset clears on reload", async () => {
    const page = await browser.newPage();
    let indexRequests = 0;

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      // Reset the very first /index.js load (the connection-reset signature),
      // then serve it normally — the boot guard should reload and boot.
      await page.route("**/index.js", async route => {
        indexRequests += 1;
        if (indexRequests === 1) {
          await route.abort("connectionreset");
          return;
        }
        await route.continue();
      });

      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

      // The SPA mounts its chrome (nav) before any data fetch, so a visible
      // nav proves the module graph booted after the auto-reload.
      await page.locator(".nav").first().waitFor({ timeout: BOOT_TIMEOUT });
      expect(indexRequests).toBeGreaterThanOrEqual(2);
      expect(
        await page
          .getByText("AdvisorBook could not finish loading this page.")
          .count()
      ).toBe(0);
    } finally {
      await page.close();
    }
  });

  it("falls back after exhausting bounded reloads when the module never loads", async () => {
    const page = await browser.newPage();

    try {
      await page.route("**/index.js", async route => {
        await route.abort("connectionreset");
      });

      const response = await page.goto(`${baseUrl}/`, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status()).toBe(200);
      await page
        .getByText("AdvisorBook could not finish loading this page.")
        .waitFor({ timeout: BOOT_TIMEOUT });
      expect(await page.getByRole("button", { name: "Reload" }).count()).toBe(
        1
      );
      expect(
        await page.evaluate(() => document.body.innerText.trim())
      ).not.toBe("");
    } finally {
      await page.close();
    }
  });
});

/**
 * Starts a static server rooted at generated web assets.
 * @returns Local static server for browser tests.
 */
async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    try {
      const filePath = staticFilePath(request.url || "/");
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });

  await new Promise<void>(resolveListen => {
    server.listen(0, "127.0.0.1", () => {
      resolveListen();
    });
  });

  return server;
}

/**
 * Resolves a request URL to a checked-in or generated web asset.
 * @param requestUrl - Incoming browser request URL.
 * @returns Absolute file path under the web root.
 */
function staticFilePath(requestUrl: string): string {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const routePath = cleanRoutePath(url.pathname);
  const normalized = normalize(routePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(WEB_ROOT, normalized);
  if (!filePath.startsWith(`${WEB_ROOT}${sep}`) && filePath !== WEB_ROOT) {
    throw new Error("static path escapes web root");
  }
  return filePath;
}

/**
 * Maps clean public routes to their legacy HTML files.
 * @param pathname - Browser URL pathname.
 * @returns Static asset path relative to the web root.
 */
function cleanRoutePath(pathname: string): string {
  if (pathname === "/") return "/index.html";
  if (["/firms", "/teams", "/regulatory"].includes(pathname)) {
    return `${pathname}.html`;
  }
  return pathname;
}

/**
 * Returns a content type for browser-loaded static assets.
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

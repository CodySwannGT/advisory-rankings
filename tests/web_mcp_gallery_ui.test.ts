import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";
import type { McpCatalogResponse } from "../src/harper/resource-mcp-catalog.js";

const browserDescribe =
  process.env.RUN_WEB_MCP_GALLERY_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe
    : describe.skip;

browserDescribe("MCP gallery route (#1472)", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    await mkdir(SHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("renders ready endpoint inventory and endpoint metadata", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      await routeAuth(page, false);
      await routeCatalog(page, readyCatalog());

      await page.goto(`${baseUrl}/mcp-gallery`, {
        waitUntil: "domcontentloaded",
      });

      await page
        .getByRole("heading", { name: "MCP Gallery", exact: true })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page.getByText("Catalog ready").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page.getByText("Catalog stale").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page.getByText("AdvisorBook 0.1.0").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await expectEntryCount(page, "tool", 6);
      await expectEntryCount(page, "template", 5);
      await page.getByText("Public data only").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page
        .locator(".mcp-gallery-boundary")
        .getByText("watchlists", { exact: false })
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await page.locator(".mcp-gallery-endpoint-code").first().textContent()
      ).toBe("/mcp");

      expect(await hasHorizontalOverflow(page)).toBe(false);
      await page.setViewportSize({ width: 390, height: 740 });
      await page
        .locator(".mcp-gallery-boundary")
        .getByText("private watchlists", { exact: false })
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(await hasHorizontalOverflow(page)).toBe(false);

      await captureViewports(page, "issue-1472-mcp-gallery");
    } finally {
      await page.close();
    }
  });

  it("shows explicit unavailable state without implying live proof", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 740 },
    });
    const catalog = readyCatalog();
    try {
      await routeAuth(page, false);
      await routeCatalog(page, {
        ...catalog,
        status: "unavailable",
        readOnlyBoundary: {
          ...catalog.readOnlyBoundary,
          status: "unavailable",
        },
        initialize: null,
        tools: [],
        resourceTemplates: [],
        unavailableReason: "MCP endpoint timed out",
      });

      await page.goto(`${baseUrl}/developers/mcp`, {
        waitUntil: "domcontentloaded",
      });

      await page
        .locator(".mcp-gallery-status-row")
        .getByText("Catalog unavailable", { exact: true })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page.getByText("MCP endpoint timed out").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page
        .locator(".mcp-gallery-stat")
        .filter({ hasText: "Server" })
        .getByText("Unavailable", { exact: true })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await expectEntryCount(page, "tool", 0);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    } finally {
      await page.close();
    }
  });
});

/**
 * Routes the public catalog resource.
 * @param page - Browser page.
 * @param payload - Catalog response.
 */
async function routeCatalog(
  page: Page,
  payload: McpCatalogResponse
): Promise<void> {
  await page.route("**/McpCatalog", async route => {
    await route.fulfill({ json: payload });
  });
}

/**
 * Asserts inventory tile count by kind.
 * @param page - Browser page.
 * @param kind - Inventory kind.
 * @param count - Expected count.
 */
async function expectEntryCount(
  page: Page,
  kind: "tool" | "template",
  count: number
): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.locator(`[data-mcp-gallery-entry="${kind}"]`).count(),
      { timeout: QUICK_TIMEOUT }
    )
    .toBe(count);
}

/**
 * Checks document-level horizontal overflow.
 * @param page - Browser page.
 * @returns Whether the document overflows horizontally.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
}

/**
 * Builds a deterministic public catalog fixture.
 * @returns Catalog response.
 */
function readyCatalog(): McpCatalogResponse {
  return {
    status: "ready",
    generatedAt: "2026-06-27T22:00:00.000Z",
    endpoint: {
      url: "/mcp",
      transport: "streamable-http",
      authRequired: false,
    },
    readOnlyBoundary: {
      status: "read-only",
      filteredCapabilities: 0,
      forbiddenTerms: ["write", "delete", "raw", "token"],
    },
    initialize: {
      capabilities: { tools: {}, resources: {} },
      serverInfo: {
        name: "advisorbook",
        title: "AdvisorBook",
        version: "0.1.0",
      },
    },
    tools: [
      tool("search_advisors", "Search advisors"),
      tool("get_advisor_profile", "Get advisor profile"),
      tool("search_firms", "Search firms"),
      tool("get_firm_profile", "Get firm profile"),
      tool("search_articles", "Search articles"),
      tool("get_article", "Get article"),
    ],
    resourceTemplates: [
      template("advisorbook://advisors/{id}", "Advisor profile"),
      template("advisorbook://firms/{id}", "Firm profile"),
      template("advisorbook://articles/{id}", "Article"),
      template("advisorbook://rankings/{id}", "Ranking"),
      template("advisorbook://search/{query}", "Search"),
    ],
  };
}

/**
 * Builds a tool fixture.
 * @param name - Tool name.
 * @param title - Tool title.
 * @returns Tool fixture.
 */
function tool(name: string, title: string): unknown {
  return {
    name,
    title,
    description: `${title} using public AdvisorBook data.`,
  };
}

/**
 * Builds a resource template fixture.
 * @param uriTemplate - Template URI.
 * @param title - Template title.
 * @returns Resource template fixture.
 */
function template(uriTemplate: string, title: string): unknown {
  return {
    uriTemplate,
    title,
    description: `${title} resource template.`,
  };
}

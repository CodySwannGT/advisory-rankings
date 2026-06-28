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

const RESOURCE_TEMPLATE_URIS = [
  "advisorbook://feed",
  "advisorbook://advisor/{id}",
  "advisorbook://firm/{id}",
  "advisorbook://team/{id}",
  "advisorbook://article/{id}",
] as const;

const TOOL_NAMES = [
  "search_advisorbook",
  "get_feed",
  "get_advisor_profile",
  "get_firm_profile",
  "get_team_profile",
  "get_article",
] as const;

const FORBIDDEN_INVENTORY_TERMS = [
  "admin",
  "auth",
  "credential",
  "delete",
  "ingest",
  "insert",
  "mutation",
  "raw",
  "refresh",
  "scrape",
  "sql",
  "table",
  "token",
  "update",
  "upsert",
  "write",
] as const;

browserDescribe("MCP gallery route (#1474)", () => {
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
      await expectInventory(page, "tool", TOOL_NAMES);
      await expectInventory(page, "template", RESOURCE_TEMPLATE_URIS);
      await expectSafeInventoryText(page);
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

      await captureViewports(page, "issue-1474-mcp-gallery");
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

      await page.goto(`${baseUrl}/mcp-gallery`, {
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
 * Asserts visible inventory entries match the public MCP catalog exactly.
 * @param page - Browser page.
 * @param kind - Inventory kind.
 * @param expected - Expected displayed codes.
 */
async function expectInventory(
  page: Page,
  kind: "tool" | "template",
  expected: readonly string[]
): Promise<void> {
  await expectEntryCount(page, kind, expected.length);
  const entries = page.locator(`[data-mcp-gallery-entry="${kind}"] code`);
  await expect
    .poll(
      async () =>
        await entries.evaluateAll(nodes =>
          nodes.map(node => node.textContent?.trim() ?? "")
        ),
      { timeout: QUICK_TIMEOUT }
    )
    .toEqual(expected);
}

/**
 * Asserts inventory cards do not advertise unsafe MCP capability families.
 * @param page - Browser page.
 */
async function expectSafeInventoryText(page: Page): Promise<void> {
  const inventoryText = await page
    .locator("[data-mcp-gallery-entry]")
    .evaluateAll(nodes =>
      nodes
        .map(node => node.textContent ?? "")
        .join(" ")
        .toLowerCase()
    );
  expect(inventoryText).not.toMatch(forbiddenInventoryPattern());
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
    tools: TOOL_NAMES.map(tool),
    resourceTemplates: RESOURCE_TEMPLATE_URIS.map(template),
  };
}

/**
 * Builds a resource template fixture.
 * @param uriTemplate - Template URI.
 * @returns Resource template fixture.
 */
function template(uriTemplate: string): unknown {
  return {
    uriTemplate,
    title: uriTemplate,
    description: `${uriTemplate} public payload.`,
  };
}

/**
 * Builds a tool fixture.
 * @param name - Tool name.
 * @returns Tool fixture.
 */
function tool(name: string): unknown {
  return {
    name,
    title: name,
    description: `${name} public payload.`,
  };
}

/**
 * Builds a whole-word matcher for unsafe inventory terms.
 * @returns Forbidden inventory term pattern.
 */
function forbiddenInventoryPattern(): RegExp {
  return new RegExp(`\\b(${FORBIDDEN_INVENTORY_TERMS.join("|")})\\b`, "u");
}

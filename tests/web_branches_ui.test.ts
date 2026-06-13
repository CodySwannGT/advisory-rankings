import type { Server } from "node:http";
import { mkdir } from "node:fs/promises";
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
import type {
  BranchDirectoryRow,
  DirectoryPage,
} from "../src/harper/resource-directory-types.js";

describe("branch explorer route (#1224)", () => {
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

  it("renders rows, restores URL filters, and fits desktop/mobile", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await routeAuth(page, false);
    await routePublicBranches(page);

    await page.goto(
      `${baseUrl}/branches?firm=wells&state=NY&minAdvisorCount=2&sourceType=brokercheck&level=branch`,
      {
        waitUntil: "domcontentloaded",
      }
    );

    await page
      .getByRole("heading", { name: "Branch explorer", exact: true })
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page.getByText("Branch network explorer").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.locator('[data-branch-id="branch-ny"]').count()).toBe(1);
    expect(await page.locator('[data-branch-id="branch-empty"]').count()).toBe(
      0
    );
    expect(await inputValue(page, "Firm")).toBe("wells");
    expect(await inputValue(page, "State")).toBe("NY");
    expect(await inputValue(page, "Source type")).toBe("brokercheck");
    expect(await inputValue(page, "Minimum advisors")).toBe("2");
    expect(await selectValue(page, "Level")).toBe("branch");
    const branchRow = page.locator('[data-branch-id="branch-ny"]');
    expect(
      await branchRow.getByRole("link", { name: "Firm" }).getAttribute("href")
    ).toContain("/firms/wells-fargo-advisors-firm-wells");
    expect(
      await branchRow
        .getByRole("link", { name: "Advisors" })
        .getAttribute("href")
    ).toBe("/advisors?firm=firm-wells");

    await page.getByLabel("City or market").fill("No match");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await page.getByText("No matching branches").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(new URL(page.url()).searchParams.get("city")).toBe("No match");

    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByRole("button", { name: "Load more" }).click();
    await page.locator('[data-branch-id="branch-empty"]').waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.getByText("Partial branch coverage").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await expectUniqueBranchRows(page);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await captureViewports(page, "issue-1224-branch-explorer");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.close();
  });
});

/**
 * Routes PublicBranches to a deterministic filtered payload.
 * @param page - Browser page under test.
 */
async function routePublicBranches(page: Page): Promise<void> {
  await page.route("**/PublicBranches**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: branchPage(url.searchParams) });
  });
}

/**
 * Applies the same filter dimensions the page sends to PublicBranches.
 * @param params - Request query params.
 * @returns PublicBranches page payload.
 */
function branchPage(
  params: URLSearchParams
): DirectoryPage<BranchDirectoryRow> {
  const q = lowerParam(params, "q");
  const firm = lowerParam(params, "firm");
  const state = lowerParam(params, "state");
  const city = lowerParam(params, "city");
  const sourceType = lowerParam(params, "sourceType");
  const level = lowerParam(params, "level");
  const minAdvisorCount = Number(params.get("minAdvisorCount") || "0");
  const items = branchRows().filter(row =>
    [
      !q ||
        [
          row.displayName,
          row.buildingName,
          row.firmName,
          row.city,
          row.state,
          row.address,
        ].some(value =>
          String(value ?? "")
            .toLowerCase()
            .includes(q)
        ),
      !firm ||
        [row.firmId, row.firmName].some(value =>
          String(value ?? "")
            .toLowerCase()
            .includes(firm)
        ),
      !state || row.state.toLowerCase() === state,
      !city ||
        [row.city, row.displayName, row.address].some(value =>
          String(value ?? "")
            .toLowerCase()
            .includes(city)
        ),
      !sourceType ||
        row.sourceMetadata.sourceTypes.some(
          source => source.toLowerCase() === sourceType
        ),
      !level || row.level === level,
      !minAdvisorCount || row.currentAdvisorCount >= minAdvisorCount,
    ].every(Boolean)
  );
  if (hasActiveFilters(params) || params.get("cursor") === "page-2") {
    return {
      items: params.get("cursor") === "page-2" ? items.slice(1) : items,
      nextCursor: null,
      total: items.length,
    };
  }
  return {
    items: items.slice(0, 1),
    nextCursor: "page-2",
    total: items.length,
  };
}

/**
 * Reads a normalized query param value.
 * @param params - Request query params.
 * @param key - Param name.
 * @returns Lowercased value.
 */
function lowerParam(params: URLSearchParams, key: string): string {
  return (params.get(key) ?? "").trim().toLowerCase();
}

/**
 * Detects whether branch filters are active on a request.
 * @param params - Request query params.
 * @returns True when at least one filter is active.
 */
function hasActiveFilters(params: URLSearchParams): boolean {
  return [
    "q",
    "firm",
    "state",
    "city",
    "sourceType",
    "level",
    "minAdvisorCount",
  ].some(key => Boolean(params.get(key)));
}

/**
 * Provides branch rows with loaded and partial coverage states.
 * @returns Branch directory fixtures.
 */
function branchRows(): readonly BranchDirectoryRow[] {
  return [
    {
      id: "branch-ny",
      firmId: "firm-wells",
      parentBranchId: null,
      level: "branch",
      name: "Midtown Manhattan Branch",
      buildingName: "GM Building",
      address: "767 Fifth Avenue",
      city: "New York",
      state: "NY",
      country: "USA",
      postalCode: "10153",
      displayName: "Midtown Manhattan Branch",
      firmName: "Wells Fargo Advisors",
      currentAdvisorCount: 12,
      coverageStatus: "loaded",
      sourceMetadata: {
        sourceTypes: ["brokercheck", "wells_fargo_locator"],
        sourceRefs: ["branch:ny"],
      },
    },
    {
      id: "branch-empty",
      firmId: "firm-wells",
      parentBranchId: null,
      level: "complex",
      name: "Brooklyn Complex",
      buildingName: null,
      address: "200 Montague Street",
      city: "Brooklyn",
      state: "NY",
      country: "USA",
      postalCode: "11201",
      displayName: "Brooklyn Complex",
      firmName: "Wells Fargo Advisors",
      currentAdvisorCount: 0,
      coverageStatus: "partial",
      sourceMetadata: {
        sourceTypes: ["wells_fargo_locator"],
        sourceRefs: ["branch:brooklyn"],
      },
    },
  ];
}

/**
 * Reads the visible value from a labeled input.
 * @param page - Browser page under test.
 * @param label - Input label.
 * @returns Current input value.
 */
async function inputValue(page: Page, label: string): Promise<string> {
  return await page
    .getByRole("textbox", { name: label, exact: true })
    .inputValue();
}

/**
 * Reads the visible value from a labeled select.
 * @param page - Browser page under test.
 * @param label - Select label.
 * @returns Current select value.
 */
async function selectValue(page: Page, label: string): Promise<string> {
  return await page
    .getByRole("combobox", { name: label, exact: true })
    .inputValue();
}

/**
 * Asserts rendered branch row IDs are unique after pagination.
 * @param page - Browser page under test.
 */
async function expectUniqueBranchRows(page: Page): Promise<void> {
  const branchIds = await page
    .locator("[data-branch-id]")
    .evaluateAll(rows =>
      rows.map(row => row.getAttribute("data-branch-id") ?? "")
    );
  expect(branchIds).toHaveLength(new Set(branchIds).size);
}

/**
 * Checks whether the document overflows horizontally.
 * @param page - Browser page under test.
 * @returns True when horizontal overflow is present.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
}

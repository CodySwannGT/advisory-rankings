import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAuth,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const MORGAN_STANLEY = "Morgan Stanley";
const UBS = "UBS";
const RBC = "RBC";
const STATE_NY = "NY";
const RECRUITING_PATH = "/recruiting";
const RESOURCE_ROUTE = "**/RecruitingMarket**";
const FIRM_INPUT_SELECTOR = '.watchlist-firm-row input[name="firm"]';
const HELP_SELECTOR = ".watchlist-firm-row .filter-field-help";

describe("recruiting filter controls", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("keeps repeated firm filters labeled and submits surviving firms in order", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const resourceQueries: string[] = [];
    try {
      await routeAuth(page, false);
      await routeRecruitingMarket(page, resourceQueries);

      await page.goto(
        `${baseUrl}${RECRUITING_PATH}?firm=${encodeURIComponent(MORGAN_STANLEY)}&firm=${UBS}&state=${STATE_NY}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.locator(".recruiting-filters").waitFor({
        timeout: QUICK_TIMEOUT,
      });

      await expectFirmRows(page, [MORGAN_STANLEY, UBS]);
      await page.getByRole("button", { name: "Add firm" }).click();
      await page.locator(FIRM_INPUT_SELECTOR).nth(2).fill(RBC);
      await page.getByRole("button", { name: "Remove firm 2" }).click();
      await expectFirmRows(page, [MORGAN_STANLEY, RBC]);
      await expectFirmHelpBindings(page, [
        "firm-filter-help-firm-1",
        "firm-filter-help-firm-2",
      ]);

      const requestCount = resourceQueries.length;
      await Promise.all([
        waitForResourceRequest(resourceQueries, requestCount),
        page.getByRole("button", { name: "Apply" }).click(),
      ]);

      const lastQuery = new URLSearchParams(resourceQueries.at(-1) ?? "");
      expect(lastQuery.getAll("firm")).toEqual([MORGAN_STANLEY, RBC]);
      expect(lastQuery.get("state")).toBe(STATE_NY);
      expect(lastQuery.get("direction")).toBe("net");
      expect(lastQuery.get("limit")).toBe("30");
    } finally {
      await page.close();
    }
  });

  it("keeps Add firm disabled until the current row matches a suggestion", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const resourceQueries: string[] = [];
    try {
      await routeAuth(page, false);
      await routeRecruitingMarket(page, resourceQueries);

      await page.goto(`${baseUrl}${RECRUITING_PATH}`, {
        waitUntil: "domcontentloaded",
      });
      await page.locator(".recruiting-filters").waitFor({
        timeout: QUICK_TIMEOUT,
      });

      const addFirm = page.getByRole("button", { name: "Add firm" });
      expect(await addFirm.isDisabled()).toBe(true);
      await addFirm.evaluate(button => (button as HTMLButtonElement).click());
      await expectFirmRows(page, [""]);

      await page.locator(FIRM_INPUT_SELECTOR).fill("Morgan");
      expect(await addFirm.isDisabled()).toBe(true);

      await page.locator(FIRM_INPUT_SELECTOR).fill(MORGAN_STANLEY);
      expect(await addFirm.isDisabled()).toBe(false);
      await addFirm.click();
      await expectFirmRows(page, [MORGAN_STANLEY, ""]);
      expect(await addFirm.isDisabled()).toBe(true);
    } finally {
      await page.close();
    }
  });
});

/**
 * Routes RecruitingMarket with filter values echoed back into the payload.
 * @param page - Playwright page.
 * @param queries - Captured resource query strings.
 */
async function routeRecruitingMarket(
  page: Page,
  queries: string[]
): Promise<void> {
  await page.route(RESOURCE_ROUTE, async route => {
    const search = new URL(route.request().url()).search;
    queries.push(search);
    await route.fulfill({ json: recruitingMarketPayload(search) });
  });
}

/**
 * Waits until the mocked resource has observed another request.
 * @param queries - Captured resource query strings.
 * @param previousCount - Count before the triggering action.
 */
async function waitForResourceRequest(
  queries: readonly string[],
  previousCount: number
): Promise<void> {
  const deadline = Date.now() + QUICK_TIMEOUT;
  while (Date.now() < deadline) {
    if (queries.length > previousCount) return;
    await new Promise(done => setTimeout(done, 25));
  }
  throw new Error("Timed out waiting for RecruitingMarket request");
}

/**
 * Verifies row values and remove-button labels after add/remove rewrites.
 * @param page - Playwright page.
 * @param firms - Expected firm values in visual row order.
 */
async function expectFirmRows(
  page: Page,
  firms: readonly string[]
): Promise<void> {
  await page.waitForFunction(
    ({ count, selector }) =>
      document.querySelectorAll(selector).length === count,
    { count: firms.length, selector: FIRM_INPUT_SELECTOR }
  );
  const values = await page
    .locator(FIRM_INPUT_SELECTOR)
    .evaluateAll(inputs =>
      inputs.map(input => (input as HTMLInputElement).value)
    );
  const removeLabels = await page
    .locator(".watchlist-remove-button")
    .evaluateAll(buttons =>
      buttons.map(button => button.getAttribute("aria-label"))
    );
  expect(values).toEqual(firms);
  expect(removeLabels).toEqual(
    firms.map((_, index) => `Remove firm ${index + 1}`)
  );
}

/**
 * Confirms helper copy remains uniquely associated after rows are rebuilt.
 * @param page - Playwright page.
 * @param ids - Expected helper ids in row order.
 */
async function expectFirmHelpBindings(
  page: Page,
  ids: readonly string[]
): Promise<void> {
  const help = await page.locator(HELP_SELECTOR).evaluateAll(nodes =>
    nodes.map(node => ({
      id: node.id,
      text: node.textContent?.trim(),
    }))
  );
  const describedBy = await page
    .locator(FIRM_INPUT_SELECTOR)
    .evaluateAll(inputs =>
      inputs.map(input => input.getAttribute("aria-describedby"))
    );
  expect(help).toEqual(
    ids.map(id => ({
      id,
      text: "Choose an exact firm result from the suggestions.",
    }))
  );
  expect(describedBy).toEqual(ids);
}

/**
 * Builds a RecruitingMarket payload sufficient for the filter form route.
 * @param search - Current resource request search string.
 * @returns RecruitingMarket payload.
 */
function recruitingMarketPayload(search: string): unknown {
  const params = new URLSearchParams(search);
  const firms = params.getAll("firm");
  return {
    generatedAt: "2026-06-29T00:00:00.000Z",
    filters: {
      direction: params.get("direction") || "net",
      firmId: null,
      firmQuery: firms[0] ?? null,
      limit: Number(params.get("limit") || 30),
      state: params.get("state"),
      watchlistFirmIds: [],
      watchlistFirmQueries: firms,
      year: params.get("year"),
    },
    summary: {
      count: 0,
      knownAum: 0,
      missingT12Count: 0,
      unknownAumCount: 0,
    },
    sourceCoverage: {
      missingAumCount: 0,
      missingLocationCount: 0,
      missingSourceCount: 0,
      missingT12Count: 0,
      moveCount: 0,
      sourceBackedCount: 0,
      statusCounts: [],
    },
    firmMomentum: [
      firmMomentum(MORGAN_STANLEY),
      firmMomentum(UBS),
      firmMomentum(RBC),
    ],
    watchlist: firms.length ? watchlistPayload(firms) : null,
    marketActivity: [],
    recentMoves: [],
    provenance: {
      sourceTables: ["TransitionEvent", "Article"],
      sourceIds: [],
    },
    emptyState: "No matching public recruiting moves are loaded.",
  };
}

/**
 * Builds a zero-move firm momentum row that still feeds datalist suggestions.
 * @param name - Firm display name.
 * @returns Firm momentum row.
 */
function firmMomentum(name: string): unknown {
  return {
    firm: {
      id: `firm-${name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
      name,
      short: name,
    },
    inbound: { count: 0, knownAum: 0, missingT12Count: 0, unknownAumCount: 0 },
    outbound: { count: 0, knownAum: 0, missingT12Count: 0, unknownAumCount: 0 },
    netKnownAum: 0,
    netMoveCount: 0,
    sourceMoveIds: [],
  };
}

/**
 * Builds no-match watchlist rows for the selected firms.
 * @param firms - Firm query values.
 * @returns Public watchlist payload.
 */
function watchlistPayload(firms: readonly string[]): unknown {
  return {
    generatedAt: "2026-06-29T00:00:00.000Z",
    count: firms.length,
    summary: {
      inbound: {
        count: 0,
        knownAum: 0,
        missingT12Count: 0,
        unknownAumCount: 0,
      },
      outbound: {
        count: 0,
        knownAum: 0,
        missingT12Count: 0,
        unknownAumCount: 0,
      },
      netKnownAum: 0,
      netMoveCount: 0,
    },
    items: firms.map(firm => ({
      query: firm,
      firm: {
        id: `firm-${firm.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
        name: firm,
        short: firm,
      },
      inbound: {
        count: 0,
        knownAum: 0,
        missingT12Count: 0,
        unknownAumCount: 0,
      },
      outbound: {
        count: 0,
        knownAum: 0,
        missingT12Count: 0,
        unknownAumCount: 0,
      },
      netKnownAum: 0,
      netMoveCount: 0,
      sourceCoverage: {
        missingLocationCount: 0,
        missingSourceCount: 0,
        moveCount: 0,
        sourceBackedCount: 0,
      },
      sourceMoveIds: [],
      sourceStatus: ["no-matching-moves"],
    })),
  };
}

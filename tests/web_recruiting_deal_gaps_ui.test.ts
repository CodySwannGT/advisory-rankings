import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAuth,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const DEAL_GAPS_PATH = "/recruiting/deal-gaps";
const RESOURCE_ROUTE = "**/RecruitingDealDataGaps**";
const ADVISOR_NAME = "Avery Stone";
const EXAMPLE_WEALTH = "Example Wealth";
const GAP_TYPE_PARAM = "gapType";
const MISSING_AUM = "missing-aum";
const STATE_GA = "GA";
const TRANSITION_GAP_ID = "transition-gap-1";
const UNRESOLVED_PARAM = "unresolved";
const ROW_TITLE = `${ADVISOR_NAME} to ${EXAMPLE_WEALTH}`;

describe("recruiting deal gaps route", () => {
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

  it("renders public gap rows with filters and follow-up links", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      await routeAuth(page, false);
      await routeDealGaps(page, dealGapPayload());

      await page.goto(
        `${baseUrl}${DEAL_GAPS_PATH}?state=${STATE_GA}&gapType=${MISSING_AUM}&unresolved=exclude`,
        { waitUntil: "domcontentloaded" }
      );

      await page
        .locator("h1")
        .filter({ hasText: "Recruiting Deal Gaps" })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page.getByText(ROW_TITLE).waitFor({ timeout: QUICK_TIMEOUT });
      expect(await inputValue(page, "state")).toBe(STATE_GA);
      expect(await selectedValue(page, GAP_TYPE_PARAM)).toBe(MISSING_AUM);
      expect(await selectedValue(page, UNRESOLVED_PARAM)).toBe("exclude");

      const row = page.locator(".deal-gap-row").first();
      const gapTags = row.locator(".deal-gap-tags");
      await gapTags.getByText("Missing AUM").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await gapTags.getByText("Missing deal terms").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await row
        .getByLabel("Source status")
        .getByText("Source confirmed")
        .waitFor({ timeout: QUICK_TIMEOUT });
      await row.getByText("TransitionEvent transition-gap-1").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await row
        .getByText(
          "Public follow-up: review linked public sources and keep unknown deal fields marked incomplete until evidence is found."
        )
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await row.getByRole("link", { name: "Article" }).getAttribute("href")
      ).toBe("/articles/article-gap-1");
      expect(
        await row.getByRole("link", { name: "Subject" }).getAttribute("href")
      ).toBe("/advisors/advisor-gap-1");
      expect(
        await row
          .getByRole("link", { name: "Market slice" })
          .getAttribute("href")
      ).toBe("/recruiting?state=GA");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("submits filters into the copied URL and resource request", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const resourceQueries: string[] = [];
    try {
      await routeAuth(page, false);
      await page.route(RESOURCE_ROUTE, async route => {
        const search = new URL(route.request().url()).search;
        resourceQueries.push(search);
        await route.fulfill({ json: dealGapPayloadForQuery(search) });
      });

      await page.goto(`${baseUrl}${DEAL_GAPS_PATH}?limit=2`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByText(ROW_TITLE).waitFor({ timeout: QUICK_TIMEOUT });
      await page.locator('input[name="firm"]').fill(EXAMPLE_WEALTH);
      await page.locator('input[name="state"]').fill(STATE_GA);
      await page.locator('select[name="direction"]').selectOption("inbound");
      await page
        .locator('select[name="gapType"]')
        .selectOption("missing-source");

      await Promise.all([
        page.waitForURL(
          `${baseUrl}${DEAL_GAPS_PATH}?firm=Example+Wealth&state=GA&year=&direction=inbound&gapType=missing-source&unresolved=include&limit=2`
        ),
        page.getByRole("button", { name: "Apply" }).click(),
      ]);

      const lastQuery = new URLSearchParams(resourceQueries.at(-1) ?? "");
      expect(lastQuery.get("firm")).toBe(EXAMPLE_WEALTH);
      expect(lastQuery.get("state")).toBe(STATE_GA);
      expect(lastQuery.get("direction")).toBe("inbound");
      expect(lastQuery.get(GAP_TYPE_PARAM)).toBe("missing-source");
      expect(lastQuery.get("limit")).toBe("2");
    } finally {
      await page.close();
    }
  });

  it("renders the empty state on mobile", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await routeAuth(page, false);
      await routeDealGaps(page, {
        ...dealGapPayload(),
        emptyState: "No matching public recruiting deal-data gaps are loaded.",
        items: [],
        summary: { count: 0, sourceBackedCount: 0, unresolvedCount: 0 },
        total: 0,
      });

      await page.goto(`${baseUrl}${DEAL_GAPS_PATH}?state=ZZ`, {
        waitUntil: "domcontentloaded",
      });

      await page
        .getByText("No matching recruiting deal gaps")
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await page
          .getByRole("link", { name: "Open Recruiting Market" })
          .getAttribute("href")
      ).toBe("/recruiting");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    } finally {
      await page.close();
    }
  });
});

async function routeDealGaps(page: Page, payload: unknown): Promise<void> {
  await page.route(RESOURCE_ROUTE, async route => {
    await route.fulfill({ json: payload });
  });
}

function dealGapPayload(): unknown {
  return {
    generatedAt: "2026-06-27T00:00:00.000Z",
    filters: {
      direction: "net",
      firmId: null,
      firmQuery: null,
      gapType: MISSING_AUM,
      limit: 25,
      state: STATE_GA,
      unresolved: "exclude",
      year: null,
    },
    summary: { count: 1, sourceBackedCount: 1, unresolvedCount: 0 },
    total: 1,
    nextCursor: null,
    provenance: {
      sourceTables: ["TransitionEvent", "RecruitingDealQuote", "Article"],
      sourceIds: [TRANSITION_GAP_ID],
    },
    emptyState: null,
    items: [
      {
        id: TRANSITION_GAP_ID,
        subject: { kind: "advisor", id: "advisor-gap-1", name: ADVISOR_NAME },
        fromFirm: { id: "firm-old", name: "Old Firm", short: "Old Firm" },
        toFirm: {
          id: "firm-example",
          name: EXAMPLE_WEALTH,
          short: EXAMPLE_WEALTH,
        },
        moveDate: "2026-05-01",
        aumMoved: null,
        productionT12: 1200000,
        headcountMoved: null,
        deal: null,
        location: { city: "Atlanta", state: "GA", label: "Atlanta, GA" },
        market: { city: "Atlanta", state: "GA", label: "Atlanta, GA" },
        article: {
          id: "article-gap-1",
          headline: "Example Wealth hires Avery Stone",
          publishedDate: "2026-05-02T00:00:00.000Z",
          modifiedDate: "2026-05-03T00:00:00.000Z",
          url: "https://www.advisorhub.com/example-wealth-hires",
        },
        loadedAt: "2026-05-03T00:00:00.000Z",
        sourceStatus: ["source-backed", MISSING_AUM, "missing-deal-terms"],
        gapTypes: [MISSING_AUM, "missing-deal-terms"],
        missingFieldLabels: ["Missing AUM", "Missing deal terms"],
        links: {
          article: "/articles/article-gap-1",
          subject: "/advisors/advisor-gap-1",
          fromFirm: "/firms/firm-old",
          toFirm: "/firms/firm-example",
          recruitingMarket: "/recruiting",
        },
        provenance: {
          sourceTable: "TransitionEvent",
          sourceIds: [TRANSITION_GAP_ID],
          articleMentionIds: ["mention-gap-1"],
          dealQuoteIds: [],
        },
      },
    ],
  };
}

function dealGapPayloadForQuery(search: string): unknown {
  const params = new URLSearchParams(search);
  return {
    ...dealGapPayload(),
    filters: {
      direction: params.get("direction") || "net",
      firmId: null,
      firmQuery: params.get("firm"),
      gapType: params.get("gapType"),
      limit: Number(params.get("limit") || 25),
      state: params.get("state"),
      unresolved: params.get("unresolved") || "include",
      year: params.get("year") || null,
    },
  };
}

async function inputValue(page: Page, name: string): Promise<string> {
  return await page.locator(`input[name="${name}"]`).inputValue();
}

async function selectedValue(page: Page, name: string): Promise<string> {
  return await page.locator(`select[name="${name}"]`).inputValue();
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth
  );
}

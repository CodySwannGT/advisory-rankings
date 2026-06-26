import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAuth,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const SOURCE_TRIAGE_PATH = "/source-triage";
const NO_EVENT_REASON = "no-event-cards";

describe("source article triage route", () => {
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

  it("renders filtered triage rows with source and ArticleView links", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      await routeAuth(page, false);
      await routeTriage(page, triagePayload());

      await page.goto(
        `${baseUrl}${SOURCE_TRIAGE_PATH}?category=unknown&reason=${NO_EVENT_REASON}`,
        { waitUntil: "domcontentloaded" }
      );

      await page
        .locator("h1")
        .filter({ hasText: "Source Article Triage" })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page
        .getByRole("link", { name: "Market brief needs review" })
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(await selectedValue(page, "category")).toBe("unknown");
      expect(await selectedValue(page, "reason")).toBe(NO_EVENT_REASON);
      const firstRow = page.locator(".source-triage-row").first();
      await firstRow.getByText("No event cards").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await firstRow.getByText("Advisors0").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      expect(
        await page
          .getByRole("link", { name: "ArticleView" })
          .first()
          .getAttribute("href")
      ).toBe("/articles/market-brief-article-1");
      expect(
        await page
          .getByRole("link", { name: "Original source" })
          .first()
          .getAttribute("href")
      ).toBe("https://www.advisorhub.com/market-brief");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("renders an empty state with a Feed return link", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    try {
      await routeAuth(page, false);
      await routeTriage(page, {
        ...triagePayload(),
        count: 0,
        items: [],
        hasMore: false,
      });

      await page.goto(`${baseUrl}${SOURCE_TRIAGE_PATH}?category=press`, {
        waitUntil: "domcontentloaded",
      });

      await page
        .getByText("No source articles match these filters")
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await page.getByRole("link", { name: "Open Feed" }).getAttribute("href")
      ).toBe("/");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    } finally {
      await page.close();
    }
  });
});

async function routeTriage(
  page: Page,
  payload: Readonly<Record<string, unknown>>
): Promise<void> {
  await page.route("**/SourceArticleTriage**", async route => {
    await route.fulfill({ json: payload });
  });
}

function triagePayload(): Readonly<Record<string, unknown>> {
  return {
    generatedAt: "2026-06-26T19:00:00.000Z",
    count: 1,
    filters: {
      category: "unknown",
      reason: NO_EVENT_REASON,
      limit: 20,
    },
    items: [
      {
        id: "article-1",
        headline: "Market brief needs review",
        publishedDate: "2026-06-26T00:00:00.000Z",
        sourceUrl: "https://www.advisorhub.com/market-brief",
        articleViewPath: "/articles/market-brief-article-1",
        category: "unknown",
        advisorCount: 0,
        firmCount: 1,
        teamCount: 0,
        eventCardCount: 0,
        hasBody: false,
        provenanceCount: 0,
        candidateProvenanceCount: 0,
        reasons: [
          { token: "uncategorized", label: "Uncategorized" },
          { token: NO_EVENT_REASON, label: "No event cards" },
          { token: "no-body-text", label: "No body text" },
          { token: "missing-provenance", label: "Missing provenance" },
        ],
        reasonTokens: [
          "uncategorized",
          NO_EVENT_REASON,
          "no-body-text",
          "missing-provenance",
        ],
      },
    ],
    nextCursor: null,
    hasMore: false,
  };
}

async function selectedValue(page: Page, name: string): Promise<string> {
  return await page.locator(`select[name="${name}"]`).inputValue();
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
}

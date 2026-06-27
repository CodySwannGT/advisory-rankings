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
const NO_EVENT_LABEL = "No event cards";
const NO_BODY_REASON = "no-body-text";
const MARKET_BRIEF_TITLE = "Market brief needs review";

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
        .getByRole("link", { name: MARKET_BRIEF_TITLE })
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(await selectedValue(page, "category")).toBe("unknown");
      expect(await selectedValue(page, "reason")).toBe(NO_EVENT_REASON);
      const firstRow = page.locator(".source-triage-row").first();
      await firstRow.getByText(NO_EVENT_LABEL).waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await firstRow.getByText("Advisors0").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await firstRow.getByText("BodyMissing").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await firstRow.getByText("Provenance0 total, 0 candidate").waitFor({
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
      expect(
        await page.getByRole("link", { name: "Original source" }).count()
      ).toBe(1);
      await Promise.all([
        page.waitForURL(`${baseUrl}${SOURCE_TRIAGE_PATH}`),
        page.getByRole("button", { name: "Clear" }).click(),
      ]);
      expect(new URL(page.url()).pathname).toBe(SOURCE_TRIAGE_PATH);
      expect(new URL(page.url()).search).toBe("");
      expect(await hasHorizontalOverflow(page)).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("preserves selected filters and result count in the copied URL", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const resourceQueries: string[] = [];
    try {
      await routeAuth(page, false);
      await routeTriageFromRequest(page, resourceQueries);

      await page.goto(
        `${baseUrl}${SOURCE_TRIAGE_PATH}?category=unknown&reason=${NO_EVENT_REASON}&limit=2`,
        { waitUntil: "domcontentloaded" }
      );
      await page
        .getByRole("link", { name: MARKET_BRIEF_TITLE })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page.locator('select[name="category"]').selectOption("market");
      await page.locator('select[name="reason"]').selectOption(NO_BODY_REASON);
      await Promise.all([
        page.waitForURL(
          `${baseUrl}${SOURCE_TRIAGE_PATH}?category=market&reason=${NO_BODY_REASON}&limit=2`
        ),
        page.getByRole("button", { name: "Apply" }).click(),
      ]);
      await page
        .getByRole("link", { name: MARKET_BRIEF_TITLE })
        .waitFor({ timeout: QUICK_TIMEOUT });

      const copiedUrl = page.url();
      await page.goto("about:blank");
      await page.goto(copiedUrl, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("link", { name: MARKET_BRIEF_TITLE })
        .waitFor({ timeout: QUICK_TIMEOUT });

      const lastQuery = resourceQueries.at(-1) ?? "";
      expect(await selectedValue(page, "category")).toBe("market");
      expect(await selectedValue(page, "reason")).toBe(NO_BODY_REASON);
      expect(
        await page.getByRole("link", { name: /needs review/u }).count()
      ).toBe(2);
      expect(new URL(copiedUrl).search).toBe(
        `?category=market&reason=${NO_BODY_REASON}&limit=2`
      );
      expect(new URLSearchParams(lastQuery).get("category")).toBe("market");
      expect(new URLSearchParams(lastQuery).get("reason")).toBe(NO_BODY_REASON);
      expect(new URLSearchParams(lastQuery).get("limit")).toBe("2");
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

async function routeTriageFromRequest(
  page: Page,
  resourceQueries: string[]
): Promise<void> {
  await page.route("**/SourceArticleTriage**", async route => {
    const url = new URL(route.request().url());
    resourceQueries.push(url.search);
    const params = url.searchParams;
    await route.fulfill({
      json: triagePayloadForFilters({
        category: params.get("category") || "all",
        reason: params.get("reason"),
        limit: Number(params.get("limit") || "20"),
      }),
    });
  });
}

function triagePayloadForFilters(filters: {
  readonly category: string;
  readonly reason: string | null;
  readonly limit: number;
}): Readonly<Record<string, unknown>> {
  const payload = triagePayload() as Readonly<Record<string, unknown>> & {
    readonly items: ReadonlyArray<Readonly<Record<string, unknown>>>;
  };
  return {
    ...payload,
    count: filters.limit,
    filters,
    items: Array.from({ length: filters.limit }, (_, index) => ({
      ...payload.items[index % payload.items.length],
      id: `article-${index + 1}`,
      headline: index === 0 ? MARKET_BRIEF_TITLE : "Economy brief needs review",
      category: filters.category,
      reasons: [
        {
          token: filters.reason ?? NO_EVENT_REASON,
          label:
            filters.reason === NO_BODY_REASON ? "No body text" : NO_EVENT_LABEL,
        },
      ],
      reasonTokens: [filters.reason ?? NO_EVENT_REASON],
    })),
  };
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
        headline: MARKET_BRIEF_TITLE,
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
          { token: NO_EVENT_REASON, label: NO_EVENT_LABEL },
          { token: NO_BODY_REASON, label: "No body text" },
          { token: "missing-provenance", label: "Missing provenance" },
        ],
        reasonTokens: [
          "uncategorized",
          NO_EVENT_REASON,
          NO_BODY_REASON,
          "missing-provenance",
        ],
      },
      {
        id: "article-2",
        headline: "LinkedIn snippet needs review",
        publishedDate: "2026-06-25T00:00:00.000Z",
        sourceUrl: "https://www.linkedin.com/in/example-advisor",
        articleViewPath: "/articles/linkedin-snippet-article-2",
        category: "unknown",
        advisorCount: 0,
        firmCount: 0,
        teamCount: 0,
        eventCardCount: 0,
        hasBody: false,
        provenanceCount: 0,
        candidateProvenanceCount: 0,
        reasons: [{ token: NO_EVENT_REASON, label: NO_EVENT_LABEL }],
        reasonTokens: [NO_EVENT_REASON],
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

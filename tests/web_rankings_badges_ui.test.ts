import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const RANKINGS_ROUTE = "**/RankingsExplorer**";
const RANKINGS_TABLE = ".rankings-table";
const REQUIRED_LABELS = [
  "Linked AdvisorBook Profile",
  "Verified Source",
] as const;
const EXAMPLE_FIRM_NAME = "Example Wealth";
const SOURCE_ID = "source-ranking";

const browserDescribe =
  process.env.RUN_WEB_RANKINGS_BADGES_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe
    : describe.skip;

browserDescribe("rankings status badges (#1525)", () => {
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

  it("keeps profile and source badges readable on desktop and mobile", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeRankings(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/rankings`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Ranked profiles" })
      .waitFor({ timeout: QUICK_TIMEOUT });

    const desktop = await readBadgeLayout(page);
    await page.screenshot({
      path: join(SHOTS, "issue-1525-rankings-badges-desktop.png"),
      fullPage: true,
    });
    expect(desktop.missingLabels).toEqual([]);
    expect(desktop.collapsedLabels).toEqual([]);
    expect(desktop.overflowLabels).toEqual([]);
    expect(desktop.documentOverflow).toBe(false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Ranked profiles" })
      .waitFor({ timeout: QUICK_TIMEOUT });

    const mobile = await readBadgeLayout(page);
    await page.screenshot({
      path: join(SHOTS, "issue-1525-rankings-badges-mobile.png"),
      fullPage: true,
    });
    expect(mobile.missingLabels).toEqual([]);
    expect(mobile.collapsedLabels).toEqual([]);
    expect(mobile.overflowLabels).toEqual([]);
    expect(mobile.documentOverflow).toBe(false);

    await page.close();
  });
});

async function routeRankings(page: Page): Promise<void> {
  await page.route(RANKINGS_ROUTE, async route => {
    await route.fulfill({ json: rankingsPayload() });
  });
}

async function readBadgeLayout(page: Page) {
  return await page.evaluate(
    ({ rankingsTable, requiredLabels }) => {
      const viewportWidth = document.documentElement.clientWidth;
      const labels = requiredLabels as readonly string[];
      const tags = [
        ...document.querySelectorAll<HTMLElement>(`${rankingsTable} .tag`),
      ];
      const tagByLabel = (label: string) =>
        tags.find(tag => tag.textContent?.trim() === label);
      const missingLabels = labels.filter(label => !tagByLabel(label));
      const collapsedLabels = labels.filter(label => {
        const tag = tagByLabel(label);
        if (!tag) return false;
        const rect = tag.getBoundingClientRect();
        const longestWord = Math.max(
          ...label.split(/\s+/u).map(word => word.length)
        );
        return rect.height > 80 || rect.width < longestWord * 6;
      });
      const overflowLabels = labels.filter(label => {
        const tag = tagByLabel(label);
        if (!tag) return false;
        const rect = tag.getBoundingClientRect();
        return (
          tag.scrollWidth > tag.clientWidth + 1 ||
          rect.left < 0 ||
          rect.right > viewportWidth + 1
        );
      });
      return {
        collapsedLabels,
        documentOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        missingLabels,
        overflowLabels,
      };
    },
    { rankingsTable: RANKINGS_TABLE, requiredLabels: REQUIRED_LABELS }
  );
}

function rankingsPayload() {
  return {
    generatedAt: "2026-07-04T04:30:00.000Z",
    filters: {
      category: null,
      year: null,
      firmQuery: null,
      state: null,
      city: null,
      resolved: null,
      sort: "rank",
    },
    facets: {
      categories: ["Next Gen"],
      cities: ["Atlanta"],
      firms: [EXAMPLE_FIRM_NAME],
      states: ["GA"],
      years: [2026],
    },
    summary: {
      totalEntries: 1,
      resolvedEntries: 1,
      unresolvedEntries: 0,
      representedFirms: 1,
      representedStates: 1,
    },
    coverage: {
      totalEntries: 1,
      buckets: [],
      gapBuckets: [],
      emptyState: null,
    },
    topFirms: [
      {
        firm: {
          id: "firm-example",
          name: EXAMPLE_FIRM_NAME,
          url: "/firms/example",
        },
        firmText: EXAMPLE_FIRM_NAME,
        count: 1,
        sourceIds: [SOURCE_ID],
      },
    ],
    items: [
      {
        id: "ranking-entry-readable-badges",
        rank: 12,
        resolutionStatus: "resolved",
        sourceStatus: ["source-backed"],
        subject: {
          id: "advisor-readable",
          kind: "advisor",
          displayName: "Alexandra Montgomery",
          url: "/advisors/alexandra-montgomery",
        },
        ranking: {
          id: "ranking-next-gen",
          name: "Next Gen Advisors to Watch",
          publisher: "AdvisorHub",
          year: 2026,
        },
        firm: {
          id: "firm-example",
          name: EXAMPLE_FIRM_NAME,
          url: "/firms/example",
        },
        firmText: EXAMPLE_FIRM_NAME,
        location: { city: "Atlanta", state: "GA", label: "Atlanta, GA" },
        scores: {
          total: { value: 94.2, status: "loaded", label: "94.2" },
          scale: { value: 91.4, status: "loaded", label: "91.4" },
          growth: { value: 88.7, status: "loaded", label: "88.7" },
          professionalism: { value: 96.1, status: "loaded", label: "96.1" },
        },
        source: {
          id: SOURCE_ID,
          label: "AdvisorHub ranking",
          url: "https://www.advisorhub.com/advisors-to-watch-rankings/",
          loadedAt: "2026-06-30T00:00:00.000Z",
        },
      },
    ],
    provenance: {
      sourceTables: ["Ranking", "RankingEntry"],
      sourceIds: [SOURCE_ID],
    },
    emptyState: null,
  };
}

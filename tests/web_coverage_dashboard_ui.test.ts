import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";
import type { DataCoverageResponse } from "../src/harper/resource-data-coverage.js";

const browserDescribe =
  process.env.RUN_WEB_COVERAGE_DASHBOARD_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

browserDescribe("coverage dashboard route (#1193)", () => {
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

  it("renders public coverage sections and truthful destinations", async () => {
    const page = await browser.newPage();
    const privateRequests: string[] = [];
    await routeAuth(page, false);
    await page.route("**/DataCoverage", async route => {
      await route.fulfill({ json: coveragePayload() });
    });
    await page.route("**/UserWatchlists**", async route => {
      privateRequests.push(route.request().url());
      await route.abort("blockedbyclient");
    });
    await page.route("**/UserRating**", async route => {
      privateRequests.push(route.request().url());
      await route.abort("blockedbyclient");
    });

    await page.goto(`${baseUrl}/coverage`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .getByRole("heading", { name: "Data coverage", exact: true })
      .waitFor({
        timeout: QUICK_TIMEOUT,
      });
    await page.getByText("Public data coverage").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    const advisorMetric = page.locator('[data-coverage-metric="advisors"]');
    await advisorMetric.waitFor({ timeout: QUICK_TIMEOUT });
    expect(await advisorMetric.textContent()).toContain("Advisors");
    expect(await advisorMetric.textContent()).toContain("1,250");
    await page
      .locator('[data-coverage-section="rankings"]')
      .waitFor({ timeout: QUICK_TIMEOUT });
    expect(
      await page
        .getByRole("link", { name: "Open rankings" })
        .getAttribute("href")
    ).toBe("/rankings");
    expect(
      await page
        .getByRole("link", { name: "Open recruiting" })
        .getAttribute("href")
    ).toBe("/recruiting");
    expect(
      await page
        .getByRole("link", { name: "Open research queue" })
        .getAttribute("href")
    ).toBe("/research/freshness");
    await page.getByText("Coverage caveats").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page
      .locator(".coverage-limitation-list li")
      .filter({ hasText: "Some ranking entries still need resolution" })
      .waitFor({ timeout: QUICK_TIMEOUT });
    expect(privateRequests).toEqual([]);

    await captureViewports(page, "issue-1193-coverage-dashboard");
    await page.close();
  });
});

/**
 * Builds a deterministic public coverage fixture.
 * @returns DataCoverage response.
 */
function coveragePayload(): DataCoverageResponse {
  return {
    generatedAt: "2026-06-12T08:15:00.000Z",
    sections: [
      {
        id: "public-entity-groups",
        label: "Public entity groups",
        metrics: [
          metric("advisors", "Advisors", 1250, "Advisor", "/PublicAdvisors"),
          metric("firms", "Firms", 210, "Firm", "/PublicFirms"),
          metric("articles", "Articles", 4000, "Article", "/Feed"),
        ],
      },
      {
        id: "rankings",
        label: "Rankings coverage",
        metrics: [
          metric(
            "ranking-gap-buckets",
            "Ranking gap buckets",
            3,
            "RankingsExplorer.coverage.gapBuckets",
            "/RankingsExplorer",
            "Some ranking entries still need resolution or source fields."
          ),
        ],
      },
      {
        id: "recruiting",
        label: "Recruiting coverage",
        metrics: [
          metric("moves", "Moves", 42, "TransitionEvent", "/RecruitingMarket"),
        ],
      },
      {
        id: "research-freshness",
        label: "Research freshness",
        metrics: [
          metric(
            "latest-research-check",
            "Latest check",
            "2026-06-11T18:00:00.000Z",
            "AdvisorResearchCheck.checkedAt",
            "/AdvisorResearchQueue"
          ),
        ],
      },
    ],
    limitations: [
      "Some ranking entries still need resolution or source fields.",
    ],
    provenance: {
      sourceTables: ["Advisor", "Firm", "Article", "RankingEntry"],
      publicResources: [
        "/PublicAdvisors",
        "/PublicFirms",
        "/Feed",
        "/RankingsExplorer",
        "/RecruitingMarket",
        "/AdvisorResearchQueue",
      ],
    },
  };
}

/**
 * Builds one coverage metric fixture.
 * @param id - Metric id.
 * @param label - Metric label.
 * @param value - Metric value.
 * @param source - Source table or aggregate name.
 * @param publicResource - Public resource path.
 * @param limitation - Optional source limitation.
 * @returns Data coverage metric.
 */
function metric(
  id: string,
  label: string,
  value: number | string | null,
  source: string,
  publicResource: string | null,
  limitation: string | null = null
) {
  return { id, label, value, source, publicResource, limitation };
}

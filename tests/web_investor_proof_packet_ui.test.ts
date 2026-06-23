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
import type { InvestorProofPacketResponse } from "../src/harper/resource-investor-proof-packet.js";
import type { DataCoverageMetric } from "../src/harper/resource-data-coverage.js";

const browserDescribe =
  process.env.RUN_WEB_INVESTOR_PROOF_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe
    : describe.skip;
const RANKING_LIMITATION =
  "Some ranking entries still need resolution or source fields.";
const RESOURCE_ADVISOR_RESEARCH_QUEUE = "/AdvisorResearchQueue";
const RESOURCE_FEED = "/Feed";
const RESOURCE_PUBLIC_FIRMS = "/PublicFirms";
const SOURCE_FIRM = "Firm";
const SOURCE_ADVISOR_RESEARCH_CHECK = "AdvisorResearchCheck";

browserDescribe("investor proof packet route (#1369)", () => {
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

  it("renders public packet proof without private resource probes", async () => {
    const page = await browser.newPage();
    try {
      const privateRequests: string[] = [];
      await routeAuth(page, false);
      await page.route("**/InvestorProofPacket", async route => {
        await route.fulfill({ json: packetPayload() });
      });
      for (const routePath of [
        "**/UserWatchlists**",
        "**/UserRating**",
        "**/AdvisorCorrectionRequest**",
        "**/User/**",
      ]) {
        await page.route(routePath, async route => {
          privateRequests.push(route.request().url());
          await route.abort("blockedbyclient");
        });
      }

      await page.goto(`${baseUrl}/investor-proof`, {
        waitUntil: "domcontentloaded",
      });

      await page
        .getByRole("heading", { name: "Investor proof packet", exact: true })
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page.getByText("Public investor proof").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      expect(
        await page
          .locator('[data-investor-proof-metric="advisors"]')
          .textContent()
      ).toContain("16,265");
      expect(
        await page.locator('[data-investor-proof-metric="firms"]').textContent()
      ).toContain("2,701");
      expect(
        await page
          .locator('[data-investor-proof-link="representative-feed"]')
          .getAttribute("href")
      ).toBe("/articles/advisor-move-article-1");
      expect(
        await page
          .locator('[data-investor-proof-link="representative-firm"]')
          .getAttribute("href")
      ).toBe("/firms/example-wealth-firm-1");
      await page.getByText("Due profiles").waitFor({ timeout: QUICK_TIMEOUT });
      await page.getByText("16,168").waitFor({ timeout: QUICK_TIMEOUT });
      await page
        .getByText("No private watchlists, ratings, analyst notes")
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(privateRequests).toEqual([]);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .locator('[data-investor-proof-link="coverage-dashboard"]')
        .waitFor({ timeout: QUICK_TIMEOUT });
      await captureViewports(page, "issue-1369-investor-proof-packet");
    } finally {
      await page.close();
    }
  });
});

/**
 * Builds a deterministic public investor proof packet fixture.
 * @returns Investor proof packet payload.
 */
function packetPayload(): InvestorProofPacketResponse {
  return {
    generatedAt: "2026-06-23T12:30:00.000Z",
    unavailable: [
      RANKING_LIMITATION,
      "No source-rights conclusions are available.",
    ],
    coverage: {
      sections: [],
      keyMetrics: [
        metric("advisors", "Advisors", 16265, "Advisor", "/PublicAdvisors"),
        metric("firms", "Firms", 2701, SOURCE_FIRM, RESOURCE_PUBLIC_FIRMS),
        metric("articles", "Articles", 557, "Article", RESOURCE_FEED),
      ],
      limitations: [RANKING_LIMITATION],
    },
    freshness: {
      totalDue: 16168,
      returned: 2,
      statusCounts: { never_checked: 2 },
      priorityGroups: [
        {
          id: "missing_contact_data",
          label: "Missing contact data",
          count: 2,
          filters: {
            sourceType: "web_research",
            staleDays: 30,
            status: null,
            missingField: "businessEmail",
            limit: 25,
          },
          representativeAdvisorIds: ["advisor-1"],
        },
      ],
      representativeAdvisors: [
        {
          advisorId: "advisor-1",
          advisorName: "Avery Stone",
          finraCrd: "12345",
          profileUrl: "/advisors/avery-stone-advisor-1",
          firm: {
            id: "firm-1",
            name: "Example Wealth",
            roleTitle: "Managing director",
          },
          sourceType: "web_research",
          status: null,
          lastCheckedAt: null,
          nextCheckAfter: null,
          daysSinceLastCheck: null,
          missingFields: ["businessEmail"],
          provenance: {
            sourceTable: SOURCE_ADVISOR_RESEARCH_CHECK,
            sourceIds: [],
          },
        },
      ],
      limitation: null,
    },
    proofLinks: [
      link(
        "coverage-dashboard",
        "Coverage dashboard",
        "/coverage",
        "/DataCoverage"
      ),
      link(
        "research-freshness",
        "Research freshness workbench",
        "/research/freshness",
        RESOURCE_ADVISOR_RESEARCH_QUEUE
      ),
      link(
        "representative-feed",
        "Advisor move",
        "/articles/advisor-move-article-1",
        RESOURCE_FEED,
        ["article-1"]
      ),
      link(
        "representative-firm",
        "Example Wealth",
        "/firms/example-wealth-firm-1",
        RESOURCE_PUBLIC_FIRMS,
        ["firm-1"]
      ),
    ],
    provenance: {
      publicResources: [
        "/DataCoverage",
        RESOURCE_ADVISOR_RESEARCH_QUEUE,
        RESOURCE_FEED,
        RESOURCE_PUBLIC_FIRMS,
      ],
      sourceTables: [
        "Advisor",
        SOURCE_FIRM,
        "Article",
        SOURCE_ADVISOR_RESEARCH_CHECK,
      ],
    },
  };
}

/**
 * Builds one coverage metric fixture.
 * @param id - Metric id.
 * @param label - Metric label.
 * @param value - Metric value.
 * @param source - Source table.
 * @param publicResource - Public resource path.
 * @returns DataCoverage metric.
 */
function metric(
  id: string,
  label: string,
  value: number,
  source: string,
  publicResource: string
): DataCoverageMetric {
  return { id, label, value, source, publicResource, limitation: null };
}

/**
 * Builds one proof link fixture.
 * @param id - Link id.
 * @param label - Link label.
 * @param url - Public route URL.
 * @param publicResource - Public resource path.
 * @param sourceIds - Source ids.
 * @returns Proof link fixture.
 */
function link(
  id: string,
  label: string,
  url: string,
  publicResource: string,
  sourceIds: readonly string[] = []
) {
  return {
    id,
    label,
    url,
    publicResource,
    sourceTable: publicResource.replace("/", ""),
    sourceIds,
    limitation: null,
  };
}

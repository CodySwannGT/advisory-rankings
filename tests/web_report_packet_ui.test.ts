import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe =
  process.env.RUN_WEB_REPORT_PACKET_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;
const MISSING_ADVISOR_ID = "missing-id";

browserDescribe("report packet route (#965)", () => {
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

  it("loads comparison data and renders a packet shell", async () => {
    const page = await browser.newPage();
    const requests: string[] = [];
    await routeComparison(
      page,
      requests,
      comparisonPayload(["adv-a", "adv-b"])
    );

    await page.goto(`${baseUrl}/report-packet.html?ids=adv-a,adv-b`, {
      waitUntil: "domcontentloaded",
    });

    await page.locator(".report-packet-summary").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(requests).toEqual(["adv-a,adv-b"]);
    expect(await page.locator("h1").textContent()).toBe("Report packet");
    expect(await page.locator(".comparison-status").textContent()).toContain(
      "Ready"
    );
    expect(await page.locator(".report-packet-advisor").count()).toBe(2);
    expect(
      await page.locator(".report-packet-advisor").first().textContent()
    ).toContain("Advisor 1");
    await captureViewports(page, "issue-965-report-packet-shell");
    await page.close();
  });

  it("shows normalized duplicate and missing-id caveats", async () => {
    const page = await browser.newPage();
    await routeComparison(
      page,
      [],
      comparisonPayload(["adv-a", MISSING_ADVISOR_ID], {
        duplicateIds: ["adv-a"],
        missingIds: [MISSING_ADVISOR_ID],
        requestedIds: ["adv-a", "adv-a", MISSING_ADVISOR_ID],
      })
    );

    await page.goto(
      `${baseUrl}/report-packet.html?ids=adv-a,adv-a,${MISSING_ADVISOR_ID}`,
      { waitUntil: "domcontentloaded" }
    );

    const status = page.locator(".comparison-status");
    await status.waitFor({ timeout: QUICK_TIMEOUT });
    const statusText = await status.textContent();
    expect(statusText).toContain("Duplicate ids ignored: adv-a.");
    expect(statusText).toContain("Missing ids: missing-id.");
    await page.close();
  });
});

/**
 * Routes AdvisorComparison and records the ids query seen by the UI.
 * @param page - Browser page under test.
 * @param requests - Collector for requested ids.
 * @param payload - Mocked AdvisorComparison payload.
 */
async function routeComparison(
  page: Page,
  requests: string[],
  payload: unknown
): Promise<void> {
  await page.route("**/AdvisorComparison?**", async route => {
    requests.push(new URL(route.request().url()).searchParams.get("ids") ?? "");
    await route.fulfill({ json: payload });
  });
}

/**
 * Builds a minimal AdvisorComparison payload for the packet route.
 * @param ids - Normalized advisor ids.
 * @param selectionOverrides - Optional caveat metadata.
 * @returns Mocked resource payload.
 */
function comparisonPayload(
  ids: readonly string[],
  selectionOverrides: Partial<{
    readonly duplicateIds: readonly string[];
    readonly missingIds: readonly string[];
    readonly requestedIds: readonly string[];
  }> = {}
): unknown {
  const missingIds = selectionOverrides.missingIds ?? [];
  return {
    generatedAt: "2026-06-01T00:00:00.000Z",
    ids,
    count: ids.length,
    selection: {
      requestedIds: selectionOverrides.requestedIds ?? ids,
      normalizedIds: ids,
      duplicateIds: selectionOverrides.duplicateIds ?? [],
      missingIds,
      cappedIds: ids,
      min: 2,
      max: 4,
      truncated: false,
      status: ids.length < 2 ? "under_limit" : "ready",
    },
    items: ids.map((id, index) =>
      missingIds.includes(id) ? notFoundItem(id) : comparisonItem(id, index)
    ),
  };
}

/**
 * Builds one found advisor comparison item.
 * @param id - Advisor id.
 * @param index - Display index.
 * @returns Found comparison item.
 */
function comparisonItem(id: string, index: number): unknown {
  return {
    id,
    status: "found",
    displayName: `Advisor ${index + 1}`,
    identity: { careerStatus: "active", yearsExperience: 10 + index },
    firm: { name: `Firm ${index + 1}` },
    regulatory: {
      disclosureCount: 0,
      registrationApplications: [],
      brokerCheckSnapshot: null,
    },
    career: [],
    rankings: [],
    articles: [],
    dataConfidence: {
      confidenceSummary: { hasData: true, total: 3 },
      evidenceFreshness: {
        hasData: true,
        lastCheckedAt: "2026-05-31T00:00:00.000Z",
      },
    },
    attribution: {
      brokerCheck: null,
      articles: [],
      assertions: [],
      researchSources: [],
    },
  };
}

/**
 * Builds a not-found comparison item.
 * @param id - Missing advisor id.
 * @returns Not-found comparison item.
 */
function notFoundItem(id: string): unknown {
  return {
    ...comparisonItem(id, 0),
    id,
    status: "not_found",
    displayName: id,
    identity: null,
    firm: null,
  };
}

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADVISOR_ID,
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  RATING_ROUTE,
  routeAuth,
  routeWatchlists,
  SHOTS,
  startStaticServer,
  WATCHLISTS_ROUTE,
} from "./fixtures/watchlist-ui-harness.js";
import { comparisonItem } from "./fixtures/report-packet-comparison-item.js";

const browserDescribe =
  process.env.RUN_WEB_REPORT_PACKET_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;
const MISSING_ADVISOR_ID = "missing-id";
const PACKET_PRIVATE_NOTE = "packet-only private note";
const PACKET_PRIVATE_REVIEW = "Packet follow-up rating.";
const PACKET_ADVISOR_IDS = ["adv-a", "adv-b"] as const;
const PACKET_ADVISOR_QUERY = PACKET_ADVISOR_IDS.join(",");
const PACKET_SUMMARY_SELECTOR = ".report-packet-summary";
const PACKET_ADVISOR_SELECTOR = ".report-packet-advisor";

browserDescribe("report packet route (#966, #967, #969)", () => {
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

  it("loads comparison data and renders public evidence sections", async () => {
    const page = await browser.newPage();
    const requests: string[] = [];
    await routeComparison(
      page,
      requests,
      comparisonPayload(PACKET_ADVISOR_IDS)
    );

    await page.goto(
      `${baseUrl}/report-packet.html?ids=${PACKET_ADVISOR_QUERY}`,
      {
        waitUntil: "domcontentloaded",
      }
    );

    await page.locator(PACKET_SUMMARY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(requests).toEqual([PACKET_ADVISOR_QUERY]);
    expect(await page.locator("h1").textContent()).toBe("Report packet");
    expect(await page.locator(".comparison-status").textContent()).toContain(
      "Ready"
    );
    const advisorCards = page.locator(PACKET_ADVISOR_SELECTOR);
    expect(await advisorCards.count()).toBe(2);
    const firstAdvisor = await advisorCards.first().textContent();
    expect(firstAdvisor).toContain("Advisor 1");
    expect(firstAdvisor).toContain("Profile");
    expect(firstAdvisor).toContain("Active");
    expect(firstAdvisor).toContain("Firm");
    expect(firstAdvisor).toContain("Firm 1");
    expect(firstAdvisor).toContain("Regulatory");
    expect(firstAdvisor).toContain("CRD 1000");
    expect(firstAdvisor).toContain("Career");
    expect(firstAdvisor).toContain("Managing director at Firm 1");
    expect(firstAdvisor).toContain("Rankings / articles");
    expect(firstAdvisor).toContain("#12 AdvisorBook 100");
    expect(firstAdvisor).toContain("Data confidence");
    expect(firstAdvisor).toContain("3 source-backed fields");
    const secondAdvisor = await advisorCards.nth(1).textContent();
    expect(secondAdvisor).toContain("No career evidence available.");

    const appendix = page.locator(".report-packet-source-appendix");
    const appendixText = await appendix.textContent();
    expect(appendixText).toContain("Source appendix");
    expect(appendixText).toContain("CRD 1000; snapshot loaded May 2026.");
    expect(appendixText).toContain("Evidence checked May 2026.");
    expect(appendixText).toContain(
      "Advisor profile coverage, published Apr 2026, source Advisor Hub"
    );
    expect(appendixText).toContain(
      "Firm: Firm 1 (High confidence; article article-1)"
    );
    expect(appendixText).toContain(
      "Brokercheck; Checked; checked May 2026; sources: FINRA BrokerCheck"
    );
    expect(appendixText).toContain(
      "Unavailable: no BrokerCheck snapshot loaded for this advisor."
    );
    expect(appendixText).toContain(
      "Uncertain: no freshness check date is available."
    );
    expect(appendixText).toContain(
      "Unavailable: no article references loaded."
    );
    expect(appendixText).toContain(
      "Incomplete: no source-backed field confidence summary is available."
    );
    await captureViewports(page, "issue-966-report-packet-evidence");
    await page.close();
  });

  it("opens the packet from comparison with the same advisor ids", async () => {
    const page = await browser.newPage();
    const requests: string[] = [];
    await routeComparison(
      page,
      requests,
      comparisonPayload(PACKET_ADVISOR_IDS)
    );

    await page.goto(`${baseUrl}/compare.html?ids=${PACKET_ADVISOR_QUERY}`, {
      waitUntil: "domcontentloaded",
    });

    await page
      .getByRole("button", { name: "Open report packet for selected advisors" })
      .click();
    await page.waitForURL(/\/report-packet\?ids=adv-a%2Cadv-b$/u, {
      timeout: QUICK_TIMEOUT,
    });
    await page.locator(PACKET_SUMMARY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(requests).toEqual([PACKET_ADVISOR_QUERY, PACKET_ADVISOR_QUERY]);
    expect(await page.locator(PACKET_ADVISOR_SELECTOR).count()).toBe(2);
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

  it("renders signed-in private annotations in a separate packet section", async () => {
    const page = await browser.newPage();
    await routeAuth(page, true);
    await routeComparison(page, [], comparisonPayload([ADVISOR_ID, "adv-b"]));
    await routeWatchlists(page, () => undefined, [
      {
        id: "packet-list",
        name: "Packet watchlist",
        entries: [
          {
            id: "packet-entry",
            advisorId: ADVISOR_ID,
            rank: 2,
            note: PACKET_PRIVATE_NOTE,
          },
        ],
      },
    ]);
    await routePacketRatings(page);

    await page.goto(`${baseUrl}/report-packet.html?ids=${ADVISOR_ID},adv-b`, {
      waitUntil: "domcontentloaded",
    });

    const privateSection = page.locator(".comparison-private");
    await privateSection
      .getByText(PACKET_PRIVATE_NOTE)
      .waitFor({ timeout: QUICK_TIMEOUT });
    await privateSection.getByText("Private rating").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await privateSection.getByText(PACKET_PRIVATE_REVIEW).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.locator(".report-packet-source-appendix").count()).toBe(
      1
    );
    await captureViewports(page, "issue-968-report-packet-private-auth");
    await page.close();
  });

  it("does not fetch private packet annotations when signed out", async () => {
    const page = await browser.newPage();
    const privateRequests: string[] = [];
    await routeAuth(page, false);
    await routeComparison(page, [], comparisonPayload([ADVISOR_ID, "adv-b"]));
    await routePrivateRequestTracker(page, privateRequests);

    await page.goto(`${baseUrl}/report-packet.html?ids=${ADVISOR_ID},adv-b`, {
      waitUntil: "domcontentloaded",
    });

    await page.locator(PACKET_SUMMARY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.locator(".comparison-private").count()).toBe(0);
    expect(privateRequests).toHaveLength(0);
    await captureViewports(page, "issue-968-report-packet-private-signed-out");
    await page.close();
  });

  it("keeps packet print and mobile layouts readable", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeComparison(page, [], comparisonPayload(PACKET_ADVISOR_IDS));
    await routePrivateRequestTracker(page, []);

    await page.goto(
      `${baseUrl}/report-packet.html?ids=${PACKET_ADVISOR_QUERY}`,
      {
        waitUntil: "domcontentloaded",
      }
    );
    await page.locator(PACKET_SUMMARY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });

    await page.emulateMedia({ media: "print" });
    const printMetrics = await packetLayoutMetrics(page);
    expect(printMetrics.summaryWidth).toBeGreaterThan(600);
    expect(printMetrics.hiddenHeaderCount).toBe(0);
    expect(printMetrics.advisorOverflow).toBe(false);
    expect(printMetrics.appendixOverflow).toBe(false);

    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width: 360, height: 780 });
    const mobileMetrics = await packetLayoutMetrics(page);
    expect(mobileMetrics.documentOverflow).toBeLessThanOrEqual(1);
    expect(mobileMetrics.advisorOverflow).toBe(false);
    expect(mobileMetrics.appendixOverflow).toBe(false);
    await captureViewports(page, "issue-969-report-packet-print-mobile");
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
 * Routes packet private rating reads for signed-in overlay coverage.
 * @param page - Browser page under test.
 */
async function routePacketRatings(page: Page): Promise<void> {
  await page.route(RATING_ROUTE, async route => {
    const advisorId = route.request().url().split("/").pop();
    await route.fulfill({
      json: {
        authenticated: true,
        rating:
          advisorId === ADVISOR_ID
            ? { ratingInt: 4, reviewText: PACKET_PRIVATE_REVIEW }
            : null,
      },
    });
  });
}

/**
 * Tracks private resource requests that must not fire for anonymous packets.
 * @param page - Browser page under test.
 * @param requests - Collector for private request URLs.
 */
async function routePrivateRequestTracker(
  page: Page,
  requests: string[]
): Promise<void> {
  for (const glob of [WATCHLISTS_ROUTE, RATING_ROUTE]) {
    await page.route(glob, async route => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 401,
        json: { authenticated: false },
      });
    });
  }
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

/**
 * Reads layout measurements that catch clipped packet text and print chrome.
 * @param page - Browser page rendering the report packet.
 * @returns Packet layout metrics for assertions.
 */
async function packetLayoutMetrics(page: Page): Promise<{
  readonly advisorOverflow: boolean;
  readonly appendixOverflow: boolean;
  readonly documentOverflow: number;
  readonly hiddenHeaderCount: number;
  readonly summaryWidth: number;
}> {
  return page.evaluate(
    ({ advisorSelector, summarySelector }) => {
      const overflows = (selector: string): boolean =>
        [...document.querySelectorAll<HTMLElement>(selector)].some(
          node => node.scrollWidth > node.clientWidth + 1
        );
      const summary = document.querySelector<HTMLElement>(summarySelector);
      const visibleHeaders = [
        ...document.querySelectorAll<HTMLElement>("header.site-header"),
      ].filter(node => getComputedStyle(node).display !== "none");
      return {
        advisorOverflow: overflows(advisorSelector),
        appendixOverflow: overflows(".report-packet-source-advisor"),
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        hiddenHeaderCount: visibleHeaders.length,
        summaryWidth: summary?.getBoundingClientRect().width ?? 0,
      };
    },
    {
      advisorSelector: PACKET_ADVISOR_SELECTOR,
      summarySelector: PACKET_SUMMARY_SELECTOR,
    }
  );
}

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const DEV_BACKEND =
  process.env.COMPARISON_SMOKE_BACKEND ||
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const COMPARISON_TABLE_SELECTOR = ".comparison-table";
const COMPARISON_START_SELECTOR = ".comparison-start";
const RUN_ENABLED = process.env.RUN_WEB_COMPARISON_SMOKE === "1";
const browserDescribe =
  RUN_ENABLED && existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

interface FeedPayload {
  readonly items?: readonly FeedItem[];
}

interface FeedItem {
  readonly advisors?: readonly AdvisorChip[];
}

interface AdvisorChip {
  readonly id?: string;
}

interface ComparisonPayload {
  readonly generatedAt?: string;
  readonly items?: readonly ComparisonItem[];
  readonly selection?: Readonly<Record<string, unknown>>;
}

interface ComparisonItem {
  readonly articles?: readonly unknown[];
  readonly attribution?: Readonly<Record<string, unknown>>;
  readonly career?: readonly unknown[];
  readonly dataConfidence?: Readonly<Record<string, unknown>>;
  readonly displayName?: string;
  readonly firm?: unknown;
  readonly identity?: Readonly<Record<string, unknown>> | null;
  readonly id?: string;
  readonly rankings?: readonly unknown[];
  readonly regulatory?: {
    readonly brokerCheckSnapshot?: unknown;
    readonly disclosures?: readonly unknown[];
    readonly disclosureCount?: number;
    readonly registrationApplications?: readonly unknown[];
  };
  readonly status?: string;
}

interface AdvisorProfilePayload {
  readonly advisor: Readonly<Record<string, unknown>>;
  readonly articles?: readonly unknown[];
  readonly brokerCheckSnapshot?: unknown;
  readonly career?: readonly AdvisorCareerRow[];
  readonly confidenceSummary?: Readonly<Record<string, unknown>>;
  readonly disclosures?: readonly unknown[];
  readonly displayName?: string;
  readonly evidenceFreshness?: Readonly<Record<string, unknown>>;
  readonly registrationApplications?: readonly unknown[];
}

interface AdvisorCareerRow {
  readonly endDate?: unknown;
  readonly firm?: unknown;
}

let comparisonFixture: ComparisonPayload | null = null;

browserDescribe(
  "comparison smoke against local assets and dev resources (#815)",
  () => {
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

    it("captures desktop and 320px mobile comparison evidence", async () => {
      const ids = (await comparisonIdsWithBrokerCheck()).ids;
      const route = `/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
      const desktop = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await routeDevResources(desktop);
      await desktop.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
      });
      await desktop.locator(COMPARISON_TABLE_SELECTOR).waitFor({
        state: "visible",
        timeout: QUICK_TIMEOUT,
      });

      const desktopMetrics = await comparisonMetrics(desktop);
      await desktop.screenshot({
        path: join(SHOTS, "issue-815-comparison-smoke-desktop.png"),
        fullPage: true,
      });
      await desktop.close();

      const mobile = await browser.newPage({
        viewport: { width: 320, height: 900 },
      });
      await routeDevResources(mobile);
      await mobile.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
      });
      await mobile.locator(COMPARISON_TABLE_SELECTOR).waitFor({
        state: "visible",
        timeout: QUICK_TIMEOUT,
      });

      const mobileMetrics = await comparisonMetrics(mobile);
      await mobile.screenshot({
        path: join(SHOTS, "issue-815-comparison-smoke-mobile.png"),
        fullPage: true,
      });
      await mobile.close();

      expect(desktopMetrics.heading).toBe("Advisor comparison");
      expect(desktopMetrics.rows).toBeGreaterThanOrEqual(6);
      expect(desktopMetrics.brokerCheckAttributions).toBeGreaterThanOrEqual(1);
      expect(mobileMetrics.rows).toBeGreaterThanOrEqual(6);
      expect(mobileMetrics.brokerCheckAttributions).toBeGreaterThanOrEqual(1);
      expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(
        mobileMetrics.clientWidth
      );
      expect(mobileMetrics.tableScrollWidth).toBeGreaterThanOrEqual(
        mobileMetrics.tableClientWidth
      );
    });

    it("guides cold-start visitors who open compare without ids", async () => {
      const desktop = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await routeNoSelectionComparison(desktop);
      await desktop.goto(`${baseUrl}/compare`, {
        waitUntil: "domcontentloaded",
      });
      await desktop.locator(COMPARISON_START_SELECTOR).waitFor({
        state: "visible",
        timeout: QUICK_TIMEOUT,
      });

      const desktopMetrics = await compareStartMetrics(desktop);
      await desktop.screenshot({
        path: join(SHOTS, "issue-893-compare-start-desktop.png"),
        fullPage: true,
      });
      await desktop.close();

      const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await routeNoSelectionComparison(mobile);
      await mobile.goto(`${baseUrl}/compare`, {
        waitUntil: "domcontentloaded",
      });
      await mobile.locator(COMPARISON_START_SELECTOR).waitFor({
        state: "visible",
        timeout: QUICK_TIMEOUT,
      });

      const mobileMetrics = await compareStartMetrics(mobile);
      await mobile.screenshot({
        path: join(SHOTS, "issue-893-compare-start-mobile.png"),
        fullPage: true,
      });
      await mobile.close();

      expect(desktopMetrics.heading).toBe("Advisor comparison");
      expect(desktopMetrics.startTitle).toBe("Choose advisors to compare");
      expect(desktopMetrics.hasManualUrlInstruction).toBe(false);
      expect(desktopMetrics.hasBrowseAction).toBe(true);
      expect(desktopMetrics.hasDirectoryLink).toBe(true);
      expect(mobileMetrics.hasBrowseAction).toBe(true);
      expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(
        mobileMetrics.clientWidth
      );
    });
  }
);

/**
 * Fetches a backend resource, asserting a successful response before the body
 * is parsed so a failed request surfaces as a clean assertion rather than a
 * parse error.
 * @param url - Backend resource URL.
 * @returns Parsed JSON payload.
 */
async function fetchOkJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
}

/**
 * Finds two real feed advisor IDs whose comparison payload includes a
 * BrokerCheck snapshot, proving the UI can render required source attribution.
 * @returns Advisor IDs suitable for a comparison route.
 */
async function comparisonIdsWithBrokerCheck(): Promise<{
  readonly ids: readonly string[];
}> {
  const feed = await fetchOkJson<FeedPayload>(`${DEV_BACKEND}/Feed`);
  const ids = [
    ...new Set(
      (feed.items ?? [])
        .flatMap(item => item.advisors ?? [])
        .map(advisor => advisor.id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  for (const pair of adjacentPairs(ids)) {
    const payload = await comparisonPayload(pair);
    if (
      (payload.items ?? []).some(
        item => item.status === "found" && item.regulatory?.brokerCheckSnapshot
      )
    ) {
      comparisonFixture = payload;
      return { ids: pair };
    }
  }

  throw new Error("No feed advisor pair produced BrokerCheck attribution");
}

/**
 * Returns ordered adjacent ID pairs.
 * @param ids - Candidate advisor IDs.
 * @returns Adjacent pairs.
 */
function adjacentPairs(ids: readonly string[]): readonly (readonly string[])[] {
  return ids
    .slice(0, -1)
    .map((id, index) => [id, ids[index + 1]].filter(Boolean));
}

/**
 * Routes resource calls to the deployed dev backend while static assets remain
 * served from the local generated web root.
 * @param page - Browser page under test.
 */
async function routeDevResources(page: Page): Promise<void> {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route("**/Feed", proxyDevResource);
  await page.route("**/AdvisorComparison", proxyComparisonResource);
  await page.route("**/AdvisorComparison?**", proxyComparisonResource);
}

/**
 * Routes the no-selection comparison resource to a deterministic empty payload.
 * @param page - Browser page under test.
 */
async function routeNoSelectionComparison(page: Page): Promise<void> {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route("**/AdvisorComparison", async route => {
    await route.fulfill({
      json: {
        generatedAt: new Date().toISOString(),
        selection: {
          status: "under_limit",
          requestedIds: [],
          normalizedIds: [],
          duplicateIds: [],
          cappedIds: [],
          missingIds: [],
          min: 2,
          max: 4,
          truncated: false,
        },
        items: [],
      },
    });
  });
}

/**
 * Proxies one browser resource request to the deployed dev backend.
 * @param route - Playwright route to fulfill.
 */
async function proxyDevResource(route: Route): Promise<void> {
  const source = new URL(route.request().url());
  const response = await route.fetch({
    url: `${DEV_BACKEND}${source.pathname}${source.search}`,
  });
  await route.fulfill({ response });
}

/**
 * Proxies AdvisorComparison to dev when available, otherwise uses a payload
 * assembled from deployed AdvisorProfile resources for the same real IDs.
 * @param route - Playwright route to fulfill.
 */
async function proxyComparisonResource(route: Route): Promise<void> {
  const source = new URL(route.request().url());
  const response = await fetch(
    `${DEV_BACKEND}${source.pathname}${source.search}`
  );
  if (response.ok) {
    await route.fulfill({
      status: response.status,
      headers: { "Content-Type": "application/json" },
      body: await response.text(),
    });
    return;
  }
  await route.fulfill({ json: comparisonFixture });
}

/**
 * Loads a comparison payload from dev, or constructs one from real dev profile
 * resources while the deployed comparison endpoint is still rolling forward.
 * @param ids - Advisor IDs to compare.
 * @returns Comparison payload with BrokerCheck source data when available.
 */
async function comparisonPayload(
  ids: readonly string[]
): Promise<ComparisonPayload> {
  const response = await fetch(
    `${DEV_BACKEND}/AdvisorComparison?ids=${ids.map(encodeURIComponent).join(",")}`
  );
  if (response.ok) return (await response.json()) as ComparisonPayload;
  const profiles = await Promise.all(ids.map(advisorProfile));
  return comparisonPayloadFromProfiles(ids, profiles);
}

/**
 * Loads one real AdvisorProfile payload from the deployed dev backend.
 * @param id - Advisor ID to load.
 * @returns Advisor profile payload or null when unavailable.
 */
async function advisorProfile(
  id: string
): Promise<AdvisorProfilePayload | null> {
  const response = await fetch(`${DEV_BACKEND}/AdvisorProfile/${id}`);
  if (!response.ok) return null;
  return (await response.json()) as AdvisorProfilePayload;
}

/**
 * Builds the comparison route shape from deployed profile payloads.
 * @param ids - Requested advisor IDs.
 * @param profiles - Profile responses for each ID.
 * @returns Comparison payload consumed by the local comparison UI.
 */
function comparisonPayloadFromProfiles(
  ids: readonly string[],
  profiles: readonly (AdvisorProfilePayload | null)[]
): ComparisonPayload {
  return {
    generatedAt: new Date().toISOString(),
    selection: {
      status: "ready",
      requestedIds: ids,
      normalizedIds: ids,
      duplicateIds: [],
      cappedIds: ids,
      missingIds: [],
      min: 2,
      max: 4,
      truncated: false,
    },
    items: profiles.map((profile, index) =>
      profile ? comparisonItem(ids[index], profile) : notFoundItem(ids[index])
    ),
  };
}

/**
 * Converts one deployed AdvisorProfile response into a comparison item.
 * @param id - Advisor ID requested.
 * @param profile - Deployed profile payload.
 * @returns Comparison item consumed by the UI.
 */
function comparisonItem(
  id: string,
  profile: AdvisorProfilePayload
): ComparisonItem {
  return {
    status: "found",
    id,
    identity: profile.advisor,
    displayName: profile.displayName ?? String(profile.advisor.legalName ?? id),
    firm: currentFirm(profile),
    regulatory: {
      brokerCheckSnapshot: profile.brokerCheckSnapshot,
      disclosures: profile.disclosures ?? [],
      disclosureCount: profile.disclosures?.length ?? 0,
      registrationApplications: profile.registrationApplications ?? [],
    },
    career: profile.career ?? [],
    rankings: [],
    articles: profile.articles ?? [],
    dataConfidence: {
      evidenceFreshness: profile.evidenceFreshness,
      confidenceSummary: profile.confidenceSummary,
    },
    attribution: {
      brokerCheck: profile.brokerCheckSnapshot,
      articles: profile.articles ?? [],
      assertions: [],
      researchSources: [],
    },
  };
}

/**
 * Builds a neutral comparison item for missing profiles.
 * @param id - Missing advisor ID.
 * @returns Not-found comparison item.
 */
function notFoundItem(id: string): ComparisonItem {
  return {
    status: "not_found",
    id,
    displayName: id,
    identity: null,
    firm: null,
    regulatory: {
      brokerCheckSnapshot: null,
      disclosures: [],
      disclosureCount: 0,
      registrationApplications: [],
    },
    career: [],
    rankings: [],
    articles: [],
    dataConfidence: {},
    attribution: {},
  };
}

/**
 * Picks a current firm from deployed profile career data.
 * @param profile - Advisor profile payload.
 * @returns Firm value or null.
 */
function currentFirm(profile: AdvisorProfilePayload): unknown {
  const career = profile.career ?? [];
  const current = career.find(row => !row.endDate);
  return (current ?? career.at(-1))?.firm ?? null;
}

/**
 * Reads comparison route rendering and responsive metrics.
 * @param page - Browser page rendering the comparison route.
 * @returns DOM metrics used by the smoke assertions.
 */
async function comparisonMetrics(page: Page) {
  return await page.evaluate(tableSelector => {
    const table = document.querySelector(tableSelector);
    return {
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      rows: document.querySelectorAll(`${tableSelector} tbody tr`).length,
      brokerCheckAttributions: document.querySelectorAll(
        ".comparison-source-attribution"
      ).length,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      tableClientWidth: table?.clientWidth ?? 0,
      tableScrollWidth: table?.scrollWidth ?? 0,
    };
  }, COMPARISON_TABLE_SELECTOR);
}

/**
 * Reads the cold-start compare state and page overflow metrics.
 * @param page - Browser page rendering `/compare` without ids.
 * @returns Empty-state DOM metrics.
 */
async function compareStartMetrics(page: Page) {
  return await page.evaluate(startSelector => {
    const start = document.querySelector(startSelector);
    return {
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      startTitle:
        start?.querySelector(".card-title")?.textContent?.trim() ?? "",
      hasManualUrlInstruction: Boolean(
        document.body.textContent?.includes("Add two to four advisor ids")
      ),
      hasBrowseAction: Boolean(
        [...document.querySelectorAll("button")].some(button =>
          button.textContent?.includes("Browse advisors")
        )
      ),
      hasDirectoryLink: Boolean(document.querySelector('a[href="/advisors"]')),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, COMPARISON_START_SELECTOR);
}

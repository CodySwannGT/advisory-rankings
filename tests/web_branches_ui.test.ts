import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";
import type {
  BranchDirectoryRow,
  DirectoryPage,
} from "../src/harper/resource-directory-types.js";
import type { DataCoverageResponse } from "../src/harper/resource-data-coverage.js";
import type { RecruitingMarketResponse } from "../src/harper/resource-recruiting-market-types.js";

const BRANCH_EMPTY_SELECTOR = '[data-branch-id="branch-empty"]';
const BRANCH_MISSING_SOURCE_SELECTOR =
  '[data-branch-id="branch-missing-source"]';
const BRANCH_MARKET_SELECTOR = '[data-branch-id="branch-market"]';
const BRANCH_NY_SELECTOR = '[data-branch-id="branch-ny"]';
const BRANCH_PARTIAL_SELECTOR = '[data-branch-id="branch-partial"]';
const BRANCH_ROW_SELECTOR = "[data-branch-id]";
const COVERAGE_STATE_LABEL = "Coverage state";
const DEV_BASE = "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const FIRM_WELLS_ID = "firm-wells";
const MISSING_SOURCE_GAP_GROUP = "missing-source";
const PARTIAL_GAP_GROUP = "partial";
const WELLS_FARGO_BRANCH_SOURCE_LABEL = "Wells Fargo public branch locator";
const ZERO_ADVISOR_GAP_GROUP = "zero-advisor";
const WELLS_FARGO_ADVISORS = "Wells Fargo Advisors";
const deployedIt =
  process.env.RUN_WEB_BRANCH_GAP_DEPLOYED === "1" &&
  existsSync(chromium.executablePath())
    ? it
    : it.skip;

describe("branch explorer route (#1224)", () => {
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

  it("renders rows, restores URL filters, and fits desktop/mobile", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await routeAuth(page, false);
    await routePublicBranches(page);

    await page.goto(
      `${baseUrl}/branches?firm=wells&state=NY&minAdvisorCount=2&sourceType=brokercheck&level=branch`,
      {
        waitUntil: "domcontentloaded",
      }
    );

    await page
      .getByRole("heading", { name: "Branch explorer", exact: true })
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page.getByText("Branch network explorer").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.locator(BRANCH_NY_SELECTOR).count()).toBe(1);
    expect(await page.locator(BRANCH_EMPTY_SELECTOR).count()).toBe(0);
    expect(await inputValue(page, "Firm")).toBe("wells");
    expect(await inputValue(page, "State")).toBe("NY");
    expect(await inputValue(page, "Source type")).toBe("brokercheck");
    expect(await inputValue(page, "Minimum advisors")).toBe("2");
    expect(await selectValue(page, COVERAGE_STATE_LABEL)).toBe("");
    expect(await selectValue(page, "Level")).toBe("branch");
    const branchRow = page.locator(BRANCH_NY_SELECTOR);
    expect(
      await branchRow.getByRole("link", { name: "Firm" }).getAttribute("href")
    ).toContain("/firms/wells-fargo-advisors-firm-wells");
    expect(
      await branchRow
        .getByRole("link", { name: "Advisors" })
        .getAttribute("href")
    ).toBe("/advisors?firm=firm-wells");

    await page.getByLabel("City or market").fill("No match");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await page.getByText("No matching branches").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(new URL(page.url()).searchParams.get("city")).toBe("No match");

    await page.getByRole("button", { name: "Clear" }).click();
    await expectUrlPath(page, "/branches");
    await page.locator(BRANCH_NY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page
      .getByLabel(COVERAGE_STATE_LABEL)
      .selectOption(ZERO_ADVISOR_GAP_GROUP);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await page.locator(BRANCH_EMPTY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.locator(BRANCH_NY_SELECTOR).count()).toBe(0);
    expect(new URL(page.url()).searchParams.get("gapGroup")).toBe(
      ZERO_ADVISOR_GAP_GROUP
    );
    await page
      .locator(BRANCH_EMPTY_SELECTOR)
      .getByText("Zero linked advisors")
      .waitFor({ timeout: QUICK_TIMEOUT });

    await page.getByRole("button", { name: "Clear" }).click();
    await expectUrlPath(page, "/branches");
    await page.getByRole("button", { name: "Load more" }).click();
    await page.locator(BRANCH_EMPTY_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page
      .locator(BRANCH_EMPTY_SELECTOR)
      .getByText("Advisor links incomplete")
      .waitFor({
        timeout: QUICK_TIMEOUT,
      });
    await page
      .locator(BRANCH_EMPTY_SELECTOR)
      .getByText("Some advisor links are still missing from public coverage.")
      .waitFor({
        timeout: QUICK_TIMEOUT,
      });
    await page
      .locator(BRANCH_EMPTY_SELECTOR)
      .getByText("Wells Fargo public branch locator")
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page
      .locator(BRANCH_PARTIAL_SELECTOR)
      .getByText("Partial branch coverage")
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page
      .locator(BRANCH_MISSING_SOURCE_SELECTOR)
      .getByText("Missing public source")
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page
      .locator(BRANCH_MISSING_SOURCE_SELECTOR)
      .getByText("Source context: public source details are not available")
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page
      .locator(BRANCH_MARKET_SELECTOR)
      .getByText("Market-level aggregate")
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page
      .locator(BRANCH_MARKET_SELECTOR)
      .getByText("No linked advisors in this market aggregate yet")
      .waitFor({ timeout: QUICK_TIMEOUT });
    await expectRawPipelineLabelsHidden(page);
    await expectUniqueBranchRows(page);
    expect(await hasHorizontalOverflow(page)).toBe(false);

    await captureViewports(page, "issue-1224-branch-explorer");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.close();
  });

  deployedIt(
    "replays branch gap filters against deployed public resources",
    async () => {
      const snapshots = await deployedSnapshots();
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      try {
        await routeDeployedPublicResources(page);

        await page.goto(`${baseUrl}/branches?gapGroup=${PARTIAL_GAP_GROUP}`, {
          waitUntil: "domcontentloaded",
        });

        await page
          .getByRole("heading", { name: "Branch explorer", exact: true })
          .waitFor({ timeout: QUICK_TIMEOUT });
        expect(await selectValue(page, COVERAGE_STATE_LABEL)).toBe(
          PARTIAL_GAP_GROUP
        );
        await expectBranchRowsMatchGapGroup(page, PARTIAL_GAP_GROUP);
        const desktopFacts = await branchPageFacts(page);
        expect(desktopFacts.overflow).toBe(false);

        await page.goto(
          `${baseUrl}/branches?gapGroup=${MISSING_SOURCE_GAP_GROUP}`,
          { waitUntil: "domcontentloaded" }
        );
        expect(await selectValue(page, COVERAGE_STATE_LABEL)).toBe(
          MISSING_SOURCE_GAP_GROUP
        );
        await expectBranchRowsMatchGapGroup(page, MISSING_SOURCE_GAP_GROUP);
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileFacts = await branchPageFacts(page);
        expect(mobileFacts.overflow).toBe(false);

        const evidence = {
          proxyBase: DEV_BASE,
          resources: {
            dataCoverageGeneratedAt: snapshots.coverage.generatedAt,
            recruitingGeneratedAt: snapshots.recruiting.generatedAt,
            recruitingMoves: snapshots.recruiting.summary.count,
          },
          branchGapCounts: branchGapCounts(snapshots.coverage),
          publicBranches: Object.fromEntries(
            Object.entries(snapshots.branchesByGap).map(([gapGroup, page]) => [
              gapGroup,
              {
                total: page.total,
                returned: page.items.length,
                sampleIds: page.items.map(row => row.id),
                sampleFirmNames: page.items.map(row => row.firmName),
              },
            ])
          ),
          desktop: desktopFacts,
          mobile: mobileFacts,
        };
        await writeFile(
          join(SHOTS, "issue-1361-branch-gap-deployed-proof.json"),
          `${JSON.stringify(evidence, null, 2)}\n`
        );
        await captureViewports(page, "issue-1361-branch-gap-deployed");
        console.log(
          "[EVIDENCE: branch-gap-deployed]",
          JSON.stringify(evidence)
        );
      } finally {
        await page.close();
      }
    }
  );
});

interface DeployedSnapshots {
  readonly branchesByGap: Readonly<
    Record<string, DirectoryPage<BranchDirectoryRow>>
  >;
  readonly coverage: DataCoverageResponse;
  readonly recruiting: RecruitingMarketResponse;
}

/**
 * Routes PublicBranches to a deterministic filtered payload.
 * @param page - Browser page under test.
 */
async function routePublicBranches(page: Page): Promise<void> {
  await page.route("**/PublicBranches**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: branchPage(url.searchParams) });
  });
}

/**
 * Applies the same filter dimensions the page sends to PublicBranches.
 * @param params - Request query params.
 * @returns PublicBranches page payload.
 */
function branchPage(
  params: URLSearchParams
): DirectoryPage<BranchDirectoryRow> {
  const q = lowerParam(params, "q");
  const firm = lowerParam(params, "firm");
  const state = lowerParam(params, "state");
  const city = lowerParam(params, "city");
  const sourceType = lowerParam(params, "sourceType");
  const gapGroup = lowerParam(params, "gapGroup");
  const level = lowerParam(params, "level");
  const minAdvisorCount = Number(params.get("minAdvisorCount") || "0");
  const items = branchRows().filter(row =>
    [
      !q ||
        [
          row.displayName,
          row.buildingName,
          row.firmName,
          row.city,
          row.state,
          row.address,
        ].some(value =>
          String(value ?? "")
            .toLowerCase()
            .includes(q)
        ),
      !firm ||
        [row.firmId, row.firmName].some(value =>
          String(value ?? "")
            .toLowerCase()
            .includes(firm)
        ),
      !state || row.state.toLowerCase() === state,
      !city ||
        [row.city, row.displayName, row.address].some(value =>
          String(value ?? "")
            .toLowerCase()
            .includes(city)
        ),
      !sourceType ||
        row.sourceMetadata.sourceTypes.some(
          source => source.toLowerCase() === sourceType
        ),
      !gapGroup || row.gapGroup === gapGroup,
      !level || row.level === level,
      !minAdvisorCount || row.currentAdvisorCount >= minAdvisorCount,
    ].every(Boolean)
  );
  if (hasActiveFilters(params) || params.get("cursor") === "page-2") {
    return {
      items: params.get("cursor") === "page-2" ? items.slice(1) : items,
      nextCursor: null,
      total: items.length,
    };
  }
  return {
    items: items.slice(0, 1),
    nextCursor: "page-2",
    total: items.length,
  };
}

/**
 * Reads a normalized query param value.
 * @param params - Request query params.
 * @param key - Param name.
 * @returns Lowercased value.
 */
function lowerParam(params: URLSearchParams, key: string): string {
  return (params.get(key) ?? "").trim().toLowerCase();
}

/**
 * Detects whether branch filters are active on a request.
 * @param params - Request query params.
 * @returns True when at least one filter is active.
 */
function hasActiveFilters(params: URLSearchParams): boolean {
  return [
    "q",
    "firm",
    "state",
    "city",
    "gapGroup",
    "sourceType",
    "level",
    "minAdvisorCount",
  ].some(key => Boolean(params.get(key)));
}

/**
 * Provides branch rows with loaded and partial coverage states.
 * @returns Branch directory fixtures.
 */
function branchRows(): readonly BranchDirectoryRow[] {
  return [
    {
      id: "branch-ny",
      firmId: FIRM_WELLS_ID,
      parentBranchId: null,
      level: "branch",
      name: "Midtown Manhattan Branch",
      buildingName: "GM Building",
      address: "767 Fifth Avenue",
      city: "New York",
      state: "NY",
      country: "USA",
      postalCode: "10153",
      displayName: "Midtown Manhattan Branch",
      firmName: WELLS_FARGO_ADVISORS,
      currentAdvisorCount: 12,
      coverageStatus: "loaded",
      gapGroup: "loaded",
      sourceMetadata: {
        sourceTypes: ["brokercheck", "wells_fargo_locator"],
        sourceLabels: [
          "FINRA BrokerCheck registration data",
          WELLS_FARGO_BRANCH_SOURCE_LABEL,
        ],
        sourceRefs: [],
      },
    },
    {
      id: "branch-empty",
      firmId: FIRM_WELLS_ID,
      parentBranchId: null,
      level: "complex",
      name: "Brooklyn Complex",
      buildingName: null,
      address: "200 Montague Street",
      city: "Brooklyn",
      state: "NY",
      country: "USA",
      postalCode: "11201",
      displayName: "Brooklyn Complex",
      firmName: WELLS_FARGO_ADVISORS,
      currentAdvisorCount: 0,
      coverageStatus: "partial",
      gapGroup: ZERO_ADVISOR_GAP_GROUP,
      sourceMetadata: {
        sourceTypes: ["wells_fargo_locator"],
        sourceLabels: [WELLS_FARGO_BRANCH_SOURCE_LABEL],
        sourceRefs: [],
      },
    },
    {
      id: "branch-market",
      firmId: FIRM_WELLS_ID,
      parentBranchId: null,
      level: "market",
      name: "Long Island Recruiting Market",
      buildingName: null,
      address: null,
      city: "Long Island",
      state: "NY",
      country: "USA",
      postalCode: null,
      displayName: "Long Island Recruiting Market",
      firmName: WELLS_FARGO_ADVISORS,
      currentAdvisorCount: 0,
      coverageStatus: "partial",
      gapGroup: ZERO_ADVISOR_GAP_GROUP,
      sourceMetadata: {
        sourceTypes: ["brokercheck", "edward_jones_advisor_results_api"],
        sourceLabels: [
          "FINRA BrokerCheck registration data",
          "Edward Jones public advisor search",
        ],
        sourceRefs: [],
      },
    },
    {
      id: "branch-partial",
      firmId: FIRM_WELLS_ID,
      parentBranchId: null,
      level: "branch",
      name: "Queens Branch",
      buildingName: null,
      address: "45-02 Queens Boulevard",
      city: "Queens",
      state: "NY",
      country: "USA",
      postalCode: "11104",
      displayName: "Queens Branch",
      firmName: WELLS_FARGO_ADVISORS,
      currentAdvisorCount: 3,
      coverageStatus: "partial",
      gapGroup: PARTIAL_GAP_GROUP,
      sourceMetadata: {
        sourceTypes: ["wells_fargo_locator"],
        sourceLabels: [WELLS_FARGO_BRANCH_SOURCE_LABEL],
        sourceRefs: [],
      },
    },
    {
      id: "branch-missing-source",
      firmId: FIRM_WELLS_ID,
      parentBranchId: null,
      level: "branch",
      name: "Source Pending Branch",
      buildingName: null,
      address: "88 Market Street",
      city: "Newark",
      state: "NJ",
      country: "USA",
      postalCode: "07102",
      displayName: "Source Pending Branch",
      firmName: WELLS_FARGO_ADVISORS,
      currentAdvisorCount: 4,
      coverageStatus: "partial",
      gapGroup: MISSING_SOURCE_GAP_GROUP,
      sourceMetadata: {
        sourceTypes: [],
        sourceLabels: [],
        sourceRefs: [],
      },
    },
  ];
}

async function deployedSnapshots(): Promise<DeployedSnapshots> {
  const [coverage, recruiting, loaded, partial, zeroAdvisor, missingSource] =
    await Promise.all([
      fetchJson<DataCoverageResponse>("/DataCoverage"),
      fetchJson<RecruitingMarketResponse>("/RecruitingMarket?limit=5"),
      fetchJson<DirectoryPage<BranchDirectoryRow>>(
        "/PublicBranches?gapGroup=loaded&limit=3"
      ),
      fetchJson<DirectoryPage<BranchDirectoryRow>>(
        "/PublicBranches?gapGroup=partial&limit=3"
      ),
      fetchJson<DirectoryPage<BranchDirectoryRow>>(
        "/PublicBranches?gapGroup=zero-advisor&limit=3"
      ),
      fetchJson<DirectoryPage<BranchDirectoryRow>>(
        "/PublicBranches?gapGroup=missing-source&limit=3"
      ),
    ]);
  return {
    coverage,
    recruiting,
    branchesByGap: {
      loaded,
      partial,
      "zero-advisor": zeroAdvisor,
      "missing-source": missingSource,
    },
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DEV_BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function routeDeployedPublicResources(page: Page): Promise<void> {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/Me") {
      await route.fulfill({ json: { authenticated: false } });
      return;
    }
    if (isProxiedPublicResource(url.pathname)) {
      await proxy(route);
      return;
    }
    await route.fallback();
  });
}

function isProxiedPublicResource(pathname: string): boolean {
  return ["/PublicBranches", "/DataCoverage", "/RecruitingMarket"].includes(
    pathname
  );
}

async function proxy(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  await route.fulfill({
    response: await route.fetch({
      url: `${DEV_BASE}${url.pathname}${url.search}`,
      timeout: 60_000,
    }),
  });
}

function branchGapCounts(
  coverage: DataCoverageResponse
): Readonly<
  Record<
    string,
    DataCoverageResponse["sections"][number]["metrics"][number]["value"]
  >
> {
  const branchSection = coverage.sections.find(
    section => section.id === "branch-coverage"
  );
  expect(branchSection).toBeTruthy();
  return Object.fromEntries(
    (branchSection?.metrics ?? [])
      .filter(metric => metric.id.startsWith("branch-gap-"))
      .map(metric => [metric.id, metric.value])
  );
}

async function expectBranchRowsMatchGapGroup(
  page: Page,
  gapGroup: string
): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: QUICK_TIMEOUT });
  const rowCount = await page.locator(BRANCH_ROW_SELECTOR).count();
  if (rowCount === 0) {
    await page.getByText("No matching branches").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    return;
  }
  const coverageStates = await page
    .locator(".branches-row-field", { hasText: COVERAGE_STATE_LABEL })
    .evaluateAll(fields => fields.map(field => field.textContent ?? ""));
  expect(coverageStates.length).toBeGreaterThan(0);
  for (const state of coverageStates) {
    expect(state).toContain(gapGroupDisplay(gapGroup));
  }
}

function gapGroupDisplay(gapGroup: string): string {
  const labels: Readonly<Record<string, string>> = {
    loaded: "Loaded branch coverage",
    partial: "Partial branch coverage",
    unavailable: "Unavailable branch context",
    "zero-advisor": "Zero linked advisors",
    "missing-source": "Missing public source",
  };
  return labels[gapGroup] ?? gapGroup;
}

async function branchPageFacts(
  page: Page
): Promise<Readonly<Record<"overflow" | "rowCount", boolean | number>>> {
  return {
    overflow: await hasHorizontalOverflow(page),
    rowCount: await page.locator(BRANCH_ROW_SELECTOR).count(),
  };
}

/**
 * Reads the visible value from a labeled input.
 * @param page - Browser page under test.
 * @param label - Input label.
 * @returns Current input value.
 */
async function inputValue(page: Page, label: string): Promise<string> {
  return await page
    .getByRole("textbox", { name: label, exact: true })
    .inputValue();
}

/**
 * Reads the visible value from a labeled select.
 * @param page - Browser page under test.
 * @param label - Select label.
 * @returns Current select value.
 */
async function selectValue(page: Page, label: string): Promise<string> {
  return await page
    .getByRole("combobox", { name: label, exact: true })
    .inputValue();
}

/**
 * Waits until the page path matches the expected app route.
 * @param page - Browser page under test.
 * @param path - Expected URL path.
 */
async function expectUrlPath(page: Page, path: string): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: QUICK_TIMEOUT })
    .toBe(path);
}

/**
 * Asserts rendered branch row IDs are unique after pagination.
 * @param page - Browser page under test.
 */
async function expectUniqueBranchRows(page: Page): Promise<void> {
  const branchIds = await page
    .locator(BRANCH_ROW_SELECTOR)
    .evaluateAll(rows =>
      rows.map(row => row.getAttribute("data-branch-id") ?? "")
    );
  expect(branchIds).toHaveLength(new Set(branchIds).size);
}

/**
 * Proves branch rows translate source/status values before display.
 * @param page - Browser page under test.
 */
async function expectRawPipelineLabelsHidden(page: Page): Promise<void> {
  const rawPipelineLabels = [
    "ZERO-ADVISOR",
    "MISSING-SOURCE",
    "EDWARD JONES ADVISOR RESULTS API",
    "WELLS_FARGO_LOCATOR",
    "branch:ny",
    "market:long-island",
    "AnalystWatchlist",
  ];
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  for (const label of rawPipelineLabels) {
    expect(bodyText).not.toContain(label.toLowerCase());
  }
  expect(await page.locator("body").innerText()).not.toContain("BROKERCHECK");
}

/**
 * Checks whether the document overflows horizontally.
 * @param page - Browser page under test.
 * @returns True when horizontal overflow is present.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );
}

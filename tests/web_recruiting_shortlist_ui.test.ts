import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe =
  process.env.RUN_WEB_RECRUITING_SHORTLIST_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

const MORGAN_STANLEY = "Morgan Stanley";
const UBS = "UBS";
const RBC = "RBC";
const DATA_COVERAGE_RESOURCE = "/DataCoverage";
const FIRMS = [MORGAN_STANLEY, UBS, RBC] as const;
const PRIVATE_ENDPOINTS = [
  "/UserWatchlists",
  "/UserRating",
  "/AdvisorCorrectionRequest",
  "/RegulatoryDiscrepancyQueue",
  "/User/",
] as const;
const PRIVATE_CONTENT = /private note|packet-only|reviewer-only|analyst-only/i;

browserDescribe("recruiting shortlist brief route (#1320)", () => {
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

  it("renders repeated firm queries with public evidence and no private-data overflow", async () => {
    const page = await browser.newPage();
    const requestedFirmParams: string[][] = [];
    const requestedLimits: Array<string | null> = [];
    const requestedPrivatePaths: string[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (isPrivateEndpoint(url.pathname))
        requestedPrivatePaths.push(url.pathname);
    });
    await routeAuth(page, false);
    await routeRecruitingMarket(page, requestedFirmParams, requestedLimits);

    try {
      await page.goto(`${baseUrl}/recruiting/shortlist?${firmQuery()}`, {
        waitUntil: "domcontentloaded",
      });

      await page.locator(".shortlist-brief-firms").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      expect(requestedFirmParams).toEqual([FIRMS]);
      expect(requestedLimits).toEqual(["30"]);
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).toContain(MORGAN_STANLEY);
      expect(bodyText).toContain(`Unresolved: ${RBC}`);
      expect(bodyText).toContain("Unresolved Firm");
      expect(bodyText).toContain("Recruiting replay");
      expect(bodyText).toContain("Branch explorer");
      expect(bodyText).toContain(
        "It excludes private watchlists, ratings, correction internals, analyst discrepancy rows, and reviewer notes."
      );
      expect(bodyText).not.toMatch(PRIVATE_CONTENT);
      await expectPublicLinks(page);
      await expectNoPrivateDestinations(page, requestedPrivatePaths);
      await expectNoOverflow(page, { width: 1280, height: 900 });
      await expectNoOverflow(page, { width: 390, height: 844 });
      await page.emulateMedia({ media: "print" });
      await expectNoOverflow(page, { width: 390, height: 844 });
      await page.emulateMedia({ media: "screen" });
      await captureViewports(page, "issue-1321-recruiting-shortlist-brief");
    } finally {
      await page.close();
    }
  });
});

/**
 * Routes RecruitingMarket with a deterministic shortlist payload.
 * @param page - Playwright page.
 * @param requests - Captured firm query values.
 * @param limits - Captured limit query values.
 */
async function routeRecruitingMarket(
  page: Page,
  requests: string[][],
  limits: Array<string | null>
): Promise<void> {
  await page.route("**/RecruitingMarket**", async route => {
    const url = new URL(route.request().url());
    requests.push(url.searchParams.getAll("firm"));
    limits.push(url.searchParams.get("limit"));
    await route.fulfill({ json: recruitingMarketPayload() });
  });
}

/**
 * Asserts the public evidence destinations preserve context.
 * @param page - Playwright page.
 */
async function expectPublicLinks(page: Page): Promise<void> {
  const hrefsByFirm = await page
    .locator(".shortlist-firm")
    .evaluateAll(nodes =>
      nodes.map(node =>
        [...node.querySelectorAll(".shortlist-link-list a")].map(link =>
          (link as HTMLAnchorElement).getAttribute("href")
        )
      )
    );
  expect(hrefsByFirm).toHaveLength(3);
  expect(hrefsByFirm[0]).toEqual([
    "/recruiting?firm=Morgan%20Stanley",
    "/firm.html?id=firm-morgan",
    "/branches?firm=firm-morgan",
    "/coverage",
    "/RecruitingMarket?firm=Morgan%20Stanley",
    "/FirmProfile/firm-morgan",
    "/PublicBranches?firm=firm-morgan",
    DATA_COVERAGE_RESOURCE,
  ]);
  expect(hrefsByFirm[1]).toEqual([
    "/recruiting?firm=UBS",
    "/firm.html?id=firm-ubs",
    "/branches?firm=firm-ubs",
    "/coverage",
    "/RecruitingMarket?firm=UBS",
    "/FirmProfile/firm-ubs",
    "/PublicBranches?firm=firm-ubs",
    DATA_COVERAGE_RESOURCE,
  ]);
  expect(hrefsByFirm[2]).toEqual([
    "/recruiting?firm=RBC",
    "/coverage",
    "/RecruitingMarket?firm=RBC",
    DATA_COVERAGE_RESOURCE,
  ]);
}

/**
 * Verifies the rendered brief does not overflow horizontally.
 * @param page - Playwright page.
 * @param viewport - Browser viewport to check.
 */
async function expectNoOverflow(
  page: Page,
  viewport: Readonly<{ height: number; width: number }>
): Promise<void> {
  await page.setViewportSize(viewport);
  const metrics = await page.evaluate(() => {
    const maxOverflow = (selector: string): number =>
      Math.max(
        0,
        ...[...document.querySelectorAll(selector)].map(node =>
          Math.max(0, node.scrollWidth - (node as HTMLElement).clientWidth)
        )
      );
    return {
      documentOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      ),
      firmOverflow: maxOverflow(".shortlist-firm"),
      linkOverflow: maxOverflow(".shortlist-link-list a"),
      statusOverflow: maxOverflow(".shortlist-firm .tag-list"),
      linksWiderThanList: [
        ...document.querySelectorAll(".shortlist-link-list"),
      ].some(list =>
        [...list.querySelectorAll("a")].some(
          link =>
            link.getBoundingClientRect().width >
            list.getBoundingClientRect().width
        )
      ),
    };
  });
  expect(metrics).toEqual({
    documentOverflow: 0,
    firmOverflow: 0,
    linkOverflow: 0,
    linksWiderThanList: false,
    statusOverflow: 0,
  });
}

/**
 * Verifies anonymous replay does not request or link private resources.
 * @param page - Playwright page.
 * @param requestedPrivatePaths - Private paths observed during browser load.
 */
async function expectNoPrivateDestinations(
  page: Page,
  requestedPrivatePaths: readonly string[]
): Promise<void> {
  const hrefs = await page
    .locator("a")
    .evaluateAll(nodes =>
      nodes.map(node => (node as HTMLAnchorElement).getAttribute("href") ?? "")
    );
  const privateHrefs = hrefs.filter(href =>
    isPrivateEndpoint(new URL(href, "https://advisorbook.test").pathname)
  );
  expect(requestedPrivatePaths).toEqual([]);
  expect(privateHrefs).toEqual([]);
}

/**
 * Checks whether a path belongs to a private resource surface.
 * @param path - URL path.
 * @returns Whether the path is private.
 */
function isPrivateEndpoint(path: string): boolean {
  return PRIVATE_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
}

/**
 * Builds the repeated firm query string for the route.
 * @returns Query string.
 */
function firmQuery(): string {
  const params = new URLSearchParams();
  for (const firm of FIRMS) params.append("firm", firm);
  return params.toString();
}

/**
 * Builds a public RecruitingMarket payload with resolved and unresolved firms.
 * @returns Resource payload.
 */
function recruitingMarketPayload(): unknown {
  return {
    generatedAt: "2026-06-20T16:00:00.000Z",
    filters: {
      direction: "net",
      firmId: null,
      firmQuery: null,
      limit: 30,
      state: null,
      year: null,
      watchlistFirmIds: ["firm-morgan", "firm-ubs"],
      watchlistFirmQueries: FIRMS,
    },
    summary: {
      count: 4,
      knownAum: 6100000000,
      unknownAumCount: 1,
      missingT12Count: 2,
    },
    sourceCoverage: {
      moveCount: 4,
      sourceBackedCount: 3,
      missingSourceCount: 1,
      missingLocationCount: 0,
      missingAumCount: 1,
      missingT12Count: 2,
      statusCounts: [],
    },
    firmMomentum: [],
    watchlist: {
      generatedAt: "2026-06-20T16:00:00.000Z",
      count: 3,
      summary: {
        inbound: {
          count: 1,
          knownAum: 7000000,
          unknownAumCount: 0,
          missingT12Count: 0,
        },
        outbound: {
          count: 4,
          knownAum: 6093000000,
          unknownAumCount: 1,
          missingT12Count: 2,
        },
        netMoveCount: -3,
        netKnownAum: -6086000000,
      },
      items: [morganItem(), ubsItem(), unresolvedItem()],
    },
    marketActivity: [],
    recentMoves: [],
    provenance: {
      sourceTables: [
        "TransitionEvent",
        "RecruitingDealQuote",
        "ArticleTransitionEventMention",
        "Article",
        "FirmAlias",
      ],
      sourceIds: ["move-1"],
    },
    emptyState: null,
  };
}

function morganItem(): unknown {
  return shortlistItem(MORGAN_STANLEY, {
    firm: {
      id: "firm-morgan",
      name: MORGAN_STANLEY,
      short: MORGAN_STANLEY,
    },
    inbound: {
      count: 1,
      knownAum: 7000000,
      unknownAumCount: 0,
      missingT12Count: 0,
    },
    outbound: {
      count: 4,
      knownAum: 6093000000,
      unknownAumCount: 1,
      missingT12Count: 2,
    },
    netMoveCount: -3,
    netKnownAum: -6086000000,
    sourceCoverage: {
      moveCount: 5,
      sourceBackedCount: 4,
      missingSourceCount: 1,
      missingLocationCount: 0,
    },
    branchCoverage: {
      status: "partial",
      branchCount: 622,
      currentAdvisorCount: 3000,
      branchesWithCurrentAdvisors: 590,
      partialBranchCount: 32,
      sourceTypes: ["firm_roster"],
      sourceRefCount: 590,
      missingSourceCount: 2,
      limitation: "32 branch rows do not have current advisor links.",
    },
    evidenceLinks: {
      recruiting: "/recruiting?firm=Morgan%20Stanley",
      recruitingResource: "/RecruitingMarket?firm=Morgan%20Stanley",
      firmProfile: "/firm.html?id=firm-morgan",
      firmProfileResource: "/FirmProfile/firm-morgan",
      branchExplorer: "/branches?firm=firm-morgan",
      publicBranchesResource: "/PublicBranches?firm=firm-morgan",
      dataCoverage: "/coverage",
      dataCoverageResource: DATA_COVERAGE_RESOURCE,
    },
    sourceMoveIds: ["move-1", "move-2"],
    sourceStatus: ["source-backed", "missing-total-pct-t12"],
  });
}

function ubsItem(): unknown {
  return shortlistItem(UBS, {
    firm: { id: "firm-ubs", name: UBS, short: UBS },
    evidenceLinks: {
      recruiting: "/recruiting?firm=UBS",
      recruitingResource: "/RecruitingMarket?firm=UBS",
      firmProfile: "/firm.html?id=firm-ubs",
      firmProfileResource: "/FirmProfile/firm-ubs",
      branchExplorer: "/branches?firm=firm-ubs",
      publicBranchesResource: "/PublicBranches?firm=firm-ubs",
      dataCoverage: "/coverage",
      dataCoverageResource: DATA_COVERAGE_RESOURCE,
    },
    sourceStatus: ["no-matching-moves"],
  });
}

function unresolvedItem(): unknown {
  return shortlistItem(RBC, {
    firm: null,
    branchCoverage: {
      status: "unavailable",
      branchCount: null,
      currentAdvisorCount: null,
      branchesWithCurrentAdvisors: null,
      partialBranchCount: null,
      sourceTypes: [],
      sourceRefCount: null,
      missingSourceCount: null,
      limitation: `Branch and advisor coverage are unavailable because "${RBC}" did not resolve to a public firm.`,
    },
    evidenceLinks: {
      recruiting: `/recruiting?firm=${RBC}`,
      recruitingResource: `/RecruitingMarket?firm=${RBC}`,
      firmProfile: null,
      firmProfileResource: null,
      branchExplorer: null,
      publicBranchesResource: null,
      dataCoverage: "/coverage",
      dataCoverageResource: DATA_COVERAGE_RESOURCE,
    },
    sourceStatus: ["unresolved-firm"],
  });
}

function shortlistItem(
  query: string,
  overrides: Readonly<Record<string, unknown>>
): unknown {
  return {
    query,
    firm: null,
    inbound: { count: 0, knownAum: 0, unknownAumCount: 0, missingT12Count: 0 },
    outbound: { count: 0, knownAum: 0, unknownAumCount: 0, missingT12Count: 0 },
    netMoveCount: 0,
    netKnownAum: 0,
    sourceCoverage: {
      moveCount: 0,
      sourceBackedCount: 0,
      missingSourceCount: 0,
      missingLocationCount: 0,
    },
    branchCoverage: {
      status: "partial",
      branchCount: 0,
      currentAdvisorCount: null,
      branchesWithCurrentAdvisors: 0,
      partialBranchCount: 0,
      sourceTypes: [],
      sourceRefCount: 0,
      missingSourceCount: 0,
      limitation: "No public branch rows are loaded for this firm.",
    },
    evidenceLinks: {
      recruiting: `/recruiting?firm=${encodeURIComponent(query)}`,
      recruitingResource: `/RecruitingMarket?firm=${encodeURIComponent(query)}`,
      firmProfile: null,
      firmProfileResource: null,
      branchExplorer: null,
      publicBranchesResource: null,
      dataCoverage: "/coverage",
      dataCoverageResource: DATA_COVERAGE_RESOURCE,
    },
    sourceMoveIds: [],
    sourceStatus: ["no-matching-moves"],
    ...overrides,
  };
}

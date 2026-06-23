import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
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
import type { InvestorProofPacketResponse } from "../src/harper/resource-investor-proof-packet.js";
import type {
  DataCoverageMetric,
  DataCoverageResponse,
} from "../src/harper/resource-data-coverage.js";
import type { AdvisorResearchQueueResponse } from "../src/harper/resource-advisor-research-queue.js";

const browserDescribe =
  process.env.RUN_WEB_INVESTOR_PROOF_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe
    : describe.skip;
const DEV_BASE = "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const RANKING_LIMITATION =
  "Some ranking entries still need resolution or source fields.";
const FRESHNESS_LIMITATION =
  "Research freshness proof has no check rows loaded.";
const FEED_LIMITATION = "No public feed article is available.";
const RESOURCE_ADVISOR_RESEARCH_QUEUE = "/AdvisorResearchQueue";
const RESOURCE_DATA_COVERAGE = "/DataCoverage";
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
          .locator('[data-investor-proof-metric="ranking-entries"]')
          .textContent()
      ).toContain("Unavailable");
      await page.getByText(RANKING_LIMITATION).first().waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page.getByText(FRESHNESS_LIMITATION).first().waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page.getByText(FEED_LIMITATION).first().waitFor({
        timeout: QUICK_TIMEOUT,
      });
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
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.close();
    }
  });

  it("replays deployed public resources and packet links", async () => {
    const snapshots = await deployedSnapshots();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const privateRequests: string[] = [];
    try {
      await routeAuth(page, false);
      await routeDeployedPublicResources(page, snapshots.packet);
      await routeBlockedPrivateResources(page, privateRequests);

      await page.goto(`${baseUrl}/investor-proof`, {
        waitUntil: "domcontentloaded",
      });

      await page
        .getByRole("heading", { name: "Investor proof packet", exact: true })
        .waitFor({ timeout: QUICK_TIMEOUT });
      const desktopFacts = await packetFacts(page);
      expectMetricParity(snapshots.packet, snapshots.coverage, desktopFacts);
      expect(desktopFacts.privateHrefCount).toBe(0);
      expect(desktopFacts.unsupportedPositiveClaimCount).toBe(0);
      expect(desktopFacts.overflow).toBe(false);

      await openPacketLink(page, desktopFacts.researchProfileHref);
      const researchTitle = await firstContentHeadingText(page);

      await page.goto(`${baseUrl}/investor-proof`, {
        waitUntil: "domcontentloaded",
      });
      const refreshedFacts = await packetFacts(page);
      await openPacketLink(page, refreshedFacts.feedHref);
      const feedTitle = await firstContentHeadingText(page);

      await page.goto(`${baseUrl}/investor-proof`, {
        waitUntil: "domcontentloaded",
      });
      const relinkedFacts = await packetFacts(page);
      await openPacketLink(page, relinkedFacts.firmHref);
      const firmTitle = await firstContentHeadingText(page);

      await page.goto(`${baseUrl}/investor-proof`, {
        waitUntil: "domcontentloaded",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileFacts = await packetFacts(page);
      expectMetricParity(snapshots.packet, snapshots.coverage, mobileFacts);
      expect(mobileFacts.privateHrefCount).toBe(0);
      expect(mobileFacts.unsupportedPositiveClaimCount).toBe(0);
      expect(mobileFacts.overflow).toBe(false);
      expect(privateRequests).toEqual([]);

      const evidence = {
        proxyBase: DEV_BASE,
        generatedAt: snapshots.packet.generatedAt,
        desktop: desktopFacts,
        mobile: mobileFacts,
        openedLinks: {
          researchProfile: {
            href: desktopFacts.researchProfileHref,
            title: researchTitle,
          },
          feedArticle: { href: refreshedFacts.feedHref, title: feedTitle },
          firmProfile: { href: relinkedFacts.firmHref, title: firmTitle },
        },
        resourceProof: {
          dataCoverageSections: snapshots.coverage.sections.length,
          advisorResearchQueueReturned:
            snapshots.researchQueue.summary.returned,
          feedItems: publicItemCount(snapshots.feed),
          publicFirmItems: publicItemCount(snapshots.publicFirms),
        },
      };
      await writeFile(
        join(SHOTS, "issue-1370-investor-proof-deployed-proof.json"),
        `${JSON.stringify(evidence, null, 2)}\n`
      );
      await captureViewports(page, "issue-1370-investor-proof-deployed");
      console.log(
        "[EVIDENCE: investor-proof-deployed]",
        JSON.stringify(evidence)
      );
    } finally {
      await page.close();
    }
  });
});

interface DeployedSnapshots {
  readonly packet: InvestorProofPacketResponse;
  readonly coverage: DataCoverageResponse;
  readonly researchQueue: AdvisorResearchQueueResponse;
  readonly feed: unknown;
  readonly publicFirms: unknown;
}

interface PacketFacts {
  readonly feedHref: string;
  readonly firmHref: string;
  readonly metricTextById: Readonly<Record<string, string>>;
  readonly overflow: boolean;
  readonly privateHrefCount: number;
  readonly researchProfileHref: string;
  readonly unsupportedPositiveClaimCount: number;
}

async function deployedSnapshots(): Promise<DeployedSnapshots> {
  const [packet, coverage, researchQueue, feed, publicFirms] =
    await Promise.all([
      fetchJson<InvestorProofPacketResponse>("/InvestorProofPacket"),
      fetchJson<DataCoverageResponse>(RESOURCE_DATA_COVERAGE),
      fetchJson<AdvisorResearchQueueResponse>(
        `${RESOURCE_ADVISOR_RESEARCH_QUEUE}?limit=25`
      ),
      fetchJson<unknown>(`${RESOURCE_FEED}?limit=5`),
      fetchJson<unknown>(`${RESOURCE_PUBLIC_FIRMS}?limit=5`),
    ]);
  return { packet, coverage, researchQueue, feed, publicFirms };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DEV_BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function routeDeployedPublicResources(
  page: Page,
  packet: InvestorProofPacketResponse
): Promise<void> {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/InvestorProofPacket") {
      await route.fulfill({ json: packet });
      return;
    }
    if (isProxiedPublicResource(url.pathname)) {
      await proxy(route);
      return;
    }
    await route.fallback();
  });
}

async function routeBlockedPrivateResources(
  page: Page,
  privateRequests: string[]
): Promise<void> {
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
}

function isProxiedPublicResource(pathname: string): boolean {
  return [
    RESOURCE_DATA_COVERAGE,
    RESOURCE_ADVISOR_RESEARCH_QUEUE,
    RESOURCE_FEED,
    RESOURCE_PUBLIC_FIRMS,
    "/ArticleView",
    "/AdvisorProfile",
    "/FirmProfile",
    "/RankingsExplorer",
    "/RecruitingMarket",
  ].some(path => pathname === path || pathname.startsWith(`${path}/`));
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

async function packetFacts(page: Page): Promise<PacketFacts> {
  await page
    .locator('[data-investor-proof-link="coverage-dashboard"]')
    .waitFor({ timeout: QUICK_TIMEOUT });
  return await page.evaluate(() => {
    const metricTextById = Object.fromEntries(
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-investor-proof-metric]"
        ),
      ]
        .map(metric => [
          metric.dataset.investorProofMetric ?? "",
          metric.textContent ?? "",
        ])
        .filter(([id]) => id.length > 0)
    );
    const href = (selector: string): string =>
      document
        .querySelector<HTMLAnchorElement>(selector)
        ?.getAttribute("href") ?? "";
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
    const body = document.body.textContent ?? "";
    const unsupportedClaims = [
      "guaranteed investor-ready",
      "all source rights are cleared",
      "private customer pipeline is available",
    ];
    return {
      feedHref: href('[data-investor-proof-link="representative-feed"]'),
      firmHref: href('[data-investor-proof-link="representative-firm"]'),
      metricTextById,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      privateHrefCount: links.filter(link =>
        /UserWatchlists|UserRating|AdvisorCorrectionRequest|User\//u.test(
          link.getAttribute("href") ?? ""
        )
      ).length,
      researchProfileHref:
        document
          .querySelector<HTMLAnchorElement>(".investor-proof-freshness a")
          ?.getAttribute("href") ?? "",
      unsupportedPositiveClaimCount: unsupportedClaims.filter(claim =>
        body.includes(claim)
      ).length,
    };
  });
}

function expectMetricParity(
  packet: InvestorProofPacketResponse,
  coverage: DataCoverageResponse,
  facts: PacketFacts
): void {
  const coverageMetrics = new Map(
    coverage.sections
      .flatMap(section => section.metrics)
      .map(metric => [metric.id, metric])
  );
  for (const metric of packet.coverage.keyMetrics) {
    const coverageMetric = coverageMetrics.get(metric.id);
    expect(coverageMetric).toBeTruthy();
    expect(
      metric.value === null &&
        coverageMetric?.value === 0 &&
        coverageMetric.limitation
        ? null
        : coverageMetric?.value
    ).toEqual(metric.value);
    expect(facts.metricTextById[metric.id]).toContain(
      displayMetricValue(metric.value)
    );
  }
}

function displayMetricValue(value: DataCoverageMetric["value"]): string {
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (value === null) return "Unavailable";
  if (!Number.isNaN(new Date(value).getTime())) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(value));
  }
  return String(value);
}

async function openPacketLink(page: Page, href: string): Promise<void> {
  expect(href).toMatch(
    /^\/(?:(advisors|articles|firms)\/|(?:advisor|article|firm)\.html\?id=)/u
  );
  await page.goto(`${baseUrlOfPage(page)}${href}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle", { timeout: QUICK_TIMEOUT });
}

function baseUrlOfPage(page: Page): string {
  const current = new URL(page.url());
  return `${current.protocol}//${current.host}`;
}

async function firstContentHeadingText(page: Page): Promise<string> {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLElement>("h1, h2")]
        .map(heading => heading.textContent?.trim() ?? "")
        .some(
          text => text.length > 0 && !["Browse", "AdvisorBook"].includes(text)
        ),
    undefined,
    { timeout: QUICK_TIMEOUT }
  );
  return await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>("h1, h2")]
        .map(heading => heading.textContent?.trim() ?? "")
        .find(
          text => text.length > 0 && !["Browse", "AdvisorBook"].includes(text)
        ) ?? ""
  );
}

function publicItemCount(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0;
  const items = (payload as { readonly items?: unknown }).items;
  if (Array.isArray(items)) return items.length;
  const rows = (payload as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Builds a deterministic public investor proof packet fixture.
 * @returns Investor proof packet payload.
 */
function packetPayload(): InvestorProofPacketResponse {
  return {
    generatedAt: "2026-06-23T12:30:00.000Z",
    unavailable: [RANKING_LIMITATION, FEED_LIMITATION],
    coverage: {
      sections: [],
      keyMetrics: [
        metric("advisors", "Advisors", 16265, "Advisor", "/PublicAdvisors"),
        metric("firms", "Firms", 2701, SOURCE_FIRM, RESOURCE_PUBLIC_FIRMS),
        metric("articles", "Articles", 557, "Article", RESOURCE_FEED),
        metric(
          "ranking-entries",
          "Ranking entries",
          null,
          "RankingEntry",
          "/RankingsExplorer",
          RANKING_LIMITATION
        ),
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
      limitation: FRESHNESS_LIMITATION,
    },
    proofLinks: [
      link(
        "coverage-dashboard",
        "Coverage dashboard",
        "/coverage",
        RESOURCE_DATA_COVERAGE
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
        ["article-1"],
        FEED_LIMITATION
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
 * @param limitation - Optional limitation copy.
 * @returns DataCoverage metric.
 */
function metric(
  id: string,
  label: string,
  value: DataCoverageMetric["value"],
  source: string,
  publicResource: string,
  limitation: string | null = null
): DataCoverageMetric {
  return { id, label, value, source, publicResource, limitation };
}

/**
 * Builds one proof link fixture.
 * @param id - Link id.
 * @param label - Link label.
 * @param url - Public route URL.
 * @param publicResource - Public resource path.
 * @param sourceIds - Source ids.
 * @param limitation - Optional limitation copy.
 * @returns Proof link fixture.
 */
function link(
  id: string,
  label: string,
  url: string,
  publicResource: string,
  sourceIds: readonly string[] = [],
  limitation: string | null = null
) {
  return {
    id,
    label,
    url,
    publicResource,
    sourceTable: publicResource.replace("/", ""),
    sourceIds,
    limitation,
  };
}

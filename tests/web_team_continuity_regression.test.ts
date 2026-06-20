import { createServer, type Server } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB_ROOT = resolve("harper-app/web");
const SHOTS = resolve("tests/screenshots");
const REGRESSION_TIMEOUT = 5_000;
const TEAM_FIXTURE_ID = "team-continuity-regression";
const TEAM_FIXTURE_NAME = "Summit Wealth Team";
const CURRENT_FIRM_ID = "firm-1";
const CURRENT_FIRM_NAME = "Example Wealth";
const ACTIVE_CAREER_STATUS = "active";
const METRIC_SNAPSHOT_KIND = "Metric snapshot";
const PRIVATE_VALUES = [
  "Private watchlist note",
  "rating: 2",
  "reviewer-only memo",
  "analyst@example.test",
  "raw_authenticated_table",
];

describe("team continuity browser regression", () => {
  let browser: Browser | undefined;
  let server: Server | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    browser = await chromium.launch({ headless: true });
    await mkdir(SHOTS, { recursive: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (!server) {
      return;
    }
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("orders public timeline rows and avoids desktop and mobile overflow", async () => {
    const desktop = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });

    try {
      await routePublicTeamProfile(desktop);
      await routePublicTeamProfile(mobile);

      const [desktopFacts, mobileFacts] = await Promise.all([
        timelineFacts(desktop, baseUrl),
        timelineFacts(mobile, baseUrl),
      ]);
      await Promise.all([
        desktop.screenshot({
          path: join(SHOTS, "team-continuity-regression-desktop.png"),
          fullPage: true,
        }),
        mobile.screenshot({
          path: join(SHOTS, "team-continuity-regression-mobile.png"),
          fullPage: true,
        }),
      ]);

      expect(desktopFacts.kinds).toEqual([
        "Roster",
        "Roster change",
        METRIC_SNAPSHOT_KIND,
        "Article evidence",
        "Transition",
        METRIC_SNAPSHOT_KIND,
      ]);
      expect(desktopFacts.firstRow).toContain(
        "Current roster: Avery Stone, Jordan Lee"
      );
      expect(desktopFacts.firstRow).toContain("Jan 2024");
      expect(desktopFacts.timelineText).toContain("past-member end date.");
      expect(desktopFacts.timelineText).toContain("snapshot as-of date.");
      expect(desktopFacts.timelineText).toContain("article published date.");
      expect(desktopFacts.timelineText).toContain(
        "recruiting transition move date."
      );
      expect(desktopFacts.timelineText).toContain("similar names alone");
      expect(desktopFacts.visibleTimelineText).toContain("Source details");
      expect(desktopFacts.visibleTimelineText).toContain(
        "Published profile metrics from manual source data."
      );
      expect(desktopFacts.visibleTimelineText).not.toContain(
        "Snapshot source type"
      );
      expect(desktopFacts.visibleTimelineText).not.toContain(
        "Source confidence"
      );
      expect(desktopFacts.visibleTimelineText).not.toContain("TeamProfile");
      expect(desktopFacts.visibleTimelineText).not.toContain("Public boundary");
      expect(desktopFacts.sourceDetailsCount).toBe(6);
      expect(desktopFacts.publicHrefs).toEqual(
        expect.arrayContaining([
          "/advisor.html?id=advisor-1",
          "/advisor.html?id=advisor-past",
          "/articles/advisor-moves-in-test-market-article-1",
          `/firm.html?id=${CURRENT_FIRM_ID}`,
        ])
      );
      expect(desktopFacts.privateLeakCount).toBe(0);
      expect(desktopFacts.hasOverflow).toBe(false);
      expect(mobileFacts.kinds).toEqual(desktopFacts.kinds);
      expect(mobileFacts.publicHrefs).toEqual(desktopFacts.publicHrefs);
      expect(mobileFacts.privateLeakCount).toBe(0);
      expect(mobileFacts.hasOverflow).toBe(false);

      console.log(
        "[EVIDENCE: team-continuity-browser-regression]",
        JSON.stringify({ desktop: desktopFacts, mobile: mobileFacts })
      );
    } finally {
      await desktop.close();
      await mobile.close();
    }
  }, 60_000);

  it("keeps sparse public continuity rows readable without placeholder links", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });

    try {
      await routePublicTeamProfile(page, sparsePublicTeamProfile());

      const facts = await timelineFacts(page, baseUrl);

      expect(facts.kinds).toEqual([
        "Roster change",
        METRIC_SNAPSHOT_KIND,
        "Transition",
        "Article evidence",
      ]);
      expect(facts.timelineText).toContain(
        "Continuity article without a public URL"
      );
      expect(facts.timelineText).toContain("Evidence unavailable");
      expect(facts.timelineText).toContain("move date unavailable");
      expect(facts.visibleTimelineText).toContain("Source details");
      expect(facts.visibleTimelineText).not.toContain("Source confidence");
      expect(facts.visibleTimelineText).not.toContain("TeamProfile");
      expect(facts.publicHrefs).toEqual([
        "/advisor.html?id=advisor-undated",
        "/articles/continuity-article-without-a-public-url-article-without-url",
      ]);
      expect(facts.publicHrefs.some(href => href.startsWith("/firm"))).toBe(
        false
      );
      expect(facts.privateLeakCount).toBe(0);
      expect(facts.hasOverflow).toBe(false);
      expect(facts.unavailableDateCount).toBe(4);

      console.log(
        "[EVIDENCE: sparse-team-continuity-browser-regression]",
        JSON.stringify(facts)
      );
    } finally {
      await page.close();
    }
  }, 60_000);
});

interface TimelineFacts {
  readonly firstRow: string;
  readonly hasOverflow: boolean;
  readonly kinds: readonly string[];
  readonly privateLeakCount: number;
  readonly publicHrefs: readonly string[];
  readonly sourceDetailsCount: number;
  readonly timelineText: string;
  readonly unavailableDateCount: number;
  readonly visibleTimelineText: string;
}

type TeamProfileFixture = ReturnType<typeof teamContinuityProfile>;

async function routePublicTeamProfile(
  page: Page,
  profile: TeamProfileFixture = teamContinuityProfile()
): Promise<void> {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route(`**/TeamProfile/${TEAM_FIXTURE_ID}`, async route => {
    await route.fulfill({ json: profile });
  });
}

async function timelineFacts(
  page: Page,
  baseUrl: string
): Promise<TimelineFacts> {
  await page.goto(`${baseUrl}/team.html?id=${TEAM_FIXTURE_ID}`, {
    waitUntil: "domcontentloaded",
  });
  const timeline = page.locator(".team-continuity-timeline");
  await timeline.waitFor({ timeout: REGRESSION_TIMEOUT });

  return await page.evaluate(privateValues => {
    const timeline = document.querySelector(".team-continuity-timeline");
    const steps = [
      ...document.querySelectorAll(".team-continuity-timeline .step"),
    ];
    const publicHrefs = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".team-continuity-timeline a"
      ),
    ].map(link => link.getAttribute("href") ?? "");
    const bodyText = document.body.textContent ?? "";
    const visibleTimelineText =
      timeline instanceof HTMLElement ? timeline.innerText.trim() : "";

    return {
      firstRow: steps[0]?.textContent?.trim() ?? "",
      hasOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      kinds: steps.map(
        step => step.querySelector(".timeline-kind")?.textContent ?? ""
      ),
      privateLeakCount: privateValues.filter(value => bodyText.includes(value))
        .length,
      publicHrefs,
      sourceDetailsCount: document.querySelectorAll(
        ".team-continuity-provenance"
      ).length,
      timelineText: timeline?.textContent?.trim() ?? "",
      unavailableDateCount: steps.filter(
        step =>
          step.querySelector(".when")?.textContent?.trim() ===
          "Date unavailable"
      ).length,
      visibleTimelineText,
    };
  }, PRIVATE_VALUES);
}

function teamContinuityProfile() {
  return {
    team: {
      id: TEAM_FIXTURE_ID,
      name: TEAM_FIXTURE_NAME,
      serviceModel: "ensemble",
      firmProgram: "Private wealth",
      foundedYear: 2020,
    },
    currentFirm: { id: CURRENT_FIRM_ID, name: CURRENT_FIRM_NAME },
    currentBranch: {
      id: "branch-1",
      name: "Atlanta",
      city: "Atlanta",
      state: "GA",
    },
    currentMembers: [
      {
        advisor: {
          id: "advisor-1",
          name: "Avery Stone",
          careerStatus: ACTIVE_CAREER_STATUS,
        },
        role: "lead_advisor",
        startDate: "2024-01-01",
      },
      {
        advisor: {
          id: "advisor-2",
          name: "Jordan Lee",
          careerStatus: ACTIVE_CAREER_STATUS,
        },
        role: "portfolio_manager",
        startDate: "2024-04-01",
      },
    ],
    pastMembers: [
      {
        advisor: {
          id: "advisor-past",
          name: "Riley Chen",
          careerStatus: "inactive",
        },
        role: "client_associate",
        startDate: "2022-01-01",
        endDate: "2025-04-15",
      },
    ],
    metricSnapshots: [
      {
        asOf: "2025-12-31",
        aum: 1000000000,
        annualRevenue: 5000000,
        householdCount: 120,
        teamSize: 3,
        sourceType: "manual",
      },
      {
        asOf: null,
        aum: null,
        annualRevenue: null,
        householdCount: null,
        teamSize: null,
        sourceType: null,
        reviewerNote: "reviewer-only memo",
        analystEmail: "analyst@example.test",
        rawTable: "raw_authenticated_table",
        privateWatchlistNote: "Private watchlist note",
        privateRating: "rating: 2",
      },
    ],
    transitions: [
      {
        id: "transition-1",
        subject: {
          kind: "team",
          id: TEAM_FIXTURE_ID,
          name: TEAM_FIXTURE_NAME,
        },
        fromFirm: {
          id: "firm-0",
          kind: "firm",
          name: "Legacy Wealth LLC",
          short: "Legacy Wealth",
        },
        toFirm: {
          id: CURRENT_FIRM_ID,
          kind: "firm",
          name: CURRENT_FIRM_NAME,
          short: CURRENT_FIRM_NAME,
        },
        moveDate: "2026-06-01",
        aumMoved: 1000000000,
        headcountMoved: 2,
        productionT12: 5000000,
        deal: null,
      },
    ],
    articles: [
      {
        id: "article-1",
        headline: "Advisor moves in test market",
        publishedDate: "2026-01-15",
        category: "recruiting",
        url: "https://example.com/article-1",
      },
    ],
  };
}

function sparsePublicTeamProfile(): TeamProfileFixture {
  return {
    ...teamContinuityProfile(),
    currentMembers: [],
    pastMembers: [
      {
        advisor: {
          id: "advisor-undated",
          name: "No Date Advisor",
          careerStatus: ACTIVE_CAREER_STATUS,
        },
        role: null,
        startDate: null,
        endDate: null,
      },
    ],
    metricSnapshots: [
      {
        asOf: null,
        aum: null,
        annualRevenue: null,
        householdCount: null,
        teamSize: null,
        sourceType: null,
      },
    ],
    transitions: [
      {
        id: "transition-without-public-firm",
        subject: {
          kind: "team",
          id: TEAM_FIXTURE_ID,
          name: TEAM_FIXTURE_NAME,
        },
        fromFirm: null,
        toFirm: null,
        moveDate: null,
        aumMoved: null,
        headcountMoved: null,
        productionT12: null,
        deal: null,
      },
    ],
    articles: [
      {
        id: "article-without-url",
        headline: "Continuity article without a public URL",
        publishedDate: null,
        category: null,
        url: null,
      },
    ],
  };
}

function baseUrlOf(localServer: Server): string {
  const address = localServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Static test server did not expose a TCP address.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const url = request.url ?? "/";
    const resolvedPath = resolveStaticPath(url);
    try {
      const file = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(file);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise<void>(resolveListen => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  return server;
}

function resolveStaticPath(url: string): string {
  const path = new URL(url, "http://localhost").pathname;
  const normalized = normalize(path === "/" ? "/index.html" : path);
  const safePath = normalized
    .split("/")
    .filter(segment => segment && segment !== "..")
    .join(sep);
  return resolve(WEB_ROOT, safePath);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

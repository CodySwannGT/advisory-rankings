import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB_ROOT = resolve("harper-app/web");
const LOGIN_SHELL = resolve("harper-app/login/shell.html");
const SHOTS = resolve("tests/screenshots");
const QUICK_TIMEOUT = 4_000;
const ME_ROUTE = "**/Me";
const FEED_ROUTE = "**/Feed";
const ADVISOR_RESEARCH_QUEUE_ROUTE = "**/AdvisorResearchQueue**";
const NO_ARTICLES_TEXT = "No articles yet";
const FEED_ERROR_TITLE = "Could not load feed";
const TEMPORARY_OUTAGE = "temporary outage";
const RETRY_RECOVERY_ARTICLE = "Retry recovery article";
const ADVISOR_RECOVERY_NAME = "Avery Stone";
const RESEARCH_QUEUE_FIRM_NAME = "Acme Advisory";
const RESEARCH_QUEUE_SOURCE_TABLE = "AdvisorResearchCheck";
const RESEARCH_QUEUE_PROFILE_LINK = "Open advisor profile";
const ROUTE_RETRY_LOG = join(SHOTS, "issue-279-route-retry-requests.json");
const EVIDENCE_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 320, height: 740 },
] as const;
const RETRY_MOBILE_VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 740 },
  { name: "mobile-320", width: 320, height: 740 },
] as const;
const browserDescribe =
  process.env.RUN_WEB_ASYNC_STATES === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

browserDescribe("web async states", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    await mkdir(SHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("shows safe sign-in recovery copy for auth failures", async () => {
    const page = await browser.newPage();
    let loginRequested = false;

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/Login", async route => {
      loginRequested = true;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "internal authorization policy denied" }),
      });
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill("user@example.com");
    await page.locator('input[name="password"]').fill("bad-password");
    await page.locator("form").evaluate(form => {
      (form as HTMLFormElement).requestSubmit();
    });

    await page
      .getByText("Email or password is incorrect.")
      .waitFor({ timeout: QUICK_TIMEOUT });
    expect(loginRequested).toBe(true);
    expect(await page.getByText("internal authorization policy").count()).toBe(
      0
    );
    await page.close();
  }, 30_000);

  it("shows a user-safe invalid-credentials error without mobile overflow", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    let loginRequested = false;

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/Login", async route => {
      loginRequested = true;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          type: "error:StatusError",
          code: "StatusError",
          title: "Invalid credentials",
          status: 500,
          instance: "/Login",
        }),
      });
    });

    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill("qa-invalid@example.com");
    await page.locator('input[name="password"]').fill("bad-password");
    await page.locator("form").evaluate(form => {
      (form as HTMLFormElement).requestSubmit();
    });

    await page
      .getByText("Email or password is incorrect.")
      .waitFor({ timeout: QUICK_TIMEOUT });
    expect(loginRequested).toBe(true);
    expect(await page.getByText("POST /Login").count()).toBe(0);
    expect(await page.getByText("StatusError").count()).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));
    await page.close();
  }, 30_000);

  it("shows feed loading skeletons before a delayed response resolves", async () => {
    const page = await browser.newPage();
    let releaseFeed: () => void = () => {};
    const feedReleased = new Promise<void>(resolveRelease => {
      releaseFeed = resolveRelease;
    });

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(FEED_ROUTE, async route => {
      await feedReleased;
      await route.fulfill({ json: { items: [] } });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    const skeletons = page.locator(".ab-skeleton");
    await skeletons.first().waitFor({ timeout: QUICK_TIMEOUT });
    expect(await skeletons.count()).toBe(8);

    releaseFeed();
    await page.getByText(NO_ARTICLES_TEXT).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.close();
  });

  it("renders a recoverable feed error when the response fails", async () => {
    const page = await browser.newPage();

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(FEED_ROUTE, async route => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    await page.getByText(FEED_ERROR_TITLE).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.getByText("Try again shortly.").isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: "Retry" }).isVisible()).toBe(
      true
    );
    expect(await page.getByText(TEMPORARY_OUTAGE).count()).toBe(0);
    expect(await page.getByText(FEED_ERROR_TITLE).count()).toBe(1);
    await page.locator(".nav a", { hasText: "Home" }).waitFor();
    await page.close();
  });

  it("retries feed failures in place and renders the successful feed", async () => {
    const page = await browser.newPage();
    const feedRequests: string[] = [];

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(FEED_ROUTE, async route => {
      feedRequests.push(route.request().url());
      if (feedRequests.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
        });
        return;
      }
      await route.fulfill({ json: feedWithArticle() });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByText(FEED_ERROR_TITLE).waitFor({
      timeout: QUICK_TIMEOUT,
    });

    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("link", { name: RETRY_RECOVERY_ARTICLE }).waitFor({
      timeout: QUICK_TIMEOUT,
    });

    expect(
      feedRequests.map(requestUrl => new URL(requestUrl).pathname)
    ).toEqual(["/Feed", "/Feed"]);
    expect(await page.getByText(FEED_ERROR_TITLE).count()).toBe(0);
    await page.close();
  });

  it("renders the research freshness queue route with profile links", async () => {
    const page = await browser.newPage();
    const queueRequests: string[] = [];

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(ADVISOR_RESEARCH_QUEUE_ROUTE, async route => {
      queueRequests.push(route.request().url());
      await route.fulfill({ json: researchQueuePayload() });
    });

    await page.goto(`${baseUrl}/research/freshness`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Research freshness queue" })
      .waitFor({ timeout: QUICK_TIMEOUT });

    await page.getByRole("heading", { name: ADVISOR_RECOVERY_NAME }).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await expectVisibleText(page, [
      "Due advisor research",
      "Public-safe queue rows",
      RESEARCH_QUEUE_FIRM_NAME,
      "Headshot Url",
      "Business Phone",
      RESEARCH_QUEUE_SOURCE_TABLE,
    ]);

    const profileLink = page.getByRole("link", {
      name: RESEARCH_QUEUE_PROFILE_LINK,
    });
    expect(await profileLink.getAttribute("href")).toBe(
      "/advisor.html?id=avery-stone"
    );
    expect(
      queueRequests.map(requestUrl => new URL(requestUrl).pathname)
    ).toEqual(["/AdvisorResearchQueue"]);
    await page.close();
  });

  it("verifies research queue profile links preserve freshness context", async () => {
    const queuePayload = researchQueuePayload();
    const queueItem = queuePayload.items[0];

    for (const viewport of EVIDENCE_VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const queueRequests: string[] = [];
      const profileRequests: string[] = [];

      try {
        await page.route(ME_ROUTE, async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(ADVISOR_RESEARCH_QUEUE_ROUTE, async route => {
          queueRequests.push(new URL(route.request().url()).pathname);
          await route.fulfill({ json: queuePayload });
        });
        await page.route("**/AdvisorProfile/avery-stone", async route => {
          profileRequests.push(new URL(route.request().url()).pathname);
          await route.fulfill({
            json: advisorEvidenceProfile("avery-stone", queueItem),
          });
        });

        await page.goto(`${baseUrl}/research/freshness`, {
          waitUntil: "domcontentloaded",
        });
        await page
          .getByRole("heading", { name: queueItem.advisorName })
          .waitFor({ timeout: QUICK_TIMEOUT });
        await page
          .getByRole("link", { name: RESEARCH_QUEUE_PROFILE_LINK })
          .click();
        await page
          .getByRole("heading", { name: queueItem.advisorName })
          .waitFor({ timeout: QUICK_TIMEOUT });

        await expectAnyVisibleText(page, [
          "Evidence freshness",
          "Stale",
          "Last checked",
          "May 2026",
          "Next check",
          "Jun 2026",
          "No New Data",
          "Web Research",
        ]);
        await page.screenshot({
          path: evidencePath(
            viewport.name,
            "issue-1018-research-queue-profile-parity"
          ),
          fullPage: true,
        });
      } finally {
        expect(queueRequests).toEqual(["/AdvisorResearchQueue"]);
        expect(profileRequests).toEqual(["/AdvisorProfile/avery-stone"]);
        await page.close();
      }
    }
  }, 30_000);

  it("syncs research queue filters through the URL and resource request", async () => {
    const page = await browser.newPage();
    const queueRequests: string[] = [];

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(ADVISOR_RESEARCH_QUEUE_ROUTE, async route => {
      queueRequests.push(route.request().url());
      await route.fulfill({ json: researchQueuePayload() });
    });

    await page.goto(
      `${baseUrl}/research/freshness?sourceType=firm_source&staleDays=7&status=no_new_data&missingField=businessPhone&limit=10`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("heading", { name: ADVISOR_RECOVERY_NAME }).waitFor({
      timeout: QUICK_TIMEOUT,
    });

    await expectFilterValue(page, "Source type", "firm_source");
    await expectFilterValue(page, "Stale days", "7");
    await expectFilterValue(page, "Status", "no_new_data");
    await expectFilterValue(page, "Missing field", "businessPhone");
    await expectFilterValue(page, "Limit", "10");

    const filteredResponse = page.waitForResponse(
      response =>
        response.url().includes("/AdvisorResearchQueue?") &&
        response.url().includes("limit=5")
    );
    await page.getByLabel("Limit").fill("5");
    await page.getByRole("button", { name: "Apply" }).click();
    await filteredResponse;
    await page.waitForURL("**/research/freshness?**limit=5**", {
      timeout: QUICK_TIMEOUT,
    });

    const requestParams = queueRequests.map(requestUrl => {
      const url = new URL(requestUrl);
      return Object.fromEntries(url.searchParams);
    });
    expect(requestParams.at(0)).toMatchObject({
      sourceType: "firm_source",
      staleDays: "7",
      status: "no_new_data",
      missingField: "businessPhone",
      limit: "10",
    });
    expect(requestParams.at(-1)).toMatchObject({
      sourceType: "firm_source",
      staleDays: "7",
      status: "no_new_data",
      missingField: "businessPhone",
      limit: "5",
    });
    await page.close();
  });

  it("keeps research queue empty and retry states tied to filtered URLs", async () => {
    const page = await browser.newPage();
    const queueRequests: string[] = [];

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(ADVISOR_RESEARCH_QUEUE_ROUTE, async route => {
      queueRequests.push(route.request().url());
      if (queueRequests.length === 1) {
        await route.fulfill({ json: emptyResearchQueuePayload() });
        return;
      }
      if (queueRequests.length === 2) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
        });
        return;
      }
      await route.fulfill({ json: researchQueuePayload() });
    });

    await page.goto(
      `${baseUrl}/research/freshness?sourceType=web_research&staleDays=1&status=failed&missingField=headshotUrl&limit=3`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByText("No due advisor checks").waitFor({
      timeout: QUICK_TIMEOUT,
    });

    await page.getByLabel("Status").selectOption("no_new_data");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByText("Could not load research queue").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await page.getByText(TEMPORARY_OUTAGE).count()).toBe(0);
    await page.getByRole("button", { name: "Retry" }).click();
    await page.getByRole("heading", { name: ADVISOR_RECOVERY_NAME }).waitFor({
      timeout: QUICK_TIMEOUT,
    });

    const searches = queueRequests.map(
      requestUrl => new URL(requestUrl).search
    );
    expect(searches[0]).toContain("status=failed");
    expect(searches[1]).toContain("status=no_new_data");
    expect(searches[2]).toContain("status=no_new_data");
    expect(searches[2]).toContain("missingField=headshotUrl");
    await page.close();
  });

  it("captures route retry request and recovery evidence", async () => {
    const requestLog = {
      feed: await captureFeedRetryEvidence(browser, baseUrl),
      advisorProfile: await captureAdvisorRetryEvidence(browser, baseUrl),
      firmDirectory: await captureFirmDirectoryRetryEvidence(browser, baseUrl),
    } as const;

    await writeFile(
      ROUTE_RETRY_LOG,
      `${JSON.stringify(requestLog, null, 2)}\n`
    );

    expect(requestLog.feed).toEqual(["/Feed", "/Feed"]);
    expect(requestLog.advisorProfile).toEqual([
      "/AdvisorProfile/advisor-loaded",
      "/AdvisorProfile/advisor-loaded",
    ]);
    expect(requestLog.firmDirectory).toEqual(["/PublicFirms", "/PublicFirms"]);
    expect(existsSync(ROUTE_RETRY_LOG)).toBe(true);
    expect(
      [
        "issue-279-feed-error-before-retry",
        "issue-279-feed-recovered",
        "issue-279-advisor-error-before-retry",
        "issue-279-advisor-recovered",
        "issue-279-firm-directory-error-before-retry",
        "issue-279-firm-directory-recovered",
      ].every(name => existsSync(evidencePath("desktop", name)))
    ).toBe(true);
  }, 30_000);

  it("guards not-found routes from introducing Retry actions", async () => {
    const cases = [
      {
        path: "/advisor.html?id=missing-advisor",
        resource: "**/AdvisorProfile/missing-advisor",
        title: "Advisor not found",
        action: "Back to Advisors",
        payload: missingDetail("missing-advisor"),
      },
      {
        path: "/team.html?id=missing-team",
        resource: "**/TeamProfile/missing-team",
        title: "Team not found",
        action: "Back to Teams",
        payload: missingDetail("missing-team"),
      },
      {
        path: "/article.html?id=missing-article",
        resource: "**/ArticleView/missing-article",
        title: "Article not found",
        action: "Back to Articles",
        payload: missingDetail("missing-article"),
      },
    ] as const;

    for (const routeCase of cases) {
      const page = await browser.newPage();
      try {
        await page.route(ME_ROUTE, async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(routeCase.resource, async route => {
          await route.fulfill({ json: routeCase.payload });
        });

        await page.goto(`${baseUrl}${routeCase.path}`, {
          waitUntil: "domcontentloaded",
        });

        await page.getByText(routeCase.title).waitFor({
          timeout: QUICK_TIMEOUT,
        });
        expect(
          await page.getByRole("button", { name: routeCase.action }).isVisible()
        ).toBe(true);
        expect(await page.getByRole("button", { name: "Retry" }).count()).toBe(
          0
        );
        await page.screenshot({
          path: evidencePath(
            "desktop",
            `issue-279-not-found-${routeCase.title}`
          ),
          fullPage: true,
        });
      } finally {
        await page.close();
      }
    }
  }, 30_000);

  it("keeps mobile Retry actions visible, tappable, and within the viewport", async () => {
    for (const viewport of RETRY_MOBILE_VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      try {
        await page.route(ME_ROUTE, async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(FEED_ROUTE, async route => {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
          });
        });

        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await page.getByText(FEED_ERROR_TITLE).waitFor({
          timeout: QUICK_TIMEOUT,
        });

        const retry = page.getByRole("button", { name: "Retry" });
        const box = await retry.boundingBox();
        const hasHorizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );

        expect(await retry.isVisible()).toBe(true);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
        expect(hasHorizontalOverflow).toBe(false);
        await page.screenshot({
          path: evidencePath(viewport.name, "issue-279-mobile-retry"),
          fullPage: true,
        });
      } finally {
        await page.close();
      }
    }
  }, 30_000);

  it("shows session recovery guidance while preserving public content", async () => {
    const page = await browser.newPage();

    await page.route(ME_ROUTE, async route => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "permission denied" }),
      });
    });
    await page.route(FEED_ROUTE, async route => {
      await route.fulfill({ json: { items: [] } });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    await page.getByText(NO_ARTICLES_TEXT).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page
      .getByText("Sign in again or continue browsing public pages")
      .waitFor({
        timeout: QUICK_TIMEOUT,
      });
    expect(await page.getByText("permission denied").count()).toBe(0);
    await page.close();
  });

  it("captures desktop and mobile feed async evidence", async () => {
    const evidenceFiles: string[] = [];
    for (const viewport of EVIDENCE_VIEWPORTS) {
      await captureFeedLoadingEvidence(browser, baseUrl, viewport);
      await captureFeedErrorEvidence(browser, baseUrl, viewport);
      evidenceFiles.push(
        evidencePath(viewport.name, "feed-loading"),
        evidencePath(viewport.name, "feed-empty"),
        evidencePath(viewport.name, "feed-error")
      );
    }
    expect(evidenceFiles.every(filePath => existsSync(filePath))).toBe(true);
  }, 30_000);
});

/**
 * Captures the feed skeleton and resolved empty state for one viewport.
 * @param browser - Browser used to create an isolated page.
 * @param baseUrl - Local static server URL.
 * @param viewport - Evidence viewport metadata.
 */
async function captureFeedLoadingEvidence(
  browser: Browser,
  baseUrl: string,
  viewport: (typeof EVIDENCE_VIEWPORTS)[number]
): Promise<void> {
  const page = await browser.newPage({ viewport });
  let releaseFeed: () => void = () => {};
  const feedReleased = new Promise<void>(resolveRelease => {
    releaseFeed = resolveRelease;
  });

  await page.route(ME_ROUTE, async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route(FEED_ROUTE, async route => {
    await feedReleased;
    await route.fulfill({ json: { items: [] } });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.locator(".ab-skeleton").first().waitFor({
    timeout: QUICK_TIMEOUT,
  });
  await page.screenshot({
    path: evidencePath(viewport.name, "feed-loading"),
    fullPage: true,
  });

  releaseFeed();
  await page.getByText(NO_ARTICLES_TEXT).waitFor({
    timeout: QUICK_TIMEOUT,
  });
  await page.screenshot({
    path: evidencePath(viewport.name, "feed-empty"),
    fullPage: true,
  });
  await page.close();
}

/**
 * Captures the feed error state for one viewport.
 * @param browser - Browser used to create an isolated page.
 * @param baseUrl - Local static server URL.
 * @param viewport - Evidence viewport metadata.
 */
async function captureFeedErrorEvidence(
  browser: Browser,
  baseUrl: string,
  viewport: (typeof EVIDENCE_VIEWPORTS)[number]
): Promise<void> {
  const page = await browser.newPage({ viewport });

  await page.route(ME_ROUTE, async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route(FEED_ROUTE, async route => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
    });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.getByText(FEED_ERROR_TITLE).waitFor({
    timeout: QUICK_TIMEOUT,
  });
  await page.screenshot({
    path: evidencePath(viewport.name, "feed-error"),
    fullPage: true,
  });
  await page.close();
}

/**
 * Captures request and screenshot evidence for feed retry recovery.
 * @param browser - Browser used to create an isolated page.
 * @param baseUrl - Local static server URL.
 * @returns Requested Feed paths in call order.
 */
async function captureFeedRetryEvidence(
  browser: Browser,
  baseUrl: string
): Promise<readonly string[]> {
  const page = await browser.newPage();
  const requests: string[] = [];

  try {
    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route(FEED_ROUTE, async route => {
      requests.push(new URL(route.request().url()).pathname);
      if (requests.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
        });
        return;
      }
      await route.fulfill({ json: feedWithArticle() });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByText(FEED_ERROR_TITLE).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.screenshot({
      path: evidencePath("desktop", "issue-279-feed-error-before-retry"),
      fullPage: true,
    });
    await clickRetryAndCapture(
      page,
      RETRY_RECOVERY_ARTICLE,
      "issue-279-feed-recovered"
    );
    return requests;
  } finally {
    await page.close();
  }
}

/**
 * Captures request and screenshot evidence for advisor profile retry recovery.
 * @param browser - Browser used to create an isolated page.
 * @param baseUrl - Local static server URL.
 * @returns Requested AdvisorProfile paths in call order.
 */
async function captureAdvisorRetryEvidence(
  browser: Browser,
  baseUrl: string
): Promise<readonly string[]> {
  const page = await browser.newPage();
  const requests: string[] = [];

  try {
    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/AdvisorProfile/advisor-loaded", async route => {
      requests.push(new URL(route.request().url()).pathname);
      if (requests.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
        });
        return;
      }
      await route.fulfill({ json: advisorEvidenceProfile("advisor-loaded") });
    });

    await page.goto(`${baseUrl}/advisor.html?id=advisor-loaded`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByText("Could not load advisor").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.screenshot({
      path: evidencePath("desktop", "issue-279-advisor-error-before-retry"),
      fullPage: true,
    });
    await clickRetryAndCapture(
      page,
      ADVISOR_RECOVERY_NAME,
      "issue-279-advisor-recovered"
    );
    return requests;
  } finally {
    await page.close();
  }
}

/**
 * Captures request and screenshot evidence for firm directory retry recovery.
 * @param browser - Browser used to create an isolated page.
 * @param baseUrl - Local static server URL.
 * @returns Requested PublicFirms paths in call order.
 */
async function captureFirmDirectoryRetryEvidence(
  browser: Browser,
  baseUrl: string
): Promise<readonly string[]> {
  const page = await browser.newPage();
  const requests: string[] = [];

  try {
    await page.route(ME_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false } });
    });
    await page.route("**/PublicFirms**", async route => {
      requests.push(new URL(route.request().url()).pathname);
      if (requests.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
        });
        return;
      }
      await route.fulfill({ json: firmDirectoryPayload() });
    });

    await page.goto(`${baseUrl}/firms`, { waitUntil: "domcontentloaded" });
    await page.getByText("Couldn't load more").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.screenshot({
      path: evidencePath(
        "desktop",
        "issue-279-firm-directory-error-before-retry"
      ),
      fullPage: true,
    });
    await clickRetryAndCapture(
      page,
      RESEARCH_QUEUE_FIRM_NAME,
      "issue-279-firm-directory-recovered",
      "Load more"
    );
    return requests;
  } finally {
    await page.close();
  }
}

/**
 * Clicks a retry-style action and captures the recovered state.
 * @param page - Browser page under test.
 * @param successText - Text expected after recovery.
 * @param screenshotName - Evidence screenshot suffix.
 * @param actionName - Button name to click.
 */
async function clickRetryAndCapture(
  page: Page,
  successText: string,
  screenshotName: string,
  actionName: string = "Retry"
): Promise<void> {
  await page.getByRole("button", { name: actionName }).click();
  await page.getByText(successText).first().waitFor({
    timeout: QUICK_TIMEOUT,
  });
  await page.screenshot({
    path: evidencePath("desktop", screenshotName),
    fullPage: true,
  });
}

/**
 * Builds a deterministic screenshot evidence path.
 * @param viewportName - Evidence viewport name.
 * @param stateName - Async state being captured.
 * @returns Absolute screenshot path.
 */
function evidencePath(viewportName: string, stateName: string): string {
  return join(SHOTS, `async-${viewportName}-${stateName}.png`);
}

/** Article stub used in the minimal feed payload. */
type FeedArticleStub = {
  readonly id: string;
  readonly headline: string;
  readonly dek: string;
  readonly category: string;
  readonly publishedDate: string;
  readonly modifiedDate: string;
  readonly authors: readonly string[];
  readonly url: string;
};

/** Single feed item used in the minimal feed payload. */
type FeedItemStub = {
  readonly article: FeedArticleStub;
  readonly eventCards: readonly never[];
  readonly firms: readonly never[];
  readonly teams: readonly never[];
  readonly advisors: readonly never[];
};

/** Return type of `feedWithArticle()`: minimal Feed payload with one article. */
type FeedWithArticle = {
  readonly items: readonly FeedItemStub[];
};

/**
 * Builds a minimal feed payload that exercises the post-card success path.
 * @returns Feed resource payload with one article.
 */
function feedWithArticle(): FeedWithArticle {
  return {
    items: [
      {
        article: {
          id: "article-retry",
          headline: RETRY_RECOVERY_ARTICLE,
          dek: "Loaded after a manual retry.",
          category: "transitions",
          publishedDate: "2026-05-27T00:00:00.000Z",
          modifiedDate: "2026-05-27T00:00:00.000Z",
          authors: ["AdvisorBook"],
          url: "https://example.com/retry-recovery",
        },
        eventCards: [],
        firms: [],
        teams: [],
        advisors: [],
      },
    ],
  };
}

/** Minimal advisor research queue payload with one due row. */
type ResearchQueuePayload = {
  readonly generatedAt: string;
  readonly filters: Readonly<
    Record<"sourceType" | "status" | "missingField", string | null> &
      Record<"staleDays" | "limit", number>
  >;
  readonly summary: {
    readonly totalDue: number;
    readonly returned: number;
    readonly statusCounts: Readonly<Record<string, number>>;
    readonly missingFieldCounts: Readonly<Record<string, number>>;
  };
  readonly items: readonly [
    {
      readonly advisorId: string;
      readonly advisorName: string;
      readonly finraCrd: string;
      readonly profileUrl: string;
      readonly firm: {
        readonly id: string;
        readonly name: string;
        readonly roleTitle: string;
      };
      readonly sourceType: string;
      readonly status: string;
      readonly lastCheckedAt: string;
      readonly nextCheckAfter: string;
      readonly daysSinceLastCheck: number;
      readonly missingFields: readonly string[];
      readonly provenance: {
        readonly sourceTable: typeof RESEARCH_QUEUE_SOURCE_TABLE;
        readonly sourceIds: readonly string[];
      };
    },
  ];
};

/**
 * Builds a deterministic research queue payload for route rendering checks.
 * @returns AdvisorResearchQueue-shaped response with one due advisor.
 */
function researchQueuePayload(): ResearchQueuePayload {
  return {
    generatedAt: "2026-06-08T12:00:00.000Z",
    filters: {
      sourceType: "web_research",
      staleDays: 30,
      status: null,
      missingField: null,
      limit: 25,
    },
    summary: {
      totalDue: 1,
      returned: 1,
      statusCounts: { no_new_data: 1 },
      missingFieldCounts: { headshotUrl: 1, businessPhone: 1 },
    },
    items: [
      {
        advisorId: "advisor-loaded",
        advisorName: ADVISOR_RECOVERY_NAME,
        finraCrd: "1234567",
        profileUrl: "/advisor.html?id=avery-stone",
        firm: {
          id: "firm-1",
          name: RESEARCH_QUEUE_FIRM_NAME,
          roleTitle: "Managing Director",
        },
        sourceType: "web_research",
        status: "no_new_data",
        lastCheckedAt: "2026-05-01T00:00:00.000Z",
        nextCheckAfter: "2026-06-01T00:00:00.000Z",
        daysSinceLastCheck: 38,
        missingFields: ["headshotUrl", "businessPhone"],
        provenance: {
          sourceTable: RESEARCH_QUEUE_SOURCE_TABLE,
          sourceIds: ["research-check-1"],
        },
      },
    ],
  };
}

/**
 * Builds an empty queue payload for filtered zero-result route checks.
 * @returns AdvisorResearchQueue-shaped response with no due advisors.
 */
function emptyResearchQueuePayload(): Omit<ResearchQueuePayload, "items"> &
  Readonly<Record<"items", readonly []>> {
  return {
    ...researchQueuePayload(),
    summary: {
      totalDue: 0,
      returned: 0,
      statusCounts: {},
      missingFieldCounts: {},
    },
    items: [],
  };
}

/**
 * Asserts the current value for a labeled queue filter control.
 * @param page - Browser page under test.
 * @param label - Accessible control label.
 * @param value - Expected form control value.
 */
async function expectFilterValue(
  page: Page,
  label: string,
  value: string
): Promise<void> {
  await page.getByLabel(label).waitFor({ timeout: QUICK_TIMEOUT });
  expect(await page.getByLabel(label).inputValue()).toBe(value);
}

/**
 * Waits for a set of exact or partial text snippets to be visible.
 * @param page - Playwright page under test.
 * @param snippets - Text snippets expected on the page.
 */
async function expectVisibleText(
  page: Page,
  snippets: readonly string[]
): Promise<void> {
  for (const snippet of snippets) {
    await page.getByText(snippet).first().waitFor({ timeout: QUICK_TIMEOUT });
  }
}

/**
 * Waits until each text snippet has at least one visible matching node.
 * @param page - Playwright page under test.
 * @param snippets - Text snippets expected on the page.
 */
async function expectAnyVisibleText(
  page: Page,
  snippets: readonly string[]
): Promise<void> {
  for (const snippet of snippets) {
    const matches = page.getByText(snippet);
    await expect
      .poll(
        async () => {
          const count = await matches.count();
          for (let index = 0; index < count; index += 1) {
            if (await matches.nth(index).isVisible()) return true;
          }
          return false;
        },
        { timeout: QUICK_TIMEOUT }
      )
      .toBe(true);
  }
}

/** Minimal not-found envelope used by detail route regression checks. */
type MissingDetailResponse = {
  readonly error: "not found";
  readonly id: string;
};

/**
 * Builds a deterministic missing-detail resource payload.
 * @param id - Missing entity id.
 * @returns Not-found response envelope.
 */
function missingDetail(id: string): MissingDetailResponse {
  return { error: "not found", id };
}

/**
 * Builds a minimal advisor profile payload that exercises retry recovery.
 * @param id - Advisor id requested by the route.
 * @param queueItem - Optional research queue row used for parity checks.
 * @returns AdvisorProfile resource payload.
 */
function advisorEvidenceProfile(
  id: string,
  queueItem?: ResearchQueuePayload["items"][number]
): unknown {
  const lastCheckedAt = queueItem?.lastCheckedAt ?? "2026-05-25T12:00:00Z";
  const nearestNextCheckAfter =
    queueItem?.nextCheckAfter ?? "2026-06-01T00:00:00Z";

  return {
    advisor: {
      id,
      legalName: ADVISOR_RECOVERY_NAME,
      preferredName: ADVISOR_RECOVERY_NAME,
      headshotUrl: null,
      careerStatus: "active",
      yearsExperience: 12,
      finraCrd: "12345",
      secIard: null,
      industryStartDate: "2014-01-01",
      birthYear: null,
      gender: "undisclosed",
    },
    displayName: ADVISOR_RECOVERY_NAME,
    career: [
      {
        roleTitle: "Advisor",
        firm: { id: "firm-a", name: "Example Wealth", short: "Example WM" },
        branch: { id: "branch-a", name: "Atlanta", city: "Atlanta" },
        startDate: "2020-01-01",
        endDate: null,
      },
    ],
    teams: [],
    disclosures: [],
    outsideBusinessActivities: [],
    registrationApplications: [],
    transitions: [],
    articles: [],
    licenses: [],
    designations: [],
    education: [],
    brokerCheckSnapshot: null,
    evidenceFreshness: {
      hasData: true,
      lastCheckedAt,
      nearestNextCheckAfter,
      statusCounts: researchStatusCounts(queueItem),
      sourceTypeCoverage: researchSourceCoverage(queueItem),
    },
    confidenceSummary: {
      hasData: true,
      asserted: 2,
      inferred: 1,
      derived: 1,
      total: 4,
    },
  };
}

/**
 * Builds profile freshness status counts from a queue row.
 * @param queueItem - Optional research queue row used for parity checks.
 * @returns Evidence freshness status counts.
 */
function researchStatusCounts(
  queueItem?: ResearchQueuePayload["items"][number]
): Readonly<
  Record<"success" | "no_new_data" | "ambiguous" | "failed", number>
> {
  if (!queueItem)
    return { success: 2, no_new_data: 1, ambiguous: 0, failed: 0 };
  return {
    success: Number(queueItem.status === "success"),
    no_new_data: Number(queueItem.status === "no_new_data"),
    ambiguous: Number(queueItem.status === "ambiguous"),
    failed: Number(queueItem.status === "failed"),
  };
}

/**
 * Builds profile source-type coverage from a queue row.
 * @param queueItem - Optional research queue row used for parity checks.
 * @returns Evidence freshness source coverage counts.
 */
function researchSourceCoverage(
  queueItem?: ResearchQueuePayload["items"][number]
): Readonly<
  Record<
    "web_research" | "firm_source" | "firm_bio" | "rankings" | "press",
    number
  >
> {
  if (!queueItem) {
    return {
      web_research: 1,
      firm_source: 0,
      firm_bio: 1,
      rankings: 0,
      press: 1,
    };
  }
  return {
    web_research: Number(queueItem.sourceType === "web_research"),
    firm_source: Number(queueItem.sourceType === "firm_source"),
    firm_bio: Number(queueItem.sourceType === "firm_bio"),
    rankings: Number(queueItem.sourceType === "rankings"),
    press: Number(queueItem.sourceType === "press"),
  };
}

/**
 * Builds a minimal firm directory payload for retry recovery.
 * @returns PublicFirms resource payload.
 */
function firmDirectoryPayload(): unknown {
  return {
    items: [
      {
        id: "firm-1",
        name: RESEARCH_QUEUE_FIRM_NAME,
        channel: "ria",
        hqCity: "Austin",
        hqState: "TX",
      },
    ],
    nextCursor: null,
    total: 1,
  };
}

/**
 * Starts a static server rooted at generated web assets.
 * @returns Local static server for browser tests.
 */
async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const filePath = request.url?.split("?")[0] || "/";
    const resolvedPath = resolveStaticPath(filePath);

    try {
      const file = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(file);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return server;
}

/**
 * Resolves a request path to a generated asset path.
 * @param urlPath - Request URL path.
 * @returns Absolute static file path.
 */
function resolveStaticPath(urlPath: string): string {
  const cleanPath = normalize(decodeURIComponent(urlPath)).replace(
    /^(\.\.(\/|\\|$))+/,
    ""
  );
  if (cleanPath === "/login") return LOGIN_SHELL;

  const relativePath =
    cleanPath === sep || cleanPath === "." || cleanPath === "/"
      ? "index.html"
      : ["/firms", "/teams", "/regulatory"].includes(cleanPath)
        ? `${cleanPath.slice(1)}.html`
        : cleanPath === "/research/freshness"
          ? "research-freshness.html"
          : cleanPath.replace(/^[/\\]+/, "");
  const candidate = resolve(WEB_ROOT, relativePath);
  if (!candidate.startsWith(`${WEB_ROOT}${sep}`) && candidate !== WEB_ROOT) {
    return join(WEB_ROOT, "404.html");
  }
  return candidate;
}

/**
 * Maps static file extensions to browser content types.
 * @param filePath - Static file path.
 * @returns HTTP content type.
 */
function contentType(filePath: string): string {
  switch (extname(filePath)) {
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

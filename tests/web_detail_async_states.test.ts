import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WEB_ROOT = resolve("harper-app/web");
const QUICK_TIMEOUT = 2_000;
const HEADLINE_TEXT = "Advisor moves in test market";
const ADVISOR_NAME = "Avery Stone";
const TEMPORARY_OUTAGE = "temporary outage";
const TRY_AGAIN_TEXT = "Try again shortly.";
const FIRM_PROFILE_ROUTE = "**/FirmProfile/firm-1";
const COULD_NOT_LOAD_FIRM = "Could not load firm";
const FIRM_DUE_DILIGENCE = "Firm due diligence";
const RECRUITING_MOMENTUM = "Recruiting momentum";
const NEEDS_DATA = "Needs data";
const RIGHT_CARD_SELECTOR = ".right .card";
const EVIDENCE_FRESHNESS = "Evidence freshness";
const EXAMPLE_WEALTH_SHORT = "Example Wealth";
const SOURCE_TIMESTAMP_NOTE = "Source timestamp loaded.";
const MAY_2_TIMESTAMP = "2026-05-02T00:00:00.000Z";

describe("detail async states", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("shows advisor detail skeletons before a delayed profile resolves", async () => {
    const page = await browser.newPage();
    let releaseAdvisor: () => void = () => {};
    const advisorReleased = new Promise<void>(resolveRelease => {
      releaseAdvisor = resolveRelease;
    });

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.route("**/AdvisorProfile/advisor-1", async route => {
        await advisorReleased;
        await route.fulfill({ json: missingAdvisor("advisor-1") });
      });

      await page.goto(`${baseUrl}/advisor.html?id=advisor-1`, {
        waitUntil: "domcontentloaded",
      });

      await page.getByLabel("Loading advisor profile").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      expect(await page.locator(".detail-loading-card").count()).toBe(4);

      releaseAdvisor();
      await page.getByText("Advisor not found").waitFor({
        timeout: QUICK_TIMEOUT,
      });
      expect(
        await page.getByRole("button", { name: "Back to Advisors" }).isVisible()
      ).toBe(true);
    } finally {
      releaseAdvisor();
      await page.close();
    }
  });

  it("renders route-specific recovery actions on missing detail records", async () => {
    const cases = [
      {
        path: "/advisor.html?id=missing-advisor",
        resource: "**/AdvisorProfile/missing-advisor",
        payload: missingDetail("missing-advisor"),
        title: "Advisor not found",
        action: "Back to Advisors",
        recoveryHref: "/advisors",
      },
      {
        path: "/firm.html?id=missing-firm",
        resource: "**/FirmProfile/missing-firm",
        payload: missingDetail("missing-firm"),
        title: "Firm not found",
        action: "Back to Firms",
        recoveryHref: "/firms",
      },
      {
        path: "/team.html?id=missing-team",
        resource: "**/TeamProfile/missing-team",
        payload: missingDetail("missing-team"),
        title: "Team not found",
        action: "Back to Teams",
        recoveryHref: "/teams",
      },
      {
        path: "/article.html?id=missing-article",
        resource: "**/ArticleView/missing-article",
        payload: missingDetail("missing-article"),
        title: "Article not found",
        action: "Back to Articles",
        recoveryHref: "/",
      },
    ];

    for (const detailCase of cases) {
      const page = await browser.newPage();
      try {
        await page.route("**/Me", async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(detailCase.resource, async route => {
          await route.fulfill({ json: detailCase.payload });
        });

        await page.goto(`${baseUrl}${detailCase.path}`, {
          waitUntil: "domcontentloaded",
        });

        await page.getByText(detailCase.title).waitFor({
          timeout: QUICK_TIMEOUT,
        });
        const action = page.getByRole("button", { name: detailCase.action });
        expect(await action.isVisible()).toBe(true);
        expect(
          await page
            .locator(".detail-not-found-card")
            .getAttribute("data-recovery-href")
        ).toBe(detailCase.recoveryHref);
        expect(
          await page
            .locator(".detail-not-found-card")
            .getByRole("button", { name: "Retry" })
            .count()
        ).toBe(0);

        await action.click();
        await page.waitForURL(`**${detailCase.recoveryHref}`, {
          timeout: QUICK_TIMEOUT,
        });
      } finally {
        await page.close();
      }
    }
  });

  it("retries article, advisor, and team errors with the same id", async () => {
    const cases = [
      {
        path: "/article.html?id=article-1",
        resource: "/ArticleView/article-1",
        title: "Could not load article",
        successText: HEADLINE_TEXT,
        payload: articleWithPartialFailures(),
      },
      {
        path: "/advisor.html?id=advisor-loaded",
        resource: "/AdvisorProfile/advisor-loaded",
        title: "Could not load advisor",
        successText: ADVISOR_NAME,
        payload: advisorEvidenceProfile("advisor-loaded"),
      },
      {
        path: "/team.html?id=team-1",
        resource: "/TeamProfile/team-1",
        title: "Could not load team",
        successText: "Summit Wealth Team",
        payload: teamProfile(),
      },
    ];

    for (const detailCase of cases) {
      const page = await browser.newPage();
      const requests: string[] = [];

      try {
        await page.route("**/Me", async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(`**${detailCase.resource}`, async route => {
          requests.push(route.request().url());
          if (requests.length === 1) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
            });
            return;
          }
          await route.fulfill({ json: detailCase.payload });
        });

        await page.goto(`${baseUrl}${detailCase.path}`, {
          waitUntil: "domcontentloaded",
        });

        await page.getByText(detailCase.title).waitFor({
          timeout: QUICK_TIMEOUT,
        });
        expect(await page.getByText(TRY_AGAIN_TEXT).isVisible()).toBe(true);
        expect(await page.getByText(TEMPORARY_OUTAGE).count()).toBe(0);

        await page.getByRole("button", { name: "Retry" }).click();
        await page.getByText(detailCase.successText).first().waitFor({
          timeout: QUICK_TIMEOUT,
        });

        expect(
          requests.map(requestUrl => new URL(requestUrl).pathname)
        ).toEqual([detailCase.resource, detailCase.resource]);
        expect(await page.getByText(detailCase.title).count()).toBe(0);
      } finally {
        await page.close();
      }
    }
  });

  it("retries firm detail errors with the same id and renders due diligence", async () => {
    const page = await browser.newPage();
    const firmProfileRequests: string[] = [];

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.route(FIRM_PROFILE_ROUTE, async route => {
        firmProfileRequests.push(route.request().url());
        if (firmProfileRequests.length === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: TEMPORARY_OUTAGE }),
          });
          return;
        }
        await route.fulfill({ json: firmDueDiligenceProfile() });
      });

      await page.goto(`${baseUrl}/firm.html?id=firm-1`, {
        waitUntil: "domcontentloaded",
      });

      const errorCard = page.getByText(COULD_NOT_LOAD_FIRM);
      await errorCard.waitFor({
        timeout: QUICK_TIMEOUT,
      });
      const firmsNav = page.locator(".nav a", { hasText: "Firms" });
      await firmsNav.waitFor();
      expect(await errorCard.isVisible()).toBe(true);
      expect(await page.getByText(TRY_AGAIN_TEXT).isVisible()).toBe(true);
      expect(await page.getByText(TEMPORARY_OUTAGE).count()).toBe(0);
      expect(await firmsNav.isVisible()).toBe(true);

      await page.getByRole("button", { name: "Retry" }).click();
      await page.getByRole("heading", { name: FIRM_DUE_DILIGENCE }).waitFor({
        timeout: QUICK_TIMEOUT,
      });
      expect(
        await page
          .getByRole("heading", { name: RECRUITING_MOMENTUM })
          .isVisible()
      ).toBe(true);
      expect(
        firmProfileRequests.map(requestUrl => new URL(requestUrl).pathname)
      ).toEqual(["/FirmProfile/firm-1", "/FirmProfile/firm-1"]);
      expect(await page.getByText(COULD_NOT_LOAD_FIRM).count()).toBe(0);
    } finally {
      await page.close();
    }
  });

  it("renders shared recoverable detail errors without leaking details", async () => {
    const page = await browser.newPage();

    try {
      await page.goto(`${baseUrl}/__blank.html`, {
        waitUntil: "domcontentloaded",
      });
      await page.addScriptTag({
        type: "module",
        content: `
          import {
            DetailNotFoundCard,
            renderRecoverableDetailError,
          } from "/detail-state.js";

          const center = document.createElement("main");
          const right = document.createElement("aside");
          center.textContent = "stale center";
          right.textContent = "stale right";
          document.body.append(center, right);

          let retryCount = 0;
          renderRecoverableDetailError({
            center,
            right,
            title: "${COULD_NOT_LOAD_FIRM}",
            error: new Error("temporary outage with raw backend details"),
            onRetry: () => {
              retryCount += 1;
            },
          });
          center
            .querySelector("button")
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

          const notFound = DetailNotFoundCard({
            title: "Firm not found",
            id: "firm-missing",
            actionLabel: "Back to Firms",
            href: "/firms",
          });
          document.body.append(notFound);

          window.__detailRecoverableResult = {
            title: center.querySelector(".card-title")?.textContent,
            body: center.querySelector(".ab-empty")?.textContent,
            buttonText: center.querySelector("button")?.textContent,
            asyncState: center
              .querySelector(".detail-error-card")
              ?.getAttribute("data-async-state"),
            retryRule: center
              .querySelector(".detail-error-card")
              ?.getAttribute("data-retry-rule"),
            retryCount,
            rightChildren: right.childElementCount,
            staleCenterCleared: !center.textContent.includes("stale center"),
            staleRightCleared: !right.textContent.includes("stale right"),
            rawDetailsLeaked: center.textContent.includes("raw backend details"),
            notFoundAction: notFound.querySelector("button")?.textContent,
            notFoundRecoveryHref: notFound.getAttribute("data-recovery-href"),
            notFoundRetryButtons: [...notFound.querySelectorAll("button")]
              .filter(button => button.textContent === "Retry").length,
          };
        `,
      });
      await page.waitForFunction(() => "__detailRecoverableResult" in window);

      const result = await page.evaluate(
        () =>
          (window as typeof window & { __detailRecoverableResult: unknown })
            .__detailRecoverableResult
      );

      expect(result).toEqual({
        title: COULD_NOT_LOAD_FIRM,
        body: TRY_AGAIN_TEXT,
        buttonText: "Retry",
        asyncState: "error",
        retryRule: "required",
        retryCount: 1,
        rightChildren: 0,
        staleCenterCleared: true,
        staleRightCleared: true,
        rawDetailsLeaked: false,
        notFoundAction: "Back to Firms",
        notFoundRecoveryHref: "/firms",
        notFoundRetryButtons: 0,
      });
    } finally {
      await page.close();
    }
  });

  it("keeps article content visible when related sections fail", async () => {
    const page = await browser.newPage();

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.route("**/ArticleView/article-1", async route => {
        await route.fulfill({ json: articleWithPartialFailures() });
      });

      await page.goto(`${baseUrl}/article.html?id=article-1`, {
        waitUntil: "domcontentloaded",
      });

      const headline = page.getByText(HEADLINE_TEXT);
      await headline.waitFor({
        timeout: QUICK_TIMEOUT,
      });
      await page.getByText("Article body could not load").waitFor();
      await page.getByText("Extracted facts could not load").waitFor();
      await page.getByText("Mentioned advisors could not load").waitFor();
      const metadataHeading = page.getByRole("heading", {
        name: "Article metadata",
      });
      await metadataHeading.waitFor();
      expect(await headline.isVisible()).toBe(true);
      expect(await metadataHeading.isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("renders firm due-diligence modules, filters, links, and unavailable states", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
    });

    try {
      await page.route("**/Me", async route => {
        await route.fulfill({ json: { authenticated: false } });
      });
      await page.route(FIRM_PROFILE_ROUTE, async route => {
        await route.fulfill({ json: firmDueDiligenceProfile() });
      });

      await page.goto(`${baseUrl}/firm.html?id=firm-1`, {
        waitUntil: "domcontentloaded",
      });

      await page.getByRole("heading", { name: FIRM_DUE_DILIGENCE }).waitFor({
        timeout: QUICK_TIMEOUT,
      });
      const recruitingHeading = page.getByRole("heading", {
        name: RECRUITING_MOMENTUM,
      });
      expect(await recruitingHeading.isVisible()).toBe(true);
      expect(
        await page.getByRole("link", { name: "The Taylor Group" }).isVisible()
      ).toBe(true);
      expect(
        await page
          .getByText("No RankingEntry rows are loaded")
          .first()
          .isVisible()
      ).toBe(true);
      expect(
        await page.getByText("FINRA BrokerCheck").first().isVisible()
      ).toBe(true);
      expect(await page.getByText("Source: TransitionEvent").isVisible()).toBe(
        true
      );
      await page.getByLabel("Source-backed explanation").first().click();
      expect(
        await page.getByText("public rows or records that support").isVisible()
      ).toBe(true);
      await page.getByLabel("Needs data explanation").first().press("Enter");
      expect(
        await page
          .getByText("not yet have enough public source rows")
          .isVisible()
      ).toBe(true);
      expect(await page.getByText("Source-backed").first().isVisible()).toBe(
        true
      );

      await page.getByRole("button", { name: NEEDS_DATA }).click();
      expect(
        await page
          .getByRole("heading", { name: "Ranking presence" })
          .isVisible()
      ).toBe(true);
      expect(
        await page.getByText("No modules currently need data.").isVisible()
      ).toBe(false);
      expect(await recruitingHeading.isVisible()).toBe(false);
    } finally {
      await page.close();
    }
  });

  it("keeps active firm due-diligence filters chip-sized", async () => {
    const viewports = [
      { width: 1180, height: 900 },
      { width: 390, height: 900 },
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });

      try {
        await page.route("**/Me", async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route(FIRM_PROFILE_ROUTE, async route => {
          await route.fulfill({ json: firmDueDiligenceProfile() });
        });

        await page.goto(`${baseUrl}/firm.html?id=firm-1`, {
          waitUntil: "domcontentloaded",
        });

        await expectCompactFirmDueDiligenceFilters(page);
      } finally {
        await page.close();
      }
    }
  });

  it("shows a firm due-diligence empty state when a filter has no modules", async () => {
    const viewports = [
      { width: 1180, height: 900 },
      { width: 390, height: 900 },
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });

      try {
        await page.route("**/Me", async route => {
          await route.fulfill({ json: { authenticated: false } });
        });
        await page.route("**/FirmProfile/firm-loaded", async route => {
          await route.fulfill({ json: firmDueDiligenceAllLoadedProfile() });
        });

        await page.goto(`${baseUrl}/firm.html?id=firm-loaded`, {
          waitUntil: "domcontentloaded",
        });

        const section = page.locator(".firm-dd-card").first();
        await section
          .getByRole("heading", { name: FIRM_DUE_DILIGENCE })
          .waitFor({ timeout: QUICK_TIMEOUT });
        await section.getByRole("button", { name: NEEDS_DATA }).click();

        expect(
          await section.getByText("No modules currently need data.").isVisible()
        ).toBe(true);
        expect(
          await section
            .getByRole("button", { name: "Show all modules" })
            .isVisible()
        ).toBe(true);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth
          )
        ).toBe(true);

        await section.getByRole("button", { name: "Show all modules" }).click();
        expect(
          await section
            .getByRole("button", { name: "All" })
            .getAttribute("aria-pressed")
        ).toBe("true");
        expect(
          await section
            .getByRole("button", { name: "All" })
            .evaluate(button => button === document.activeElement)
        ).toBe(true);
        expect(
          await section
            .getByRole("heading", { name: RECRUITING_MOMENTUM })
            .isVisible()
        ).toBe(true);
      } finally {
        await page.close();
      }
    }
  });

  it("renders advisor evidence panels for loaded, warning, and no-data states", async () => {
    const page = await browser.newPage({
      viewport: { width: 1180, height: 900 },
    });
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 900 },
    });

    try {
      await routeAdvisorEvidence(page);
      await page.goto(`${baseUrl}/advisor.html?id=advisor-loaded`, {
        waitUntil: "domcontentloaded",
      });

      const desktopEvidence = page
        .locator(RIGHT_CARD_SELECTOR)
        .filter({ hasText: EVIDENCE_FRESHNESS })
        .first();
      await desktopEvidence.waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await desktopEvidence
          .locator(".tag")
          .filter({ hasText: /^Current$/ })
          .isVisible()
      ).toBe(true);
      await desktopEvidence
        .getByLabel("Evidence freshness explanation")
        .click();
      expect(
        await desktopEvidence
          .getByText("public-source checks last ran")
          .isVisible()
      ).toBe(true);
      expect(await desktopEvidence.getByText("Last checked").isVisible()).toBe(
        true
      );
      expect(await desktopEvidence.getByText("Firm Bio").isVisible()).toBe(
        true
      );
      const confidence = page
        .locator(RIGHT_CARD_SELECTOR)
        .filter({ hasText: "Fact confidence" })
        .first();
      await confidence.waitFor({ timeout: QUICK_TIMEOUT });
      expect(await confidence.getByText("4 total").isVisible()).toBe(true);
      await confidence.getByLabel("Fact confidence explanation").click();
      expect(
        await confidence
          .getByText("supported by public source rows")
          .isVisible()
      ).toBe(true);
      expect(await confidence.getByText("Direct source").isVisible()).toBe(
        true
      );
      expect(await confidence.getByText("Calculated").isVisible()).toBe(true);
      expect(
        await confidence
          .locator(".advisor-confidence-bar")
          .getAttribute("aria-label")
      ).toBe("Fact confidence distribution");

      await page.goto(`${baseUrl}/advisor.html?id=advisor-warning`, {
        waitUntil: "domcontentloaded",
      });
      const warningEvidence = page
        .locator(RIGHT_CARD_SELECTOR)
        .filter({ hasText: EVIDENCE_FRESHNESS })
        .first();
      await warningEvidence
        .locator(".tag")
        .filter({ hasText: /^Warning$/ })
        .waitFor({ timeout: QUICK_TIMEOUT });
      const warningLabels = warningEvidence.locator(
        ".advisor-evidence-metric span"
      );
      expect(
        await warningLabels.filter({ hasText: /^Failed$/ }).isVisible()
      ).toBe(true);
      expect(
        await warningLabels.filter({ hasText: /^Ambiguous$/ }).isVisible()
      ).toBe(true);
      expect(
        await warningEvidence.getByText("2 checks need review").isVisible()
      ).toBe(true);

      await routeAdvisorEvidence(mobilePage);
      await mobilePage.goto(`${baseUrl}/advisor.html?id=advisor-empty`, {
        waitUntil: "domcontentloaded",
      });
      const mobileEvidence = mobilePage.locator(".advisor-mobile-evidence");
      await mobileEvidence
        .getByRole("heading", { name: EVIDENCE_FRESHNESS })
        .waitFor({ timeout: QUICK_TIMEOUT });
      expect(
        await mobileEvidence.getByText("No evidence checks yet").isVisible()
      ).toBe(true);
      expect(
        await mobileEvidence.getByText("No confidence rows yet").isVisible()
      ).toBe(true);
      expect(
        await mobileEvidence
          .locator(".tag")
          .filter({ hasText: "No data" })
          .count()
      ).toBe(2);
      const mobileLabels = await mobileEvidence
        .locator(".advisor-evidence-metric span")
        .evaluateAll(nodes =>
          nodes.map(node => node.textContent?.trim()).filter(Boolean)
        );
      expect(mobileLabels).toEqual(
        expect.arrayContaining(["Last checked", "Next check", "Direct source"])
      );
      await mobileEvidence
        .getByLabel("Evidence freshness explanation")
        .first()
        .press("Enter");
      expect(
        await mobileEvidence
          .getByText("public-source checks last ran")
          .first()
          .isVisible()
      ).toBe(true);
      expect(
        await mobilePage.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth
        )
      ).toBe(true);
    } finally {
      await page.close();
      await mobilePage.close();
    }
  });
});

/**
 * Starts a static server for generated web assets.
 * @returns Static HTTP server.
 */
async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const filePath = request.url?.split("?")[0] || "/";
    if (filePath === "/__blank.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><body></body></html>");
      return;
    }

    const resolvedPath = resolveStaticPath(filePath);

    try {
      const body = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(body);
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
 * Resolves a URL path to a generated web asset.
 * @param urlPath - Incoming request path.
 * @returns Local static file path.
 */
function resolveStaticPath(urlPath: string): string {
  const cleanPath = normalize(safeDecodePath(urlPath)).replace(
    /^(\.\.(\/|\\|$))+/,
    ""
  );
  const relativePath =
    cleanPath === sep || cleanPath === "." || cleanPath === "/"
      ? "index.html"
      : cleanPath.replace(/^[/\\]+/, "");
  const candidate = resolve(WEB_ROOT, relativePath);
  if (!candidate.startsWith(`${WEB_ROOT}${sep}`) && candidate !== WEB_ROOT) {
    return join(WEB_ROOT, "404.html");
  }
  return candidate;
}

/**
 * Decodes a request path while preserving malformed paths for normal 404 flow.
 * @param urlPath - Incoming request path.
 * @returns Decoded URL path or the original value when decoding fails.
 */
function safeDecodePath(urlPath: string): string {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return urlPath;
  }
}

/**
 * Maps static file extensions to content types.
 * @param filePath - Local file path.
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

/**
 * Builds the standard resource envelope for a missing detail entity.
 * @param id - Requested entity id.
 * @returns Detail not-found response.
 */
function missingDetail(id: string): MissingDetailResponse {
  return { error: "not found", id };
}

const missingAdvisor = missingDetail;

/**
 * Builds an ArticleView payload with successful primary content and failed
 * related sections.
 * @returns ArticleView response.
 */
function articleWithPartialFailures(): ArticleWithPartialFailures {
  return {
    article: {
      id: "article-1",
      headline: HEADLINE_TEXT,
      dek: "Primary article metadata loaded.",
      category: "transitions",
      publishedDate: "2026-05-24",
      modifiedDate: "2026-05-24",
      authors: ["AdvisorBook"],
      url: "https://example.com/article-1",
    },
    body: { error: "body unavailable" },
    eventCards: { error: "events unavailable" },
    firms: [],
    teams: [],
    advisors: { error: "advisors unavailable" },
    provenance: { error: "provenance unavailable" },
  };
}

/**
 * Builds a FirmProfile payload with source-backed and unavailable
 * due-diligence modules.
 * @returns FirmProfile response.
 */
function firmDueDiligenceProfile(): FirmDueDiligenceProfile {
  return {
    firm: {
      id: "firm-1",
      name: "Example Wealth LLC",
      short: EXAMPLE_WEALTH_SHORT,
      logoUrl: null,
      channel: "wirehouse",
      subChannel: "wealth_management",
      hqCity: "New York",
      hqState: "NY",
      hqCountry: "US",
      foundedYear: 1999,
      finraCrd: "67890",
      website: "https://example.com",
    },
    currentAdvisorCount: 4,
    pastAdvisorCount: 2,
    currentTeams: [],
    transitionsIn: [],
    transitionsOut: [],
    disclosuresAtThisFirm: [],
    articles: [],
    branches: [],
    brokerCheckSnapshot: null,
    dueDiligence: {
      generatedAt: "2026-05-25T12:00:00.000Z",
      firmId: "firm-1",
      modules: {
        recruitingMomentum: {
          status: "loaded",
          note: "Calculated from canonical TransitionEvent rows for this firm.",
          inbound: { count: 1, knownAum: 500000000, unknownAumCount: 0 },
          outbound: { count: 0, knownAum: 0, unknownAumCount: 0 },
          netMoveCount: 1,
          netAumMoved: 500000000,
          recentMoves: [
            {
              id: "move-1",
              direction: "inbound",
              subject: {
                kind: "team",
                id: "team-1",
                name: "The Taylor Group",
              },
              moveDate: "2026-05-01T00:00:00.000Z",
              aumMoved: 500000000,
            },
          ],
          provenance: {
            sourceTable: "TransitionEvent",
            sourceIds: ["move-1"],
          },
          freshness: {
            status: "loaded",
            asOf: "2026-05-01T00:00:00.000Z",
            note: SOURCE_TIMESTAMP_NOTE,
          },
        },
        rosterFootprint: {
          status: "loaded",
          note: "Counts are derived from canonical roster, team, and branch rows.",
          currentAdvisorCount: 4,
          pastAdvisorCount: 2,
          teamCount: 1,
          branchCount: 3,
          provenance: { sourceTables: ["EmploymentHistory", "Team", "Branch"] },
          freshness: {
            status: "loaded",
            asOf: MAY_2_TIMESTAMP,
            note: SOURCE_TIMESTAMP_NOTE,
          },
        },
        rankingPresence: {
          status: "unavailable",
          note: "No RankingEntry rows are loaded for this firm; this does not imply the firm has no ranked advisors, teams, or firm appearances.",
          appearances: [],
          resolvedCount: 0,
          unresolvedCount: 0,
          provenance: { sourceTable: "RankingEntry", sourceIds: [] },
          freshness: {
            status: "unavailable",
            asOf: null,
            note: "Ranking freshness is unavailable because no RankingEntry rows are loaded.",
          },
        },
        regulatorySnapshot: {
          status: "loaded",
          note: "Regulatory values are source-backed by the loaded firm BrokerCheck snapshot.",
          snapshot: {
            subjectCrd: "67890",
            bcScope: "ACTIVE",
            iaScope: "ACTIVE",
            disclosureCount: 12,
            registeredStateCount: 52,
          },
          source: {
            sourceName: "FINRA BrokerCheck",
            sourceUrl: "https://brokercheck.finra.org/firm/summary/67890",
            termsUrl: "https://brokercheck.finra.org/terms",
            compiledAsOf: MAY_2_TIMESTAMP,
          },
          provenance: {
            sourceTable: "BrokerCheckSnapshot",
            sourceIds: ["bc-1"],
          },
          freshness: {
            status: "loaded",
            asOf: MAY_2_TIMESTAMP,
            note: SOURCE_TIMESTAMP_NOTE,
          },
        },
        coverageTimeline: {
          status: "not_found",
          note: "No source articles mention this firm in the loaded article data.",
          recentArticles: [],
          articleCount: 0,
          provenance: {
            sourceTables: ["Article", "ArticleFirmMention"],
            sourceIds: [],
          },
          freshness: {
            status: "unavailable",
            asOf: null,
            note: "Coverage freshness is unavailable because no article publication dates are loaded.",
          },
        },
      },
      dataConfidence: {
        status: "partial",
        note: "Module statuses distinguish loaded rows, explicit no-result states, and unavailable source tables.",
        modules: [
          { name: "recruitingMomentum", status: "loaded" },
          { name: "rosterFootprint", status: "loaded" },
          { name: "rankingPresence", status: "unavailable" },
          { name: "regulatorySnapshot", status: "loaded" },
          { name: "coverageTimeline", status: "not_found" },
        ],
      },
    },
  };
}

function firmDueDiligenceAllLoadedProfile(): FirmDueDiligenceProfile {
  const profile = JSON.parse(
    JSON.stringify(firmDueDiligenceProfile())
  ) as FirmDueDiligenceProfile;
  profile.dueDiligence.modules.rankingPresence.status = "loaded";
  profile.dueDiligence.modules.rankingPresence.note =
    "Ranking rows are loaded for this firm.";
  profile.dueDiligence.modules.rankingPresence.appearances = [
    {
      ranking: { id: "ranking-1", name: "Top firms", year: 2026 },
      rank: 12,
      segment: "national",
    },
  ];
  profile.dueDiligence.modules.coverageTimeline.status = "loaded";
  profile.dueDiligence.modules.coverageTimeline.note =
    "Source-backed coverage is loaded.";
  profile.dueDiligence.modules.coverageTimeline.articleCount = 1;
  profile.dueDiligence.modules.coverageTimeline.recentArticles = [
    {
      id: "article-1",
      headline: "Example Wealth expands",
      publishedDate: "2026-05-20T00:00:00.000Z",
      url: "https://example.com/article-1",
      source: "AdvisorBook",
    },
  ];
  profile.dueDiligence.dataConfidence.status = "loaded";
  profile.dueDiligence.dataConfidence.modules =
    profile.dueDiligence.dataConfidence.modules.map(module => ({
      ...module,
      status: "loaded",
    }));
  return profile;
}

async function routeAdvisorEvidence(page: Page) {
  await page.route("**/Me", async route => {
    await route.fulfill({ json: { authenticated: false } });
  });
  await page.route("**/AdvisorProfile/*", async route => {
    const id = route.request().url().split("/").pop() || "advisor-loaded";
    await route.fulfill({ json: advisorEvidenceProfile(id) });
  });
}

function advisorEvidenceProfile(id: string): AdvisorEvidenceProfile {
  const states = {
    "advisor-loaded": {
      evidenceFreshness: {
        hasData: true,
        lastCheckedAt: "2026-05-25T12:00:00Z",
        nearestNextCheckAfter: "2026-06-01T00:00:00Z",
        statusCounts: {
          success: 2,
          no_new_data: 1,
          ambiguous: 0,
          failed: 0,
        },
        sourceTypeCoverage: {
          web_research: 1,
          firm_bio: 1,
          rankings: 0,
          press: 1,
        },
      },
      confidenceSummary: {
        hasData: true,
        asserted: 2,
        inferred: 1,
        derived: 1,
        total: 4,
      },
    },
    "advisor-warning": {
      evidenceFreshness: {
        hasData: true,
        lastCheckedAt: "2026-05-25T12:00:00Z",
        nearestNextCheckAfter: "2026-06-01T00:00:00Z",
        statusCounts: {
          success: 1,
          no_new_data: 0,
          ambiguous: 1,
          failed: 1,
        },
        sourceTypeCoverage: {
          web_research: 1,
          firm_bio: 1,
          rankings: 0,
          press: 0,
        },
      },
      confidenceSummary: {
        hasData: true,
        asserted: 1,
        inferred: 1,
        derived: 0,
        total: 2,
      },
    },
    "advisor-empty": {
      evidenceFreshness: emptyEvidenceFreshness(),
      confidenceSummary: emptyConfidenceSummary(),
    },
  } as const;
  const state = states[id as keyof typeof states] || states["advisor-loaded"];

  return {
    advisor: {
      id,
      legalName: ADVISOR_NAME,
      preferredName: ADVISOR_NAME,
      headshotUrl: null,
      careerStatus: "active",
      yearsExperience: 12,
      finraCrd: "12345",
      secIard: null,
      industryStartDate: "2014-01-01",
      birthYear: null,
      gender: "undisclosed",
    },
    displayName: ADVISOR_NAME,
    career: [
      {
        roleTitle: "Advisor",
        firm: { id: "firm-a", name: EXAMPLE_WEALTH_SHORT, short: "Example WM" },
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
    ...state,
  };
}

function teamProfile(): TeamProfileFixture {
  return {
    team: {
      id: "team-1",
      name: "Summit Wealth Team",
      serviceModel: "ensemble",
      firmProgram: "Private wealth",
      foundedYear: 2020,
    },
    currentFirm: { id: "firm-1", name: EXAMPLE_WEALTH_SHORT },
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
          name: ADVISOR_NAME,
          careerStatus: "active",
        },
        role: "lead_advisor",
        startDate: "2024-01-01",
      },
    ],
    pastMembers: [],
    metricSnapshots: [
      {
        asOf: "2026-05-27",
        aum: 1000000000,
        annualRevenue: 5000000,
        householdCount: 120,
        teamSize: 3,
        sourceType: "manual",
      },
    ],
    transitions: [],
    articles: [],
  };
}

function emptyEvidenceFreshness() {
  return {
    hasData: false,
    lastCheckedAt: null,
    nearestNextCheckAfter: null,
    statusCounts: {
      success: 0,
      no_new_data: 0,
      ambiguous: 0,
      failed: 0,
    },
    sourceTypeCoverage: {
      web_research: 0,
      firm_bio: 0,
      rankings: 0,
      press: 0,
    },
  };
}

function emptyConfidenceSummary() {
  return {
    hasData: false,
    asserted: 0,
    inferred: 0,
    derived: 0,
    total: 0,
  };
}

async function expectCompactFirmDueDiligenceFilters(page: Page): Promise<void> {
  const section = page.locator(".firm-dd-card").first();
  await section
    .getByRole("heading", { name: FIRM_DUE_DILIGENCE })
    .waitFor({ timeout: QUICK_TIMEOUT });

  for (const name of ["All", "Source-backed", NEEDS_DATA]) {
    await section.getByRole("button", { name }).click();
    const activeMetric = await section
      .locator(".firm-dd-filter[aria-pressed='true']")
      .evaluate(button => {
        const box = button.getBoundingClientRect();
        const parentBox = button.parentElement?.getBoundingClientRect();

        return {
          width: Math.round(box.width),
          parentWidth: Math.round(parentBox?.width || 0),
        };
      });

    expect(activeMetric.width).toBeGreaterThan(0);
    expect(activeMetric.width).toBeLessThan(activeMetric.parentWidth * 0.7);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
  }
}

/**
 * Test payload for AdvisorProfile not-found responses.
 */
type MissingDetailResponse = Readonly<{
  error: string;
  id: string;
}>;

/**
 * Test payload for related resources that fail independently.
 */
type FailedResource = Readonly<{
  error: string;
}>;

/**
 * Minimal ArticleView payload used by partial-failure browser tests.
 */
type ArticleWithPartialFailures = Readonly<{
  article: Readonly<{
    id: string;
    headline: string;
    dek: string;
    category: string;
    publishedDate: string;
    modifiedDate: string;
    authors: readonly string[];
    url: string;
  }>;
  body: FailedResource;
  eventCards: FailedResource;
  firms: readonly unknown[];
  teams: readonly unknown[];
  advisors: FailedResource;
  provenance: FailedResource;
}>;

type FirmDueDiligenceProfile = Readonly<Record<string, unknown>>;
type AdvisorEvidenceProfile = Readonly<Record<string, unknown>>;
type TeamProfileFixture = Readonly<Record<string, unknown>>;

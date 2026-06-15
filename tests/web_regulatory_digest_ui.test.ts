import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAuth,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe = existsSync(chromium.executablePath())
  ? describe.sequential
  : describe.skip;

const SEVERITY_ARTICLE_ID = "article-severity";

browserDescribe("regulatory digest UI", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("renders a ranked public digest before the compatible event list", async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await routeAuth(page, false);
    await page.route("**/Feed**", async route => {
      await route.fulfill({ json: regulatoryFeedFixture() });
    });

    await page.goto(`${baseUrl}/regulatory`, { waitUntil: "domcontentloaded" });
    const digestRows = page.locator(".regulatory-digest-row");
    await digestRows.first().waitFor({ timeout: QUICK_TIMEOUT });

    await page.getByText("Regulatory digest (3)").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.getByText("Compliance events (3)").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await digestRows.count()).toBe(3);
    expect(await digestRows.nth(0).innerText()).toContain("Morgan Severity");
    expect(await digestRows.nth(1).innerText()).toContain("Avery Recency");
    expect(await digestRows.nth(2).innerText()).toContain("Casey Older");
    expect(await digestRows.first().innerText()).toContain(
      "Event date 2026-05-01"
    );
    expect(await digestRows.first().innerText()).toContain(
      "source published 2026-05-02"
    );
    expect(
      await digestRows
        .first()
        .getByRole("link", { name: "Advisor profile" })
        .getAttribute("href")
    ).toContain("advisor-severity");
    expect(
      await digestRows
        .first()
        .getByRole("link", { name: "Source article" })
        .getAttribute("href")
    ).toContain(SEVERITY_ARTICLE_ID);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth
      )
    ).toBe(true);
    await page.close();
  });
});

function regulatoryFeedFixture(): Readonly<Record<string, unknown>> {
  return {
    items: [
      feedItem("article-recency", "Avery Recency", "2026-05-01", "pending"),
      feedItem(SEVERITY_ARTICLE_ID, "Morgan Severity", "2026-05-01", "barred", [
        {
          id: "sanction-bar",
          disclosureId: "disc-article-severity",
          sanctionType: "bar",
          amount: undefined,
          durationMonths: undefined,
          jurisdiction: "FINRA",
        },
      ]),
      feedItem("article-older", "Casey Older", "2026-04-01", "resolved"),
    ],
  };
}

function feedItem(
  articleId: string,
  advisorName: string,
  dateResolved: string,
  status: string,
  sanctions: readonly Readonly<Record<string, unknown>>[] = []
): Readonly<Record<string, unknown>> {
  const advisorId = `advisor-${articleId.replace("article-", "")}`;
  return {
    article: {
      id: articleId,
      headline: `${advisorName} disclosure source`,
      dek: "",
      url: `https://example.test/${articleId}`,
      slug: undefined,
      publishedDate:
        articleId === SEVERITY_ARTICLE_ID ? "2026-05-02" : dateResolved,
      modifiedDate: undefined,
      authors: [],
      category: "regulatory",
    },
    eventCards: [
      {
        kind: "disclosure",
        disclosureId: `disc-${articleId}`,
        id: `disc-${articleId}`,
        advisor: { id: advisorId, name: advisorName },
        disclosureType: "regulatory",
        regulator: "FINRA",
        regulatorState: undefined,
        forum: undefined,
        status,
        admitDeny: undefined,
        dateInitiated: undefined,
        dateResolved,
        allegationText: `${advisorName} public allegation summary.`,
        allegationCategories: undefined,
        ruleViolations: undefined,
        awardAmount: undefined,
        settlementAmount: undefined,
        damagesRequested: undefined,
        clusterId: undefined,
        sanctions,
      },
    ],
    advisors: [],
    firms: [],
    teams: [],
  };
}

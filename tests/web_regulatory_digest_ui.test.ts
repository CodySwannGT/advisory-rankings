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
const FIRM_CONTEXT_NAME = "Example Wealth";
const PRIVATE_REVIEWER_NOTE = "private reviewer note";
const PRIVATE_SUBMITTER_NOTE = "private submitter note";
const PRIVATE_WATCHLIST_NOTE = "private watchlist note";
const PRIVATE_RATING_REVIEW = "private rating review";
const PRIVATE_COPY_MARKERS = [
  PRIVATE_REVIEWER_NOTE,
  PRIVATE_SUBMITTER_NOTE,
  PRIVATE_WATCHLIST_NOTE,
  PRIVATE_RATING_REVIEW,
];
const PRIVATE_RESOURCE_RE =
  /\/(RegulatoryDiscrepancyQueue|UserRating|UserWatchlists|AdvisorCorrectionRequest)\b/u;

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
    const requestedPrivateResources: string[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (PRIVATE_RESOURCE_RE.test(url.pathname)) {
        requestedPrivateResources.push(url.pathname);
      }
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
    expect(await digestRows.nth(2).innerText()).toContain(FIRM_CONTEXT_NAME);
    expect(await digestRows.first().innerText()).toContain(
      "Event date 2026-05-01"
    );
    expect(await digestRows.first().innerText()).toContain(
      "source published 2026-05-02"
    );
    expect(await digestRows.first().innerText()).toContain("Civil judicial");
    expect(await digestRows.first().innerText()).toContain(
      "U.S. District Court for the Southern District of New York"
    );
    expect(await digestRows.first().innerText()).toContain(
      "Awarded for claimant"
    );
    expect(await digestRows.first().innerText()).not.toContain(
      "CIVIL JUDICIAL"
    );
    expect(await digestRows.first().innerText()).not.toContain(
      "U.S. DISTRICT COURT FOR THE SOUTHERN DISTRICT OF NEW YORK"
    );
    expect(await digestRows.first().innerText()).not.toContain(
      "AWARDED FOR CLAIMANT"
    );
    expect(await digestRows.nth(1).innerText()).toContain(
      "missing details are a source limitation, not clean evidence"
    );
    expect(await digestRows.nth(1).innerText()).toContain(
      "BrokerCheck context is not present in this digest row"
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
      await digestRows
        .nth(2)
        .getByRole("link", { name: "Firm profile" })
        .getAttribute("href")
    ).toContain("firm-example");
    const bodyText = await page.locator("body").innerText();
    for (const marker of PRIVATE_COPY_MARKERS) {
      expect(bodyText).not.toContain(marker);
    }
    expect(requestedPrivateResources).toEqual([]);
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
      firmFeedItem(),
    ],
  };
}

function firmFeedItem(): Readonly<Record<string, unknown>> {
  return {
    ...feedItem("article-older", "Casey Older", "2026-04-01", "resolved"),
    firms: [
      {
        id: "firm-example",
        kind: "firm",
        name: FIRM_CONTEXT_NAME,
        short: "Example",
        logoUrl: null,
        channel: "ria",
        hq: "Austin, TX",
        dissolvedYear: null,
      },
    ],
    eventCards: [
      {
        kind: "disclosure",
        disclosureId: "disc-firm-only",
        id: "disc-firm-only",
        advisor: undefined,
        disclosureType: "regulatory",
        regulator: "SEC",
        regulatorState: undefined,
        forum: undefined,
        status: "resolved",
        admitDeny: undefined,
        dateInitiated: undefined,
        dateResolved: "2026-04-01",
        allegationText: `${FIRM_CONTEXT_NAME} public firm disclosure.`,
        allegationCategories: undefined,
        ruleViolations: undefined,
        awardAmount: undefined,
        settlementAmount: undefined,
        damagesRequested: undefined,
        clusterId: undefined,
        sanctions: [],
        reviewerNote: PRIVATE_REVIEWER_NOTE,
        submitterNote: PRIVATE_SUBMITTER_NOTE,
        watchlistNote: PRIVATE_WATCHLIST_NOTE,
        ratingReview: PRIVATE_RATING_REVIEW,
      },
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
        disclosureType:
          articleId === SEVERITY_ARTICLE_ID ? "CIVIL JUDICIAL" : "regulatory",
        regulator: articleId === SEVERITY_ARTICLE_ID ? undefined : "FINRA",
        regulatorState: undefined,
        forum:
          articleId === SEVERITY_ARTICLE_ID
            ? "U.S. DISTRICT COURT FOR THE SOUTHERN DISTRICT OF NEW YORK"
            : undefined,
        status:
          articleId === SEVERITY_ARTICLE_ID ? "AWARDED FOR CLAIMANT" : status,
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
        reviewerNote: PRIVATE_REVIEWER_NOTE,
        submitterNote: PRIVATE_SUBMITTER_NOTE,
        watchlistNote: PRIVATE_WATCHLIST_NOTE,
        ratingReview: PRIVATE_RATING_REVIEW,
      },
    ],
    advisors: [],
    firms: [],
    teams: [],
  };
}

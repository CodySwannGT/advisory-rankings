import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  baseUrlOf,
  QUICK_TIMEOUT,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe = existsSync(chromium.executablePath())
  ? describe.sequential
  : describe.skip;

browserDescribe("design-system event cards", () => {
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

  it("renders disclosure sanction pills without object placeholders", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({
      type: "module",
      content: `
        import { DisclosureEventCard } from "/design-system/index.js";

        const card = DisclosureEventCard({
          kind: "disclosure",
          disclosureId: "disc-fixture",
          id: "disc-fixture",
          advisor: { id: "advisor-a", name: "Avery Stone" },
          disclosureType: "regulatory",
          regulator: "finra",
          regulatorState: "TX",
          forum: undefined,
          status: "suspended",
          admitDeny: undefined,
          dateInitiated: undefined,
          dateResolved: undefined,
          allegationText: "Unapproved real estate business activity.",
          allegationCategories: undefined,
          ruleViolations: undefined,
          awardAmount: undefined,
          settlementAmount: undefined,
          damagesRequested: undefined,
          clusterId: undefined,
          sanctions: [{
            id: "sanction-a",
            disclosureId: "disc-fixture",
            sanctionType: "fine",
            amount: 2500,
            durationMonths: 3,
            jurisdiction: "TX",
          }],
        }, {
          fmtMoney: value => "$" + Number(value).toLocaleString("en-US"),
          humanize: value => String(value).replace(/_/g, " "),
        });

        document.body.append(card);
      `,
    });

    const pill = page.locator(".sanction-pill");
    await pill.waitFor({ timeout: QUICK_TIMEOUT });
    const text = await page.locator(".event-card").innerText();
    expect(text).toContain("fine");
    expect(text).toContain("$2,500");
    expect(text).toContain("3mo");
    expect(text).not.toContain("[object Object]");
    await page.close();
  });

  it("renders feed metadata without raw category author tokens", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({
      type: "module",
      content: `
        import { FeedPostCard } from "/design-system/index.js";

        const card = FeedPostCard({
          article: {
            id: "article-raw-author",
            headline: "Advisor public profile",
            dek: "",
            url: "https://advisor.morganstanley.com/example",
            slug: undefined,
            publishedDate: "2026-06-06",
            modifiedDate: undefined,
            authors: ["public_web_research"],
            category: "public_web_research",
          },
          eventCards: [],
          advisors: [],
          firms: [],
          teams: [],
        }, {
          fmtDate: () => "1w ago",
          articleSource: () => ({
            source: "Morgan Stanley",
            initials: "MS",
            ctaLabel: "Read original",
            publicOriginalLink: false,
          }),
        });

        document.body.append(card);
      `,
    });

    const header = page.locator(".post-header");
    await header.waitFor({ timeout: QUICK_TIMEOUT });
    const text = await header.innerText();
    expect(text).toContain("Advisor research");
    expect(text).not.toContain("public_web_research");
    await page.close();
  });
});

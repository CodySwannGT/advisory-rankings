import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADVISOR_ID,
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  routeAdvisor,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe =
  process.env.RUN_WEB_COMPARE_ENTRY_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

browserDescribe("public comparison entry actions (#810)", () => {
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

  it("adds a directory advisor to the comparison URL", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeAdvisorDirectory(page);

    await page.goto(`${baseUrl}/advisors?ids=adv-a`, {
      waitUntil: "domcontentloaded",
    });

    const row = page.locator(".advisor-directory-row").first();
    await row.waitFor({ timeout: QUICK_TIMEOUT });
    await Promise.all([
      page.waitForURL(/\/compare\?ids=adv-a,advisor-watch-1$/u),
      row.locator(".compare-entry-button").click(),
    ]);

    expect(new URL(page.url()).searchParams.get("ids")).toBe(
      `adv-a,${ADVISOR_ID}`
    );
    await captureViewports(page, "issue-810-compare-entry-public-flow");
    await page.close();
  });

  it("shows a cap message when adding a fifth advisor from a profile", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeAdvisor(page, false);

    await page.goto(
      `${baseUrl}/advisor.html?id=${ADVISOR_ID}&ids=adv-a,adv-b,adv-c,adv-d`,
      { waitUntil: "domcontentloaded" }
    );

    const card = page.locator(".compare-entry-card");
    await card.locator(".compare-entry-button").click();
    await card.getByText("Compare supports up to four advisors.").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    const url = new URL(page.url());
    expect(url.pathname).toBe(`/advisors/avery-stone-${ADVISOR_ID}`);
    expect(url.searchParams.get("ids")).toBe("adv-a,adv-b,adv-c,adv-d");
    await captureViewports(page, "issue-810-compare-entry-cap-message");
    await page.close();
  });
});

/**
 * Routes the public advisor directory to one deterministic row.
 * @param page - Browser page under test.
 */
async function routeAdvisorDirectory(page: Page): Promise<void> {
  await page.route("**/PublicAdvisors?**", async route => {
    await route.fulfill({
      json: {
        items: [
          {
            id: ADVISOR_ID,
            legalName: "Avery Stone",
            preferredName: "Avery Stone",
            lastName: "Stone",
            careerStatus: "active",
            yearsExperience: 12,
            finraCrd: "12345",
            headshotUrl: null,
          },
        ],
        nextCursor: null,
        total: 1,
      },
    });
  });
}

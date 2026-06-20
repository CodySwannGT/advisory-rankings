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
const COMPARE_BUTTON_SELECTOR = ".compare-entry-button";
const ADVISOR_DIRECTORY_ROW_SELECTOR = ".advisor-directory-row";
const READINESS_BADGE_SELECTOR = ".advisor-readiness-badge";
const CONTACT_READY_LABEL = "Contact ready";
const SECOND_ADVISOR_ID = "advisor-watch-2";

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

  it("selects directory advisors in place before opening comparison", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeAdvisorDirectory(page);

    await page.goto(`${baseUrl}/advisors`, {
      waitUntil: "domcontentloaded",
    });

    const rows = page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR);
    await rows.first().waitFor({ timeout: QUICK_TIMEOUT });
    await rows.nth(0).locator(COMPARE_BUTTON_SELECTOR).click();

    expect(new URL(page.url()).pathname).toBe("/advisors");
    await page.getByText("1 selected").waitFor({ timeout: QUICK_TIMEOUT });
    await rows.nth(1).locator(COMPARE_BUTTON_SELECTOR).click();
    await page.getByText("2 selected").waitFor({ timeout: QUICK_TIMEOUT });

    await Promise.all([
      page.waitForURL(
        new RegExp(`/compare\\?ids=${ADVISOR_ID},${SECOND_ADVISOR_ID}$`, "u")
      ),
      page.getByRole("button", { name: "Compare now" }).click(),
    ]);

    expect(new URL(page.url()).searchParams.get("ids")).toBe(
      `${ADVISOR_ID},${SECOND_ADVISOR_ID}`
    );
    await captureViewports(page, "issue-1165-directory-in-place-compare");
    await page.close();
  });

  it("renders shareable contact-readiness finder state", async () => {
    const page = await browser.newPage();
    const advisorRequests: string[] = [];
    await routeAuth(page, false);
    await routeAdvisorDirectory(page, advisorRequests);

    await page.goto(
      `${baseUrl}/advisors?contactReadiness=ready&profileSubstance=present&hasCrd=true&freshness=unknown`,
      { waitUntil: "domcontentloaded" }
    );

    await page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR).first().waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await expectFinderState(page, advisorRequests);
    await captureViewports(page, "issue-1327-readiness-finder");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR).first().waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));
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
    await card.locator(COMPARE_BUTTON_SELECTOR).click();
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
 * @param requests - Captured PublicAdvisors request URLs.
 */
async function routeAdvisorDirectory(
  page: Page,
  requests: string[] = []
): Promise<void> {
  await page.route("**/PublicAdvisors?**", async route => {
    requests.push(route.request().url());
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
            readiness: readyReadiness("present"),
          },
          {
            id: SECOND_ADVISOR_ID,
            legalName: "Blake Carter",
            preferredName: "Blake Carter",
            lastName: "Carter",
            careerStatus: "active",
            yearsExperience: 9,
            finraCrd: "67890",
            headshotUrl: null,
            readiness: readyReadiness("present"),
          },
        ],
        nextCursor: null,
        total: 2,
      },
    });
  });
}

/**
 * Asserts URL-backed readiness controls and visible row badges.
 * @param page - Browser page under test.
 * @param requests - Captured PublicAdvisors request URLs.
 */
async function expectFinderState(
  page: Page,
  requests: readonly string[]
): Promise<void> {
  await expectControlValue(page, "contactReadiness", "ready");
  await expectControlValue(page, "profileSubstance", "present");
  await expectControlValue(page, "hasCrd", "true");
  await expectControlValue(page, "freshness", "unknown");
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: CONTACT_READY_LABEL })
    .first()
    .waitFor({
      timeout: QUICK_TIMEOUT,
    });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: "Profile substance" })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: "CRD present" })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  expect(
    requests.some(url => {
      const requestUrl = new URL(url);
      return (
        requestUrl.searchParams.get("contactReadiness") === "ready" &&
        requestUrl.searchParams.get("profileSubstance") === "present" &&
        requestUrl.searchParams.get("hasCrd") === "true" &&
        requestUrl.searchParams.get("freshness") === "unknown"
      );
    })
  ).toBe(true);
}

/**
 * Asserts a form control value by name.
 * @param page - Browser page under test.
 * @param name - Control name.
 * @param value - Expected value.
 */
async function expectControlValue(
  page: Page,
  name: string,
  value: string
): Promise<void> {
  await expect(page.locator(`[name="${name}"]`).inputValue()).resolves.toBe(
    value
  );
}

/**
 * Builds a deterministic public readiness payload.
 * @param profileSubstance - Profile substance status.
 * @returns Advisor readiness payload.
 */
function readyReadiness(profileSubstance: string): object {
  return {
    contact: "ready",
    profileSubstance,
    crd: "present",
    freshness: "unknown",
    fields: {
      businessEmail: "present",
      businessPhone: "present",
      linkedinUrl: "present",
      headshotUrl: "present",
      bioText: "present",
      crd: "present",
    },
    limitations: [
      "Research freshness is unavailable from public source checks.",
    ],
  };
}

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADVISOR_ID,
  baseUrlOf,
  captureViewports,
  type CapturedPost,
  feedWithDisclosure,
  LIST_NAME,
  QUICK_TIMEOUT,
  routeAdvisor,
  routeAuth,
  routeWatchlists,
  SHOTS,
  startStaticServer,
  WATCHLISTS_ROUTE,
  waitForPost,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe =
  process.env.RUN_WEB_WATCHLIST_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;
const COMPARISON_TABLE_SELECTOR = ".comparison-table";
const COMPARISON_AFTER_REMOVE = "adv-a,adv-c";
const COMPARISON_AFTER_REORDER = "adv-c,adv-a";
const MOVE_ADVISOR_1_LEFT = "Move Advisor 1 left";
const REMOVE_ADVISOR_2 = "Remove Advisor 2";

browserDescribe("watchlist management UI (#228)", () => {
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

  it("gates anonymous watchlist actions with a safe sign-in path", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeAdvisor(page);
    await page.route(WATCHLISTS_ROUTE, async route => {
      await route.fulfill({ json: { authenticated: false, lists: [] } });
    });

    await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
      waitUntil: "domcontentloaded",
    });

    const card = page.locator(".add-watchlist-card");
    const signIn = card.getByRole("link", { name: /sign in/iu });
    await signIn.waitFor({ timeout: QUICK_TIMEOUT });
    expect(await signIn.getAttribute("href")).toBe("/login");
    expect(await card.locator(".add-watchlist-select").count()).toBe(0);
    expect(await page.getByText(LIST_NAME).count()).toBe(0);

    await page.goto(`${baseUrl}/watchlists.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByText(/sign in to create and manage/iu).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await page.close();
  });

  it("adds an advisor to a chosen watchlist from the advisor profile", async () => {
    const page = await browser.newPage();
    const posts: CapturedPost[] = [];
    await routeAuth(page, true);
    await routeAdvisor(page);
    await routeWatchlists(page, body => posts.push({ body }), [
      { id: "list-1", name: LIST_NAME, entries: [] },
    ]);

    await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
      waitUntil: "domcontentloaded",
    });

    const card = page.locator(".add-watchlist-card");
    await card.locator(".add-watchlist-select").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await card.locator(".add-watchlist-add").click();
    await card.getByText(`Added to ${LIST_NAME}.`).waitFor({
      timeout: QUICK_TIMEOUT,
    });

    const addEntry = posts.find(post => post.body.action === "addEntry");
    expect(addEntry?.body).toEqual({
      action: "addEntry",
      listId: "list-1",
      advisorId: ADVISOR_ID,
      rank: 1,
      note: "",
    });

    await captureViewports(page, "issue-228-add-from-profile");
    await page.close();
  });

  it("persists rank reorder and note edits on the watchlist page", async () => {
    const page = await browser.newPage();
    const posts: CapturedPost[] = [];
    await routeAuth(page, true);
    await routeWatchlists(page, body => posts.push({ body }), [
      {
        id: "list-1",
        name: LIST_NAME,
        entries: [
          { id: "e1", listId: "list-1", advisorId: "adv-a", rank: 1, note: "" },
          { id: "e2", listId: "list-1", advisorId: "adv-b", rank: 2, note: "" },
        ],
      },
    ]);

    await page.goto(`${baseUrl}/watchlists.html`, {
      waitUntil: "domcontentloaded",
    });

    const rows = page.locator(".watchlist-firm-row");
    await rows.first().waitFor({ timeout: QUICK_TIMEOUT });
    expect(await rows.count()).toBe(2);

    await rows.first().locator(".watchlist-move--down").click();
    await waitForPost(posts, post => post.body.action === "updateEntry");
    const reorder = posts.find(
      post =>
        post.body.action === "updateEntry" && post.body.advisorId === "adv-a"
    );
    expect(reorder?.body.rank).toBe(2);

    await rows.first().locator('input[name="note"]').fill("watch closely");
    await rows.first().locator(".watchlist-save-note").click();
    await waitForPost(
      posts,
      post =>
        post.body.action === "updateEntry" && post.body.note === "watch closely"
    );

    await captureViewports(page, "issue-228-watchlist-reorder-note");
    await page.close();
  });

  it("starts a URL-backed comparison from selected watchlist advisors", async () => {
    const page = await browser.newPage();
    await routeAuth(page, true);
    await page.route("**/AdvisorComparison?**", async route => {
      await route.fulfill({ json: comparisonPayload(["adv-a", "adv-b"]) });
    });
    await routeWatchlists(page, () => undefined, [
      {
        id: "list-1",
        name: LIST_NAME,
        entries: [
          { id: "e1", listId: "list-1", advisorId: "adv-a", rank: 1, note: "" },
          { id: "e2", listId: "list-1", advisorId: "adv-b", rank: 2, note: "" },
          { id: "e3", listId: "list-1", advisorId: "adv-c", rank: 3, note: "" },
        ],
      },
    ]);

    await page.goto(`${baseUrl}/watchlists.html`, {
      waitUntil: "domcontentloaded",
    });

    const button = page.locator(".watchlist-compare-button");
    await button.waitFor({ timeout: QUICK_TIMEOUT });
    expect(await button.isDisabled()).toBe(true);
    await page.locator('.watchlist-compare-select[value="adv-a"]').check();
    await page.locator('.watchlist-compare-select[value="adv-b"]').check();
    expect(await button.isEnabled()).toBe(true);

    await Promise.all([
      page.waitForURL(/\/compare\?ids=adv-a,adv-b$/u),
      button.click(),
    ]);

    expect(new URL(page.url()).searchParams.get("ids")).toBe("adv-a,adv-b");
    await page
      .locator(COMPARISON_TABLE_SELECTOR)
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page
      .locator(".comparison-source-attribution")
      .getByText(/FINRA BrokerCheck/iu)
      .first()
      .waitFor({ timeout: QUICK_TIMEOUT });
    expect(
      await page
        .locator(
          '.comparison-source-attribution a[href*="brokercheck.finra.org/terms"]'
        )
        .count()
    ).toBe(2);
    expect(
      await page
        .getByText("No BrokerCheck snapshot loaded for this advisor.")
        .count()
    ).toBe(2);
    await captureViewports(page, "issue-812-watchlist-seed-comparison");
    await page.close();
  });

  it("removes and reorders comparison columns through the share URL", async () => {
    const page = await browser.newPage();
    await routeAuth(page, true);
    await page.route("**/AdvisorComparison?**", async route => {
      await route.fulfill({
        json: comparisonPayload(comparisonIdsFromUrl(route.request().url())),
      });
    });

    await page.goto(`${baseUrl}/compare?ids=adv-a,adv-b,adv-c`, {
      waitUntil: "domcontentloaded",
    });

    await page.locator(COMPARISON_TABLE_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    const controls = page.locator(".comparison-control");
    expect(
      await controls.evaluateAll(buttons =>
        buttons.map(button => button.textContent?.trim() || "")
      )
    ).toEqual(["", "", "", "", "", "", "", "", ""]);
    expect(
      await page
        .getByRole("button", { name: MOVE_ADVISOR_1_LEFT })
        .getAttribute("title")
    ).toBe(MOVE_ADVISOR_1_LEFT);
    expect(
      await page
        .getByRole("button", { name: REMOVE_ADVISOR_2 })
        .getAttribute("title")
    ).toBe(REMOVE_ADVISOR_2);
    expect(await comparisonColumnIds(page)).toEqual([
      "adv-a",
      "adv-b",
      "adv-c",
    ]);

    await page.getByRole("button", { name: REMOVE_ADVISOR_2 }).click();
    expect(new URL(page.url()).searchParams.get("ids")).toBe(
      COMPARISON_AFTER_REMOVE
    );
    expect(await comparisonColumnIds(page)).toEqual(
      COMPARISON_AFTER_REMOVE.split(",")
    );

    await page.getByRole("button", { name: "Move Advisor 3 left" }).click();
    expect(new URL(page.url()).searchParams.get("ids")).toBe(
      COMPARISON_AFTER_REORDER
    );
    expect(await comparisonColumnIds(page)).toEqual(
      COMPARISON_AFTER_REORDER.split(",")
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(COMPARISON_TABLE_SELECTOR).waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(await comparisonColumnIds(page)).toEqual(
      COMPARISON_AFTER_REORDER.split(",")
    );

    await captureViewports(page, "issue-811-comparison-reorder-url");
    await page.close();
  });

  it("adds an advisor to a watchlist from the feed discovery surface", async () => {
    const page = await browser.newPage();
    const posts: CapturedPost[] = [];
    await routeAuth(page, true);
    await routeWatchlists(page, body => posts.push({ body }), [
      { id: "list-1", name: LIST_NAME, entries: [] },
    ]);
    await page.route("**/Feed", async route => {
      await route.fulfill({ json: feedWithDisclosure() });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });

    const toggle = page.locator(".discovery-row .add-watchlist-toggle").first();
    await toggle.waitFor({ timeout: QUICK_TIMEOUT });
    await toggle.click();
    await page
      .locator(".discovery-row .add-watchlist-select")
      .first()
      .waitFor({ timeout: QUICK_TIMEOUT });
    await page.locator(".discovery-row .add-watchlist-add").first().click();

    await waitForPost(posts, post => post.body.action === "addEntry");
    const addEntry = posts.find(post => post.body.action === "addEntry");
    expect(addEntry?.body.advisorId).toBe(ADVISOR_ID);
    expect(addEntry?.body.listId).toBe("list-1");
    await page.close();
  });
});

/**
 * Builds the minimal comparison payload needed by the route under test.
 * @param ids - Advisor ids selected from the watchlist.
 * @returns AdvisorComparison-like route payload.
 */
function comparisonPayload(ids: readonly string[]): unknown {
  return {
    generatedAt: "2026-06-01T00:00:00.000Z",
    ids,
    count: ids.length,
    selection: {
      requestedIds: ids,
      normalizedIds: ids,
      duplicateIds: [],
      missingIds: [],
      cappedIds: ids,
      min: 2,
      max: 4,
      truncated: false,
      status: ids.length < 2 ? "under_limit" : "ready",
    },
    items: ids.map((id, index) => comparisonItem(id, index)),
  };
}

/**
 * Builds one found advisor comparison row for the mocked resource.
 * @param id - Advisor id.
 * @param index - Display index.
 * @returns AdvisorComparison found item.
 */
function comparisonItem(id: string, index: number): unknown {
  return {
    id,
    status: "found",
    displayName: `Advisor ${index + 1}`,
    identity: {
      careerStatus: "active",
      yearsExperience: 10 + index,
    },
    firm: { name: `Firm ${index + 1}` },
    regulatory: {
      disclosureCount: index,
      registrationApplications: [],
      brokerCheckSnapshot:
        index === 0
          ? {
              subjectCrd: "12345",
              fetchedAt: "2026-05-02T12:00:00.000Z",
              disclosureCount: 1,
              employmentCount: 2,
            }
          : null,
    },
    career: [{ roleTitle: "Advisor", firm: { name: `Firm ${index + 1}` } }],
    rankings: [],
    articles: [],
    dataConfidence: {
      confidenceSummary: { hasData: true, total: 3 },
      evidenceFreshness: {
        hasData: true,
        lastCheckedAt: "2026-05-31T00:00:00.000Z",
      },
    },
    attribution: { researchSources: [] },
  };
}

/**
 * Reads comma-separated comparison ids from a routed resource URL.
 * @param url - AdvisorComparison request URL.
 * @returns Ordered advisor ids.
 */
function comparisonIdsFromUrl(url: string): readonly string[] {
  return (new URL(url).searchParams.get("ids") ?? "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);
}

/**
 * Reads the visible comparison advisor column ids from the table headers.
 * @param page - Browser page rendering the comparison table.
 * @returns Advisor ids in visible table order.
 */
async function comparisonColumnIds(page: Page): Promise<readonly string[]> {
  return await page
    .locator(`${COMPARISON_TABLE_SELECTOR} thead th[data-advisor-id]`)
    .evaluateAll(nodes =>
      nodes
        .map(node => node.dataset.advisorId)
        .filter((id): id is string => Boolean(id))
    );
}

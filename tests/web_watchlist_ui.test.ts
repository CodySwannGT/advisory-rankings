import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser } from "playwright";
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
    expect(await signIn.getAttribute("href")).toBe("/login.html");
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

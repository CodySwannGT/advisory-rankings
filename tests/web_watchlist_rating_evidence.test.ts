import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADVISOR_ID,
  baseUrlOf,
  captureViewports,
  type CapturedPost,
  LIST_NAME,
  QUICK_TIMEOUT,
  RATING_ROUTE,
  routeAdvisor,
  routeAuth,
  routeComparison,
  routeRating,
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

const NOTE_RETAIN_FOR_REVIEW = "retain for review";
const REVIEW_TEXT_STRONG_FIT = "Strong fit for recruiting follow-up.";
const COMPARE_PRIVATE_NOTE = "priority retention call";
const COMPARISON_PRIVATE_SELECTOR = ".comparison-private";

let baseUrl = "";

interface EntryFixture {
  readonly id: string;
  readonly listId: string;
  readonly advisorId: string;
  readonly rank: number;
  readonly note: string;
}

interface ListFixture {
  readonly id: string;
  readonly name: string;
  entries: EntryFixture[];
}

browserDescribe("watchlist and rating evidence (#232)", () => {
  let browser: Browser;
  let server: Server;

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

  it("captures persistence evidence for signed-in watchlists and ratings", async () => {
    const page = await browser.newPage();
    try {
      const watchlistPosts: CapturedPost[] = [];
      const ratingPosts: CapturedPost[] = [];
      const lists = mutableLists();

      await routeAuth(page, true);
      await routeAdvisor(page, false);
      await routeStatefulWatchlists(page, watchlistPosts, lists);
      await routeRating(page, body => ratingPosts.push({ body }), null);

      await createWatchlist(page);
      await addAdvisorFromProfile(page, watchlistPosts);
      await persistRankAndNote(page, watchlistPosts);
      await persistRating(page, ratingPosts);
      expect(watchlistPosts.length).toBeGreaterThan(0);
      expect(ratingPosts.length).toBeGreaterThan(0);
      await captureViewports(page, "issue-232-watchlist-rating-mobile");
    } finally {
      await page.close();
    }
  });

  it("captures auth-gated mutation payloads and safe sign-in guidance", async () => {
    const page = await browser.newPage();
    try {
      const blockedPayloads: CapturedPost[] = [];

      await routeAuth(page, false);
      await routeAdvisor(page, false);
      await routeBlockedMutations(page, blockedPayloads);

      await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByText(/sign in to add private ratings/iu)
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page
        .getByText(/sign in to create and manage private watchlists/iu)
        .waitFor({ timeout: QUICK_TIMEOUT });

      const statuses = await page.evaluate(
        async ({
          advisorId,
          listName,
        }: {
          advisorId: string;
          listName: string;
        }) =>
          await Promise.all([
            fetch("/UserWatchlists", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "create", name: listName }),
            }).then(response => response.status),
            fetch(`/AdvisorRating/${advisorId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ratingInt: 5, reviewText: "private" }),
            }).then(response => response.status),
          ]),
        { advisorId: ADVISOR_ID, listName: LIST_NAME }
      );

      expect(statuses).toEqual([401, 401]);
      expect(blockedPayloads).toHaveLength(2);
      expect(blockedPayloads.map(post => post.body)).toEqual(
        expect.arrayContaining([
          { action: "create", name: LIST_NAME },
          { ratingInt: 5, reviewText: "private" },
        ])
      );
      await captureViewports(page, "issue-232-auth-gate");
    } finally {
      await page.close();
    }
  });

  it("renders comparison private overlay only for signed-in owners", async () => {
    const page = await browser.newPage();
    try {
      await routeAuth(page, true);
      await routeComparison(page);
      await routeWatchlists(page, () => undefined, comparisonLists());
      await routeComparisonRatings(page);

      await page.goto(
        `${baseUrl}/compare.html?ids=${ADVISOR_ID},advisor-watch-2`,
        {
          waitUntil: "domcontentloaded",
        }
      );

      await page
        .locator(COMPARISON_PRIVATE_SELECTOR)
        .getByText(COMPARE_PRIVATE_NOTE)
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page
        .locator(COMPARISON_PRIVATE_SELECTOR)
        .getByText("Overall")
        .waitFor({ timeout: QUICK_TIMEOUT });
      await page
        .locator(COMPARISON_PRIVATE_SELECTOR)
        .getByText(REVIEW_TEXT_STRONG_FIT)
        .waitFor({ timeout: QUICK_TIMEOUT });
      await captureViewports(page, "issue-813-private-overlay-auth");
    } finally {
      await page.close();
    }
  });

  it("hides comparison private overlay when signed out", async () => {
    const page = await browser.newPage();
    try {
      const privateRequests: string[] = [];
      await routeAuth(page, false);
      await routeComparison(page);
      await routePrivateRequestTracker(page, privateRequests);

      await page.goto(
        `${baseUrl}/compare.html?ids=${ADVISOR_ID},advisor-watch-2`,
        {
          waitUntil: "domcontentloaded",
        }
      );
      await page.locator(".comparison-table").waitFor({
        timeout: QUICK_TIMEOUT,
      });

      expect(await page.locator(COMPARISON_PRIVATE_SELECTOR).count()).toBe(0);
      expect(privateRequests).toHaveLength(0);
      await captureViewports(page, "issue-813-private-overlay-signed-out");
    } finally {
      await page.close();
    }
  });
});

function mutableLists(): ListFixture[] {
  return [
    {
      id: "list-1",
      name: LIST_NAME,
      entries: [
        {
          id: "entry-b",
          listId: "list-1",
          advisorId: "advisor-b",
          rank: 1,
          note: "",
        },
      ],
    },
  ];
}

function comparisonLists(): ListFixture[] {
  return [
    {
      id: "list-compare",
      name: LIST_NAME,
      entries: [
        {
          id: "entry-compare",
          listId: "list-compare",
          advisorId: ADVISOR_ID,
          rank: 1,
          note: COMPARE_PRIVATE_NOTE,
        },
      ],
    },
  ];
}

async function routeComparisonRatings(page: Page): Promise<void> {
  await page.route(RATING_ROUTE, async route => {
    const advisorId = new URL(route.request().url()).pathname
      .split("/")
      .filter(Boolean)
      .at(-1);
    await route.fulfill({
      json: {
        authenticated: true,
        rating:
          advisorId === ADVISOR_ID
            ? {
                advisorId: ADVISOR_ID,
                ratingInt: 5,
                responsiveness: 4,
                reviewText: REVIEW_TEXT_STRONG_FIT,
              }
            : null,
      },
    });
  });
}

async function routePrivateRequestTracker(
  page: Page,
  requests: string[]
): Promise<void> {
  await page.route(WATCHLISTS_ROUTE, async route => {
    requests.push(route.request().url());
    await route.fulfill({ json: { authenticated: false, lists: [] } });
  });
  await page.route(RATING_ROUTE, async route => {
    requests.push(route.request().url());
    await route.fulfill({ json: { authenticated: false, rating: null } });
  });
}

async function createWatchlist(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/watchlists.html`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator('.watchlist-create-form input[name="name"]')
    .fill("Diligence");
  await page.locator(".watchlist-create-form button").click();
  await page
    .locator('.watchlist-card[data-list-id="list-created"]')
    .waitFor({ timeout: QUICK_TIMEOUT });
}

async function addAdvisorFromProfile(
  page: Page,
  watchlistPosts: readonly CapturedPost[]
): Promise<void> {
  await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
    waitUntil: "domcontentloaded",
  });
  const card = page.locator(".add-watchlist-card");
  await card.locator(".add-watchlist-select").waitFor({
    timeout: QUICK_TIMEOUT,
  });
  await card.locator(".add-watchlist-select").selectOption("list-1");
  await card.locator(".add-watchlist-add").click();
  await waitForPost(
    watchlistPosts,
    post =>
      post.body.action === "addEntry" && post.body.advisorId === ADVISOR_ID
  );
  await card.getByText(`Added to ${LIST_NAME}.`).waitFor({
    timeout: QUICK_TIMEOUT,
  });
}

async function persistRankAndNote(
  page: Page,
  watchlistPosts: readonly CapturedPost[]
): Promise<void> {
  await page.goto(`${baseUrl}/watchlists.html`, {
    waitUntil: "domcontentloaded",
  });
  const rows = page.locator(".watchlist-firm-row");
  await rows.first().waitFor({ timeout: QUICK_TIMEOUT });
  await rows.first().locator(".watchlist-move--down").click();
  await waitForPost(
    watchlistPosts,
    post => post.body.action === "updateEntry" && post.body.rank === 2
  );
  await page.waitForFunction(
    advisorId =>
      document
        .querySelector(".watchlist-firm-row")
        ?.getAttribute("data-advisor-id") === advisorId,
    ADVISOR_ID,
    { timeout: QUICK_TIMEOUT }
  );
  const movedRow = page.locator(
    '.watchlist-firm-row[data-advisor-id="advisor-b"]'
  );
  await movedRow.waitFor({ timeout: QUICK_TIMEOUT });
  await movedRow.locator('input[name="note"]').fill(NOTE_RETAIN_FOR_REVIEW);
  await movedRow.locator(".watchlist-save-note").click();
  await waitForPost(
    watchlistPosts,
    post =>
      post.body.action === "updateEntry" &&
      post.body.note === NOTE_RETAIN_FOR_REVIEW
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    expectedNote =>
      document.querySelector<HTMLInputElement>(
        '.watchlist-firm-row[data-advisor-id="advisor-b"] input[name="note"]'
      )?.value === expectedNote,
    NOTE_RETAIN_FOR_REVIEW,
    { timeout: QUICK_TIMEOUT }
  );
}

async function persistRating(
  page: Page,
  ratingPosts: readonly CapturedPost[]
): Promise<void> {
  await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('.private-rating-form input[name="ratingInt"]').fill("5");
  await page
    .locator('.private-rating-form input[name="responsiveness"]')
    .fill("4");
  await page
    .locator('.private-rating-form textarea[name="reviewText"]')
    .fill(REVIEW_TEXT_STRONG_FIT);
  await page.locator(".private-rating-save").click();
  await waitForPost(
    ratingPosts,
    post => post.body.reviewText === REVIEW_TEXT_STRONG_FIT
  );
  await page.getByText("Saved.").waitFor({ timeout: QUICK_TIMEOUT });
  await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    expectedReview =>
      document.querySelector<HTMLInputElement>(
        '.private-rating-form input[name="ratingInt"]'
      )?.value === "5" &&
      document.querySelector<HTMLTextAreaElement>(
        '.private-rating-form textarea[name="reviewText"]'
      )?.value === expectedReview,
    REVIEW_TEXT_STRONG_FIT,
    { timeout: QUICK_TIMEOUT }
  );
}

async function routeStatefulWatchlists(
  page: Page,
  posts: CapturedPost[],
  lists: ListFixture[]
): Promise<void> {
  await page.route(WATCHLISTS_ROUTE, async route => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ json: { authenticated: true, lists } });
      return;
    }
    const body = route.request().postDataJSON() as Readonly<
      Record<string, unknown>
    >;
    posts.push({ body });
    const list = applyWatchlistMutation(lists, body);
    await route.fulfill({ json: { authenticated: true, list } });
  });
}

function applyWatchlistMutation(
  lists: ListFixture[],
  body: Readonly<Record<string, unknown>>
): ListFixture | undefined {
  if (body.action === "create") {
    const list: ListFixture = {
      id: "list-created",
      name: String(body.name),
      entries: [],
    };
    lists.push(list);
    return list;
  }
  const list = lists.find(candidate => candidate.id === body.listId);
  if (!list) return undefined;
  if (body.action === "addEntry") return addEntry(list, body);
  if (body.action === "updateEntry") return updateEntry(list, body);
  return list;
}

function addEntry(
  list: ListFixture,
  body: Readonly<Record<string, unknown>>
): ListFixture {
  const entry = {
    id: `entry-${String(body.advisorId)}`,
    listId: list.id,
    advisorId: String(body.advisorId),
    rank: Number(body.rank),
    note: String(body.note ?? ""),
  };
  replaceEntries(list, [...list.entries, entry]);
  return list;
}

function updateEntry(
  list: ListFixture,
  body: Readonly<Record<string, unknown>>
): ListFixture {
  replaceEntries(
    list,
    list.entries.map(entry =>
      entry.advisorId === body.advisorId
        ? { ...entry, rank: Number(body.rank), note: String(body.note ?? "") }
        : entry
    )
  );
  return list;
}

function replaceEntries(
  list: ListFixture,
  entries: readonly EntryFixture[]
): void {
  Object.assign(list, {
    entries: [...entries].sort((left, right) => left.rank - right.rank),
  });
}

async function routeBlockedMutations(
  page: Page,
  posts: CapturedPost[]
): Promise<void> {
  const block = async (route: Route): Promise<void> => {
    if (route.request().method() === "POST") {
      posts.push({
        body: route.request().postDataJSON() as Readonly<
          Record<string, unknown>
        >,
      });
      await route.fulfill({ status: 401, json: { error: "sign in required" } });
      return;
    }
    if (route.request().url().includes("/AdvisorRating/")) {
      await route.fulfill({ json: { authenticated: false, rating: null } });
      return;
    }
    await route.fulfill({ json: { authenticated: false, lists: [] } });
  };
  await page.route(WATCHLISTS_ROUTE, block);
  await page.route(RATING_ROUTE, block);
}

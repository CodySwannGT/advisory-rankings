import type { Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  DEPLOYED_DATA_TIMEOUT,
  check,
  type Check,
} from "./web_smoke_support.js";

const FEED_PAGE_SIZE = 20;
const FEED_LOAD_MORE_SELECTOR = ".feed-load-more";

/** Feed load-more interaction result. */
interface FeedLoadMoreResult {
  readonly afterCount: number;
  readonly appended: boolean;
  readonly beforeCount: number;
  readonly duplicateLinks: readonly string[];
  readonly initialCount: number;
  readonly noDuplicateLinks: boolean;
}

/**
 * Checks that the public feed is initially bounded and progressively loads.
 * @param page - Browser page positioned on the feed.
 * @returns Smoke assertions for feed pagination.
 */
export async function smokeFeedPagination(
  page: Page
): Promise<readonly Check[]> {
  const loadMoreBehavior = await exerciseFeedLoadMore(page);
  return [
    check(
      loadMoreBehavior.initialCount <= FEED_PAGE_SIZE,
      "/ feed: initial render stays within first-page budget",
      String(loadMoreBehavior.initialCount)
    ),
    check(
      loadMoreBehavior.appended,
      "/ feed: Load more appends additional posts",
      `${loadMoreBehavior.beforeCount} -> ${loadMoreBehavior.afterCount}`
    ),
    check(
      loadMoreBehavior.noDuplicateLinks,
      "/ feed: Load more does not duplicate existing post links",
      loadMoreBehavior.duplicateLinks.slice(0, 3).join(", ")
    ),
    check(
      loadMoreBehavior.afterCount <= FEED_PAGE_SIZE * 2,
      "/ feed: second page remains bounded",
      String(loadMoreBehavior.afterCount)
    ),
  ];
}

/**
 * Loads feed pages until a known card appears, preserving the user path.
 * @param page - Browser page positioned on the feed.
 * @param text - Visible card text to reveal.
 */
export async function revealFeedCard(page: Page, text: string): Promise<void> {
  const card = page.locator(ARTICLE_CARD_SELECTOR).filter({ hasText: text });
  const loadMore = page.locator(FEED_LOAD_MORE_SELECTOR);
  await revealFeedLocatorAttempt(page, card, loadMore, 1);
}

/**
 * Loads feed pages until a selector appears in the rendered feed.
 * @param page - Browser page positioned on the feed.
 * @param selector - Selector to reveal.
 */
export async function revealFeedSelector(
  page: Page,
  selector: string
): Promise<void> {
  const target = page.locator(selector);
  const loadMore = page.locator(FEED_LOAD_MORE_SELECTOR);
  await revealFeedLocatorAttempt(page, target, loadMore, 1);
}

/**
 * Recursively loads bounded feed pages until a locator is visible.
 * @param page - Browser page positioned on the feed.
 * @param target - Locator to reveal.
 * @param loadMore - Feed load-more control.
 * @param attempt - Current attempt count.
 */
async function revealFeedLocatorAttempt(
  page: Page,
  target: ReturnType<Page["locator"]>,
  loadMore: ReturnType<Page["locator"]>,
  attempt: number
): Promise<void> {
  if (await target.first().isVisible()) return;
  if ((await loadMore.count()) === 0 || attempt > 30) {
    await target.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
    return;
  }
  const previousCount = await page.locator(ARTICLE_CARD_SELECTOR).count();
  await loadMore.click();
  await page.waitForFunction(
    ({ articleSelector, count }) =>
      document.querySelectorAll(articleSelector).length > count,
    { articleSelector: ARTICLE_CARD_SELECTOR, count: previousCount },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  await revealFeedLocatorAttempt(page, target, loadMore, attempt + 1);
}

/**
 * Clicks the progressive feed loading control when more posts are available.
 * @param page - Browser page positioned on the feed.
 * @returns Load-more count and duplicate-link checks.
 */
async function exerciseFeedLoadMore(page: Page): Promise<FeedLoadMoreResult> {
  const cards = page.locator(ARTICLE_CARD_SELECTOR);
  const loadMore = page.locator(FEED_LOAD_MORE_SELECTOR);
  const beforeCount = await cards.count();
  const beforeLinks = await feedPostLinks(page);

  if ((await loadMore.count()) === 0) {
    return {
      afterCount: beforeCount,
      appended: true,
      beforeCount,
      duplicateLinks: [],
      initialCount: beforeCount,
      noDuplicateLinks: true,
    };
  }

  await loadMore.click();
  await page.waitForFunction(
    ({ articleSelector, previousCount }) =>
      document.querySelectorAll(articleSelector).length > previousCount,
    { articleSelector: ARTICLE_CARD_SELECTOR, previousCount: beforeCount },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  const afterLinks = await feedPostLinks(page);
  const appendedLinks = afterLinks.slice(beforeLinks.length);
  const beforeLinkSet = new Set(beforeLinks);
  const duplicateLinks = appendedLinks.filter(link => beforeLinkSet.has(link));

  return {
    afterCount: await cards.count(),
    appended: afterLinks.length > beforeLinks.length,
    beforeCount,
    duplicateLinks,
    initialCount: beforeCount,
    noDuplicateLinks: duplicateLinks.length === 0,
  };
}

/**
 * Reads stable article links from rendered feed cards.
 * @param page - Browser page positioned on the feed.
 * @returns Feed card article hrefs.
 */
async function feedPostLinks(page: Page): Promise<readonly string[]> {
  return await page
    .locator(`${ARTICLE_CARD_SELECTOR} .post-headline a`)
    .evaluateAll(links =>
      links.map(link => link.getAttribute("href") || "").filter(Boolean)
    );
}

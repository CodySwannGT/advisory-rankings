import type { Page } from "playwright";
import {
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  shot,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const ARTICLE_CARD = "article.card";
const EVENT_CARD = ".event-card";
const FEED_MODE_SELECT = 'form.feed-filters select[name="mode"]';
const FEED_CATEGORY_SELECT = 'form.feed-filters select[name="category"]';
const FILTER_EMPTY_TEXT = "text=No feed posts match these filters";

/** Minimal event card shape returned by the feed resource. */
interface FeedEvent {
  readonly kind?: string;
}

/** Minimal feed item shape needed for filter smoke assertions. */
interface FeedItem {
  readonly article?: { readonly category?: string };
  readonly eventCards?: readonly FeedEvent[];
}

/** Feed resource envelope used by the browser-side helper. */
interface FeedResponse {
  readonly items?: readonly FeedItem[];
}

/** Result captured after exercising event-backed filter state. */
interface EventFilterResult {
  readonly url: string;
  readonly cardCount: number;
  readonly allHaveCards: boolean;
}

/**
 * Checks feed filter URL state, event-backed rows, and filtered empty states.
 * @param page - Browser page already positioned on the feed.
 * @returns Smoke assertions for feed filters.
 */
export async function smokeFeedFilters(page: Page): Promise<readonly Check[]> {
  const eventFilter = await selectEventBackedMode(page);
  const emptyCategory = await feedCategoryWithoutMoves(page);
  const emptyVisible = emptyCategory
    ? await selectEmptyMoveCategory(page, emptyCategory)
    : true;

  return [
    check(
      eventFilter.url.includes("mode=event"),
      "/ feed filters: event-backed mode persists in URL",
      eventFilter.url
    ),
    check(
      eventFilter.cardCount >= 1,
      "/ feed filters: event-backed mode keeps matching posts visible"
    ),
    check(
      eventFilter.allHaveCards,
      "/ feed filters: event-backed rows all include event cards"
    ),
    check(
      emptyVisible,
      "/ feed filters: zero-result combinations show explicit empty state"
    ),
  ];
}

/**
 * Selects event-backed mode and verifies it survives a page reload.
 * @param page - Browser page on the feed.
 * @returns Result details after reload.
 */
async function selectEventBackedMode(page: Page): Promise<EventFilterResult> {
  await page.locator(FEED_MODE_SELECT).selectOption("event");
  await page.waitForURL(
    url => new URL(url).searchParams.get("mode") === "event",
    { timeout: QUICK_UI_TIMEOUT }
  );
  await waitForAllCardsToHaveEvents(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await shot(page, "01-feed-event-filter");

  return {
    url: page.url(),
    cardCount: await page.locator(ARTICLE_CARD).count(),
    allHaveCards: await allCardsHaveEvents(page),
  };
}

/**
 * Selects a move/category combination known to have no rows.
 * @param page - Browser page on the feed.
 * @param category - Category with no transition event rows.
 * @returns Whether the explicit empty state became visible.
 */
async function selectEmptyMoveCategory(
  page: Page,
  category: string
): Promise<boolean> {
  await page.locator(FEED_MODE_SELECT).selectOption("moves");
  await page.locator(FEED_CATEGORY_SELECT).selectOption(category);
  await page.waitForSelector(FILTER_EMPTY_TEXT, { timeout: QUICK_UI_TIMEOUT });
  await shot(page, "01-feed-empty-filter");
  return (await page.locator(FILTER_EMPTY_TEXT).count()) >= 1;
}

/**
 * Waits until every rendered feed card has at least one event card.
 * @param page - Browser page on the feed.
 */
async function waitForAllCardsToHaveEvents(page: Page): Promise<void> {
  await page.waitForFunction(
    selectors =>
      [...document.querySelectorAll(selectors.article)].every(
        card => card.querySelectorAll(selectors.event).length > 0
      ),
    { article: ARTICLE_CARD, event: EVENT_CARD },
    { timeout: QUICK_UI_TIMEOUT }
  );
}

/**
 * Checks rendered feed cards for inline event content.
 * @param page - Browser page on the feed.
 * @returns Whether all visible article cards include event cards.
 */
async function allCardsHaveEvents(page: Page): Promise<boolean> {
  return await page
    .locator(ARTICLE_CARD)
    .evaluateAll(
      (cards, eventSelector) =>
        cards.every(
          card => card.querySelectorAll(String(eventSelector)).length > 0
        ),
      EVENT_CARD
    );
}

/**
 * Finds a loaded feed category that should produce an empty recruiting-moves view.
 * @param page - Browser page used for the scenario.
 * @returns Category value or empty string when every category has a move.
 */
async function feedCategoryWithoutMoves(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const data = (await fetch("/Feed").then(response =>
      response.json()
    )) as FeedResponse;
    const items = Array.isArray(data.items) ? data.items : [];
    const categories = new Set(
      items.map(item => item.article?.category).filter(Boolean)
    );
    const moveCategories = new Set(
      items
        .filter(item =>
          (item.eventCards || []).some(event => event.kind === "transition")
        )
        .map(item => item.article?.category)
        .filter(Boolean)
    );
    return (
      [...categories].find(category => !moveCategories.has(category)) || ""
    );
  });
}

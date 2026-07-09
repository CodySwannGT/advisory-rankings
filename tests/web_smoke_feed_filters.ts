import type { Page } from "playwright";
import {
  BASE,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const ARTICLE_CARD = "article.card";
const EVENT_CARD = ".event-card";
const FEED_LOAD_MORE = ".feed-load-more";
const FEED_APPLY_BUTTON = 'form.feed-filters button[type="submit"]';
const FEED_MODE_SELECT = 'form.feed-filters select[name="mode"]';
const FEED_CATEGORY_SELECT = 'form.feed-filters select[name="category"]';
const FEED_FILTER_SUMMARY = ".feed-filter-summary";
const FILTER_EMPTY_TEXT = "text=No feed posts match these filters";
const SEMANTIC_URL_CATEGORY = "firm_bio";

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
  readonly afterLoadCount: number;
  readonly afterLoadUrl: string;
  readonly allHaveCards: boolean;
  readonly applyButtonCount: number;
  readonly cardCount: number;
  readonly noDuplicateLinks: boolean;
  readonly url: string;
}

interface SemanticModeResult {
  readonly allHaveCards: boolean;
  readonly canonicalUrl: boolean;
  readonly selectedMode: string;
  readonly summary: string;
  readonly summaryMatches: boolean;
  readonly url: string;
}

interface UnsupportedModeResult {
  readonly normalizedUrl: boolean;
  readonly selectedMode: string;
  readonly url: string;
}

/**
 * Checks feed filter URL state, event-backed rows, and filtered empty states.
 * @param page - Browser page already positioned on the feed.
 * @returns Smoke assertions for feed filters.
 */
export async function smokeFeedFilters(page: Page): Promise<readonly Check[]> {
  const semanticMode = await verifySemanticModeUrl(page);
  const unsupportedMode = await verifyUnsupportedModeUrl(page);
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const eventFilter = await selectEventBackedMode(page);
  const emptyCategory = await feedCategoryWithoutMoves(
    page,
    FEED_CATEGORY_SELECT
  );
  const emptyVisible = emptyCategory
    ? await selectEmptyMoveCategory(page, emptyCategory)
    : true;

  return feedFilterChecks(
    semanticMode,
    unsupportedMode,
    eventFilter,
    emptyVisible
  );
}

function feedFilterChecks(
  semanticMode: SemanticModeResult,
  unsupportedMode: UnsupportedModeResult,
  eventFilter: EventFilterResult,
  emptyVisible: boolean
): readonly Check[] {
  return [
    semanticModeCheck(semanticMode),
    unsupportedModeCheck(unsupportedMode),
    ...eventFilterModeChecks(eventFilter),
    check(
      eventFilter.afterLoadUrl === eventFilter.url,
      "/ feed filters: Load more preserves URL filter state",
      eventFilter.afterLoadUrl
    ),
    check(
      eventFilter.afterLoadCount >= eventFilter.cardCount,
      "/ feed filters: Load more keeps filtered posts visible",
      `${eventFilter.cardCount} -> ${eventFilter.afterLoadCount}`
    ),
    check(
      eventFilter.noDuplicateLinks,
      "/ feed filters: Load more appends unique filtered posts"
    ),
    check(
      emptyVisible,
      "/ feed filters: zero-result combinations show explicit empty state"
    ),
  ];
}

function eventFilterModeChecks(eventFilter: EventFilterResult) {
  return [
    check(
      eventFilter.url.includes("mode=event"),
      "/ feed filters: event-backed mode persists in URL",
      eventFilter.url
    ),
    check(
      eventFilter.applyButtonCount === 0,
      "/ feed filters: auto-applied controls omit redundant Apply button",
      String(eventFilter.applyButtonCount)
    ),
    check(
      eventFilter.cardCount >= 1,
      "/ feed filters: event-backed mode keeps matching posts visible"
    ),
    check(
      eventFilter.allHaveCards,
      "/ feed filters: event-backed rows all include event cards"
    ),
  ];
}

function semanticModeCheck(semanticMode: SemanticModeResult): Check {
  return check(
    semanticMode.canonicalUrl &&
      semanticMode.selectedMode === "event" &&
      semanticMode.summaryMatches &&
      semanticMode.allHaveCards,
    "/ feed filters: semantic event-backed URL canonicalizes to matching state",
    `${semanticMode.url} | ${semanticMode.selectedMode} | ${semanticMode.summary}`
  );
}

function unsupportedModeCheck(unsupportedMode: UnsupportedModeResult): Check {
  return check(
    unsupportedMode.normalizedUrl && unsupportedMode.selectedMode === "all",
    "/ feed filters: unsupported URL mode safely normalizes",
    `${unsupportedMode.url} | ${unsupportedMode.selectedMode}`
  );
}

/**
 * Opens the legacy semantic event-backed mode URL and verifies canonical state.
 * @param page - Browser page used for the scenario.
 * @returns Captured URL, select value, summary, and card state.
 */
async function verifySemanticModeUrl(page: Page): Promise<SemanticModeResult> {
  // Test the semantic-mode canonicalization (`event-backed` → `event`) on its
  // own. Pinning it to a hardcoded `category=firm_bio` was brittle: the deployed
  // dataset has event-backed posts and firm_bio posts but none that are both, so
  // the combo rendered an empty feed, and the category label ("Firm profile
  // updates") no longer matches the literal "firm bio" the summary was asserted
  // against. Category canonicalization/copy is covered by the other feed-filter
  // checks; here we verify only the mode state + event-card rows.
  await smokeGoto(page, `${BASE}/?mode=event-backed`);
  await page.waitForSelector(FEED_FILTER_SUMMARY, {
    timeout: QUICK_UI_TIMEOUT,
  });
  await waitForAllCardsToHaveEvents(page);
  await shot(page, "01-feed-semantic-mode-url");
  const url = page.url();
  const selectedMode = await page.locator(FEED_MODE_SELECT).inputValue();
  const summary = (await page.locator(FEED_FILTER_SUMMARY).textContent()) || "";
  return {
    allHaveCards: await allCardsHaveEvents(page),
    canonicalUrl: new URL(url).searchParams.get("mode") === "event",
    selectedMode,
    summary,
    summaryMatches: /event-backed/i.test(summary),
    url,
  };
}

/**
 * Opens an unsupported feed mode and verifies it is removed from URL state.
 * @param page - Browser page used for the scenario.
 * @returns Captured URL and selected mode.
 */
async function verifyUnsupportedModeUrl(
  page: Page
): Promise<UnsupportedModeResult> {
  await smokeGoto(
    page,
    `${BASE}/?mode=unsupported-feed-mode&category=${SEMANTIC_URL_CATEGORY}`
  );
  await page.waitForSelector(FEED_FILTER_SUMMARY, {
    timeout: QUICK_UI_TIMEOUT,
  });
  await shot(page, "01-feed-unsupported-mode-url");
  const url = page.url();
  return {
    normalizedUrl: !new URL(url).searchParams.has("mode"),
    selectedMode: await page.locator(FEED_MODE_SELECT).inputValue(),
    url,
  };
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
  const beforeLinks = await feedPostLinks(page);
  const cardCount = await page.locator(ARTICLE_CARD).count();
  const url = page.url();
  await clickLoadMoreIfAvailable(page);
  const afterLinks = await feedPostLinks(page);
  const appendedLinks = afterLinks.slice(beforeLinks.length);
  const beforeLinkSet = new Set(beforeLinks);

  return {
    afterLoadCount: await page.locator(ARTICLE_CARD).count(),
    afterLoadUrl: page.url(),
    applyButtonCount: await page.locator(FEED_APPLY_BUTTON).count(),
    cardCount,
    allHaveCards: await allCardsHaveEvents(page),
    noDuplicateLinks: appendedLinks.every(link => !beforeLinkSet.has(link)),
    url,
  };
}

/**
 * Clicks the feed load-more control when the current filtered view has one.
 * @param page - Browser page on the feed.
 */
async function clickLoadMoreIfAvailable(page: Page): Promise<void> {
  const loadMore = page.locator(FEED_LOAD_MORE);
  if ((await loadMore.count()) === 0) return;
  const previousCount = await page.locator(ARTICLE_CARD).count();
  await loadMore.click();
  await page.waitForFunction(
    ({ articleSelector, count }) =>
      document.querySelectorAll(articleSelector).length > count,
    { articleSelector: ARTICLE_CARD, count: previousCount },
    { timeout: QUICK_UI_TIMEOUT }
  );
}

/**
 * Reads stable article links from rendered feed cards.
 * @param page - Browser page on the feed.
 * @returns Feed article hrefs.
 */
async function feedPostLinks(page: Page): Promise<readonly string[]> {
  return await page
    .locator(`${ARTICLE_CARD} .post-headline a`)
    .evaluateAll(links =>
      links.map(link => link.getAttribute("href") || "").filter(Boolean)
    );
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
 * Finds a feed category that produces an empty recruiting-moves view.
 *
 * Asks the server directly which `mode=recruiting&category=<opt>` combination
 * returns zero rows, iterating the real category `<select>` options. An earlier
 * version sampled only the default `/Feed` page (50 items) and inferred
 * move-categories from it — but recruiting mode scans every article, so once a
 * move article fell outside the first 50 the heuristic mislabeled its category
 * as move-free, picked it, and the "empty" view was non-empty. Querying the
 * server per candidate category is authoritative regardless of dataset size,
 * ordering, or category normalization.
 * @param page - Browser page used for the scenario.
 * @param categorySelect - CSS selector for the feed category `<select>`.
 * @returns Category value with no recruiting moves, or empty string when none.
 */
async function feedCategoryWithoutMoves(
  page: Page,
  categorySelect: string
): Promise<string> {
  return await page.evaluate(async (selector: string) => {
    const options = [
      ...document.querySelectorAll<HTMLOptionElement>(`${selector} option`),
    ]
      .map(option => option.value)
      .filter(value => value && value !== "all");
    for (const category of options) {
      const response = await fetch(
        `/Feed?mode=recruiting&category=${encodeURIComponent(category)}&limit=1`
      );
      // A non-2xx response is a server failure, NOT an empty category. Treating
      // it as empty once made the smoke pick a category that actually had moves
      // (so the empty state never rendered) and mis-attributed a server 500 to
      // a UI bug. Surface it instead of silently returning a wrong category.
      if (!response.ok) {
        throw new Error(
          `feed category probe: /Feed?mode=recruiting&category=${category} → ${response.status}`
        );
      }
      const data = (await response.json()) as FeedResponse;
      if ((Array.isArray(data.items) ? data.items.length : 0) === 0) {
        return category;
      }
    }
    return "";
  }, categorySelect);
}

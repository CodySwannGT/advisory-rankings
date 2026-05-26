import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  check,
  shot,
  smokeGoto,
  type Check,
} from "./web_smoke_support.js";

const DIRECTORY_ROW_SELECTOR = ".center .entity-list .row";
const LOAD_MORE_SELECTOR = ".paginated-load-more";
const STATS_CARD_SELECTOR = ".right .card";
const DIRECTORY_FIRST_PAGE_LIMIT = 50;
const ADVISOR_STATS_TITLE = "Advisor directory";

/**
 * Checks that the anonymous advisor directory can manually load a second page.
 * @param page - Browser page used for the advisor directory scenario.
 * @returns Smoke assertions for advisor directory pagination.
 */
export async function smokeAdvisorDirectoryPagination(
  page: Page
): Promise<readonly Check[]> {
  const rows = page.locator(DIRECTORY_ROW_SELECTOR);
  const loadMore = page.locator(LOAD_MORE_SELECTOR).first();
  const stats = page
    .locator(STATS_CARD_SELECTOR)
    .filter({ hasText: ADVISOR_STATS_TITLE })
    .first();

  await smokeGoto(page, `${BASE}/advisors`);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await waitForDirectoryLoadedCount(page, ADVISOR_STATS_TITLE);
  await waitForDirectoryTotalCount(page, ADVISOR_STATS_TITLE);
  await loadMore.waitFor({ state: "visible", timeout: DEPLOYED_DATA_TIMEOUT });

  const firstPageKeys = await directoryRowKeys(
    page,
    DIRECTORY_FIRST_PAGE_LIMIT
  );
  const preClickCount = await rows.count();
  await loadMore.click();
  await page.waitForFunction(
    ({ rowSelector, previousCount }) =>
      document.querySelectorAll(rowSelector).length > previousCount,
    { rowSelector: DIRECTORY_ROW_SELECTOR, previousCount: preClickCount },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );

  const postClickKeys = await directoryRowKeys(page);
  const appendedKeys = postClickKeys.slice(preClickCount);
  const firstPageKeySet = new Set(firstPageKeys);
  const duplicateFirstPageKeys = appendedKeys.filter(key =>
    firstPageKeySet.has(key)
  );

  await shot(page, "06-advisors-pagination");

  return [
    check((await rows.count()) >= 50, "advisors pagination: first page rows"),
    check(
      (await stats.locator("dt", { hasText: "Total" }).count()) >= 1 &&
        Number.isFinite(await directoryTotalCount(page, ADVISOR_STATS_TITLE)),
      "advisors pagination: total count rendered"
    ),
    check(
      preClickCount >= 50,
      "advisors pagination: pre-click count is at least one page",
      String(preClickCount)
    ),
    check(
      postClickKeys.length > 50 && postClickKeys.length > preClickCount,
      "advisors pagination: Load more appends additional rows",
      `${preClickCount} -> ${postClickKeys.length}`
    ),
    check(
      duplicateFirstPageKeys.length === 0,
      "advisors pagination: appended rows do not duplicate first page",
      duplicateFirstPageKeys.slice(0, 3).join(", ")
    ),
  ];
}

/**
 * Checks that firm/team directories load a bounded first page and append more.
 * @param page - Browser page used for the directory scenario.
 * @param pageName - Public route name.
 * @param statsTitle - Right-rail stats card title.
 * @returns Smoke assertions for bounded directory pagination.
 */
export async function smokePaginatedDirectory(
  page: Page,
  pageName: "firms" | "teams",
  statsTitle: string
): Promise<readonly Check[]> {
  const rows = page.locator(DIRECTORY_ROW_SELECTOR);
  const loadMore = page.locator(LOAD_MORE_SELECTOR).first();
  const firstPageBudget = DIRECTORY_FIRST_PAGE_LIMIT + 5;

  await smokeGoto(page, `${BASE}/${pageName}`);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await waitForDirectoryLoadedCount(page, statsTitle);
  await waitForDirectoryTotalCount(page, statsTitle);
  await loadMore.waitFor({ state: "visible", timeout: DEPLOYED_DATA_TIMEOUT });

  const firstPageKeys = await directoryRowKeys(
    page,
    DIRECTORY_FIRST_PAGE_LIMIT
  );
  const firstPageCount = await rows.count();
  const firstPageHeight = await page.evaluate(() => document.body.scrollHeight);
  await loadMore.click();
  await page.waitForFunction(
    ({ rowSelector, previousCount }) =>
      document.querySelectorAll(rowSelector).length > previousCount,
    { rowSelector: DIRECTORY_ROW_SELECTOR, previousCount: firstPageCount },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  const postClickKeys = await directoryRowKeys(page);
  const appendedKeys = postClickKeys.slice(firstPageCount);
  const firstPageKeySet = new Set(firstPageKeys);
  const duplicateFirstPageKeys = appendedKeys.filter(key =>
    firstPageKeySet.has(key)
  );
  const totalCount = await directoryTotalCount(page, statsTitle);

  await shot(page, `06-${pageName}-pagination`);

  return [
    check(
      firstPageCount <= firstPageBudget,
      `${pageName}: first page is bounded`,
      String(firstPageCount)
    ),
    check(
      firstPageHeight < 15000,
      `${pageName}: initial document height is bounded`,
      String(firstPageHeight)
    ),
    check(
      totalCount > firstPageCount,
      `${pageName}: total count remains visible`,
      `${firstPageCount} of ${totalCount}`
    ),
    check(
      postClickKeys.length > firstPageCount,
      `${pageName}: Load more appends additional rows`,
      `${firstPageCount} -> ${postClickKeys.length}`
    ),
    check(
      duplicateFirstPageKeys.length === 0,
      `${pageName}: appended rows do not duplicate first page`,
      duplicateFirstPageKeys.slice(0, 3).join(", ")
    ),
  ];
}

/**
 * Waits until a directory loaded stat reaches the first-page count.
 * @param page - Browser page rendering the directory.
 * @param statsTitle - Right-rail stats card title.
 */
async function waitForDirectoryLoadedCount(
  page: Page,
  statsTitle: string
): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, title, min }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(title)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const loaded = labels.find(label => label.textContent === "Loaded");
      const value = loaded?.nextElementSibling?.textContent ?? "";
      const count = Number(value.replace(/,/g, ""));
      return Number.isFinite(count) && count >= min;
    },
    {
      statsSelector: STATS_CARD_SELECTOR,
      title: statsTitle,
      min: DIRECTORY_FIRST_PAGE_LIMIT,
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Waits for a directory total stat to become numeric.
 * @param page - Browser page rendering the directory.
 * @param statsTitle - Right-rail stats card title.
 */
async function waitForDirectoryTotalCount(
  page: Page,
  statsTitle: string
): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, title }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(title)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Total");
      const value = total?.nextElementSibling?.textContent ?? "";
      return Number.isFinite(Number(value.replace(/,/g, "")));
    },
    {
      statsSelector: STATS_CARD_SELECTOR,
      title: statsTitle,
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Reads a directory total stat as a number.
 * @param page - Browser page rendering the directory.
 * @param statsTitle - Right-rail stats card title.
 * @returns Parsed total count, or NaN when the stat is absent.
 */
async function directoryTotalCount(
  page: Page,
  statsTitle: string
): Promise<number> {
  return await page.evaluate(
    ({ statsSelector, title }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(title)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Total");
      const value = total?.nextElementSibling?.textContent ?? "";
      return Number(value.replace(/,/g, ""));
    },
    {
      statsSelector: STATS_CARD_SELECTOR,
      title: statsTitle,
    }
  );
}

/**
 * Builds stable row keys from directory links and visible row text.
 * @param page - Browser page rendering the directory.
 * @param limit - Optional maximum number of rows to read.
 * @returns Stable visible row signatures.
 */
async function directoryRowKeys(
  page: Page,
  limit?: number
): Promise<readonly string[]> {
  return await page.locator(DIRECTORY_ROW_SELECTOR).evaluateAll(
    (rowNodes, maxRows) =>
      rowNodes.slice(0, maxRows ?? rowNodes.length).map(row => {
        const link = row.closest("a")?.getAttribute("href") ?? "";
        const text = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return `${link} ${text}`.trim();
      }),
    limit
  );
}

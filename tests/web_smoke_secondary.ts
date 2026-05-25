import type { Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  DISCLOSURE_CARD_SELECTOR,
  FEED_HEADLINE_SELECTOR,
  TAYLOR_GROUP_TEXT,
  check,
  cleanProfilePath,
  retryAsync,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const ENTITY_ROW_SELECTOR = ".entity-list .row";
const ADVISOR_LOAD_MORE_SELECTOR = ".paginated-load-more";
const ADVISOR_STATS_CARD_SELECTOR = ".right .card";
const ADVISOR_STATS_TITLE = "Advisor directory";

/**
 * Finds an article with extracted provenance and checks the detail page.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for article detail.
 */
export async function smokeArticle(page: Page): Promise<readonly Check[]> {
  const articlePath = await findArticleWithProvenance(page);

  if (articlePath) await smokeGoto(page, `${BASE}${articlePath}`);
  await smokeWaitForSelector(page, ".post-headline");
  await page.locator(".snap-table tbody tr").first().waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await shot(page, "05-article-detail");

  return [
    check(
      Boolean(articlePath),
      "article.html: found feed article with provenance"
    ),
    check(
      cleanProfilePath("articles", page.url()),
      "article URL: clean /articles/... path",
      page.url()
    ),
    check(
      (await page.locator(".card:has(.snap-table)").count()) >= 1,
      "article.html: extracted facts section present"
    ),
    check(
      (await page.locator(".snap-table tbody tr").count()) >= 3,
      "article.html: extracted fact rows rendered"
    ),
  ];
}

/**
 * Checks the public compliance page for regulatory disclosure content.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for the compliance page.
 */
export async function smokeCompliance(page: Page): Promise<readonly Check[]> {
  const complianceCard = page
    .locator(".card")
    .filter({ hasText: /Compliance events/i })
    .first();
  const disclosureCard = page.locator(DISCLOSURE_CARD_SELECTOR).first();
  const regulatoryDisclosure = page
    .locator(DISCLOSURE_CARD_SELECTOR)
    .filter({ hasText: /FINRA|regulatory/i })
    .first();
  const loadError = page.locator(".ab-empty", {
    hasText: /Could not load compliance events/i,
  });

  await smokeGoto(page, `${BASE}/regulatory`);
  await retryAsync(
    async () => {
      await complianceCard.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
    },
    2,
    1500
  ).catch(async error => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await complianceCard.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
    return error;
  });
  await disclosureCard.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await regulatoryDisclosure.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const legacyResponse = await page.request.get(`${BASE}/regulatory.html`);
  await shot(page, "06-compliance");

  return [
    check(
      new URL(page.url()).pathname === "/regulatory",
      "regulatory: clean URL"
    ),
    check(
      legacyResponse.ok(),
      "regulatory.html: legacy route remains compatible",
      String(legacyResponse.status())
    ),
    check(await complianceCard.isVisible(), "regulatory: compliance card"),
    check(
      (await page.locator(DISCLOSURE_CARD_SELECTOR).count()) >= 1,
      "regulatory: disclosure events rendered"
    ),
    check(
      /FINRA|regulatory|disclosure/i.test(
        (await regulatoryDisclosure.textContent()) ?? ""
      ),
      "regulatory: event shows regulatory context"
    ),
    check(
      (await loadError.count()) === 0,
      "regulatory: no compliance load error"
    ),
  ];
}

/**
 * Opens the feed and returns the Taylor transition article path.
 *
 * The Taylor article is the seeded regression case with extracted
 * provenance, so using its visible feed card avoids fanning out live
 * ArticleView requests across every feed item during deploy smoke.
 * @param page - Browser page used for Feed requests.
 * @returns Article detail path, or an empty string if no provenance exists.
 */
async function findArticleWithProvenance(page: Page): Promise<string> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  return (
    (await page
      .locator(ARTICLE_CARD_SELECTOR)
      .filter({ hasText: TAYLOR_GROUP_TEXT })
      .first()
      .locator(".post-headline a")
      .getAttribute("href")) || ""
  );
}

/**
 * Checks the three flat public directory pages.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for public directories.
 */
export async function smokeDirectories(page: Page): Promise<readonly Check[]> {
  return [
    ...(await smokeDirectoryPages(page, ["firms", "advisors", "teams"])),
    ...(await smokeAdvisorDirectoryPagination(page)),
  ];
}

/**
 * Visits public directory pages one at a time on the shared browser page.
 * @param page - Browser page used for the scenario.
 * @param pageNames - Remaining directory route names to verify.
 * @returns Smoke assertions for all requested directories.
 */
async function smokeDirectoryPages(
  page: Page,
  pageNames: readonly string[]
): Promise<readonly Check[]> {
  const [pageName, ...remaining] = pageNames;
  if (!pageName) return [];

  await smokeGoto(page, `${BASE}/${pageName}`);
  await smokeWaitForSelector(page, ENTITY_ROW_SELECTOR);
  await shot(page, `06-${pageName}`);

  return [
    check(
      (await page.locator(ENTITY_ROW_SELECTOR).count()) >= 1,
      `${pageName}: rows rendered`
    ),
    ...(await smokeDirectoryPages(page, remaining)),
  ];
}

/**
 * Checks that the anonymous advisor directory can manually load a second page.
 * The page also auto-loads near the sentinel, so the click assertion measures
 * from the visible button's immediate pre-click state instead of assuming the
 * DOM still contains exactly one page.
 * @param page - Browser page used for the advisor directory scenario.
 * @returns Smoke assertions for advisor directory pagination.
 */
async function smokeAdvisorDirectoryPagination(
  page: Page
): Promise<readonly Check[]> {
  const rows = page.locator(ENTITY_ROW_SELECTOR);
  const loadMore = page.locator(ADVISOR_LOAD_MORE_SELECTOR).first();
  const stats = page
    .locator(ADVISOR_STATS_CARD_SELECTOR)
    .filter({ hasText: ADVISOR_STATS_TITLE })
    .first();

  await smokeGoto(page, `${BASE}/advisors`);
  await rows.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await waitForAdvisorLoadedCount(page, 50);
  await waitForAdvisorTotalCount(page);
  await loadMore.waitFor({ state: "visible", timeout: DEPLOYED_DATA_TIMEOUT });

  const firstPageKeys = await advisorRowKeys(page, 50);
  const preClickCount = await rows.count();
  await loadMore.click();
  await page.waitForFunction(
    ({ rowSelector, previousCount }) =>
      document.querySelectorAll(rowSelector).length > previousCount,
    { rowSelector: ENTITY_ROW_SELECTOR, previousCount: preClickCount },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );

  const postClickKeys = await advisorRowKeys(page);
  const appendedKeys = postClickKeys.slice(preClickCount);
  const firstPageKeySet = new Set(firstPageKeys);
  const duplicateFirstPageKeys = appendedKeys.filter(key =>
    firstPageKeySet.has(key)
  );

  await shot(page, "06-advisors-pagination");

  return [
    check(
      (await rows.count()) >= 50,
      "advisors pagination: first page rows rendered"
    ),
    check(
      (await stats.locator("dt", { hasText: "Total" }).count()) >= 1 &&
        Number.isFinite(await advisorTotalCount(page)),
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
 * Waits until the advisor directory loaded stat reaches an expected floor.
 * @param page - Browser page rendering the advisor directory.
 * @param minimum - Minimum loaded count expected in the stats panel.
 */
async function waitForAdvisorLoadedCount(
  page: Page,
  minimum: number
): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, statsTitle, min }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(statsTitle)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const loaded = labels.find(label => label.textContent === "Loaded");
      const value = loaded?.nextElementSibling?.textContent ?? "";
      const count = Number(value.replace(/,/g, ""));
      return Number.isFinite(count) && count >= min;
    },
    {
      statsSelector: ADVISOR_STATS_CARD_SELECTOR,
      statsTitle: ADVISOR_STATS_TITLE,
      min: minimum,
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Waits for the advisor directory total stat to become numeric.
 * @param page - Browser page rendering the advisor directory.
 */
async function waitForAdvisorTotalCount(page: Page): Promise<void> {
  await page.waitForFunction(
    ({ statsSelector, statsTitle }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(statsTitle)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Total");
      const value = total?.nextElementSibling?.textContent ?? "";
      return Number.isFinite(Number(value.replace(/,/g, "")));
    },
    {
      statsSelector: ADVISOR_STATS_CARD_SELECTOR,
      statsTitle: ADVISOR_STATS_TITLE,
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
}

/**
 * Reads the advisor directory total stat as a number.
 * @param page - Browser page rendering the advisor directory.
 * @returns Parsed total count, or NaN when the stat is absent.
 */
async function advisorTotalCount(page: Page): Promise<number> {
  return await page.evaluate(
    ({ statsSelector, statsTitle }) => {
      const stats = Array.from(document.querySelectorAll(statsSelector)).find(
        card => card.textContent?.includes(statsTitle)
      );
      const labels = Array.from(stats?.querySelectorAll("dt") ?? []);
      const total = labels.find(label => label.textContent === "Total");
      const value = total?.nextElementSibling?.textContent ?? "";
      return Number(value.replace(/,/g, ""));
    },
    {
      statsSelector: ADVISOR_STATS_CARD_SELECTOR,
      statsTitle: ADVISOR_STATS_TITLE,
    }
  );
}

/**
 * Builds stable row keys from advisor links and visible row text.
 * @param page - Browser page rendering the advisor directory.
 * @param limit - Optional maximum number of rows to read.
 * @returns Stable visible row signatures.
 */
async function advisorRowKeys(
  page: Page,
  limit?: number
): Promise<readonly string[]> {
  return await page.locator(ENTITY_ROW_SELECTOR).evaluateAll(
    (rowNodes, maxRows) =>
      rowNodes.slice(0, maxRows ?? rowNodes.length).map(row => {
        const link = row.closest("a")?.getAttribute("href") ?? "";
        const text = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return `${link} ${text}`.trim();
      }),
    limit
  );
}

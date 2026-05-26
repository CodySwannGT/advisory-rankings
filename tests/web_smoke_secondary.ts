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
import {
  smokeAdvisorDirectoryPagination,
  smokePaginatedDirectory,
} from "./web_smoke_directory_pagination.js";

const ENTITY_ROW_SELECTOR = ".center .entity-list .row";

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
    ...(await smokePaginatedDirectory(page, "firms", "Firm directory")),
    ...(await smokeAdvisorDirectoryPagination(page)),
    ...(await smokePaginatedDirectory(page, "teams", "Team directory")),
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

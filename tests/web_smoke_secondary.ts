import type { Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  FEED_HEADLINE_SELECTOR,
  check,
  cleanProfilePath,
  isLocalDev,
  pass,
  shot,
  type Check,
} from "./web_smoke_support.js";

/**
 * Finds an article with extracted provenance and checks the detail page.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for article detail.
 */
export async function smokeArticle(page: Page): Promise<readonly Check[]> {
  const articlePath = await findArticleWithProvenance(page);

  if (articlePath)
    await page.goto(`${BASE}${articlePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".post-headline", { timeout: 10000 });
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
      (await page
        .locator(".card")
        .filter({ hasText: "Extracted facts" })
        .count()) >= 1,
      "article.html: extracted facts section present"
    ),
    check(
      (await page.locator(".snap-table tbody tr").count()) >= 3,
      "article.html: extracted fact rows rendered"
    ),
  ];
}

/**
 * Opens the feed and returns the first article path with extracted provenance.
 * @param page - Browser page used for Feed and ArticleView requests.
 * @returns Article detail path, or an empty string if no provenance exists.
 */
async function findArticleWithProvenance(page: Page): Promise<string> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, { timeout: 10000 });
  return await page.evaluate(async () => {
    const feed = await fetch("/Feed").then(response => response.json());
    const matches = await Promise.all(
      (feed.items || []).map(
        async (item: {
          readonly article?: { readonly id?: string };
          readonly id?: string;
        }) => {
          const id = item.article?.id || item.id || "";
          const detail = await fetch(
            `/ArticleView/${encodeURIComponent(id)}`
          ).then(response => response.json());
          return detail.provenance?.length
            ? document
                .querySelector(`a[href*="${id}"]`)
                ?.getAttribute("href") || `/articles/${id}`
            : "";
        }
      )
    );
    return matches.find(Boolean) || "";
  });
}

/**
 * Checks the three flat public directory pages.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for public directories.
 */
export async function smokeDirectories(page: Page): Promise<readonly Check[]> {
  return await Promise.all(
    ["firms", "advisors", "teams"].map(async pageName => {
      await page.goto(`${BASE}/${pageName}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".entity-list .row", { timeout: 10000 });
      await shot(page, `06-${pageName}`);
      return check(
        (await page.locator(".entity-list .row").count()) >= 1,
        `${pageName}: rows rendered`
      );
    })
  );
}

/**
 * Checks navbar auth affordances and the deployed sign-in flow when enabled.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for auth UI.
 */
export async function smokeAuth(page: Page): Promise<readonly Check[]> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, { timeout: 10000 });
  if (isLocalDev)
    return [
      check(
        /Sign in/i.test(
          (await page
            .locator(".me-spot .me-action")
            .first()
            .textContent()
            .catch(() => "")) ?? ""
        ),
        'navbar: anonymous shows "Sign in"'
      ),
      pass("navbar: local smoke skips signed-in flow"),
    ];

  await page.locator('.me-spot a:has-text("Sign in")').first().click();
  await page.waitForSelector('input[name="email"]', { timeout: 8000 });
  await page
    .locator('input[name="email"]')
    .fill(process.env.HARPER_ADMIN_USERNAME || "cody.swann@gmail.com");
  await page
    .locator('input[name="password"]')
    .fill(process.env.HARPER_ADMIN_PASSWORD || "");
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector(ARTICLE_CARD_SELECTOR, { timeout: 10000 });
  await shot(page, "07-signed-in");
  await page.locator('.me-spot button:has-text("Sign out")').click();
  await page.waitForSelector('.me-spot a:has-text("Sign in")', {
    timeout: 8000,
  });

  return [pass("navbar: deployed sign-in flow returns to anonymous")];
}

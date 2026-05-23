import type { Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  TAYLOR_GROUP_TEXT,
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
  await page.waitForSelector(".post-headline", {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
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
 * Opens the feed and returns the Taylor transition article path.
 *
 * The Taylor article is the seeded regression case with extracted
 * provenance, so using its visible feed card avoids fanning out live
 * ArticleView requests across every feed item during deploy smoke.
 * @param page - Browser page used for Feed requests.
 * @returns Article detail path, or an empty string if no provenance exists.
 */
async function findArticleWithProvenance(page: Page): Promise<string> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
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
  return await smokeDirectoryPages(page, ["firms", "advisors", "teams"]);
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

  await page.goto(`${BASE}/${pageName}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".entity-list .row", {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await shot(page, `06-${pageName}`);

  return [
    check(
      (await page.locator(".entity-list .row").count()) >= 1,
      `${pageName}: rows rendered`
    ),
    ...(await smokeDirectoryPages(page, remaining)),
  ];
}

/**
 * Checks navbar auth affordances and the deployed sign-in flow when enabled.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for auth UI.
 */
export async function smokeAuth(page: Page): Promise<readonly Check[]> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
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

  if ((await page.locator('.me-spot button:has-text("Sign out")').count()) > 0)
    return await authenticatedSmokeCheck(page);

  const username = process.env.HARPER_ADMIN_USERNAME;
  const password = process.env.HARPER_ADMIN_PASSWORD;
  if (!username || !password)
    return [pass("navbar: deployed sign-in flow skipped without admin creds")];

  await page.locator('.me-spot a:has-text("Sign in")').first().click();
  await page.waitForSelector('input[name="email"]', {
    timeout: QUICK_UI_TIMEOUT,
  });
  await page.locator('input[name="email"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  const loginResult = await waitForSignedInFeed(page);
  if (loginResult !== "feed")
    return [
      check(
        false,
        "navbar: deployed sign-in flow returns to anonymous",
        await loginFailureDetail(page, loginResult)
      ),
    ];
  await shot(page, "07-signed-in");
  await page.locator('.me-spot button:has-text("Sign out")').click();
  await page.waitForSelector('.me-spot a:has-text("Sign in")', {
    timeout: QUICK_UI_TIMEOUT,
  });

  return [pass("navbar: deployed sign-in flow returns to anonymous")];
}

/**
 * Verifies a smoke run that starts with JWT-authenticated headers.
 * @param page - Browser page used for the auth scenario.
 * @returns Smoke assertion for the signed-in navbar state.
 */
async function authenticatedSmokeCheck(page: Page): Promise<readonly Check[]> {
  await shot(page, "07-signed-in");
  return [pass("navbar: JWT smoke starts signed in")];
}

/**
 * Waits for sign-in to either land back on the feed or show a login error.
 * @param page - Browser page used for the auth scenario.
 * @returns The first observed post-submit state.
 */
async function waitForSignedInFeed(
  page: Page
): Promise<"error" | "feed" | "timeout"> {
  return await Promise.race([
    page
      .waitForSelector(ARTICLE_CARD_SELECTOR, {
        timeout: DEPLOYED_DATA_TIMEOUT,
      })
      .then(() => "feed" as const),
    page
      .locator(".ab-empty")
      .waitFor({ state: "visible", timeout: DEPLOYED_DATA_TIMEOUT })
      .then(() => "error" as const),
  ]).catch(() => "timeout" as const);
}

/**
 * Captures a concise post-login failure detail for CI output.
 * @param page - Browser page used for the auth scenario.
 * @param loginResult - Failed login state that was observed.
 * @returns Current URL and visible error text when available.
 */
async function loginFailureDetail(
  page: Page,
  loginResult: "error" | "timeout"
): Promise<string> {
  const errorText =
    (await page
      .locator(".ab-empty")
      .first()
      .textContent()
      .catch(() => "")) ?? "";
  return `${loginResult}; url=${page.url()}; ${errorText}`.slice(0, 240);
}

import type { Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  isLocalDev,
  pass,
  shot,
  type Check,
} from "./web_smoke_support.js";

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

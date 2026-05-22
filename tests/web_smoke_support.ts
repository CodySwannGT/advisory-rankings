import { resolve } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { createAuthTokens, loadCreds } from "../src/scripts/_auth.js";

export const BASE = process.env.BASE_URL || "http://127.0.0.1:9926";
export const SHOTS = resolve("tests/screenshots");
export const ARTICLE_CARD_SELECTOR = "article.card";
export const FEED_HEADLINE_SELECTOR = "article.card .post-headline";
export const PROFILE_HEADING_SELECTOR = ".profile-head h1";
export const CARD_TITLE_SELECTOR = ".card h2.card-title";
export const TAYLOR_GROUP_TEXT = "The Taylor Group";
export const isLocalDev = /^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE);

/** One smoke assertion produced by a scenario. */
export interface Check {
  readonly label: string;
  readonly passed: boolean;
}

/**
 * Creates a passing smoke assertion.
 * @param label - Human-readable assertion text.
 * @returns A passing check record.
 */
export function pass(label: string): Check {
  return { label, passed: true };
}

const fail = (label: string, detail = ""): Check => ({
  label: `${label}${detail ? ` - ${detail}` : ""}`,
  passed: false,
});

/**
 * Converts a boolean expression into a smoke check.
 * @param condition - Whether the assertion passed.
 * @param label - Human-readable assertion text.
 * @param detail - Short detail captured from the page.
 * @returns A pass or fail check.
 */
export function check(condition: boolean, label: string, detail = ""): Check {
  return (
    [fail(label, detail), pass(label)][Number(condition)] ?? fail(label, detail)
  );
}

/**
 * Captures a full-page screenshot under the shared smoke screenshot folder.
 * @param page - Playwright page to capture.
 * @param name - Screenshot basename without extension.
 */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/**
 * Verifies profile routes use canonical clean paths.
 * @param kind - Profile route segment such as firms, advisors, or teams.
 * @param url - Current browser URL.
 * @returns Whether the path matches canonical or legacy accepted forms.
 */
export function cleanProfilePath(kind: string, url: string): boolean {
  const path = new URL(url).pathname;
  const canonical = new RegExp(`^/${kind}/[a-z0-9-]+-[0-9a-f-]{36}$`, "i");
  const legacySlug = new RegExp(`^/${kind}/[a-z0-9-]+$`, "i");
  const legacyId = new RegExp(`^/${kind}/[0-9a-f-]{36}$`, "i");
  return canonical.test(path) || legacySlug.test(path) || legacyId.test(path);
}

/**
 * Builds optional JWT headers for deployed smoke checks.
 * @returns Extra browser headers or undefined for anonymous checks.
 */
export async function authHeaders(): Promise<
  Record<string, string> | undefined
> {
  if (isLocalDev || process.env.AUTH !== "jwt") return undefined;
  const creds = loadCreds();
  if (!creds.username || !creds.password) return undefined;
  const { operation_token: operationToken } = await createAuthTokens(creds);
  return { Authorization: `Bearer ${operationToken}` };
}

/**
 * Opens a browser context with the standard smoke viewport and headers.
 * @param browser - Browser that owns the context.
 * @param viewport - Viewport dimensions for the context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns A configured Playwright context.
 */
export async function newContext(
  browser: Browser,
  viewport: Readonly<{ height: number; width: number }>,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<BrowserContext> {
  return await browser.newContext({
    viewport,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders,
  });
}

/**
 * Closes a temporary context after its checks have been calculated.
 * @param context - Browser context to close.
 * @param checks - Scenario assertions to return to the caller.
 * @returns The supplied checks after context cleanup.
 */
export async function closeWithChecks(
  context: BrowserContext,
  checks: readonly Check[]
): Promise<readonly Check[]> {
  await context.close();
  return checks;
}

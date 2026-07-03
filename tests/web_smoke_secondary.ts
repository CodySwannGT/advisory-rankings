import type { Browser, Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  DISCLOSURE_CARD_SELECTOR,
  FEED_HEADLINE_SELECTOR,
  TAYLOR_GROUP_TEXT,
  check,
  cleanProfilePath,
  closeWithChecks,
  newContext,
  retryAsync,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import { smokeAdvisorDirectoryFilters } from "./web_smoke_advisor_filters.js";
import {
  smokeAdvisorDirectoryPagination,
  smokePaginatedDirectory,
} from "./web_smoke_directory_pagination.js";
import { smokeFirmTeamDirectoryFilters } from "./web_smoke_directory_filters.js";
import { revealFeedCard } from "./web_smoke_feed_pagination.js";

const ENTITY_ROW_SELECTOR = ".center .entity-list .row";
const WATCHLIST_SIGN_IN_COPY =
  "Sign in to create and manage private watchlists";
const WATCHLIST_SIGN_IN_LINK_SELECTOR = '.watchlist-signin-link[href="/login"]';
const LOGIN_ACCESS_HEADING = "Need account access?";
const LOGIN_ACCESS_COPY = "AdvisorBook accounts are provisioned by your team.";
const LOGIN_RECOVERY_COPY = "Forgot your password or cannot sign in?";
const hasActiveClass = (className: string | null): boolean =>
  className?.split(/\s+/).includes("active") ?? false;

interface WatchlistGateEvidence {
  readonly loginCopyVisible: boolean;
  readonly loginPath: string;
  readonly loginRecoveryVisible: boolean;
  readonly overflow: {
    readonly clientWidth: number;
    readonly scrollWidth: number;
  };
  readonly signInGuidanceVisible: boolean;
  readonly signInHref: string | null;
  readonly watchlistsHeadingVisible: boolean;
  readonly watchlistsPath: string;
}

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
      (await page.locator("h1").count()) === 1,
      "article.html: exactly one page-level h1"
    ),
    check(
      (await page.locator("h1.post-headline").count()) === 1,
      "article.html: h1 uses article title"
    ),
    check(
      cleanProfilePath("articles", page.url()),
      "article URL: clean /articles/... path",
      page.url()
    ),
    check(
      (await page
        .getByRole("heading", { name: /Source-backed facts/ })
        .count()) >= 1,
      "article.html: source-backed facts section present"
    ),
    check(
      (await page.locator(".snap-table tbody tr").count()) >= 3,
      "article.html: source-backed fact rows rendered"
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
  const complianceNavLink = page.locator('.nav-links a[href="/regulatory"]');
  const homeNavLink = page.locator('.nav-links a[href="/"]');
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
  const complianceNavClass = await complianceNavLink.getAttribute("class");
  const homeNavClass = await homeNavLink.getAttribute("class");
  await shot(page, "06-compliance");

  return complianceChecks({
    complianceCardVisible: await complianceCard.isVisible(),
    complianceNavClass,
    disclosureCount: await page.locator(DISCLOSURE_CARD_SELECTOR).count(),
    homeNavClass,
    legacyStatus: legacyResponse.status(),
    legacyOk: legacyResponse.ok(),
    loadErrorCount: await loadError.count(),
    pageUrl: page.url(),
    regulatoryDisclosureText: await regulatoryDisclosure.textContent(),
  });
}

function complianceChecks(facts: {
  readonly complianceCardVisible: boolean;
  readonly complianceNavClass: string | null;
  readonly disclosureCount: number;
  readonly homeNavClass: string | null;
  readonly legacyOk: boolean;
  readonly legacyStatus: number;
  readonly loadErrorCount: number;
  readonly pageUrl: string;
  readonly regulatoryDisclosureText: string | null;
}): readonly Check[] {
  return [
    check(
      new URL(facts.pageUrl).pathname === "/regulatory",
      "regulatory: clean URL"
    ),
    check(
      facts.legacyOk,
      "regulatory.html: legacy route remains compatible",
      String(facts.legacyStatus)
    ),
    check(facts.complianceCardVisible, "regulatory: compliance card"),
    check(
      hasActiveClass(facts.complianceNavClass),
      "regulatory: compliance nav item active",
      facts.complianceNavClass ?? "missing class"
    ),
    check(
      !hasActiveClass(facts.homeNavClass),
      "regulatory: home nav item inactive",
      facts.homeNavClass ?? "missing class"
    ),
    check(facts.disclosureCount >= 1, "regulatory: disclosure events rendered"),
    check(
      /FINRA|regulatory|disclosure/i.test(facts.regulatoryDisclosureText ?? ""),
      "regulatory: event shows regulatory context"
    ),
    check(facts.loadErrorCount === 0, "regulatory: no compliance load error"),
  ];
}

/**
 * Checks the public Watchlists route for the anonymous sign-in gate.
 *
 * Runs in a dedicated anonymous context (never the suite's shared page) so the
 * anonymous gate is exercised even when the deployed smoke carries a JWT bearer
 * for the authenticated scenarios — an authenticated context renders the
 * watchlist management UI instead of the sign-in gate.
 * @param browser - Browser used to open an isolated anonymous context.
 * @returns Smoke assertions for the Watchlists page.
 */
export async function smokeWatchlists(
  browser: Browser
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    undefined
  );
  const page = await context.newPage();
  await smokeGoto(page, `${BASE}/watchlists`);
  await smokeWaitForSelector(page, WATCHLIST_SIGN_IN_LINK_SELECTOR);
  await shot(page, "06-watchlists");
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const signInHref = await page
    .locator(WATCHLIST_SIGN_IN_LINK_SELECTOR)
    .first()
    .getAttribute("href");
  const watchlistsPath = new URL(page.url()).pathname;
  const watchlistsHeadingVisible = await page
    .getByRole("heading", { level: 1, name: "Watchlists" })
    .isVisible();
  const signInGuidanceVisible = await page
    .getByText(WATCHLIST_SIGN_IN_COPY)
    .isVisible();
  await page.locator(WATCHLIST_SIGN_IN_LINK_SELECTOR).first().click();
  await page
    .getByRole("heading", { name: LOGIN_ACCESS_HEADING })
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "06-watchlists-login-access-path");
  const loginEvidence = await readLoginAccessEvidence(page);

  return await closeWithChecks(
    context,
    watchlistGateChecks(
      watchlistGateEvidence({
        ...loginEvidence,
        overflow,
        signInGuidanceVisible,
        signInHref,
        watchlistsHeadingVisible,
        watchlistsPath,
      })
    )
  );
}

async function readLoginAccessEvidence(page: Page) {
  return {
    loginCopyVisible: await page.getByText(LOGIN_ACCESS_COPY).isVisible(),
    loginPath: new URL(page.url()).pathname,
    loginRecoveryVisible: await page.getByText(LOGIN_RECOVERY_COPY).isVisible(),
  };
}

function watchlistGateEvidence(
  evidence: WatchlistGateEvidence
): WatchlistGateEvidence {
  return evidence;
}

function watchlistGateChecks(facts: WatchlistGateEvidence): readonly Check[] {
  return [
    check(facts.watchlistsPath === "/watchlists", "watchlists: clean URL"),
    check(facts.watchlistsHeadingVisible, "watchlists: heading visible"),
    check(
      facts.signInGuidanceVisible,
      "watchlists: anonymous sign-in guidance visible"
    ),
    check(
      facts.signInHref === "/login",
      "watchlists: sign-in action points to login",
      facts.signInHref ?? "missing href"
    ),
    check(
      facts.loginPath === "/login",
      "watchlists: sign-in action opens login",
      facts.loginPath
    ),
    check(facts.loginCopyVisible, "login: request-access guidance visible"),
    check(facts.loginRecoveryVisible, "login: recovery guidance visible"),
    check(
      facts.overflow.scrollWidth <= facts.overflow.clientWidth,
      "watchlists: no horizontal overflow",
      `scrollWidth ${facts.overflow.scrollWidth}, clientWidth ${facts.overflow.clientWidth}`
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
  await smokeGoto(page, `${BASE}/?mode=event`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await revealFeedCard(page, TAYLOR_GROUP_TEXT);
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
    ...(await smokeAdvisorDirectoryFilters(page)),
    ...(await smokeAdvisorDirectoryPagination(page)),
    ...(await smokePaginatedDirectory(page, "teams", "Team directory")),
    ...(await smokeFirmTeamDirectoryFilters(page)),
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

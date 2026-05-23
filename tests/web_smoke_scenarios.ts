import type { Locator, Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  CARD_TITLE_SELECTOR,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  PROFILE_HEADING_SELECTOR,
  QUICK_UI_TIMEOUT,
  TAYLOR_GROUP_TEXT,
  check,
  cleanProfilePath,
  isLocalDev,
  shot,
  type Check,
} from "./web_smoke_support.js";

/**
 * Checks feed cards, transition/disclosure event rendering, and right-rail content.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for the feed.
 */
export async function smokeFeed(page: Page): Promise<readonly Check[]> {
  const postCards = page.locator(ARTICLE_CARD_SELECTOR);
  const taylorCard = postCards.filter({ hasText: TAYLOR_GROUP_TEXT }).first();
  const transition = page.locator(".event-card.transition").first();
  const disclosure = page.locator(".event-card.disclosure").first();

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await taylorCard.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await transition.waitFor({ timeout: QUICK_UI_TIMEOUT });
  await disclosure.waitFor({ timeout: QUICK_UI_TIMEOUT });
  await shot(page, "01-feed");

  return [
    check((await postCards.count()) >= 2, "/ feed: at least two post cards"),
    check(
      Boolean(await taylorCard.locator(".post-headline").textContent()),
      "/ feed: Taylor article headline present"
    ),
    check(
      /Morgan Stanley/.test((await transition.textContent()) ?? "") &&
        /Wells Fargo/.test((await transition.textContent()) ?? ""),
      "/ feed: transition shows Morgan Stanley to Wells Fargo"
    ),
    check(
      /\$5\.94B|5\.94/.test((await transition.textContent()) ?? ""),
      "/ feed: transition shows $5.94B AUM"
    ),
    check(
      /275%|2\.75/.test((await transition.textContent()) ?? ""),
      "/ feed: transition shows 275% T-12 deal"
    ),
    check(
      (await page.locator(".sanction-pill").count()) >= 2,
      "/ feed: sanction pills rendered"
    ),
    check(
      /FINRA/.test((await disclosure.textContent()) ?? ""),
      "/ feed: disclosure event shows FINRA"
    ),
    check(
      (await page
        .locator(".right .card")
        .filter({ hasText: "Trending firms" })
        .count()) >= 1,
      "/ feed: right rail shows Trending firms"
    ),
  ];
}

/**
 * Navigates from the feed to the Wells Fargo firm profile.
 * @param page - Browser page used for the scenario.
 * @returns The past-advisors card and smoke assertions for the firm profile.
 */
export async function smokeFirm(
  page: Page
): Promise<readonly [readonly Check[], Locator]> {
  const taylorCard = page
    .locator(ARTICLE_CARD_SELECTOR)
    .filter({ hasText: TAYLOR_GROUP_TEXT })
    .first();
  const wellsChip = taylorCard
    .locator(".chip.firm")
    .filter({ hasText: /^firmWells Fargo(?: Advisors)?(?:·|$)/ })
    .first();
  const pastBlock = page
    .locator(".card")
    .filter({ hasText: "Past advisors" })
    .first();
  const cairnesLink = pastBlock
    .locator("a")
    .filter({ hasText: "Cairnes" })
    .first();

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await wellsChip.click();
  await page.waitForSelector(PROFILE_HEADING_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await pastBlock.scrollIntoViewIfNeeded();
  await cairnesLink.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "02-firm-wells-fargo");

  return [await firmProfileChecks(page, pastBlock, cairnesLink), pastBlock];
}

const firmProfileChecks = async (
  page: Page,
  pastBlock: Locator,
  cairnesLink: Locator
): Promise<readonly Check[]> => [
  check(
    cleanProfilePath("firms", page.url()),
    "firm URL: clean /firms/... path",
    page.url()
  ),
  check(
    /Wells Fargo/.test(
      (await page.locator(PROFILE_HEADING_SELECTOR).textContent()) ?? ""
    ),
    "firm.html: Wells Fargo header"
  ),
  check(
    (await page.locator(CARD_TITLE_SELECTOR).allTextContents()).some(title =>
      /Current advisors/i.test(title)
    ),
    "firm.html: Current advisors section"
  ),
  check(
    (await page.locator(CARD_TITLE_SELECTOR).allTextContents()).some(title =>
      /Past advisors/i.test(title)
    ),
    "firm.html: Past advisors section"
  ),
  check(
    (await page.locator(CARD_TITLE_SELECTOR).allTextContents()).some(title =>
      /moves to/i.test(title)
    ),
    "firm.html: inbound transitions section"
  ),
  check(
    (await cairnesLink.count()) >= 1,
    "firm.html: past-advisor list includes Cairnes",
    ((await pastBlock.textContent()) ?? "").slice(0, 200)
  ),
  check(
    /terminated/i.test((await pastBlock.textContent()) ?? ""),
    "firm.html: terminated-for-cause flagged"
  ),
  check(
    (await page
      .locator(".right .card")
      .filter({ hasText: "Branches" })
      .count()) >= 1,
    "firm.html: right rail shows Branches"
  ),
];

/**
 * Checks advisor profile timeline, disclosure, status, and BrokerCheck attribution.
 * @param page - Browser page used for the scenario.
 * @param pastBlock - Firm profile card containing the Cairnes link.
 * @returns Smoke assertions for the advisor profile.
 */
export async function smokeAdvisor(
  page: Page,
  pastBlock: Locator
): Promise<readonly Check[]> {
  await navigateToCairnesAdvisor(page, pastBlock);
  await shot(page, "03-advisor-cairnes");

  return [
    check(
      cleanProfilePath("advisors", page.url()),
      "advisor URL: clean /advisors/... path",
      page.url()
    ),
    check(
      /Cairnes/.test(
        (await page.locator(PROFILE_HEADING_SELECTOR).textContent()) ?? ""
      ),
      "advisor.html: Cairnes header"
    ),
    check(
      (await page.locator(".timeline .step").count()) >= 3,
      "advisor.html: career timeline has at least three steps"
    ),
    check(
      (await page.locator(".event-card.disclosure").count()) >= 5,
      "advisor.html: expected disclosure events"
    ),
    check(
      (await page.locator(".sanction-pill").count()) >= 3,
      "advisor.html: expected sanction pills"
    ),
    check(
      /suspended|withdrawn/i.test(
        (await page
          .locator(".profile-head .tag")
          .filter({ hasText: /suspended|withdrawn/i })
          .first()
          .textContent()
          .catch(() => "")) ?? ""
      ),
      "advisor.html: career status flagged"
    ),
    check(
      isLocalDev ||
        (await page
          .locator(".profile-head .tag")
          .filter({ hasText: /CRD/i })
          .count()) >= 1,
      "advisor.html: FINRA CRD badge present"
    ),
    check(
      isLocalDev || (await page.locator(".ab-source-attr").count()) >= 1,
      "advisor.html: BrokerCheck attribution footer present"
    ),
    check(
      isLocalDev ||
        /FINRA BrokerCheck/i.test(
          (await page
            .locator(".ab-source-attr")
            .first()
            .textContent()
            .catch(() => "")) ?? ""
        ),
      "advisor.html: attribution names FINRA BrokerCheck"
    ),
    check(
      isLocalDev ||
        (await page
          .locator('.ab-source-attr a[href*="brokercheck.finra.org/terms"]')
          .count()) >= 1,
      "advisor.html: attribution links to BrokerCheck ToU"
    ),
  ];
}

/**
 * Opens the known Cairnes advisor profile from the firm past-advisors section.
 * @param page - Browser page used for navigation.
 * @param pastBlock - Firm profile card containing the Cairnes link.
 */
async function navigateToCairnesAdvisor(
  page: Page,
  pastBlock: Locator
): Promise<void> {
  await pastBlock.locator("a").filter({ hasText: "Cairnes" }).first().click();
  await page.waitForSelector(PROFILE_HEADING_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
}

/**
 * Checks the Taylor team profile.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for the team profile.
 */
export async function smokeTeam(page: Page): Promise<readonly Check[]> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".chip.team", { timeout: DEPLOYED_DATA_TIMEOUT });
  await page
    .locator(".chip.team")
    .filter({ hasText: "Taylor" })
    .first()
    .click();
  await page.waitForSelector(PROFILE_HEADING_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await shot(page, "04-team-taylor-group");

  return [
    check(
      cleanProfilePath("teams", page.url()),
      "team URL: clean /teams/... path",
      page.url()
    ),
    check(
      /Taylor/.test(
        (await page.locator(PROFILE_HEADING_SELECTOR).textContent()) ?? ""
      ),
      "team.html: Taylor header"
    ),
    check(
      (await page
        .locator(".card")
        .filter({ hasText: "Current members" })
        .first()
        .locator(".row")
        .count()) >= 9,
      "team.html: current members rendered"
    ),
    check(
      (await page.locator(".snap-table tbody tr").count()) >= 2,
      "team.html: metric snapshot rows rendered"
    ),
  ];
}

export {
  smokeArticle,
  smokeAuth,
  smokeDirectories,
} from "./web_smoke_secondary.js";

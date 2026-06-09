import type { Locator, Page } from "playwright";
import {
  ARTICLE_CARD_SELECTOR,
  BASE,
  CARD_TITLE_SELECTOR,
  DEPLOYED_DATA_TIMEOUT,
  DISCLOSURE_CARD_SELECTOR,
  FEED_HEADLINE_SELECTOR,
  PROFILE_HEADING_SELECTOR,
  QUICK_UI_TIMEOUT,
  TAYLOR_GROUP_TEXT,
  check,
  cleanProfilePath,
  isLocalDev,
  profileHeadingChecks,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  verifyCrdBadgeRenders,
  type Check,
} from "./web_smoke_support.js";
import { firmDueDiligenceChecks } from "./web_smoke_firm_due_diligence.js";
import { smokeFeedFilters } from "./web_smoke_feed_filters.js";
import { smokeTeam } from "./web_smoke_team.js";
import {
  advisorCopyGuardrailChecks,
  browseLabelChecks,
  feedCopyGuardrailChecks,
} from "./web_smoke_copy_guardrails.js";
import {
  revealFeedCard,
  revealFeedSelector,
  smokeFeedPagination,
} from "./web_smoke_feed_pagination.js";
import { expectedSanctionPillCount } from "./web_smoke_sanction_pills.js";

/**
 * Checks feed cards, transition/disclosure event rendering, and right-rail content.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for the feed.
 */
export async function smokeFeed(page: Page): Promise<readonly Check[]> {
  const postCards = page.locator(ARTICLE_CARD_SELECTOR);
  const taylorCard = postCards.filter({ hasText: TAYLOR_GROUP_TEXT }).first();
  const transition = page.locator(".event-card.transition").first();
  const disclosure = page.locator(DISCLOSURE_CARD_SELECTOR).first();
  const regulatoryDisclosure = page
    .locator(DISCLOSURE_CARD_SELECTOR)
    .filter({ hasText: /FINRA|regulatory/i })
    .first();

  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const paginationChecks = await smokeFeedPagination(page);
  await smokeGoto(page, `${BASE}/?mode=event`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await revealFeedCard(page, TAYLOR_GROUP_TEXT);
  await revealFeedSelector(page, DISCLOSURE_CARD_SELECTOR);
  await taylorCard.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await transition.waitFor({ timeout: QUICK_UI_TIMEOUT });
  await disclosure.waitFor({ timeout: QUICK_UI_TIMEOUT });
  await regulatoryDisclosure.waitFor({ timeout: QUICK_UI_TIMEOUT });
  await shot(page, "01-feed");
  const initialPostCount = await postCards.count();
  const sanctionPillExpectation = await expectedSanctionPillCount(page);
  const actualSanctionPillCount = await page.locator(".sanction-pill").count();
  const transitionText = (await transition.textContent()) ?? "";
  const initialFeedChecks = [
    check(initialPostCount >= 2, "/ feed: at least two post cards"),
    check(
      Boolean(await taylorCard.locator(".post-headline").textContent()),
      "/ feed: Taylor article headline present"
    ),
    check(
      /UBS|Morgan Stanley/.test(transitionText) &&
        /Wells Fargo|Rockefeller/.test(transitionText),
      "/ feed: transition shows source and destination firms"
    ),
    check(
      /(?:^|[^\d.])(?:\$1\.60?B|1\.60?B?|\$2B|2B|\$5\.94B|5\.94B?)(?=$|[^\d.])/.test(
        transitionText
      ),
      "/ feed: transition shows seeded AUM"
    ),
    check(
      /T-12 production|advisors moved|breakaway|275%|2\.75/.test(
        transitionText
      ),
      "/ feed: transition shows transition detail context"
    ),
    check(
      actualSanctionPillCount >= sanctionPillExpectation,
      `/ feed: sanction pills rendered (expected≥${sanctionPillExpectation}, got ${actualSanctionPillCount})`
    ),
    check(
      /FINRA|regulatory/i.test(
        (await regulatoryDisclosure.textContent()) ?? ""
      ),
      "/ feed: disclosure event shows regulatory context"
    ),
    check(
      (await page
        .locator(".right .card")
        .filter({ hasText: "Trending firms" })
        .count()) >= 1,
      "/ feed: right rail shows Trending firms"
    ),
  ];

  return [
    ...initialFeedChecks,
    ...paginationChecks,
    ...(await smokeFeedFilters(page)),
    ...(await feedCopyGuardrailChecks(page)),
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
    .filter({
      has: page.locator("h2.card-title").filter({ hasText: /^Past advisors/ }),
    })
    .first();
  const cairnesLink = pastBlock
    .locator("a")
    .filter({ hasText: "Cairnes" })
    .first();

  await smokeGoto(page, `${BASE}/?mode=event`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  await revealFeedCard(page, TAYLOR_GROUP_TEXT);
  await wellsChip.click();
  await smokeWaitForSelector(page, PROFILE_HEADING_SELECTOR);
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
  ...(await firmDueDiligenceChecks(page)),
  ...(await browseLabelChecks(page, "firm.html")),
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
  ...(await profileHeadingChecks(page, "firm.html", /Wells Fargo/)),
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

  const cairnesChecks = [
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
    ...(await profileHeadingChecks(page, "advisor.html", /Cairnes/)),
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
    ...(await advisorEvidenceChecks(page)),
    ...(await advisorCopyGuardrailChecks(page)),
  ];
  // CRD badge: verify on an advisor that actually has one (derived from live
  // data). Cairnes's deployed record has no finraCrd, so asserting it on
  // Cairnes specifically was brittle; the badge rendering is what we prove.
  return [...cairnesChecks, await verifyCrdBadgeRenders(page)];
}

/**
 * Checks advisor evidence right-rail cards.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for profile evidence panels.
 */
async function advisorEvidenceChecks(page: Page): Promise<readonly Check[]> {
  return [
    check(
      (await page
        .locator(".card")
        .filter({ hasText: "Evidence freshness" })
        .count()) >= 1,
      "advisor.html: evidence freshness panel rendered"
    ),
    check(
      (await page
        .locator(".card")
        .filter({ hasText: "Fact confidence" })
        .count()) >= 1,
      "advisor.html: fact confidence panel rendered"
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
  await smokeWaitForSelector(page, PROFILE_HEADING_SELECTOR);
}

export {
  smokeArticle,
  smokeCompliance,
  smokeDirectories,
  smokeWatchlists,
} from "./web_smoke_secondary.js";
export { smokeNotFoundRecovery } from "./web_smoke_not_found.js";
export { smokeInvalidDetailRecovery } from "./web_smoke_invalid_detail.js";
export { smokeAuth } from "./web_smoke_auth.js";
export { smokeTeam };

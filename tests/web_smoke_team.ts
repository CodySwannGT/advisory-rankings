import type { Page } from "playwright";
import {
  BASE,
  PROFILE_HEADING_SELECTOR,
  check,
  cleanProfilePath,
  profileHeadingChecks,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import { revealFeedCard } from "./web_smoke_feed_pagination.js";

/**
 * Checks the Taylor team profile.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for the team profile.
 */
export async function smokeTeam(page: Page): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/?mode=event`);
  await smokeWaitForSelector(page, "article.card .post-headline");
  await revealFeedCard(page, "Taylor");
  await smokeWaitForSelector(page, ".chip.team");
  await page
    .locator(".chip.team")
    .filter({ hasText: "Taylor" })
    .first()
    .click();
  await smokeWaitForSelector(page, PROFILE_HEADING_SELECTOR);
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
    ...(await profileHeadingChecks(page, "team.html", /Taylor/)),
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

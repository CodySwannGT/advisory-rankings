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
  const mobileChecks = await smokeTeamMobileDetails(page);

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
    await currentMembersRowsCheck(page),
    await teamSnapshotRowsCheck(page),
    ...mobileChecks,
  ];
}

async function currentMembersRowsCheck(page: Page): Promise<Check> {
  const currentMembers = page
    .locator(".card")
    .filter({ hasText: "Current members" });
  return check(
    (await currentMembers.first().locator(".row").count()) >= 9,
    "team.html: current members rendered"
  );
}

async function teamSnapshotRowsCheck(page: Page): Promise<Check> {
  return check(
    (await page.locator(".snap-table tbody tr").count()) >= 2,
    "team.html: metric snapshot rows rendered"
  );
}

/**
 * Checks team details after the right rail collapses on mobile.
 * @param page - Browser page already positioned on a team profile.
 * @returns Smoke assertions for mobile team details.
 */
async function smokeTeamMobileDetails(page: Page): Promise<readonly Check[]> {
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await smokeWaitForSelector(page, PROFILE_HEADING_SELECTOR);
    const details = page.locator(".team-mobile-details .card").first();
    await details.waitFor();
    await shot(page, "04-team-details-mobile");
    const detailsText = (await details.textContent()) ?? "";

    return [
      check(
        await details.isVisible(),
        "team.html: mobile Team details section visible"
      ),
      check(
        /Name/.test(detailsText) &&
          /Firm program/.test(detailsText) &&
          /Current firm/.test(detailsText),
        "team.html: mobile Team details include structured facts",
        detailsText
      ),
    ];
  } finally {
    if (desktopViewport) await page.setViewportSize(desktopViewport);
  }
}

import type { Page } from "playwright";

import {
  BASE,
  QUICK_UI_TIMEOUT,
  check,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

/**
 * Verifies the public Interactive Rankings Explorer page.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Rankings smoke assertions.
 */
export async function smokeRankings(page: Page): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/rankings`);
  await smokeWaitForSelector(page, ".rankings-table", QUICK_UI_TIMEOUT);
  const loaded = await page.evaluate(() => ({
    hasHeader: document.body.innerText.includes(
      "Interactive Rankings Explorer"
    ),
    hasNextGen: document.body.innerText.includes("Next Gen"),
    hasResolved: document.body.innerText.includes("RESOLVED"),
    hasSourceBacked: document.body.innerText.includes("SOURCE BACKED"),
    hasUnavailable: document.body.innerText.includes("UNAVAILABLE"),
    profileHref: document.querySelector<HTMLAnchorElement>(
      ".rankings-table tbody a[href*='advisor.html'], .rankings-table tbody a[href*='team.html']"
    )?.href,
    rowCount: document.querySelectorAll(".rankings-table tbody tr").length,
  }));
  await shot(page, "11-rankings-desktop");

  await smokeGoto(page, `${BASE}/rankings?resolved=unresolved&state=TX`);
  await smokeWaitForSelector(page, ".rankings-table", QUICK_UI_TIMEOUT);
  const unresolved = await page.evaluate(() => ({
    hasUnresolvedRow: document.body.innerText.includes("Jordan Example"),
    hasUnresolvedStatus: document.body.innerText.includes("UNRESOLVED"),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
    noOverflow:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  }));

  await smokeGoto(page, `${BASE}/rankings?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  const empty = await page.evaluate(() => ({
    hasEmpty: document.body.innerText.includes(
      "No matching public ranking rows"
    ),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
  }));

  return [
    check(loaded.hasHeader, "rankings: page header renders"),
    check(loaded.hasNextGen, "rankings: category data renders"),
    check(loaded.rowCount > 0, "rankings: source-backed rows render"),
    check(loaded.hasResolved, "rankings: resolved status is visible"),
    check(loaded.hasSourceBacked, "rankings: source status is visible"),
    check(loaded.hasUnavailable, "rankings: missing score is explicit"),
    check(
      Boolean(loaded.profileHref),
      "rankings: resolved row links to profile"
    ),
    check(
      unresolved.hasUnresolvedRow && unresolved.hasUnresolvedStatus,
      "rankings: unresolved row remains visible"
    ),
    check(unresolved.state === "TX", "rankings: state filter is retained"),
    check(
      unresolved.noOverflow,
      "rankings: filtered page has no desktop overflow"
    ),
    check(empty.hasEmpty, "rankings: empty filter explains missing data"),
    check(empty.state === "ZZ", "rankings: empty state retains filter"),
  ];
}

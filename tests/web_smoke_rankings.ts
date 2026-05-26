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
  const loaded = await readLoadedRankings(page);
  await shot(page, "11-rankings-desktop");

  await smokeGoto(page, `${BASE}/rankings?resolved=unresolved&state=TX`);
  await smokeWaitForSelector(page, ".rankings-table", QUICK_UI_TIMEOUT);
  const unresolved = await readUnresolvedRankings(page);

  await smokeGoto(page, `${BASE}/rankings?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  const empty = await readEmptyRankings(page);

  return rankingsChecks(loaded, unresolved, empty);
}

/**
 * Reads loaded rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Loaded rankings DOM facts.
 */
async function readLoadedRankings(page: Page) {
  return await page.evaluate(() => ({
    hasHeader: document.body.innerText.includes(
      "Interactive Rankings Explorer"
    ),
    hasNextGen: document.body.innerText.includes("Next Gen"),
    hasCoverageWorkbench:
      document.body.innerText.includes("Coverage workbench"),
    hasCoverageBucket: document.body.innerText.includes("Advisors to Watch"),
    hasGapSample: document.body.innerText.includes("Jordan Example"),
    hasLatestLoaded: document.body.innerText.includes("Latest"),
    hasResolved: document.body.innerText.includes("RESOLVED"),
    hasSourceBacked: document.body.innerText.includes("SOURCE BACKED"),
    hasUnavailable: document.body.innerText.includes("UNAVAILABLE"),
    profileHref: document.querySelector<HTMLAnchorElement>(
      ".rankings-table tbody a[href*='advisor.html'], .rankings-table tbody a[href*='team.html']"
    )?.href,
    rowCount: document.querySelectorAll(".rankings-table tbody tr").length,
  }));
}

/**
 * Reads filtered unresolved rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Unresolved rankings DOM facts.
 */
async function readUnresolvedRankings(page: Page) {
  return await page.evaluate(() => ({
    hasUnresolvedRow: document.body.innerText.includes("Jordan Example"),
    hasUnresolvedStatus: document.body.innerText.includes("UNRESOLVED"),
    hasUnresolvedWorkbench:
      document.body.innerText.includes("Coverage workbench"),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
    noOverflow:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  }));
}

/**
 * Reads empty rankings page evidence.
 * @param page - Browser page to inspect.
 * @returns Empty rankings DOM facts.
 */
async function readEmptyRankings(page: Page) {
  return await page.evaluate(() => ({
    hasEmpty: document.body.innerText.includes(
      "No matching public ranking rows"
    ),
    hasCoverageEmpty: document.body.innerText.includes(
      "No ranking rows are loaded for this coverage slice."
    ),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
  }));
}

/**
 * Converts rankings DOM facts into smoke checks.
 * @param loaded - Loaded page facts.
 * @param unresolved - Filtered unresolved page facts.
 * @param empty - Empty page facts.
 * @returns Smoke assertions.
 */
function rankingsChecks(loaded, unresolved, empty) {
  return [
    check(loaded.hasHeader, "rankings: page header renders"),
    check(loaded.hasNextGen, "rankings: category data renders"),
    check(loaded.hasCoverageWorkbench, "rankings: coverage workbench renders"),
    check(loaded.hasCoverageBucket, "rankings: coverage buckets render"),
    check(loaded.hasGapSample, "rankings: gap sample rows render"),
    check(loaded.hasLatestLoaded, "rankings: latest loaded context renders"),
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
      unresolved.hasUnresolvedWorkbench,
      "rankings: filtered coverage workbench remains visible"
    ),
    check(
      unresolved.noOverflow,
      "rankings: filtered page has no desktop overflow"
    ),
    check(empty.hasEmpty, "rankings: empty filter explains missing data"),
    check(empty.hasCoverageEmpty, "rankings: empty coverage state renders"),
    check(empty.state === "ZZ", "rankings: empty state retains filter"),
  ];
}

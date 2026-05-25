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
 * Verifies the public Recruiting Market Map page and empty filter state.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Recruiting smoke assertions.
 */
export async function smokeRecruiting(page: Page): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/recruiting`);
  await smokeWaitForSelector(page, ".recruiting-table", QUICK_UI_TIMEOUT);
  const loaded = await page.evaluate(() => ({
    hasHeader: document.body.innerText.includes("Recruiting Market Map"),
    hasMomentum: document.body.innerText.includes("Firm momentum"),
    hasRecentMoves: document.body.innerText.includes("Recent moves"),
    hasSourceStatus: document.body.innerText.includes("SOURCE BACKED"),
    hasTaylorGroup: document.body.innerText.includes("The Taylor Group"),
    rowCount: document.querySelectorAll(".recruiting-table tbody tr").length,
  }));
  await shot(page, "10-recruiting-desktop");

  await smokeGoto(page, `${BASE}/recruiting?state=ZZ`);
  await smokeWaitForSelector(page, ".empty", QUICK_UI_TIMEOUT);
  const empty = await page.evaluate(() => ({
    hasEmpty: document.body.innerText.includes(
      "No matching public recruiting move data"
    ),
    state: document.querySelector<HTMLInputElement>('input[name="state"]')
      ?.value,
    noOverflow:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  }));

  return [
    check(loaded.hasHeader, "recruiting: page header renders"),
    check(loaded.hasMomentum, "recruiting: firm momentum renders"),
    check(loaded.hasRecentMoves, "recruiting: recent moves render"),
    check(
      loaded.rowCount > 0 && loaded.hasTaylorGroup,
      "recruiting: source-backed fixture is visible"
    ),
    check(loaded.hasSourceStatus, "recruiting: source status is visible"),
    check(empty.hasEmpty, "recruiting: empty filter explains missing data"),
    check(empty.state === "ZZ", "recruiting: state filter is retained"),
    check(empty.noOverflow, "recruiting: filtered page has no overflow"),
  ];
}

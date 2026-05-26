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

const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const RECRUITING_MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 740 },
] as const;

/** Mobile viewport dimensions used by recruiting overflow smoke checks. */
type RecruitingViewport = (typeof RECRUITING_MOBILE_VIEWPORTS)[number];

/**
 * Verifies the public Recruiting Market Map page and empty filter state.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Recruiting smoke assertions.
 */
export async function smokeRecruiting(page: Page): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/recruiting`);
  await smokeWaitForSelector(page, ".recruiting-table", QUICK_UI_TIMEOUT);
  const desktopOverflow = await readRecruitingOverflow(page);
  const loaded = await page.evaluate(() => ({
    hasHeader: document.body.innerText.includes("Recruiting Market Map"),
    hasMomentum: document.body.innerText.includes("Firm momentum"),
    hasRecentMoves: document.body.innerText.includes("Recent moves"),
    hasSourceStatus: document.body.innerText.includes("SOURCE BACKED"),
    hasTaylorGroup: document.body.innerText.includes("The Taylor Group"),
    rowCount: document.querySelectorAll(".recruiting-table tbody tr").length,
  }));
  await shot(page, "10-recruiting-desktop");

  const mobileChecks = await smokeRecruitingMobile(page);

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
    recruitingOverflowCheck(desktopOverflow, "desktop"),
    ...mobileChecks,
    check(empty.hasEmpty, "recruiting: empty filter explains missing data"),
    check(empty.state === "ZZ", "recruiting: state filter is retained"),
    check(empty.noOverflow, "recruiting: filtered page has no overflow"),
  ];
}

/**
 * Checks recruiting tables at mobile breakpoints and restores desktop sizing.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Mobile recruiting overflow assertions.
 */
async function smokeRecruitingMobile(page: Page): Promise<readonly Check[]> {
  const checks = await RECRUITING_MOBILE_VIEWPORTS.reduce<
    Promise<readonly Check[]>
  >(
    async (previous, viewport) => [
      ...(await previous),
      await smokeRecruitingViewport(page, viewport),
    ],
    Promise.resolve([])
  );
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return checks;
}

/**
 * Checks recruiting overflow at one viewport.
 * @param page - Browser page shared by smoke scenarios.
 * @param viewport - Viewport under test.
 * @returns Overflow assertion for the viewport.
 */
async function smokeRecruitingViewport(
  page: Page,
  viewport: RecruitingViewport
): Promise<Check> {
  await page.setViewportSize(viewport);
  await smokeGoto(page, `${BASE}/recruiting`);
  await smokeWaitForSelector(page, ".recruiting-table", QUICK_UI_TIMEOUT);
  await shot(page, `10-recruiting-${viewport.width}`);
  return recruitingOverflowCheck(
    await readRecruitingOverflow(page),
    `${viewport.width}px`
  );
}

/**
 * Reads page and table-wrapper overflow on the recruiting page.
 * @param page - Browser page to inspect.
 * @returns Overflow metrics in CSS pixels.
 */
async function readRecruitingOverflow(page: Page): Promise<{
  readonly maxTableOverflow: number;
  readonly pageOverflow: number;
}> {
  return await page.evaluate(() => {
    const tableOverflows = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".snap-table-scroll:has(.recruiting-table)"
      )
    ).map(wrapper => wrapper.scrollWidth - wrapper.clientWidth);
    return {
      maxTableOverflow: Math.max(0, ...tableOverflows),
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      ),
    };
  });
}

/**
 * Builds an overflow smoke assertion for a recruiting viewport.
 * @param overflow - Measured page and table overflow.
 * @param viewport - Human-readable viewport label.
 * @returns Smoke check result.
 */
function recruitingOverflowCheck(
  overflow: Readonly<{ maxTableOverflow: number; pageOverflow: number }>,
  viewport: string
): Check {
  return check(
    overflow.pageOverflow === 0 && overflow.maxTableOverflow <= 16,
    `recruiting: ${viewport} table overflow is bounded`,
    `page +${overflow.pageOverflow}px, table +${overflow.maxTableOverflow}px`
  );
}

/**
 * [EVIDENCE: search-kind-filter] scenario for issue #250. Drives the global
 * navbar search-kind toggle (Advisors / Firms / Teams), introduced by #248,
 * and asserts: /Search?kind=<...> returns 2xx, visible rows match the chosen
 * kind, the count hint names the kind, and aria-pressed flips on the active
 * toggle.
 */
import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  check,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";
import {
  SEARCH_COUNT_HINT,
  SEARCH_KIND_CASES,
  SEARCH_RESULT_ROWS,
  type SearchKindCase,
} from "./web_smoke_high_signal_evidence_shared.js";

/** Per-kind observation captured after pressing the search-kind toggle. */
interface SearchKindObservation {
  readonly kindCase: SearchKindCase;
  readonly responseUrl: string;
  readonly responseStatus: number;
  readonly visibleKinds: readonly string[];
  readonly countHint: string;
  readonly buttonPressed: string;
}

/**
 * Drives each search-kind toggle (advisor/firm/team) and captures the
 * `/Search?kind=...` payload and visible kind rows.
 * @param page - Desktop page provided by the smoke runner.
 * @returns Per-kind evidence assertions.
 */
export async function captureSearchKindEvidence(
  page: Page
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const input = page.locator("#global-search");
  await input.fill("wells");
  await page
    .locator(SEARCH_RESULT_ROWS)
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });

  const observations = await SEARCH_KIND_CASES.reduce<
    Promise<readonly SearchKindObservation[]>
  >(
    async (previous, kindCase) => [
      ...(await previous),
      await observeSearchKind(page, kindCase),
    ],
    Promise.resolve([])
  );

  return observations.flatMap(searchKindObservationChecks);
}

function searchKindObservationChecks(
  observation: SearchKindObservation
): readonly Check[] {
  return [
    check(
      observation.responseStatus === 200,
      `[EVIDENCE: search-kind-filter] ${observation.kindCase.kind} request returns 2xx`,
      `${observation.responseUrl} status=${observation.responseStatus}`
    ),
    check(
      observation.responseUrl.includes(`kind=${observation.kindCase.kind}`),
      `[EVIDENCE: search-kind-filter] ${observation.kindCase.kind} request carries kind param`,
      observation.responseUrl
    ),
    check(
      visibleKindsMatch(observation),
      `[EVIDENCE: search-kind-filter] ${observation.kindCase.kind} mode renders only ${observation.kindCase.kind} rows`,
      observation.visibleKinds.join(",")
    ),
    check(
      observation.buttonPressed === "true",
      `[EVIDENCE: search-kind-filter] ${observation.kindCase.kind} toggle reports aria-pressed`,
      observation.buttonPressed
    ),
    check(
      observation.countHint.toLowerCase().includes("no matches") ||
        observation.countHint
          .toLowerCase()
          .includes(`${observation.kindCase.kind} matches`),
      `[EVIDENCE: search-kind-filter] ${observation.kindCase.kind} count hint names kind`,
      observation.countHint
    ),
  ];
}

function visibleKindsMatch(observation: SearchKindObservation): boolean {
  const expected = observation.kindCase.rowKindLabel.toLowerCase();
  return (
    observation.visibleKinds.length > 0 &&
    observation.visibleKinds.every(
      kind => kind.trim().toLowerCase() === expected
    )
  );
}

/**
 * Switches to one search kind and captures /Search payload + visible rows.
 * @param page - Desktop page with the search input already filled.
 * @param kindCase - Kind toggle being observed.
 * @returns Captured kind-mode observation.
 */
async function observeSearchKind(
  page: Page,
  kindCase: SearchKindCase
): Promise<SearchKindObservation> {
  const responsePromise = page.waitForResponse(
    response => {
      const url = new URL(response.url());
      return (
        url.pathname === "/Search" &&
        url.searchParams.get("q") === "wells" &&
        url.searchParams.get("kind") === kindCase.kind
      );
    },
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  await page.getByRole("button", { name: kindCase.buttonName }).click();
  const response = await responsePromise;
  await page.locator("#global-search-results").first().waitFor({
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await shot(page, `04-evidence-search-kind-${kindCase.kind}`);

  const observed = await readSearchKindState(page, kindCase);

  return {
    kindCase,
    responseUrl: response.url(),
    responseStatus: response.status(),
    visibleKinds: observed.visibleKinds,
    countHint: observed.countHint,
    buttonPressed: observed.buttonPressed,
  };
}

async function readSearchKindState(page: Page, kindCase: SearchKindCase) {
  const countHint =
    (await page
      .locator(SEARCH_COUNT_HINT)
      .first()
      .textContent()
      .catch(() => "")) ||
    (await page.locator("#global-search-results").first().textContent()) ||
    "";
  return {
    buttonPressed:
      (await page
        .getByRole("button", { name: kindCase.buttonName })
        .getAttribute("aria-pressed")) ?? "",
    countHint: countHint.trim(),
    visibleKinds: await page
      .locator(`${SEARCH_RESULT_ROWS} .gs-kind`)
      .allTextContents(),
  };
}

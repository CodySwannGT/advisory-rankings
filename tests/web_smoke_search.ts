import type { Locator, Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  FEED_HEADLINE_SELECTOR,
  check,
  cleanProfilePath,
  shot,
  type Check,
} from "./web_smoke_support.js";

/** Search result kinds that map directly to public profile route segments. */
type SearchKind = "advisor" | "firm" | "team";

/**
 * Checks global search suggestions and keyboard navigation against backend data.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for global search.
 */
export async function smokeGlobalSearch(page: Page): Promise<readonly Check[]> {
  const input = page.locator("#global-search");
  const results = page.locator("#global-search-results .gs-item");

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FEED_HEADLINE_SELECTOR, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await input.fill("wells");
  await results.first().waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "02-global-search");

  const firstResult = results.first();
  const firstKind = normalizeSearchKind(
    (await firstResult.locator(".gs-kind").textContent()) ?? ""
  );
  const firstHref = await firstResult.getAttribute("href");
  const expectedPath = new URL(firstHref ?? "/", BASE).pathname;
  const dropdownExpanded = await input.evaluate(
    element => element.getAttribute("aria-expanded") === "true"
  );
  const resultCount = await results.count();
  const supportedKinds = await supportedSearchKindCount(results);

  await input.press("ArrowDown");
  const activeRows = await page.locator(".gs-item-active").count();
  await input.press("Enter");
  await page.waitForURL(url => url.pathname === expectedPath, {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });

  return [
    check(dropdownExpanded, "global search: suggestions dropdown opens"),
    check(resultCount >= 1, "global search: selectable suggestions render"),
    check(
      supportedKinds >= 1,
      "global search: advisor, firm, or team result renders"
    ),
    check(activeRows === 1, "global search: ArrowDown selects one result"),
    check(
      firstKind !== null &&
        cleanProfilePath(pluralSearchKind(firstKind), page.url()),
      "global search: Enter opens clean profile route",
      page.url()
    ),
  ];
}

const normalizeSearchKind = (value: string): SearchKind | null =>
  value.trim().toLowerCase() === "advisor"
    ? "advisor"
    : value.trim().toLowerCase() === "team"
      ? "team"
      : value.trim().toLowerCase() === "firm"
        ? "firm"
        : null;

const pluralSearchKind = (kind: SearchKind): string => `${kind}s`;

/**
 * Counts search suggestions whose row type is one of the supported entities.
 * @param results - Search result rows rendered by the global search dropdown.
 * @returns Number of advisor, firm, or team suggestions.
 */
async function supportedSearchKindCount(results: Locator): Promise<number> {
  const kinds = await results.locator(".gs-kind").allTextContents();
  return kinds.filter(kind =>
    ["advisor", "firm", "team"].includes(kind.trim().toLowerCase())
  ).length;
}

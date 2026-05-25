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

const ENTITY_ROW_SELECTOR = ".entity-list .row";
const NOT_FOUND_CARD_SELECTOR = ".detail-not-found-card";

/**
 *
 */
type NotFoundRouteCheck = Readonly<
  Record<
    | "kind"
    | "path"
    | "title"
    | "actionLabel"
    | "destinationPath"
    | "destinationSelector",
    string
  >
>;

const NOT_FOUND_ROUTE_CHECKS: readonly NotFoundRouteCheck[] = [
  {
    kind: "advisor",
    path: "/advisors/missing-advisor",
    title: "Advisor not found",
    actionLabel: "Back to Advisors",
    destinationPath: "/advisors",
    destinationSelector: ENTITY_ROW_SELECTOR,
  },
  {
    kind: "firm",
    path: "/firms/missing-firm",
    title: "Firm not found",
    actionLabel: "Back to Firms",
    destinationPath: "/firms",
    destinationSelector: ENTITY_ROW_SELECTOR,
  },
  {
    kind: "team",
    path: "/teams/missing-team",
    title: "Team not found",
    actionLabel: "Back to Teams",
    destinationPath: "/teams",
    destinationSelector: ENTITY_ROW_SELECTOR,
  },
  {
    kind: "article",
    path: "/articles/missing-article",
    title: "Article not found",
    actionLabel: "Back to Articles",
    destinationPath: "/",
    destinationSelector: FEED_HEADLINE_SELECTOR,
  },
] as const;

/**
 * Verifies deployed not-found behavior and recovery navigation across
 * advisor, firm, team, and article detail routes.
 * @param page - Browser page used for scenario navigation.
 * @returns Smoke assertions for not-found copy and recovery affordances.
 */
export async function smokeNotFoundRecovery(
  page: Page
): Promise<readonly Check[]> {
  return await runRouteChecks(page, NOT_FOUND_ROUTE_CHECKS);
}

/**
 * Recursively executes each not-found route check and flattens the results.
 * @param page - Browser page used for navigation.
 * @param routeChecks - Remaining route checks to run.
 * @returns Collected checks from every route scenario.
 */
async function runRouteChecks(
  page: Page,
  routeChecks: readonly NotFoundRouteCheck[]
): Promise<readonly Check[]> {
  const [first, ...rest] = routeChecks;
  if (!first) return [];
  return [
    ...(await runRouteCheck(page, first)),
    ...(await runRouteChecks(page, rest)),
  ];
}

/**
 * Runs one route-level not-found scenario and validates recovery behavior.
 * @param page - Browser page used for navigation.
 * @param routeCheck - Route configuration for the entity under test.
 * @returns Checks for title copy, error-safety copy, and recovery navigation.
 */
async function runRouteCheck(
  page: Page,
  routeCheck: NotFoundRouteCheck
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}${routeCheck.path}`);
  await smokeWaitForSelector(page, NOT_FOUND_CARD_SELECTOR);
  await shot(page, `07-not-found-${routeCheck.kind}`);

  const cardText = (await page.locator(NOT_FOUND_CARD_SELECTOR).textContent())
    ?.replace(/\s+/g, " ")
    .trim();
  const hasTitle =
    (await page
      .locator(NOT_FOUND_CARD_SELECTOR)
      .getByText(routeCheck.title, { exact: true })
      .count()) >= 1;

  await page
    .locator(NOT_FOUND_CARD_SELECTOR)
    .getByRole("button", { name: routeCheck.actionLabel, exact: true })
    .click();
  await page.waitForURL(new RegExp(`${routeCheck.destinationPath}$`), {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await smokeWaitForSelector(page, routeCheck.destinationSelector);

  return [
    check(
      hasTitle,
      `not-found ${routeCheck.kind}: entity-specific title rendered`
    ),
    check(
      !/(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(cardText || "") &&
        !/\b(4\d{2}|5\d{2})\b/.test(cardText || ""),
      `not-found ${routeCheck.kind}: no raw backend error text`,
      cardText
    ),
    check(
      new URL(page.url()).pathname === routeCheck.destinationPath,
      `not-found ${routeCheck.kind}: recovery navigates to ${routeCheck.destinationPath}`,
      page.url()
    ),
    check(
      (await page.locator(routeCheck.destinationSelector).count()) >= 1,
      `not-found ${routeCheck.kind}: recovery destination is interactive`
    ),
  ];
}

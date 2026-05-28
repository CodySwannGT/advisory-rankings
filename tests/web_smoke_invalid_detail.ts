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

/**
 * Deployed smoke coverage for the legacy detail resource routes that PR #752
 * (issue #280) wired through resource-level content negotiation.
 *
 * Where {@link import("./web_smoke_not_found.js").smokeNotFoundRecovery} covers
 * the SPA's slug routes (`/advisors/<slug>`, `/firms/<slug>`, ...), this
 * scenario covers the legacy detail resource paths (`/AdvisorProfile/<id>`,
 * `/FirmProfile/<id>`, `/TeamProfile/<id>`, `/ArticleView/<id>`). These are the
 * REST endpoints whose default JSON response leaked through to the page body
 * before issue #280 — a stale/shared link would render `{"error":"not found"}`
 * instead of the app shell. Issue #281 asserts that:
 *
 * - A browser document navigation (Accept: text/html) renders the same
 *   `.detail-not-found-card` recovery state the slug routes show.
 * - The raw JSON error envelope is never visible in the rendered page body.
 * - The recovery CTA navigates back to a working public route whose primary
 *   surface is interactive.
 * - The SPA's own `api()` data fetch (Accept: application/json) still receives
 *   the JSON resource payload, so non-browser API access is unchanged.
 */

const ENTITY_ROW_SELECTOR = ".entity-list .row";
const NOT_FOUND_CARD_SELECTOR = ".detail-not-found-card";
const RAW_JSON_NEEDLE = /\{\s*"error"\s*:\s*"[^"]*not\s*found/i;
const HTTP_VERB_RE = /(GET|POST|PUT|PATCH|DELETE)\s+\//i;
const HTTP_STATUS_RE = /\b(4\d{2}|5\d{2})\b/;

/** One invalid-detail-route scenario keyed off the resource name in the path. */
type InvalidDetailRouteCheck = Readonly<
  Record<
    | "kind"
    | "resource"
    | "path"
    | "title"
    | "actionLabel"
    | "destinationPath"
    | "destinationSelector",
    string
  >
>;

const INVALID_DETAIL_ROUTE_CHECKS: readonly InvalidDetailRouteCheck[] = [
  {
    kind: "advisor",
    resource: "AdvisorProfile",
    path: "/AdvisorProfile/issue-281-invalid",
    title: "Advisor not found",
    actionLabel: "Back to Advisors",
    destinationPath: "/advisors",
    destinationSelector: ENTITY_ROW_SELECTOR,
  },
  {
    kind: "firm",
    resource: "FirmProfile",
    path: "/FirmProfile/issue-281-invalid",
    title: "Firm not found",
    actionLabel: "Back to Firms",
    destinationPath: "/firms",
    destinationSelector: ENTITY_ROW_SELECTOR,
  },
  {
    kind: "team",
    resource: "TeamProfile",
    path: "/TeamProfile/issue-281-invalid",
    title: "Team not found",
    actionLabel: "Back to Teams",
    destinationPath: "/teams",
    destinationSelector: ENTITY_ROW_SELECTOR,
  },
  {
    kind: "article",
    resource: "ArticleView",
    path: "/ArticleView/issue-281-invalid",
    title: "Article not found",
    actionLabel: "Back to Articles",
    destinationPath: "/",
    destinationSelector: FEED_HEADLINE_SELECTOR,
  },
] as const;

/**
 * Verifies invalid-ID document navigation to the four legacy detail resource
 * routes (`/AdvisorProfile/<id>`, `/FirmProfile/<id>`, `/TeamProfile/<id>`,
 * `/ArticleView/<id>`) renders the in-app not-found shell and recovers to a
 * working public route, and that the SPA's own JSON data fetch is unaffected.
 *
 * @param page - Browser page used for scenario navigation.
 * @returns Smoke assertions for shell handoff, recovery, and JSON parity.
 */
export async function smokeInvalidDetailRecovery(
  page: Page
): Promise<readonly Check[]> {
  return await runRouteChecks(page, INVALID_DETAIL_ROUTE_CHECKS);
}

/**
 * Recursively executes each invalid-detail route check and flattens the
 * results. Modeled after the analogous helper in `web_smoke_not_found.ts` so
 * both scenarios share the same fold-without-mutation shape.
 *
 * @param page - Browser page used for navigation.
 * @param routeChecks - Remaining route checks to run.
 * @returns Collected checks from every route scenario.
 */
async function runRouteChecks(
  page: Page,
  routeChecks: readonly InvalidDetailRouteCheck[]
): Promise<readonly Check[]> {
  const [first, ...rest] = routeChecks;
  if (!first) return [];
  return [
    ...(await runRouteCheck(page, first)),
    ...(await runRouteChecks(page, rest)),
  ];
}

/**
 * Runs one legacy-resource invalid-ID scenario. Asserts:
 * 1. Document navigation renders the HTML app shell (not raw JSON), with
 *    the resource-specific not-found title and a visible recovery CTA.
 * 2. The page body never exposes the `{"error":"not found"}` envelope or
 *    other backend-noise patterns (HTTP verbs, raw status codes).
 * 3. The recovery CTA navigates back to a working public route whose
 *    primary surface is interactive.
 * 4. The same path probed with `Accept: application/json` still returns the
 *    JSON resource payload — the shell handoff is browser-only, so the
 *    SPA's `api()` data fetch is unchanged.
 *
 * @param page - Browser page used for navigation.
 * @param routeCheck - Resource configuration for the route under test.
 * @returns Checks for shell rendering, JSON-leak safety, recovery, and JSON
 *   parity for non-browser clients.
 */
async function runRouteCheck(
  page: Page,
  routeCheck: InvalidDetailRouteCheck
): Promise<readonly Check[]> {
  // 1) Probe the JSON contract first while the page is detached from the
  // request. The SPA's api() helper sets Accept: application/json on every
  // fetch; the negotiation MUST keep returning JSON for that case so non-
  // browser clients (and the SPA itself) are unaffected by the shell handoff.
  const jsonResponse = await page.request.get(`${BASE}${routeCheck.path}`, {
    headers: { Accept: "application/json" },
    failOnStatusCode: false,
  });
  const jsonContentType = jsonResponse.headers()["content-type"] ?? "";
  const jsonBodyText = await jsonResponse.text();

  // 2) Document-navigation: a real browser navigation sends an HTML Accept,
  // so the legacy resource must serve the shell that boots the SPA page.
  await smokeGoto(page, `${BASE}${routeCheck.path}`);
  await smokeWaitForSelector(page, NOT_FOUND_CARD_SELECTOR);
  await shot(page, `13-invalid-detail-${routeCheck.kind}`);

  const cardLocator = page.locator(NOT_FOUND_CARD_SELECTOR);
  const cardText = (await cardLocator.textContent())
    ?.replace(/\s+/g, " ")
    .trim();
  const hasTitle =
    (await cardLocator.getByText(routeCheck.title, { exact: true }).count()) >=
    1;

  // Pull the full visible body text so we can prove the raw JSON envelope is
  // not rendered. Document-mode navigations to the same legacy resources used
  // to dump `{"error":"not found"}` straight into <body>, which is the
  // regression #281 guards against.
  const bodyText = ((await page.locator("body").textContent()) ?? "")
    .replace(/\s+/g, " ")
    .trim();

  // 3) Recovery: the CTA must navigate to a working public route whose
  // primary surface is interactive (the entity list, or the feed).
  await cardLocator
    .getByRole("button", { name: routeCheck.actionLabel, exact: true })
    .click();
  await page.waitForURL(new RegExp(`${routeCheck.destinationPath}$`), {
    timeout: DEPLOYED_DATA_TIMEOUT,
  });
  await smokeWaitForSelector(page, routeCheck.destinationSelector);

  return [
    check(
      hasTitle,
      `invalid-detail ${routeCheck.kind}: resource-specific title rendered`
    ),
    check(
      !HTTP_VERB_RE.test(cardText || "") &&
        !HTTP_STATUS_RE.test(cardText || ""),
      `invalid-detail ${routeCheck.kind}: no raw backend error text in card`,
      cardText
    ),
    check(
      !RAW_JSON_NEEDLE.test(bodyText),
      `invalid-detail ${routeCheck.kind}: raw JSON error envelope not rendered as page body`,
      bodyText.slice(0, 160)
    ),
    check(
      new URL(page.url()).pathname === routeCheck.destinationPath,
      `invalid-detail ${routeCheck.kind}: recovery navigates to ${routeCheck.destinationPath}`,
      page.url()
    ),
    check(
      (await page.locator(routeCheck.destinationSelector).count()) >= 1,
      `invalid-detail ${routeCheck.kind}: recovery destination is interactive`
    ),
    // JSON contract parity — Accept: application/json must NOT receive the
    // shell. The negotiation honors the explicit JSON Accept and the resource
    // returns its normal not-found JSON payload (or any non-HTML body).
    check(
      !/text\/html/i.test(jsonContentType),
      `invalid-detail ${routeCheck.kind}: api() Accept=json still receives JSON, not HTML shell`,
      `content-type=${jsonContentType}`
    ),
    check(
      !jsonBodyText.trimStart().startsWith("<"),
      `invalid-detail ${routeCheck.kind}: api() Accept=json response body is not HTML`,
      jsonBodyText.slice(0, 80)
    ),
  ];
}

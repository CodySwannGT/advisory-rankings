import type { Page } from "playwright";

import {
  BASE,
  QUICK_UI_TIMEOUT,
  check,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

/** Public route metadata used by the semantic heading smoke checks. */
interface HeadingRoute {
  readonly label: string;
  readonly path: string;
  readonly readySelector: string;
  readonly title: string;
}

const ENTITY_ROW_SELECTOR = ".entity-list .row";

const HEADING_ROUTES: readonly HeadingRoute[] = [
  {
    label: "home",
    path: "/",
    readySelector: "article.card .post-headline",
    title: "AdvisorBook feed",
  },
  {
    label: "firms",
    path: "/firms",
    readySelector: ENTITY_ROW_SELECTOR,
    title: "Firm directory",
  },
  {
    label: "advisors",
    path: "/advisors",
    readySelector: ENTITY_ROW_SELECTOR,
    title: "Advisor directory",
  },
  {
    label: "teams",
    path: "/teams",
    readySelector: ENTITY_ROW_SELECTOR,
    title: "Team directory",
  },
  {
    label: "rankings",
    path: "/rankings",
    readySelector: ".rankings-table",
    title: "Interactive Rankings Explorer",
  },
  {
    label: "recruiting",
    path: "/recruiting",
    readySelector: ".recruiting-table",
    title: "Recruiting Market Map",
  },
  {
    label: "regulatory",
    path: "/regulatory",
    readySelector: ".event-card.disclosure",
    title: "Compliance events",
  },
  {
    label: "compare",
    path: "/compare?ids=advisor-a,advisor-b",
    readySelector: ".comparison-table",
    title: "Advisor comparison",
  },
];

/**
 * Verifies every top-level public route exposes one route-specific h1 while
 * preserving the visible section/card heading hierarchy below it.
 * @param page - Browser page shared by smoke scenarios.
 * @returns Semantic heading assertions for public pages.
 */
export async function smokePublicPageHeadings(
  page: Page
): Promise<readonly Check[]> {
  return await smokePublicPageHeadingsForRoutes(page, HEADING_ROUTES);
}

/**
 * Verifies the semantic heading contract for one public route.
 * @param page - Browser page shared by smoke scenarios.
 * @param route - Public route metadata and expected h1 copy.
 * @returns Heading assertions for the route.
 */
async function smokePublicPageHeading(
  page: Page,
  route: HeadingRoute
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}${route.path}`);
  await smokeWaitForSelector(page, route.readySelector, QUICK_UI_TIMEOUT);

  const heading = await page.evaluate(() => {
    const h1s = [...document.querySelectorAll("h1")];
    const firstH1 = h1s[0];
    const lowerHeadingsAfterTitle = [...document.querySelectorAll("h2, h3")]
      .filter(node =>
        firstH1
          ? Boolean(
              firstH1.compareDocumentPosition(node) &
              Node.DOCUMENT_POSITION_FOLLOWING
            )
          : false
      )
      .map(node => node.textContent?.trim())
      .filter(Boolean);

    return {
      h1Count: h1s.length,
      h1Text: firstH1?.textContent?.trim() ?? "",
      lowerHeadingCount: lowerHeadingsAfterTitle.length,
    };
  });

  return [
    check(
      heading.h1Count === 1,
      `${route.label}: exactly one page-level h1`,
      `found ${heading.h1Count}`
    ),
    check(
      heading.h1Text === route.title,
      `${route.label}: h1 matches route purpose`,
      heading.h1Text
    ),
    check(
      heading.lowerHeadingCount > 0,
      `${route.label}: section headings remain below h1`,
      `found ${heading.lowerHeadingCount}`
    ),
  ];
}

/**
 * Verifies semantic heading contracts for an ordered list of public routes.
 * @param page - Browser page shared by smoke scenarios.
 * @param routes - Remaining routes to inspect.
 * @returns Heading assertions for all routes.
 */
async function smokePublicPageHeadingsForRoutes(
  page: Page,
  routes: readonly HeadingRoute[]
): Promise<readonly Check[]> {
  const [route, ...remainingRoutes] = routes;
  if (!route) return [];

  return [
    ...(await smokePublicPageHeading(page, route)),
    ...(await smokePublicPageHeadingsForRoutes(page, remainingRoutes)),
  ];
}

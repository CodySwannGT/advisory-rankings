import type { Browser, Page } from "playwright";

import {
  BASE,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  isLocalDev,
  newContext,
  shot,
  smokeGoto,
  type Check,
} from "./web_smoke_support.js";

const COVERAGE_ROUTE = "/coverage";
const COVERAGE_HEADING = "Data coverage";
const DEV_BACKEND_BASE =
  process.env.SMOKE_DATA_BASE_URL ||
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const PRIVATE_RESOURCE_PATTERN = /\/(?:UserWatchlists|AdvisorRating)\b/u;
const PROXIED_RESOURCE_PATHS = ["/DataCoverage", "/Me"] as const;
const REQUIRED_SECTION_IDS = [
  "public-entity-groups",
  "rankings",
  "recruiting",
  "research-freshness",
] as const;
const REQUIRED_METRIC_LABELS = [
  "Advisors",
  "Firms",
  "Articles",
  "Ranking",
  "Moves",
  "Latest research check",
] as const;
const REQUIRED_LINKS = [
  ["Open rankings", "/rankings?resolved=unresolved"],
  ["Open recruiting", "/recruiting"],
  [
    "Open research queue",
    "/research/freshness?sourceType=web_research&staleDays=30&status=&missingField=&limit=25",
  ],
] as const;
const PRIVATE_TEXT_PATTERNS = [
  /analyst@example/i,
  /private rating/i,
  /UserWatchlists/u,
  /AdvisorRating/u,
] as const;

/** Coverage dashboard DOM facts captured from one viewport. */
interface CoverageDashboardEvidence {
  readonly bodyText: string;
  readonly h1Text: string;
  readonly hiddenPrivateCopy: readonly string[];
  readonly linkHrefs: Readonly<Record<string, string | null>>;
  readonly metricLabels: readonly string[];
  readonly privateRequests: readonly string[];
  readonly scrollWidth: number;
  readonly sectionIds: readonly string[];
  readonly viewportWidth: number;
}

/**
 * Verifies the public Data Coverage dashboard against the live backend.
 * @param page - Desktop smoke page shared by the full smoke journey.
 * @param browser - Browser used to open an isolated mobile context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Coverage dashboard smoke assertions.
 */
export async function smokeCoverageDashboard(
  page: Page,
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  await proxyCoverageResources(page);
  await smokeGoto(page, `${BASE}${COVERAGE_ROUTE}`);
  await waitForCoverageDashboard(page);
  await shot(page, "coverage-dashboard-desktop");
  const desktop = await readCoverageDashboardEvidence(page);

  return [
    ...coverageChecks("coverage desktop", desktop),
    ...(await smokeCoverageDashboardMobile(browser, extraHTTPHeaders)),
  ];
}

/**
 * Verifies the dashboard at a narrow mobile viewport.
 * @param browser - Browser used to open a mobile context.
 * @param extraHTTPHeaders - Optional auth headers for deployed checks.
 * @returns Mobile coverage dashboard assertions.
 */
async function smokeCoverageDashboardMobile(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 390, height: 844 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  await proxyCoverageResources(page);

  await smokeGoto(page, `${BASE}${COVERAGE_ROUTE}`);
  await waitForCoverageDashboard(page);
  await shot(page, "coverage-dashboard-mobile");
  const evidence = await readCoverageDashboardEvidence(page);

  return await closeWithChecks(context, [
    ...coverageChecks("coverage mobile", evidence),
  ]);
}

/**
 * Proxies coverage resources when local static assets are served without a
 * Harper resource listener, matching the documented local replay setup.
 * @param page - Browser page whose route table should receive proxy handlers.
 */
async function proxyCoverageResources(page: Page): Promise<void> {
  if (!isLocalDev || BASE.endsWith(":9926")) return;

  await page.route(`**${COVERAGE_ROUTE}`, async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname !== COVERAGE_ROUTE) {
      await route.fallback();
      return;
    }
    const response = await page.request.fetch(`${BASE}/coverage.html`);
    await route.fulfill({ response });
  });

  for (const path of PROXIED_RESOURCE_PATHS) {
    await page.route(`**${path}`, async route => {
      const response = await page.request.fetch(`${DEV_BACKEND_BASE}${path}`);
      await route.fulfill({ response });
    });
  }
}

/**
 * Waits for the route chrome and public coverage payload to render.
 * @param page - Browser page to inspect.
 */
async function waitForCoverageDashboard(page: Page): Promise<void> {
  await page
    .getByRole("heading", { name: COVERAGE_HEADING, exact: true })
    .waitFor({ timeout: QUICK_UI_TIMEOUT });
  await page.waitForFunction(
    expectedSections =>
      expectedSections.every(section =>
        document.querySelector(`[data-coverage-section="${section}"]`)
      ),
    REQUIRED_SECTION_IDS,
    { timeout: QUICK_UI_TIMEOUT }
  );
}

/**
 * Reads user-visible coverage dashboard evidence from the current page.
 * @param page - Browser page to inspect.
 * @returns DOM and request evidence.
 */
async function readCoverageDashboardEvidence(
  page: Page
): Promise<CoverageDashboardEvidence> {
  return await page.evaluate(
    ({ links, privatePatterns, privateResourcePattern }) => {
      const bodyText = document.body.innerText;
      const textMatches = (pattern: string) =>
        new RegExp(pattern, "i").test(bodyText);
      const privateResource = new RegExp(privateResourcePattern);

      return {
        bodyText,
        h1Text: document.querySelector("h1")?.textContent?.trim() ?? "",
        hiddenPrivateCopy: privatePatterns.filter(textMatches),
        linkHrefs: Object.fromEntries(
          links.map(([label]) => {
            const href =
              [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
                link => link.textContent?.trim() === label
              )?.href ?? null;
            if (!href) return [label, null];
            const url = new URL(href);
            return [label, `${url.pathname}${url.search}`];
          })
        ),
        metricLabels: [
          ...document.querySelectorAll<HTMLElement>(".coverage-metric-label"),
        ].map(metric => metric.textContent?.trim() ?? ""),
        privateRequests: performance
          .getEntriesByType("resource")
          .map(entry => entry.name)
          .filter(name => privateResource.test(new URL(name).pathname)),
        scrollWidth: document.documentElement.scrollWidth,
        sectionIds: [
          ...document.querySelectorAll<HTMLElement>("[data-coverage-section]"),
        ].map(section => section.dataset.coverageSection ?? ""),
        viewportWidth: document.documentElement.clientWidth,
      };
    },
    {
      links: REQUIRED_LINKS,
      privatePatterns: PRIVATE_TEXT_PATTERNS.map(pattern => pattern.source),
      privateResourcePattern: PRIVATE_RESOURCE_PATTERN.source,
    }
  );
}

/**
 * Builds assertions for one viewport's coverage dashboard evidence.
 * @param label - Prefix for smoke check labels.
 * @param evidence - DOM and request evidence to assert.
 * @returns Smoke checks for the viewport.
 */
function coverageChecks(
  label: string,
  evidence: CoverageDashboardEvidence
): readonly Check[] {
  return [
    check(evidence.h1Text === COVERAGE_HEADING, `${label}: h1 renders`),
    check(
      evidence.bodyText.includes("Public data coverage"),
      `${label}: public summary renders`
    ),
    check(
      REQUIRED_SECTION_IDS.every(section =>
        evidence.sectionIds.includes(section)
      ),
      `${label}: required sections render`,
      evidence.sectionIds.join(", ")
    ),
    requiredMetricsCheck(label, evidence),
    ...REQUIRED_LINKS.map(([linkLabel, href]) =>
      check(
        evidence.linkHrefs[linkLabel] === href,
        `${label}: ${linkLabel} destination is public`,
        evidence.linkHrefs[linkLabel] ?? "missing"
      )
    ),
    check(
      evidence.hiddenPrivateCopy.length === 0,
      `${label}: private user copy is absent`,
      evidence.hiddenPrivateCopy.join(", ")
    ),
    check(
      evidence.privateRequests.length === 0,
      `${label}: no private resources requested`,
      evidence.privateRequests.join(", ")
    ),
    check(
      evidence.scrollWidth <= evidence.viewportWidth,
      `${label}: no horizontal overflow`,
      `${evidence.scrollWidth}/${evidence.viewportWidth}`
    ),
  ];
}

/**
 * Builds the required metrics smoke assertion.
 * @param label - Prefix for smoke check labels.
 * @param evidence - DOM evidence to assert.
 * @returns Required metric check.
 */
function requiredMetricsCheck(
  label: string,
  evidence: CoverageDashboardEvidence
): Check {
  return check(
    REQUIRED_METRIC_LABELS.every(required =>
      evidence.metricLabels.some(labelText => labelText.includes(required))
    ),
    `${label}: required metrics render`,
    evidence.metricLabels.join(", ")
  );
}

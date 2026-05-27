import type { Locator, Page } from "playwright";
import {
  BASE,
  FEED_HEADLINE_SELECTOR,
  QUICK_UI_TIMEOUT,
  check,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const EXPECTED_BROWSE_LABELS = [
  "Home",
  "Firms",
  "Recruiting",
  "Rankings",
  "Advisors",
  "Teams",
  "Compliance",
];
const RAW_IDENTIFIER_PATTERN = /\b[a-z]+(?:_[a-z0-9]+)+\b/;
const PUBLIC_WEB_RESEARCH_OPTION_MISSING =
  "public_web_research option not present";

/**
 * Checks feed copy and browse labels on the public home route.
 * @param page - Browser page rendering the feed.
 * @returns Smoke assertions for reader-facing feed copy.
 */
export async function feedCopyGuardrailChecks(
  page: Page
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/`);
  await smokeWaitForSelector(page, FEED_HEADLINE_SELECTOR);
  const metadata = await visibleFeedMetadata(page);
  const categoryCopy = await visibleFeedCategoryCopy(page);
  return [
    check(
      metadata.length > 0,
      "/ feed copy: visible card metadata is available"
    ),
    check(
      metadata.every(text => !RAW_IDENTIFIER_PATTERN.test(text)),
      "/ feed copy: card metadata avoids raw underscore identifiers",
      metadata.filter(text => RAW_IDENTIFIER_PATTERN.test(text)).join(" | ")
    ),
    check(
      categoryCopy.optionLabel === null ||
        categoryCopy.optionLabel === "Advisor research",
      "/ feed copy: web research category option is reader-facing",
      categoryCopy.optionLabel || PUBLIC_WEB_RESEARCH_OPTION_MISSING
    ),
    check(
      categoryCopy.summary === null ||
        categoryCopy.summary.includes("Advisor research"),
      "/ feed copy: filter summary uses reader-facing category copy",
      categoryCopy.summary || PUBLIC_WEB_RESEARCH_OPTION_MISSING
    ),
    check(
      categoryCopy.urlCategory === null ||
        categoryCopy.urlCategory === "public_web_research",
      "/ feed copy: category filter keeps machine URL value",
      categoryCopy.urlCategory || PUBLIC_WEB_RESEARCH_OPTION_MISSING
    ),
    ...(await browseLabelChecks(page, "/ feed")),
    copyGuardFixtureCheck(),
  ];
}

/**
 * Checks browse labels on a profile route.
 * @param page - Browser page rendering a profile.
 * @param routeLabel - Scenario label prefix.
 * @returns Smoke assertions for Browse navigation copy.
 */
export async function browseLabelChecks(
  page: Page,
  routeLabel: string
): Promise<readonly Check[]> {
  const rawLabels = await page
    .locator(".left .card", { hasText: "Browse" })
    .first()
    .locator("a")
    .evaluateAll(nodes =>
      nodes.map(node => node.textContent?.trim() || "").filter(Boolean)
    );
  const labels = rawLabels.map(readableNavLabel);

  return [
    check(
      labels.join("|") === EXPECTED_BROWSE_LABELS.join("|"),
      `${routeLabel}: Browse labels match primary navigation`,
      labels.join(", ")
    ),
  ];
}

/**
 * Removes decorative icon text from Browse navigation labels.
 * @param value - Raw link text.
 * @returns Reader-facing navigation label.
 */
function readableNavLabel(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^[^A-Za-z]+/, "");
}

/**
 * Checks firm profile due-diligence controls and explanations.
 * @param section - Firm due-diligence card.
 * @returns Smoke assertions for firm due-diligence affordances.
 */
export async function firmCopyGuardrailChecks(
  section: Locator
): Promise<readonly Check[]> {
  const chipMetrics = await section
    .locator(".firm-dd-filter")
    .evaluateAll(buttons =>
      buttons.map(button => {
        const box = button.getBoundingClientRect();
        return {
          text: button.textContent?.trim() || "",
          width: Math.round(box.width),
          parentWidth: Math.round(
            button.parentElement?.getBoundingClientRect().width || 0
          ),
        };
      })
    );
  const helpCount = await section.locator(".firm-dd-help summary").count();

  return [
    check(
      chipMetrics.length >= 3,
      "firm.html: due-diligence filter chips rendered"
    ),
    check(
      chipMetrics.every(
        metric => metric.width > 0 && metric.width < metric.parentWidth * 0.7
      ),
      "firm.html: active due-diligence chips stay compact",
      chipMetrics
        .map(metric => `${metric.text} ${metric.width}/${metric.parentWidth}`)
        .join(", ")
    ),
    check(
      helpCount >= 2,
      "firm.html: due-diligence source terms expose help affordances"
    ),
  ];
}

/**
 * Checks advisor evidence explanation controls.
 * @param page - Browser page rendering an advisor profile.
 * @returns Smoke assertions for advisor evidence help affordances.
 */
export async function advisorCopyGuardrailChecks(
  page: Page
): Promise<readonly Check[]> {
  const helpNames = await page
    .locator(".advisor-evidence-help summary")
    .evaluateAll(nodes =>
      nodes.map(node => node.getAttribute("aria-label") || "")
    );

  return [
    check(
      helpNames.some(name => /Evidence freshness/i.test(name)) &&
        helpNames.some(name => /Fact confidence/i.test(name)),
      "advisor.html: evidence terms expose accessible help affordances",
      helpNames.join(", ")
    ),
    ...(await browseLabelChecks(page, "advisor.html")),
  ];
}

/**
 * Exercises the copy guard failure mode against controlled markup.
 * @returns Smoke assertion proving raw identifiers are detectable.
 */
function copyGuardFixtureCheck(): Check {
  const fixtureMetadata = ["public_web_research · today"];
  return check(
    fixtureMetadata.some(text => RAW_IDENTIFIER_PATTERN.test(text)),
    "/ feed copy: guard detects raw identifier fixture"
  );
}

/**
 * Reads visible feed card metadata after filtering to web research when present.
 * @param page - Browser page rendering the feed.
 * @returns Visible post-header text values.
 */
async function visibleFeedMetadata(page: Page): Promise<readonly string[]> {
  const categorySelect = page.locator(
    'form.feed-filters select[name="category"]'
  );
  const publicWebResearch = categorySelect.locator(
    'option[value="public_web_research"]'
  );
  if ((await publicWebResearch.count()) > 0) {
    await categorySelect.selectOption("public_web_research");
    await page.waitForURL(
      url => url.searchParams.get("category") === "public_web_research",
      { timeout: QUICK_UI_TIMEOUT }
    );
  }

  const metadata = await page
    .locator("article.card .post-header")
    .evaluateAll(nodes =>
      nodes.map(node => node.textContent?.trim() || "").filter(Boolean)
    );
  if (metadata.length > 0) return metadata;

  await smokeGoto(page, `${BASE}/`);
  return await page
    .locator("article.card .post-header")
    .evaluateAll(nodes =>
      nodes.map(node => node.textContent?.trim() || "").filter(Boolean)
    );
}

/**
 * Reads web-research category label and URL state when the option exists.
 * @param page - Browser page rendering the feed.
 * @returns Category option label, summary, and URL category param.
 */
async function visibleFeedCategoryCopy(page: Page): Promise<{
  readonly optionLabel: string | null;
  readonly summary: string | null;
  readonly urlCategory: string | null;
}> {
  const option = page.locator(
    'form.feed-filters select[name="category"] option[value="public_web_research"]'
  );
  if ((await option.count()) === 0) {
    return { optionLabel: null, summary: null, urlCategory: null };
  }
  return {
    optionLabel: (await option.textContent())?.trim() || "",
    summary: await page.locator(".feed-filter-summary").textContent(),
    urlCategory: new URL(page.url()).searchParams.get("category"),
  };
}

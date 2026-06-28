// Shared harness for the watchlist management UI browser tests (#228).
//
// Houses the static file server, resource route mocks, evidence-capture helper,
// and deterministic resource payloads so the test spec stays focused on the
// acceptance-criteria assertions and within the project line budget.

import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Page, Route } from "playwright";

/** Generated web asset root served to the browser under test. */
const WEB_ROOT = resolve("harper-app/web");
/** Login shell served outside the generated web asset root. */
const LOGIN_SHELL = resolve("harper-app/login/shell.html");
/** Directory screenshots are written to. */
export const SHOTS = resolve("tests/screenshots");
/** Standard wait budget for UI assertions. */
export const QUICK_TIMEOUT = 10_000;
/** Advisor used across the watchlist UI fixtures. */
export const ADVISOR_ID = "advisor-watch-1";
/** Second advisor used across comparison fixtures. */
const SECOND_ADVISOR_ID = "advisor-watch-2";
/** Advisor display name used across the fixtures. */
const ADVISOR_NAME = "Avery Stone";
/** Second advisor display name used across comparison fixtures. */
const SECOND_ADVISOR_NAME = "Blake Carter";
/** Primary fixture firm name used across profile and comparison payloads. */
const EXAMPLE_WEALTH = "Example Wealth";
/** Watchlist name used across the fixtures. */
export const LIST_NAME = "Top targets";
/** UserWatchlists resource route glob. */
export const WATCHLISTS_ROUTE = "**/UserWatchlists";
/** AdvisorRating resource route glob. */
export const RATING_ROUTE = "**/AdvisorRating/**";
/** AdvisorComparison resource route glob. */
const COMPARISON_ROUTE = "**/AdvisorComparison**";

const ME_ROUTE = "**/Me";
const SOURCE_TYPE_COVERAGE = {
  web_research: 1,
  firm_bio: 1,
  rankings: 0,
  press: 1,
};

/** Desktop + mobile viewports captured for evidence. */
const EVIDENCE_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 320, height: 740 },
] as const;

/** A captured POST body sent to the UserWatchlists resource. */
export interface CapturedPost {
  readonly body: Readonly<Record<string, unknown>>;
}

/** A list shape returned by the GET handler. */
type ListFixture = Readonly<Record<string, unknown>>;

/**
 * Returns the base URL for a listening static server.
 * @param server - Listening HTTP server.
 * @returns The loopback base URL.
 */
export function baseUrlOf(server: Server): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Routes the `/Me` session probe to an authenticated or anonymous response.
 * @param page - Playwright page under test.
 * @param authenticated - Whether the session should report as signed-in.
 */
export async function routeAuth(
  page: Page,
  authenticated: boolean
): Promise<void> {
  await page.route(ME_ROUTE, async route => {
    await route.fulfill({
      json: authenticated
        ? { authenticated: true, username: "analyst@example.test" }
        : { authenticated: false },
    });
  });
}

/**
 * Routes the AdvisorProfile resource and, by default, an empty AdvisorRating
 * resource for profile-page tests that do not need rating mutation state.
 * @param page - Playwright page under test.
 * @param includeRating - Whether to route AdvisorRating as an empty response.
 */
export async function routeAdvisor(
  page: Page,
  includeRating: boolean = true
): Promise<void> {
  await page.route("**/AdvisorProfile/**", async route => {
    await route.fulfill({ json: advisorProfile(ADVISOR_ID) });
  });
  if (!includeRating) return;
  await page.route(RATING_ROUTE, async route => {
    await route.fulfill({ json: { authenticated: true, rating: null } });
  });
}

/**
 * Routes the AdvisorComparison resource to a deterministic two-advisor payload.
 * @param page - Playwright page under test.
 */
export async function routeComparison(page: Page): Promise<void> {
  await page.route(COMPARISON_ROUTE, async route => {
    await route.fulfill({
      json: comparisonPayload([ADVISOR_ID, SECOND_ADVISOR_ID]),
    });
  });
}

/**
 * Routes UserWatchlists: GET returns the supplied lists; each POST body is
 * handed to `onPost` (the spec owns the mutable collector) and acknowledged.
 * @param page - Playwright page under test.
 * @param onPost - Callback invoked with each captured POST body.
 * @param lists - Lists returned by the GET handler.
 */
export async function routeWatchlists(
  page: Page,
  onPost: (body: Readonly<Record<string, unknown>>) => void,
  lists: ReadonlyArray<ListFixture>
): Promise<void> {
  await page.route(WATCHLISTS_ROUTE, async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Readonly<
        Record<string, unknown>
      >;
      onPost(body);
      await route.fulfill({
        json: { authenticated: true, list: lists[0] ?? null },
      });
      return;
    }
    await route.fulfill({ json: { authenticated: true, lists } });
  });
}

/**
 * Routes AdvisorRating: GET returns the supplied rating; POST captures and
 * returns the saved private rating envelope.
 * @param page - Playwright page under test.
 * @param onPost - Callback invoked with each captured POST body.
 * @param rating - Rating returned by GET before the first mutation.
 */
export async function routeRating(
  page: Page,
  onPost: (body: Readonly<Record<string, unknown>>) => void,
  rating: Readonly<Record<string, unknown>> | null
): Promise<void> {
  const state = { current: rating };
  await page.route(RATING_ROUTE, async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Readonly<
        Record<string, unknown>
      >;
      onPost(body);
      state.current = body;
      await route.fulfill({
        json: { authenticated: true, rating: state.current },
      });
      return;
    }
    await route.fulfill({
      json: { authenticated: true, rating: state.current },
    });
  });
}

/**
 * Waits until a captured POST satisfies the predicate (or times out).
 * @param posts - Captured POST bodies, appended as requests arrive.
 * @param predicate - Match predicate.
 */
export async function waitForPost(
  posts: readonly CapturedPost[],
  predicate: (post: CapturedPost) => boolean
): Promise<void> {
  const deadline = Date.now() + QUICK_TIMEOUT;
  while (Date.now() < deadline) {
    if (posts.some(predicate)) return;
    await new Promise(done => setTimeout(done, 50));
  }
  throw new Error("Timed out waiting for a matching UserWatchlists POST");
}

/**
 * Captures desktop and mobile screenshots of the current page.
 * @param page - Playwright page under test.
 * @param slug - Evidence filename slug.
 */
export async function captureViewports(
  page: Page,
  slug: string
): Promise<void> {
  for (const viewport of EVIDENCE_VIEWPORTS) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.screenshot({
      path: join(SHOTS, `${slug}-${viewport.name}.png`),
      fullPage: true,
    });
  }
}

/**
 * Builds a feed payload with a single disclosure card carrying a real advisor.
 * @returns Feed resource payload.
 */
export function feedWithDisclosure(): unknown {
  return {
    items: [
      {
        article: {
          id: "article-watch",
          headline: "Compliance update",
          dek: "",
          category: "compliance",
          publishedDate: "2026-05-27T00:00:00.000Z",
          modifiedDate: "2026-05-27T00:00:00.000Z",
          authors: ["AdvisorBook"],
          url: "https://example.com/compliance",
        },
        eventCards: [disclosureCard()],
        firms: [],
        teams: [],
        advisors: [],
      },
    ],
  };
}

/**
 * Builds a disclosure event card referencing the fixture advisor.
 * @returns Disclosure event card payload.
 */
function disclosureCard(): Readonly<Record<string, unknown>> {
  return {
    kind: "disclosure",
    disclosureId: "disc-1",
    id: "disc-1",
    advisor: { id: ADVISOR_ID, name: ADVISOR_NAME },
    disclosureType: "regulatory",
    regulator: "finra",
    regulatorState: undefined,
    forum: undefined,
    status: undefined,
    admitDeny: undefined,
    dateInitiated: undefined,
    dateResolved: undefined,
    allegationText: undefined,
    allegationCategories: undefined,
    ruleViolations: undefined,
    awardAmount: undefined,
    settlementAmount: undefined,
    damagesRequested: undefined,
    clusterId: undefined,
    sanctions: [],
  };
}

/**
 * Builds a minimal advisor profile payload sufficient to render the page.
 * @param id - Advisor id requested by the route.
 * @returns AdvisorProfile resource payload.
 */
function advisorProfile(id: string): unknown {
  return {
    advisor: {
      id,
      legalName: ADVISOR_NAME,
      preferredName: ADVISOR_NAME,
      headshotUrl: null,
      careerStatus: "active",
      yearsExperience: 12,
      finraCrd: "12345",
      secIard: null,
      industryStartDate: "2014-01-01",
      birthYear: null,
      gender: "undisclosed",
    },
    displayName: ADVISOR_NAME,
    career: [
      {
        roleTitle: "Advisor",
        firm: { id: "firm-a", name: EXAMPLE_WEALTH, short: "Example WM" },
        branch: { id: "branch-a", name: "Atlanta", city: "Atlanta" },
        startDate: "2020-01-01",
        endDate: null,
      },
    ],
    teams: [],
    disclosures: [],
    outsideBusinessActivities: [],
    registrationApplications: [],
    transitions: [],
    articles: [],
    licenses: [],
    designations: [],
    education: [],
    brokerCheckSnapshot: null,
    evidenceFreshness: {
      hasData: true,
      lastCheckedAt: "2026-05-25T12:00:00Z",
      nearestNextCheckAfter: "2026-06-01T00:00:00Z",
      statusCounts: { success: 2, no_new_data: 1, ambiguous: 0, failed: 0 },
      sourceTypeCoverage: SOURCE_TYPE_COVERAGE,
    },
    confidenceSummary: {
      hasData: true,
      asserted: 2,
      inferred: 1,
      derived: 1,
      total: 4,
    },
  };
}

/**
 * Builds a minimal AdvisorComparison payload sufficient to render the compare page.
 * @param ids - Compared advisor ids.
 * @returns AdvisorComparison resource payload.
 */
function comparisonPayload(ids: readonly string[]): unknown {
  return {
    generatedAt: "2026-05-31T12:00:00.000Z",
    selection: {
      status: "ready",
      requestedIds: ids,
      normalizedIds: ids,
      duplicateIds: [],
      cappedIds: ids,
      missingIds: [],
      min: 2,
      max: 4,
      truncated: false,
    },
    count: ids.length,
    ids,
    items: ids.map(comparisonItem),
  };
}

/**
 * Builds one found AdvisorComparison item for test rendering.
 * @param id - Advisor id.
 * @returns Found comparison item payload.
 */
function comparisonItem(id: string): unknown {
  const isPrimary = id === ADVISOR_ID;
  const displayName = isPrimary ? ADVISOR_NAME : SECOND_ADVISOR_NAME;
  return {
    status: "found",
    id,
    identity: {
      id,
      legalName: displayName,
      preferredName: displayName,
      careerStatus: "active",
      yearsExperience: isPrimary ? 12 : 9,
    },
    displayName,
    firm: {
      id: isPrimary ? "firm-a" : "firm-b",
      name: isPrimary ? EXAMPLE_WEALTH : "Summit Advisory",
      short: isPrimary ? "Example WM" : "Summit",
    },
    regulatory: {
      brokerCheckSnapshot: { subjectCrd: isPrimary ? "12345" : "98765" },
      disclosures: [],
      disclosureCount: 0,
      registrationApplications: [],
    },
    career: [
      {
        roleTitle: "Advisor",
        firm: { name: isPrimary ? EXAMPLE_WEALTH : "Summit Advisory" },
      },
    ],
    rankings: [],
    articles: [],
    dataConfidence: {
      evidenceFreshness: {
        hasData: true,
        lastCheckedAt: "2026-05-25T12:00:00Z",
      },
      confidenceSummary: {
        hasData: true,
        asserted: 2,
        inferred: 1,
        derived: 1,
        total: 4,
      },
    },
    attribution: {
      brokerCheck: null,
      articles: [],
      assertions: [],
      researchSources: [],
    },
  };
}

/**
 * Starts a static file server rooted at the generated web assets.
 * @returns The listening HTTP server.
 */
export async function startStaticServer(): Promise<Server> {
  const server = createServer(async (request, response) => {
    const filePath = request.url?.split("?")[0] || "/";
    const resolvedPath = resolveStaticPath(filePath);
    try {
      const file = await readFile(resolvedPath);
      response.writeHead(200, { "Content-Type": contentType(resolvedPath) });
      response.end(file);
    } catch {
      try {
        const fallbackPath = resolveStaticPath(`${filePath}.html`);
        const file = await readFile(fallbackPath);
        response.writeHead(200, { "Content-Type": contentType(fallbackPath) });
        response.end(file);
      } catch {
        response.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Not found");
      }
    }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

/**
 * Resolves a request path to a generated asset path under the web root.
 * @param urlPath - Request URL path.
 * @returns Absolute static file path.
 */
function resolveStaticPath(urlPath: string): string {
  if (urlPath === "/login") return LOGIN_SHELL;
  const shell = cleanRouteShell(urlPath);
  if (shell) return resolve(WEB_ROOT, shell);
  const exactShell = exactRouteShell(urlPath);
  if (exactShell) return resolve(WEB_ROOT, exactShell);
  const cleanPath = normalize(decodeURIComponent(urlPath)).replace(
    /^(\.\.(\/|\\|$))+/u,
    ""
  );
  const relativePath =
    cleanPath === sep || cleanPath === "." || cleanPath === "/"
      ? "index.html"
      : cleanPath.replace(/^[/\\]+/u, "");
  const candidate = resolve(WEB_ROOT, relativePath);
  if (!candidate.startsWith(`${WEB_ROOT}${sep}`) && candidate !== WEB_ROOT) {
    return join(WEB_ROOT, "404.html");
  }
  return candidate;
}

/**
 * Maps non-detail clean routes to their generated static shells.
 * @param urlPath - Request URL path.
 * @returns Matching shell filename, or null when no exact shell applies.
 */
function exactRouteShell(urlPath: string): string | null {
  if (urlPath === "/mcp-gallery") return "mcp-gallery.html";
  if (urlPath === "/recruiting/shortlist") return "recruiting-shortlist.html";
  if (urlPath === "/recruiting/deal-gaps") return "recruiting/deal-gaps.html";
  return null;
}

/**
 * Maps clean public detail routes to their generated app shell.
 * @param urlPath - Request URL path.
 * @returns Matching shell filename, or null when the path is not a clean route.
 */
function cleanRouteShell(urlPath: string): string | null {
  if (/^\/advisors\/[^/]+$/u.test(urlPath)) return "advisor.html";
  if (/^\/articles\/[^/]+$/u.test(urlPath)) return "article.html";
  if (/^\/firms\/[^/]+$/u.test(urlPath)) return "firm.html";
  return null;
}

/**
 * Maps static file extensions to browser content types.
 * @param filePath - Static file path.
 * @returns HTTP content type.
 */
function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

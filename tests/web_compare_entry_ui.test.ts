import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADVISOR_ID,
  baseUrlOf,
  captureViewports,
  QUICK_TIMEOUT,
  routeAdvisor,
  routeAuth,
  SHOTS,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const browserDescribe =
  process.env.RUN_WEB_COMPARE_ENTRY_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;
const COMPARE_BUTTON_SELECTOR = ".compare-entry-button";
const ADVISOR_DIRECTORY_ROW_SELECTOR = ".advisor-directory-row";
const READINESS_BADGE_SELECTOR = ".advisor-readiness-badge";
const CONTACT_READY_LABEL = "Contact ready";
const SECOND_ADVISOR_ID = "advisor-watch-2";
const MISSING_CONTACT_ID = "advisor-contact-gap";
const MISSING_SUBSTANCE_ID = "advisor-substance-gap";
const MISSING_CRD_ID = "advisor-crd-gap";
const AVERY_STONE = "Avery Stone";

interface DirectoryAdvisor {
  readonly id: string;
  readonly legalName: string;
  readonly preferredName: string;
  readonly lastName: string;
  readonly careerStatus: string;
  readonly yearsExperience: number;
  readonly finraCrd: string | null;
  readonly headshotUrl: string | null;
  readonly businessEmail?: string | null;
  readonly businessPhone?: string | null;
  readonly linkedinUrl?: string | null;
  readonly bioText?: string | null;
  readonly readiness: object;
}

browserDescribe("public comparison entry actions (#810)", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    await mkdir(SHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close(error => (error ? rejectClose(error) : resolveClose()));
    });
  });

  it("selects directory advisors in place before opening comparison", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeAdvisorDirectory(page);

    await page.goto(`${baseUrl}/advisors`, {
      waitUntil: "domcontentloaded",
    });

    const rows = page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR);
    await rows.first().waitFor({ timeout: QUICK_TIMEOUT });
    await rows.nth(0).locator(COMPARE_BUTTON_SELECTOR).click();

    expect(new URL(page.url()).pathname).toBe("/advisors");
    await page.getByText("1 selected").waitFor({ timeout: QUICK_TIMEOUT });
    await rows.nth(1).locator(COMPARE_BUTTON_SELECTOR).click();
    await page.getByText("2 selected").waitFor({ timeout: QUICK_TIMEOUT });

    await Promise.all([
      page.waitForURL(
        new RegExp(`/compare\\?ids=${ADVISOR_ID},${SECOND_ADVISOR_ID}$`, "u")
      ),
      page.getByRole("button", { name: "Compare now" }).click(),
    ]);

    expect(new URL(page.url()).searchParams.get("ids")).toBe(
      `${ADVISOR_ID},${SECOND_ADVISOR_ID}`
    );
    await captureViewports(page, "issue-1165-directory-in-place-compare");
    await page.close();
  });

  it("renders shareable contact-readiness finder state", async () => {
    const page = await browser.newPage();
    const advisorRequests: string[] = [];
    await routeAuth(page, false);
    await routeAdvisorDirectory(
      page,
      advisorRequests,
      readinessDirectoryRows()
    );
    await routeAdvisorProfile(page, readinessProfileAdvisor());

    await page.goto(
      `${baseUrl}/advisors?contactReadiness=ready&profileSubstance=present&hasCrd=true&freshness=unknown`,
      { waitUntil: "domcontentloaded" }
    );

    await page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR).first().waitFor({
      timeout: QUICK_TIMEOUT,
    });
    await expectFinderState(page, advisorRequests);
    await captureViewports(page, "issue-1327-readiness-finder");

    await page.setViewportSize({ width: 320, height: 740 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR).first().waitFor({
      timeout: QUICK_TIMEOUT,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));

    await page.goto(
      `${baseUrl}/advisors?contactReadiness=missing_contact_data`,
      {
        waitUntil: "domcontentloaded",
      }
    );
    await expectReadinessRow(page, "Missing contact data");

    await page.goto(
      `${baseUrl}/advisors?profileSubstance=missing_profile_substance`,
      { waitUntil: "domcontentloaded" }
    );
    await expectReadinessRow(page, "Missing profile substance");

    await page.goto(`${baseUrl}/advisors?hasCrd=false`, {
      waitUntil: "domcontentloaded",
    });
    await expectReadinessRow(page, "CRD absent");

    await page.goto(
      `${baseUrl}/advisors?contactReadiness=ready&profileSubstance=present&hasCrd=true&freshness=unknown`,
      { waitUntil: "domcontentloaded" }
    );
    await page.getByRole("link", { name: AVERY_STONE }).click();
    await expectProfileReadiness(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectProfileReadiness(page);
    await page
      .locator(".advisor-mobile-evidence .card", {
        hasText: "Public readiness",
      })
      .waitFor({
        state: "visible",
        timeout: QUICK_TIMEOUT,
      });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(await page.evaluate(() => document.documentElement.clientWidth));
    await page.close();
  });

  it("shows a cap message when adding a fifth advisor from a profile", async () => {
    const page = await browser.newPage();
    await routeAuth(page, false);
    await routeAdvisor(page, false);

    await page.goto(
      `${baseUrl}/advisor.html?id=${ADVISOR_ID}&ids=adv-a,adv-b,adv-c,adv-d`,
      { waitUntil: "domcontentloaded" }
    );

    const card = page.locator(".compare-entry-card");
    await card.locator(COMPARE_BUTTON_SELECTOR).click();
    await card.getByText("Compare supports up to four advisors.").waitFor({
      timeout: QUICK_TIMEOUT,
    });
    const url = new URL(page.url());
    expect(url.pathname).toBe(`/advisors/avery-stone-${ADVISOR_ID}`);
    expect(url.searchParams.get("ids")).toBe("adv-a,adv-b,adv-c,adv-d");
    await captureViewports(page, "issue-810-compare-entry-cap-message");
    await page.close();
  });
});

/**
 * Routes the public advisor directory to one deterministic row.
 * @param page - Browser page under test.
 * @param requests - Captured PublicAdvisors request URLs.
 * @param advisors - Directory rows returned by the routed resource.
 */
async function routeAdvisorDirectory(
  page: Page,
  requests: string[] = [],
  advisors: readonly DirectoryAdvisor[] = defaultDirectoryRows()
): Promise<void> {
  await page.route("**/PublicAdvisors?**", async route => {
    requests.push(route.request().url());
    const url = new URL(route.request().url());
    const rows = filterDirectoryRows(advisors, url.searchParams);
    await route.fulfill({
      json: {
        items: rows,
        nextCursor: null,
        total: rows.length,
      },
    });
  });
}

/**
 * Routes the advisor profile resource to the supplied public advisor facts.
 * @param page - Browser page under test.
 * @param advisor - Advisor facts to expose on profile drilldown.
 */
async function routeAdvisorProfile(
  page: Page,
  advisor: DirectoryAdvisor
): Promise<void> {
  await page.route("**/AdvisorProfile/**", async route => {
    await route.fulfill({ json: advisorProfilePayload(advisor) });
  });
}

/**
 * Filters deterministic directory rows using the public readiness query state.
 * @param advisors - Candidate rows.
 * @param params - URL query params from the resource request.
 * @returns Rows matching the requested readiness filters.
 */
function filterDirectoryRows(
  advisors: readonly DirectoryAdvisor[],
  params: URLSearchParams
): readonly DirectoryAdvisor[] {
  return advisors.filter(advisor => {
    const readiness = advisor.readiness as Readonly<Record<string, string>>;
    const contact = params.get("contactReadiness");
    const substance = params.get("profileSubstance");
    const hasCrd = params.get("hasCrd");
    return (
      (!contact || readiness.contact === contact) &&
      (!substance || readiness.profileSubstance === substance) &&
      (!hasCrd || String(Boolean(advisor.finraCrd)) === hasCrd)
    );
  });
}

/**
 * Asserts URL-backed readiness controls and visible row badges.
 * @param page - Browser page under test.
 * @param requests - Captured PublicAdvisors request URLs.
 */
async function expectFinderState(
  page: Page,
  requests: readonly string[]
): Promise<void> {
  await expectControlValue(page, "contactReadiness", "ready");
  await expectControlValue(page, "profileSubstance", "present");
  await expectControlValue(page, "hasCrd", "true");
  await expectControlValue(page, "freshness", "unknown");
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: CONTACT_READY_LABEL })
    .first()
    .waitFor({
      timeout: QUICK_TIMEOUT,
    });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: "Profile substance" })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: "CRD present" })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: "Freshness unknown" })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  await page.getByText("Freshness null").waitFor({
    state: "detached",
    timeout: QUICK_TIMEOUT,
  });
  expect(
    requests.some(url => {
      const requestUrl = new URL(url);
      return (
        requestUrl.searchParams.get("contactReadiness") === "ready" &&
        requestUrl.searchParams.get("profileSubstance") === "present" &&
        requestUrl.searchParams.get("hasCrd") === "true" &&
        requestUrl.searchParams.get("freshness") === "unknown"
      );
    })
  ).toBe(true);
}

/**
 * Asserts one readiness state appears in the directory at desktop and mobile.
 * @param page - Browser page rendering the advisor finder.
 * @param badge - Readiness badge copy expected on the row.
 */
async function expectReadinessRow(page: Page, badge: string): Promise<void> {
  await page.locator(ADVISOR_DIRECTORY_ROW_SELECTOR).first().waitFor({
    timeout: QUICK_TIMEOUT,
  });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: badge })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator(READINESS_BADGE_SELECTOR, { hasText: badge })
    .first()
    .waitFor({ timeout: QUICK_TIMEOUT });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
  await page.setViewportSize({ width: 1280, height: 900 });
}

/**
 * Asserts profile drilldown repeats finder readiness facts.
 * @param page - Browser page rendering the advisor profile.
 */
async function expectProfileReadiness(page: Page): Promise<void> {
  await page.getByRole("heading", { name: "Public readiness" }).waitFor({
    timeout: QUICK_TIMEOUT,
  });
  const text = await page.locator("body").textContent();
  expect(text).toContain("Contact ready");
  expect(text).toContain("Business email");
  expect(text).toContain("avery@example.test");
  expect(text).toContain("Business phone");
  expect(text).toContain("404-555-0100");
  expect(text).toContain("LinkedIn URL");
  expect(text).toContain("https://linkedin.example/avery");
  expect(text).toContain("FINRA CRD");
  expect(text).toContain("12345");
  expect(text).toContain("Freshness");
  expect(text).toContain("Current");
  expect(text).toContain("No public readiness gaps");
}

/**
 * Asserts a form control value by name.
 * @param page - Browser page under test.
 * @param name - Control name.
 * @param value - Expected value.
 */
async function expectControlValue(
  page: Page,
  name: string,
  value: string
): Promise<void> {
  await expect(page.locator(`[name="${name}"]`).inputValue()).resolves.toBe(
    value
  );
}

/**
 * Builds a deterministic public readiness payload.
 * @param profileSubstance - Profile substance status.
 * @returns Advisor readiness payload.
 */
function readyReadiness(profileSubstance: string): object {
  return {
    contact: "ready",
    profileSubstance,
    crd: "present",
    freshness: "unknown",
    fields: {
      businessEmail: "present",
      businessPhone: "present",
      linkedinUrl: "present",
      headshotUrl: "present",
      bioText: "present",
      crd: "present",
    },
    limitations: [
      "Research freshness is unavailable from public source checks.",
    ],
  };
}

/**
 * Builds default directory rows used by comparison tests.
 * @returns Default directory rows.
 */
function defaultDirectoryRows(): readonly DirectoryAdvisor[] {
  return [
    readyAdvisor(ADVISOR_ID, AVERY_STONE),
    readyAdvisor(SECOND_ADVISOR_ID, "Blake Carter"),
  ];
}

/**
 * Builds rows covering each public readiness finder state.
 * @returns Directory rows covering readiness finder states.
 */
function readinessDirectoryRows(): readonly DirectoryAdvisor[] {
  return [
    readinessProfileAdvisor(),
    {
      ...readyAdvisor(MISSING_CONTACT_ID, "Casey No Contact"),
      businessEmail: null,
      businessPhone: null,
      linkedinUrl: null,
      readiness: missingContactReadiness(),
    },
    {
      ...readyAdvisor(MISSING_SUBSTANCE_ID, "Devon Thin Profile"),
      bioText: null,
      headshotUrl: null,
      readiness: readyReadiness("missing_profile_substance"),
    },
    {
      ...readyAdvisor(MISSING_CRD_ID, "Emerson No CRD"),
      finraCrd: null,
      readiness: missingCrdReadiness(),
    },
  ];
}

/**
 * Builds the advisor row used for profile drilldown parity.
 * @returns Advisor row used for profile drilldown parity.
 */
function readinessProfileAdvisor(): DirectoryAdvisor {
  return {
    ...readyAdvisor(ADVISOR_ID, AVERY_STONE),
    businessEmail: "avery@example.test",
    businessPhone: "404-555-0100",
    linkedinUrl: "https://linkedin.example/avery",
    bioText: "Public biography with enough source-backed profile substance.",
    headshotUrl: "https://example.test/avery.jpg",
  };
}

/**
 * Builds a ready advisor row.
 * @param id - Advisor id.
 * @param name - Display name.
 * @returns Directory row.
 */
function readyAdvisor(id: string, name: string): DirectoryAdvisor {
  const parts = name.split(" ");
  return {
    id,
    legalName: name,
    preferredName: name,
    lastName: parts.at(-1) ?? name,
    careerStatus: "active",
    yearsExperience: id === SECOND_ADVISOR_ID ? 9 : 12,
    finraCrd: id === SECOND_ADVISOR_ID ? "67890" : "12345",
    headshotUrl: null,
    readiness: readyReadiness("present"),
  };
}

/**
 * Builds a missing-contact readiness payload.
 * @returns Missing-contact readiness payload.
 */
function missingContactReadiness(): object {
  return {
    ...readyReadiness("present"),
    contact: "missing_contact_data",
    fields: {
      businessEmail: "missing",
      businessPhone: "missing",
      linkedinUrl: "missing",
      headshotUrl: "present",
      bioText: "present",
      crd: "present",
    },
  };
}

/**
 * Builds a missing-CRD readiness payload.
 * @returns Missing-CRD readiness payload.
 */
function missingCrdReadiness(): object {
  return {
    ...readyReadiness("present"),
    crd: "absent",
    fields: {
      businessEmail: "present",
      businessPhone: "present",
      linkedinUrl: "present",
      headshotUrl: "present",
      bioText: "present",
      crd: "missing",
    },
  };
}

/**
 * Builds a minimal advisor profile payload sufficient to render drilldown.
 * @param row - Public advisor row.
 * @returns AdvisorProfile resource payload.
 */
function advisorProfilePayload(row: DirectoryAdvisor): object {
  return {
    advisor: row,
    displayName: row.preferredName,
    career: [
      {
        roleTitle: "Advisor",
        firm: { id: "firm-a", name: "Example Wealth", short: "Example WM" },
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
    reviewedRegulatoryDiscrepancies: [],
    reviewedCorrectionRequests: [],
    evidenceFreshness: {
      hasData: true,
      lastCheckedAt: "2026-05-25T12:00:00Z",
      nearestNextCheckAfter: "2026-06-01T00:00:00Z",
      statusCounts: { success: 2, no_new_data: 1, ambiguous: 0, failed: 0 },
      sourceTypeCoverage: {
        web_research: 1,
        firm_bio: 1,
        rankings: 0,
        press: 1,
      },
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

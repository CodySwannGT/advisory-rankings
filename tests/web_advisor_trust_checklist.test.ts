import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  advisorTrustChecklistRows,
  type AdvisorTrustChecklistRow,
} from "../src/web/advisor-trust-checklist.js";
import type { AdvisorProfilePayload } from "../src/types/advisor-profile.js";
import {
  ADVISOR_ID,
  baseUrlOf,
  QUICK_TIMEOUT,
  routeAdvisor,
  routeAuth,
  startStaticServer,
} from "./fixtures/watchlist-ui-harness.js";

const UNSUPPORTED_POSITIVE_CLAIMS =
  /clean|safe|verified|risk-free|zero-risk|suitability|misconduct-free/i;
const DISCLOSURE_ROW_ID = "disclosures-regulatory-signals";
const browserDescribe =
  process.env.RUN_WEB_ADVISOR_TRUST_CHECKLIST_UI === "1" &&
  existsSync(chromium.executablePath())
    ? describe.sequential
    : describe.skip;

describe("advisor trust checklist mapping", () => {
  it("marks available public profile signals as present or review-needed", () => {
    const rows = advisorTrustChecklistRows(
      profileFixture({
        disclosures: [{}],
        reviewedRegulatoryDiscrepancies: [{}],
      })
    );

    expect(rowStates(rows)).toEqual({
      "article-context": "present",
      "contact-profile-readiness": "present",
      [DISCLOSURE_ROW_ID]: "needs-review",
      "evidence-freshness": "present",
      "finra-crd": "present",
      "firm-team-context": "present",
      "reviewed-notes": "needs-review",
    });
    expect(rowById(rows, DISCLOSURE_ROW_ID).summary).toContain(
      "public disclosure row loaded for reader review"
    );
    expect(rowById(rows, DISCLOSURE_ROW_ID).stateLabel).toBe(
      "Review source details"
    );
  });

  it("keeps missing public facts neutral instead of positive", () => {
    const rows = advisorTrustChecklistRows(
      profileFixture({
        advisor: {
          bioText: null,
          businessEmail: null,
          businessPhone: null,
          finraCrd: null,
          headshotUrl: null,
          linkedinUrl: null,
        },
        articles: [],
        career: [],
        evidenceFreshness: { hasData: false, lastCheckedAt: null },
        teams: [],
      })
    );

    expect(rowStates(rows)).toEqual({
      "article-context": "not-found",
      "contact-profile-readiness": "missing",
      [DISCLOSURE_ROW_ID]: "not-found",
      "evidence-freshness": "not-found",
      "finra-crd": "missing",
      "firm-team-context": "not-found",
      "reviewed-notes": "not-found",
    });
    expect(rows.map(row => row.summary).join(" ")).not.toMatch(
      UNSUPPORTED_POSITIVE_CLAIMS
    );
  });

  it("uses deterministic row order and support anchors", () => {
    const rows = advisorTrustChecklistRows(profileFixture());

    expect(rows.map(row => row.id)).toEqual([
      "contact-profile-readiness",
      "finra-crd",
      "evidence-freshness",
      DISCLOSURE_ROW_ID,
      "firm-team-context",
      "article-context",
      "reviewed-notes",
    ]);
    expect(rows.map(row => row.supportHref)).toEqual([
      "#public-readiness",
      "#profile-identity",
      "#profile-provenance",
      "#profile-disclosures",
      "#profile-career",
      "#profile-articles",
      "#reviewed-discrepancy-notes",
    ]);
    expect(rows.map(row => row.supportLabel)).toEqual([
      "Public readiness",
      "Profile identity",
      "Profile provenance",
      "Disclosures",
      "Career and teams",
      "Coverage articles",
      "Reviewed discrepancy notes",
    ]);
  });

  it("keeps reviewed-note and disclosure summaries bounded to public counts", () => {
    const rows = advisorTrustChecklistRows(
      profileFixture({
        disclosures: [{ privateDetail: "do not expose" }],
        reviewedCorrectionRequests: [
          {
            fieldName: "bioText",
            reviewerNote: "private correction reviewer note",
          },
        ],
        reviewedRegulatoryDiscrepancies: [
          {
            fieldName: "crd",
            reviewerNote: "private regulatory reviewer note",
          },
        ],
      })
    );

    const boundedSummaries = [
      rowById(rows, DISCLOSURE_ROW_ID).summary,
      rowById(rows, "reviewed-notes").summary,
    ].join(" ");

    expect(boundedSummaries).toContain("1 public disclosure row");
    expect(boundedSummaries).toContain(
      "2 reviewed public discrepancy or correction notes"
    );
    expect(boundedSummaries).not.toMatch(
      /private|do not expose|reviewer note/i
    );
  });
});

browserDescribe("advisor trust checklist profile UI", () => {
  let browser: Browser;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  });

  it.each([
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ])(
    "renders checklist rows and support targets on %s",
    async (_name, viewport) => {
      const page = await browser.newPage({ viewport });
      try {
        await routeAuth(page, false);
        await routeAdvisor(page);
        await page.goto(`${baseUrl}/advisor.html?id=${ADVISOR_ID}`, {
          waitUntil: "networkidle",
        });
        await page
          .getByRole("heading", { name: "Advisor trust checklist" })
          .waitFor({ timeout: QUICK_TIMEOUT });

        expect(await checklistEvidence(page)).toMatchObject({
          rowCount: 7,
          hasOverflow: false,
          linkTargetsExist: true,
          labels: [
            "Contact and profile readiness",
            "FINRA CRD",
            "Evidence freshness",
            "Disclosures and regulatory signals",
            "Firm and team context",
            "Article context",
            "Reviewed notes",
          ],
        });
      } finally {
        await page.close();
      }
    }
  );
});

/**
 * Reads rendered checklist and anchor-target evidence from the browser.
 * @param page - Advisor profile page under test.
 * @returns Rendered checklist evidence.
 */
async function checklistEvidence(page: Page): Promise<{
  readonly hasOverflow: boolean;
  readonly labels: readonly string[];
  readonly linkTargetsExist: boolean;
  readonly rowCount: number;
}> {
  return await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>(".advisor-trust-row"),
    ];
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".advisor-trust-row-support[href^='#']"
      ),
    ];
    return {
      hasOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      labels: rows.map(
        row =>
          row.querySelector<HTMLElement>(".advisor-trust-row-label")
            ?.textContent ?? ""
      ),
      linkTargetsExist: links.every(link =>
        Boolean(document.querySelector(link.getAttribute("href") ?? ""))
      ),
      rowCount: rows.length,
    };
  });
}

function rowStates(
  rows: readonly AdvisorTrustChecklistRow[]
): Record<string, AdvisorTrustChecklistRow["state"]> {
  return Object.fromEntries(rows.map(row => [row.id, row.state]));
}

function rowById(
  rows: readonly AdvisorTrustChecklistRow[],
  id: string
): AdvisorTrustChecklistRow {
  const row = rows.find(candidate => candidate.id === id);
  if (!row) throw new Error(`Missing row ${id}`);
  return row;
}

function profileFixture(
  overrides: Partial<AdvisorProfilePayload> & {
    readonly advisor?: Partial<AdvisorProfilePayload["advisor"]>;
    readonly evidenceFreshness?: Partial<
      AdvisorProfilePayload["evidenceFreshness"]
    >;
  } = {}
): AdvisorProfilePayload {
  return {
    advisor: {
      id: "advisor-a",
      bioText: "Public biography.",
      businessEmail: "advisor@example.test",
      businessPhone: "555-0100",
      careerStatus: "active",
      finraCrd: "123456",
      headshotUrl: "https://example.test/headshot.jpg",
      legalName: "Advisor A",
      linkedinUrl: "https://linkedin.example/advisor",
      preferredName: "Advisor",
      ...overrides.advisor,
    } as AdvisorProfilePayload["advisor"],
    articles: [{}],
    brokerCheckSnapshot: null,
    career: [{} as AdvisorProfilePayload["career"][number]],
    confidenceSummary: {
      asserted: 1,
      derived: 0,
      hasData: true,
      inferred: 0,
      total: 1,
    },
    designations: [],
    disclosures: [],
    education: [],
    evidenceFreshness: {
      hasData: true,
      lastCheckedAt: "2026-06-01T00:00:00Z",
      nearestNextCheckAfter: null,
      sourceTypeCoverage: {},
      statusCounts: {},
      ...overrides.evidenceFreshness,
    } as AdvisorProfilePayload["evidenceFreshness"],
    licenses: [],
    outsideBusinessActivities: [],
    registrationApplications: [],
    reviewedCorrectionRequests: [],
    reviewedRegulatoryDiscrepancies: [],
    teams: [],
    transitions: [],
    displayName: "Advisor A",
    ...overrides,
  };
}

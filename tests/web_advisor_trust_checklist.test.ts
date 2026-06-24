import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  advisorTrustChecklistRows,
  type AdvisorTrustChecklistRow,
} from "../src/web/advisor-trust-checklist.js";
import type { AdvisorProfilePayload } from "../src/types/advisor-profile.js";
import type { AdvisorResearchQueueResponse } from "../src/harper/resource-advisor-research-queue.js";
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

const DEV_BASE = "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const UNSUPPORTED_POSITIVE_CLAIMS =
  /clean|safe|verified|risk-free|zero-risk|suitability|misconduct-free/i;
const DISCLOSURE_ROW_ID = "disclosures-regulatory-signals";
const browserDescribe = existsSync(chromium.executablePath())
  ? describe.sequential
  : describe.skip;
const EXPECTED_SUPPORT_LINK_COUNT = 4;

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
  let browser: Browser | undefined;
  let server: Server | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    server = await startStaticServer();
    baseUrl = baseUrlOf(server);
    await mkdir(SHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    if (server) {
      await new Promise<void>(resolveClose =>
        server?.close(() => resolveClose())
      );
    }
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
          supportLinkCount: EXPECTED_SUPPORT_LINK_COUNT,
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

  it("replays deployed public advisor payloads against checklist copy and anchors", async () => {
    const snapshots = await deployedSnapshots();
    const advisorId = deployedProfileId(snapshots.publicAdvisors);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    try {
      await routeAuth(page, false);
      await routeDeployedAdvisorResources(page, snapshots, advisorId);

      await page.goto(`${baseUrl}/advisor.html?id=${advisorId}`, {
        waitUntil: "networkidle",
      });
      await page
        .getByRole("heading", { name: "Advisor trust checklist" })
        .waitFor({ timeout: QUICK_TIMEOUT });

      const desktop = await checklistEvidence(page);
      expect(desktop).toMatchObject({
        rowCount: 7,
        hasOverflow: false,
        supportLinkCount: EXPECTED_SUPPORT_LINK_COUNT,
        linkTargetsExist: true,
      });
      expect(rowEvidenceById(desktop, "finra-crd")).toMatchObject({
        state: "Unavailable public data",
      });
      expect(rowEvidenceById(desktop, "finra-crd").summary).toContain(
        "source-data limitation"
      );
      expect(rowEvidenceById(desktop, "evidence-freshness")).toMatchObject({
        state: expectedFreshnessState(snapshots.advisorProfile),
      });
      expect(checklistCopy(desktop)).not.toMatch(UNSUPPORTED_POSITIVE_CLAIMS);

      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await checklistEvidence(page);
      expect(mobile).toMatchObject({
        rowCount: 7,
        hasOverflow: false,
        supportLinkCount: EXPECTED_SUPPORT_LINK_COUNT,
        linkTargetsExist: true,
      });
      expect(checklistCopy(mobile)).not.toMatch(UNSUPPORTED_POSITIVE_CLAIMS);

      const evidence = {
        proxyBase: DEV_BASE,
        advisorId,
        publicAdvisors: publicAdvisorsExcerpt(snapshots.publicAdvisors),
        advisorProfile: advisorProfileExcerpt(snapshots.advisorProfile),
        advisorResearchQueue: advisorResearchQueueExcerpt(
          snapshots.advisorResearchQueue
        ),
        desktop,
        mobile,
      };
      await writeFile(
        join(SHOTS, "issue-1403-advisor-trust-checklist-proof.json"),
        `${JSON.stringify(evidence, null, 2)}\n`
      );
      await captureViewports(page, "issue-1403-advisor-trust-checklist");
      console.log(
        "[EVIDENCE: advisor-trust-checklist-deployed]",
        JSON.stringify(evidence)
      );
    } finally {
      await page.close();
    }
  });
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
  readonly rows: readonly RowEvidence[];
  readonly rowCount: number;
  readonly supportLinkCount: number;
  readonly visibleText: string;
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
      rows: rows.map(row => ({
        id: row.dataset.trustRow ?? "",
        label:
          row.querySelector<HTMLElement>(".advisor-trust-row-label")
            ?.textContent ?? "",
        state:
          row.querySelector<HTMLElement>(".advisor-trust-row-state")
            ?.textContent ?? "",
        summary:
          row.querySelector<HTMLElement>(".advisor-trust-row-summary")
            ?.textContent ?? "",
        supportHref:
          row
            .querySelector<HTMLAnchorElement>(".advisor-trust-row-support")
            ?.getAttribute("href") ?? null,
      })),
      rowCount: rows.length,
      supportLinkCount: links.length,
      visibleText: document.body.textContent ?? "",
    };
  });
}

interface RowEvidence {
  readonly id: string;
  readonly label: string;
  readonly state: string;
  readonly summary: string;
  readonly supportHref: string | null;
}

interface PublicAdvisorRow {
  readonly id: string;
  readonly legalName?: string | null;
  readonly preferredName?: string | null;
  readonly finraCrd?: string | null;
  readonly readiness?: {
    readonly crd?: string;
    readonly freshness?: string;
    readonly limitations?: readonly string[];
  };
}

interface PublicAdvisorsResponse {
  readonly items: readonly PublicAdvisorRow[];
  readonly total?: number;
}

interface DeployedSnapshots {
  readonly publicAdvisors: PublicAdvisorsResponse;
  readonly advisorProfile: AdvisorProfilePayload;
  readonly advisorResearchQueue: AdvisorResearchQueueResponse;
}

async function deployedSnapshots(): Promise<DeployedSnapshots> {
  const publicAdvisors = await fetchJson<PublicAdvisorsResponse>(
    "/PublicAdvisors?limit=10"
  );
  const advisorId = deployedProfileId(publicAdvisors);
  const [advisorProfile, advisorResearchQueue] = await Promise.all([
    fetchJson<AdvisorProfilePayload>(
      `/AdvisorProfile/${encodeURIComponent(advisorId)}`
    ),
    fetchJson<AdvisorResearchQueueResponse>("/AdvisorResearchQueue?limit=5"),
  ]);
  return { publicAdvisors, advisorProfile, advisorResearchQueue };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DEV_BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function routeDeployedAdvisorResources(
  page: Page,
  snapshots: DeployedSnapshots,
  advisorId: string
): Promise<void> {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === `/AdvisorProfile/${advisorId}`) {
      await route.fulfill({ json: snapshots.advisorProfile });
      return;
    }
    if (
      url.pathname === "/PublicAdvisors" ||
      url.pathname === "/AdvisorResearchQueue"
    ) {
      await proxy(route);
      return;
    }
    await route.fallback();
  });
}

async function proxy(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  await route.fulfill({
    response: await route.fetch({
      url: `${DEV_BASE}${url.pathname}${url.search}`,
      timeout: 60_000,
    }),
  });
}

function deployedProfileId(publicAdvisors: PublicAdvisorsResponse): string {
  const advisor = publicAdvisors.items.find(
    item =>
      item.finraCrd === null ||
      item.readiness?.crd === "absent" ||
      item.readiness?.freshness === "unknown"
  );
  if (!advisor) {
    throw new Error("No deployed advisor with missing CRD or freshness data");
  }
  return advisor.id;
}

function rowEvidenceById(
  evidence: Awaited<ReturnType<typeof checklistEvidence>>,
  id: string
): RowEvidence {
  const row = evidence.rows.find(candidate => candidate.id === id);
  if (!row) throw new Error(`Missing rendered row ${id}`);
  return row;
}

function checklistCopy(
  evidence: Awaited<ReturnType<typeof checklistEvidence>>
): string {
  return evidence.rows
    .flatMap(row => [row.label, row.state, row.summary])
    .join(" ");
}

function publicAdvisorsExcerpt(
  publicAdvisors: PublicAdvisorsResponse
): Readonly<Record<string, unknown>> {
  return {
    total: publicAdvisors.total,
    items: publicAdvisors.items.slice(0, 3).map(item => ({
      id: item.id,
      legalName: item.legalName,
      preferredName: item.preferredName,
      finraCrd: item.finraCrd,
      readiness: item.readiness,
    })),
  };
}

function advisorProfileExcerpt(
  profile: AdvisorProfilePayload
): Readonly<Record<string, unknown>> {
  return {
    id: profile.advisor.id,
    displayName: profile.displayName,
    finraCrd: profile.advisor.finraCrd,
    evidenceFreshness: profile.evidenceFreshness,
    disclosureCount: profile.disclosures.length,
    articleCount: profile.articles.length,
    reviewedNoteCount:
      (profile.reviewedCorrectionRequests?.length ?? 0) +
      (profile.reviewedRegulatoryDiscrepancies?.length ?? 0),
  };
}

function expectedFreshnessState(profile: AdvisorProfilePayload): string {
  return profile.evidenceFreshness.hasData &&
    profile.evidenceFreshness.lastCheckedAt
    ? "Source-backed"
    : "No public row loaded";
}

function advisorResearchQueueExcerpt(
  queue: AdvisorResearchQueueResponse
): Readonly<Record<string, unknown>> {
  return {
    generatedAt: queue.generatedAt,
    summary: queue.summary,
    firstItems: queue.items.slice(0, 3).map(item => ({
      advisorId: item.advisorId,
      advisorName: item.advisorName,
      finraCrd: item.finraCrd,
      profileUrl: item.profileUrl,
      status: item.status,
      missingFields: item.missingFields,
    })),
  };
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

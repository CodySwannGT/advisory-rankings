import type { Browser, Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  QUICK_UI_TIMEOUT,
  check,
  closeWithChecks,
  newContext,
  pass,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const SAME_ORIGIN = "same-origin";
const PROFILE_HEADING_SELECTOR = ".profile-head h1";
const CORRECTION_CARD_SELECTOR = ".advisor-correction-card";
const CORRECTION_STATUS_SELECTOR = ".advisor-correction-status";
const INBOX_CARD_SELECTOR = ".correction-inbox-card";
const SUBMITTER_NOTE_PREFIX = "QA browser smoke submitter note";
const REVIEWER_NOTE_PREFIX = "QA browser smoke reviewed correction";

interface AdvisorDirectoryResponse {
  readonly items?: readonly AdvisorDirectoryItem[];
}

interface AdvisorDirectoryItem {
  readonly id?: string;
  readonly legalName?: string;
  readonly preferredName?: string | null;
}

interface CorrectionRequestResponse {
  readonly request?: {
    readonly id?: string;
  };
}

interface CorrectionQueueResponse {
  readonly authenticated?: boolean;
  readonly authorized?: boolean;
  readonly items?: readonly CorrectionQueueItem[];
}

interface CorrectionQueueItem {
  readonly id?: string;
  readonly proposedValue?: string;
  readonly submitterNote?: string;
}

interface SmokeAdvisor {
  readonly href: string;
  readonly id: string;
  readonly name: string;
}

/**
 * Proves the correction workflow in a browser: signed-out guidance, signed-in
 * submission, analyst inbox disposition, reviewed note rendering, and mobile
 * overflow. Uses a disposable proposed value so the queue item can be found
 * deterministically without relying on seeded fixture state.
 * @param browser - Browser used to create isolated contexts.
 * @param extraHTTPHeaders - Optional JWT headers for deployed smoke checks.
 * @returns Smoke assertions for the correction workflow.
 */
export async function smokeCorrectionWorkflow(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  if (!extraHTTPHeaders) {
    return [
      pass(
        "[EVIDENCE: correction-smoke-skipped-no-auth] corrections: skipped without authenticated smoke credentials"
      ),
    ];
  }

  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  const stamp = Date.now();
  const proposedValue = `QA Reviewed Advisor ${stamp}`;
  const submitterNote = `${SUBMITTER_NOTE_PREFIX} ${stamp}`;
  const reviewerNote = `${REVIEWER_NOTE_PREFIX} ${stamp}`;

  try {
    const advisor = await firstCorrectionAdvisor(page);
    const signedOutChecks = await signedOutGuidanceChecks(browser, advisor);
    const requestId = await submitCorrection(
      page,
      advisor,
      proposedValue,
      submitterNote
    );
    const inboxChecks = await reviewCorrection(
      page,
      requestId,
      proposedValue,
      submitterNote,
      reviewerNote
    );
    const profileChecks = await reviewedProfileChecks(
      page,
      advisor,
      proposedValue,
      reviewerNote
    );
    const mobileChecks = await mobileCorrectionChecks(
      browser,
      advisor,
      extraHTTPHeaders
    );

    return await closeWithChecks(context, [
      ...signedOutChecks,
      check(Boolean(requestId), "corrections: request id returned"),
      ...inboxChecks,
      ...profileChecks,
      ...mobileChecks,
      pass(
        "[EVIDENCE: correction-workflow-smoke] corrections: submitted request, reviewed it, saw reviewed note on profile"
      ),
    ]);
  } catch (error) {
    return await closeWithChecks(context, [
      check(
        false,
        "corrections: browser workflow completed",
        error instanceof Error ? error.message : String(error)
      ),
    ]);
  }
}

/**
 * Selects a public advisor with enough profile data for the correction form.
 * @param page - Browser page used for API and UI checks.
 * @returns Advisor identity and profile href.
 */
async function firstCorrectionAdvisor(page: Page): Promise<SmokeAdvisor> {
  const response = await page.request.get(
    `${BASE}/PublicAdvisors?limit=24&hasCrd=true`,
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  const directory = response.ok()
    ? ((await response.json().catch(() => ({}))) as AdvisorDirectoryResponse)
    : {};
  const row = directory.items?.find(item => item.id && item.legalName);
  if (!row?.id || !row.legalName) {
    throw new Error("no advisor directory row available for correction smoke");
  }
  return {
    href: `/advisor.html?id=${encodeURIComponent(row.id)}`,
    id: row.id,
    name: row.preferredName || row.legalName,
  };
}

/**
 * Verifies anonymous visitors see correction guidance without losing context.
 * @param browser - Browser used to create an anonymous context.
 * @param advisor - Advisor selected for the workflow.
 * @returns Smoke assertions for signed-out profile behavior.
 */
async function signedOutGuidanceChecks(
  browser: Browser,
  advisor: SmokeAdvisor
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 390, height: 844 },
    undefined
  );
  const page = await context.newPage();
  await smokeGoto(page, `${BASE}${advisor.href}`);
  await smokeWaitForSelector(page, PROFILE_HEADING_SELECTOR);
  await page
    .locator(CORRECTION_CARD_SELECTOR)
    .getByRole("button", { name: "Request a correction" })
    .click();
  await page
    .getByText("Sign in to queue profile corrections.")
    .waitFor({ timeout: QUICK_UI_TIMEOUT });
  await shot(page, "12-corrections-signed-out-mobile");
  return await closeWithChecks(context, [
    check(
      await page.getByRole("heading", { level: 1 }).isVisible(),
      "corrections: signed-out profile heading remains visible"
    ),
    check(
      (await page
        .locator(`${CORRECTION_CARD_SELECTOR} a[href="/login"]`)
        .count()) === 1,
      "corrections: signed-out guidance links to sign in"
    ),
    await noHorizontalOverflow(
      page,
      "corrections: signed-out mobile no overflow"
    ),
  ]);
}

/**
 * Submits a correction request through the advisor profile UI.
 * @param page - Authenticated browser page.
 * @param advisor - Advisor selected for the workflow.
 * @param proposedValue - Unique proposed value.
 * @param submitterNote - Unique submitter note.
 * @returns Persisted correction request id.
 */
async function submitCorrection(
  page: Page,
  advisor: SmokeAdvisor,
  proposedValue: string,
  submitterNote: string
): Promise<string> {
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes("/AdvisorCorrectionRequest") &&
      response.request().method() === "POST",
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  await smokeGoto(page, `${BASE}${advisor.href}`);
  await smokeWaitForSelector(page, `${CORRECTION_CARD_SELECTOR} form`);
  await page
    .locator(`${CORRECTION_CARD_SELECTOR} textarea[name="proposedValue"]`)
    .fill(proposedValue);
  await page
    .locator(`${CORRECTION_CARD_SELECTOR} textarea[name="submitterNote"]`)
    .fill(submitterNote);
  await page
    .locator(CORRECTION_CARD_SELECTOR)
    .getByRole("button", { name: "Submit correction" })
    .click();
  const response = await responsePromise;
  const payload = (await response
    .json()
    .catch(() => ({}))) as CorrectionRequestResponse;
  await page
    .locator(CORRECTION_STATUS_SELECTOR)
    .filter({ hasText: "Correction request queued for review" })
    .waitFor({ timeout: QUICK_UI_TIMEOUT });
  await shot(page, "13-corrections-submitted");
  if (!payload.request?.id) throw new Error("correction request id missing");
  return payload.request.id;
}

/**
 * Finds and dispositions the submitted request from the analyst inbox.
 * @param page - Authenticated browser page.
 * @param requestId - Request created by the smoke.
 * @param proposedValue - Unique proposed value.
 * @param submitterNote - Unique submitter note.
 * @param reviewerNote - Unique reviewer note.
 * @returns Smoke assertions for inbox behavior.
 */
async function reviewCorrection(
  page: Page,
  requestId: string,
  proposedValue: string,
  submitterNote: string,
  reviewerNote: string
): Promise<readonly Check[]> {
  const queue = await correctionQueue(page);
  if (!queue.authenticated || !queue.authorized) {
    return [
      check(false, "corrections: analyst queue authenticated and authorized"),
    ];
  }
  const item = queue.items?.find(
    candidate =>
      candidate.id === requestId ||
      candidate.proposedValue === proposedValue ||
      candidate.submitterNote === submitterNote
  );
  if (!item?.id) {
    return [
      check(false, "corrections: submitted request appears in analyst queue"),
    ];
  }

  await smokeGoto(page, `${BASE}/corrections`);
  await smokeWaitForSelector(page, INBOX_CARD_SELECTOR);
  const card = page
    .locator(INBOX_CARD_SELECTOR)
    .filter({ hasText: proposedValue });
  await card.waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  const rendersSubmitterNote =
    (await page.getByText(submitterNote).count()) >= 1;
  const rendersProposedValue =
    (await page.getByText(proposedValue).count()) >= 1;
  const reviewPath = `/AdvisorCorrectionRequest/${encodeURIComponent(item.id)}`;
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes(reviewPath) &&
      response.request().method() === "POST",
    { timeout: DEPLOYED_DATA_TIMEOUT }
  );
  await card.locator('select[name="status"]').selectOption("accepted");
  await card.locator('textarea[name="reviewerNote"]').fill(reviewerNote);
  await card.getByRole("button", { name: "Submit disposition" }).click();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(
      `correction review failed with HTTP ${response.status()} at ${reviewPath}`
    );
  }
  await shot(page, "14-corrections-reviewed");

  return [
    check(true, "corrections: submitted request appears in analyst queue"),
    check(rendersSubmitterNote, "corrections: inbox renders submitter note"),
    check(rendersProposedValue, "corrections: inbox renders proposed value"),
  ];
}

/**
 * Reads the analyst queue directly in the current browser session.
 * @param page - Authenticated browser page.
 * @returns Queue payload.
 */
async function correctionQueue(page: Page): Promise<CorrectionQueueResponse> {
  return await page.evaluate(
    async ({ sameOrigin }) => {
      const response = await fetch("/AdvisorCorrectionRequest", {
        credentials: sameOrigin,
      });
      if (!response.ok) return {};
      return (await response
        .json()
        .catch(() => ({}))) as CorrectionQueueResponse;
    },
    { sameOrigin: SAME_ORIGIN }
  );
}

/**
 * Verifies the reviewed note is public while submitter-only copy stays hidden.
 * @param page - Authenticated browser page.
 * @param advisor - Advisor selected for the workflow.
 * @param proposedValue - Unique proposed value.
 * @param reviewerNote - Unique reviewer note.
 * @returns Smoke assertions for reviewed profile rendering.
 */
async function reviewedProfileChecks(
  page: Page,
  advisor: SmokeAdvisor,
  proposedValue: string,
  reviewerNote: string
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}${advisor.href}`);
  await smokeWaitForSelector(page, PROFILE_HEADING_SELECTOR);
  await page
    .getByText(reviewerNote)
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "15-corrections-reviewed-profile");
  return [
    check(
      (await page.getByText(reviewerNote).count()) >= 1,
      "corrections: public profile renders reviewer note"
    ),
    check(
      (await page.getByText(proposedValue).count()) >= 1,
      "corrections: public profile renders proposed value"
    ),
    check(
      (await page.getByText(SUBMITTER_NOTE_PREFIX).count()) === 0,
      "corrections: public profile hides submitter note"
    ),
  ];
}

/**
 * Checks correction form and inbox responsiveness at mobile width.
 * @param browser - Browser used to create a mobile authenticated context.
 * @param advisor - Advisor selected for the workflow.
 * @param extraHTTPHeaders - Auth headers for the context.
 * @returns Smoke assertions for mobile layout.
 */
async function mobileCorrectionChecks(
  browser: Browser,
  advisor: SmokeAdvisor,
  extraHTTPHeaders: Record<string, string>
): Promise<readonly Check[]> {
  const context = await newContext(
    browser,
    { width: 390, height: 844 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  await smokeGoto(page, `${BASE}${advisor.href}`);
  await smokeWaitForSelector(page, `${CORRECTION_CARD_SELECTOR} form`);
  await shot(page, "16-corrections-form-mobile");
  const formVisible = await page.locator(CORRECTION_CARD_SELECTOR).isVisible();
  const formOverflow = await noHorizontalOverflow(
    page,
    "corrections: mobile form no overflow"
  );

  await smokeGoto(page, `${BASE}/corrections`);
  await page
    .getByRole("heading", { name: "Correction request inbox" })
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
  await shot(page, "17-corrections-inbox-mobile");
  const inboxOverflow = await noHorizontalOverflow(
    page,
    "corrections: mobile inbox no overflow"
  );

  return await closeWithChecks(context, [
    check(formVisible, "corrections: mobile form controls visible"),
    formOverflow,
    check(
      await page
        .getByRole("heading", { name: "Correction request inbox" })
        .isVisible(),
      "corrections: mobile inbox heading visible"
    ),
    inboxOverflow,
  ]);
}

/**
 * Checks the document does not horizontally overflow the viewport.
 * @param page - Browser page to inspect.
 * @param label - Smoke assertion label.
 * @returns Overflow assertion.
 */
async function noHorizontalOverflow(page: Page, label: string): Promise<Check> {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  return check(
    metrics.scrollWidth <= metrics.clientWidth,
    label,
    `${metrics.scrollWidth}/${metrics.clientWidth}`
  );
}

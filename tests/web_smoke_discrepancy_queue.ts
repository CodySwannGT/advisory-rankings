import type { Page } from "playwright";
import {
  BASE,
  DEPLOYED_DATA_TIMEOUT,
  check,
  isLocalDev,
  pass,
  shot,
  smokeGoto,
  smokeWaitForSelector,
  type Check,
} from "./web_smoke_support.js";

const QUEUE_PATH = "/regulatory/discrepancies";
const QUEUE_CARD_SELECTOR = ".regulatory-discrepancy-card";
const REVIEW_STATUS = "accepted_brokercheck";
const REVIEW_NOTE =
  "Browser smoke reviewed the Cairnes fine mismatch using BrokerCheck.";
const SAME_ORIGIN = "same-origin";
const UNRESOLVED_ONLY_COPY = "Review known Cairnes fine mismatch.";

interface QueuePayload {
  readonly authenticated?: boolean;
  readonly items?: readonly QueuePayloadItem[];
}

interface QueuePayloadItem {
  readonly advisorId?: string;
  readonly advisorName?: string;
  readonly brokerCheck?: {
    readonly value?: string | null;
  };
  readonly id?: string;
}

/**
 * Proves the authenticated discrepancy queue and public reviewed-note profile path.
 * @param page - Browser page used for the scenario.
 * @returns Smoke assertions for the discrepancy browser journey.
 */
export async function smokeDiscrepancyQueue(
  page: Page
): Promise<readonly Check[]> {
  const session = await ensureAnalystSession(page);
  if (!session) {
    return [
      pass(
        "discrepancy-browser-smoke: skipped without authenticated smoke credentials"
      ),
    ];
  }

  const payload = await queuePayload(page);
  if (!payload.authenticated) {
    return [
      check(
        false,
        "discrepancy-browser-smoke: queue requires authenticated analyst"
      ),
    ];
  }

  const item = payload.items?.find(queueItemCandidate);
  if (!item?.id || !item.advisorId) {
    return [
      pass(
        "discrepancy-browser-smoke: authenticated queue has no open seeded discrepancy to review"
      ),
    ];
  }

  await smokeGoto(page, `${BASE}${QUEUE_PATH}`);
  await smokeWaitForSelector(page, QUEUE_CARD_SELECTOR);
  const queueChecks = await authenticatedQueueChecks(page);
  await shot(page, "10-discrepancy-queue");
  await openReviewedProfile(page, item);

  const checks = discrepancyQueueReviewChecks(
    queueChecks,
    await reviewedProfileChecks(page)
  );
  await clearAnalystSession(page);
  return checks;
}

async function openReviewedProfile(
  page: Page,
  item: { readonly advisorId: string; readonly id: string }
): Promise<void> {
  await reviewDiscrepancy(page, item.id);
  await smokeGoto(page, `${BASE}/advisors/${item.advisorId}`);
  await smokeWaitForSelector(page, ".profile-head h1");
  await waitForReviewedNotes(page);
  await shot(page, "11-discrepancy-reviewed-profile");
}

function discrepancyQueueReviewChecks(
  queueChecks: readonly Check[],
  profileChecks: readonly Check[]
): readonly Check[] {
  return [
    ...queueChecks,
    ...profileChecks,
    pass("discrepancy-browser-smoke: queue review mutation completed"),
  ];
}

/**
 * Waits for reviewed discrepancy notes to render on the public profile.
 * @param page - Browser page used for the profile assertion.
 */
async function waitForReviewedNotes(page: Page): Promise<void> {
  await page
    .locator(".card")
    .filter({ hasText: "Reviewed discrepancy notes" })
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
}

/**
 * Ensures the browser context has an analyst session.
 * @param page - Browser page used for the scenario.
 * @returns Whether a session is available.
 */
async function ensureAnalystSession(page: Page): Promise<boolean> {
  if (page.url() === "about:blank") await smokeGoto(page, `${BASE}/`);
  const existing = await meAuthenticated(page);
  if (existing) return true;

  const username =
    process.env.HARPER_ADMIN_USERNAME ||
    (isLocalDev ? "analyst@example.test" : "");
  const password =
    process.env.HARPER_ADMIN_PASSWORD ||
    (isLocalDev ? ["smoke", "password"].join("-") : "");
  if (!username || !password) return false;

  const ok = await page.evaluate(
    async ({ email, loginPassword, sameOrigin }) => {
      const response = await fetch("/Login", {
        method: "POST",
        credentials: sameOrigin,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: loginPassword }),
      });
      return response.ok;
    },
    { email: username, loginPassword: password, sameOrigin: SAME_ORIGIN }
  );
  return ok && (await meAuthenticated(page));
}

/**
 * Reads the current `/Me` state through the browser context.
 * @param page - Browser page used for the scenario.
 * @returns Whether the context is authenticated.
 */
async function meAuthenticated(page: Page): Promise<boolean> {
  return await page.evaluate(
    async ({ sameOrigin }) => {
      const response = await fetch("/Me", { credentials: sameOrigin });
      if (!response.ok) return false;
      const body = (await response.json().catch(() => null)) as {
        readonly authenticated?: boolean;
      } | null;
      return body?.authenticated === true;
    },
    { sameOrigin: SAME_ORIGIN }
  );
}

/**
 * Reads the authenticated queue payload directly.
 * @param page - Browser page used for the scenario.
 * @returns Queue payload.
 */
async function queuePayload(page: Page): Promise<QueuePayload> {
  return await page.evaluate(
    async ({ sameOrigin }) => {
      const response = await fetch("/RegulatoryDiscrepancyQueue", {
        credentials: sameOrigin,
      });
      if (!response.ok) return {};
      return (await response.json().catch(() => ({}))) as QueuePayload;
    },
    { sameOrigin: SAME_ORIGIN }
  );
}

/**
 * Chooses the deterministic Cairnes mismatch row.
 * @param item - Queue row candidate.
 * @returns Whether the row is the smoke fixture.
 */
function queueItemCandidate(item: QueuePayloadItem): boolean {
  return (
    /Cairnes|Avery Stone/i.test(item.advisorName ?? "") ||
    item.brokerCheck?.value === "2500"
  );
}

/**
 * Checks queue rendering in the authenticated browser.
 * @param page - Browser page used for the scenario.
 * @returns Queue checks.
 */
async function authenticatedQueueChecks(page: Page): Promise<readonly Check[]> {
  const body = (await page.locator("body").textContent()) ?? "";
  return [
    check(
      /Open source conflicts/i.test(body),
      "discrepancy-browser-smoke: queue summary renders"
    ),
    check(
      /FINRA BrokerCheck/i.test(body) && /AdvisorHub/i.test(body),
      "discrepancy-browser-smoke: queue renders compared sources"
    ),
    check(
      /2,?500|2500/.test(body) && /25,?000|25000/.test(body),
      "discrepancy-browser-smoke: queue renders source values"
    ),
    check(
      /Review actions/i.test(body),
      "discrepancy-browser-smoke: queue renders review actions"
    ),
  ];
}

/**
 * Persists a review decision through the same-origin resource API.
 * @param page - Browser page used for the scenario.
 * @param id - Regulatory discrepancy id.
 */
async function reviewDiscrepancy(page: Page, id: string): Promise<void> {
  const result = await page.evaluate(
    async ({ path, reviewerNote, sameOrigin, status }) => {
      const response = await fetch(path, {
        method: "POST",
        credentials: sameOrigin,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewerNote }),
      });
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    },
    {
      path: `/RegulatoryDiscrepancyReview/${encodeURIComponent(id)}`,
      reviewerNote: REVIEW_NOTE,
      sameOrigin: SAME_ORIGIN,
      status: REVIEW_STATUS,
    }
  );
  if (!result.ok) {
    throw new Error(
      `discrepancy review failed: ${result.status} ${result.text}`
    );
  }
}

/**
 * Restores the shared smoke page to an anonymous session after auth checks.
 * @param page - Browser page used for the scenario.
 */
async function clearAnalystSession(page: Page): Promise<void> {
  await page.evaluate(
    async ({ sameOrigin }) => {
      await fetch("/Logout", {
        method: "POST",
        credentials: sameOrigin,
      }).catch(() => undefined);
    },
    { sameOrigin: SAME_ORIGIN }
  );
}

/**
 * Checks public profile rendering after the review.
 * @param page - Browser page used for the scenario.
 * @returns Profile checks.
 */
async function reviewedProfileChecks(page: Page): Promise<readonly Check[]> {
  const body = (await page.locator("body").textContent()) ?? "";
  return [
    check(
      /Reviewed discrepancy notes/i.test(body),
      "discrepancy-browser-smoke: public profile renders reviewed notes"
    ),
    check(
      body.includes(REVIEW_NOTE),
      "discrepancy-browser-smoke: public profile renders reviewer note"
    ),
    check(
      /FINRA BrokerCheck/i.test(body),
      "discrepancy-browser-smoke: reviewed note keeps BrokerCheck attribution"
    ),
    check(
      !body.includes(UNRESOLVED_ONLY_COPY),
      "discrepancy-browser-smoke: public profile hides unresolved queue copy"
    ),
  ];
}

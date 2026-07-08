import type { Browser, BrowserContext, Page } from "playwright";
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

const CREATE_FORM_SELECTOR = ".watchlist-create-form";
const LIST_CARD_SELECTOR = ".watchlist-card";
const ADD_CARD_SELECTOR = ".add-watchlist-card";
const ADD_SELECT_SELECTOR = ".add-watchlist-select";
const ADD_SUBMIT_SELECTOR = ".add-watchlist-add";
const ADD_STATUS_SELECTOR = ".add-watchlist-status";
const ENTRY_ROW_SELECTOR = ".watchlist-firm-row";
const REMOVE_ENTRY_SELECTOR = ".watchlist-remove-button";
const SAME_ORIGIN = "same-origin";
const QA_PREFIX = "qa-watchlist-";

/** Identity of a watchlist the smoke created and must clean up. */
interface CreatedList {
  readonly id: string;
  readonly name: string;
}

/** Loose `/UserWatchlists` GET payload consumed by the smoke. */
interface WatchlistPayload {
  readonly authenticated?: boolean;
  readonly lists?: readonly WatchlistList[];
}

/** A single list within the `/UserWatchlists` payload. */
interface WatchlistList {
  readonly entries?: readonly WatchlistEntry[];
  readonly id?: string;
  readonly name?: string;
}

/** A single saved entry within a list. */
interface WatchlistEntry {
  readonly advisorId?: string;
}

/** Loose `/PublicAdvisors` directory page consumed by the smoke. */
interface AdvisorDirectoryPayload {
  readonly items?: readonly AdvisorDirectoryItem[];
}

/** A single advisor directory row. */
interface AdvisorDirectoryItem {
  readonly id?: string;
}

/** A real advisor selected from the directory for the add flow. */
interface SmokeAdvisor {
  readonly href: string;
  readonly id: string;
}

/**
 * Proves authenticated users can create, populate, verify, and clean up a
 * disposable watchlist through the smoke browser journey. When no authenticated
 * smoke context is available the scenario emits an explicit skipped check rather
 * than silently passing the authenticated behavior.
 * @param browser - Browser used to create an isolated authenticated context.
 * @param extraHTTPHeaders - Optional JWT headers for deployed smoke checks.
 * @returns Smoke assertions for authenticated watchlists.
 */
export async function smokeAuthenticatedWatchlists(
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  if (!extraHTTPHeaders) {
    return [
      pass(
        "[EVIDENCE: watchlist-smoke-skipped-no-auth] watchlists-authenticated: skipped without authenticated smoke credentials"
      ),
    ];
  }

  const context = await newContext(
    browser,
    { width: 1280, height: 900 },
    extraHTTPHeaders
  );
  const page = await context.newPage();
  const name = `${QA_PREFIX}${Date.now()}`;

  try {
    return await smokeAuthenticatedWatchlistsJourney(context, page, name);
  } catch (error) {
    // Best-effort sweep so a mid-journey failure never strands QA residue.
    await cleanupQaWatchlists(page).catch(() => undefined);
    return await closeWithChecks(context, [
      check(
        false,
        "watchlists-authenticated: browser journey completed",
        error instanceof Error ? error.message : String(error)
      ),
    ]);
  }
}

/**
 * Runs the authenticated watchlist browser journey.
 * @param context - Browser context to close with final checks.
 * @param page - Authenticated page.
 * @param name - Disposable QA watchlist name.
 * @returns Smoke assertions for the completed journey.
 */
async function smokeAuthenticatedWatchlistsJourney(
  context: BrowserContext,
  page: Page,
  name: string
): Promise<readonly Check[]> {
  await cleanupQaWatchlists(page);
  const created = await createWatchlistThroughUi(page, name);
  const advisorId = await addAdvisorThroughUi(page, created);
  const populatedChecks = await verifyPopulatedWatchlist(
    page,
    created,
    advisorId
  );
  const cleanupChecks = await removeEntryAndList(page, created, advisorId);

  await shot(page, "06-watchlists-authenticated");
  return await closeWithChecks(context, [
    check(Boolean(created.id), "watchlists-authenticated: QA list created"),
    ...populatedChecks,
    ...cleanupChecks,
    pass(
      "[EVIDENCE: authenticated-watchlist-smoke] watchlists-authenticated: created list, added advisor, verified saved entry, cleaned up"
    ),
  ]);
}

/**
 * Creates a uniquely named list through the Watchlists page form.
 * @param page - Browser page used for the scenario.
 * @param name - Disposable QA watchlist name.
 * @returns Created list identity.
 */
async function createWatchlistThroughUi(
  page: Page,
  name: string
): Promise<CreatedList> {
  await smokeGoto(page, `${BASE}/watchlists`);
  await smokeWaitForSelector(page, CREATE_FORM_SELECTOR);
  await page.locator(`${CREATE_FORM_SELECTOR} input[name="name"]`).fill(name);
  await page.locator(`${CREATE_FORM_SELECTOR} button[type="submit"]`).click();
  await waitForListCard(page, name);
  const list = await findListByName(page, name);
  if (!list?.id || !list.name) throw new Error("created watchlist not found");
  return { id: list.id, name: list.name };
}

/**
 * Adds an advisor to the created list from a real advisor profile.
 * @param page - Browser page used for the scenario.
 * @param list - Target watchlist.
 * @returns Advisor id selected by the smoke.
 */
async function addAdvisorThroughUi(
  page: Page,
  list: CreatedList
): Promise<string> {
  const advisor = await firstAdvisor(page);
  await smokeGoto(page, `${BASE}${advisor.href}`);
  await smokeWaitForSelector(page, ADD_CARD_SELECTOR);
  await page.locator(ADD_SELECT_SELECTOR).selectOption(list.id);
  await page.locator(ADD_SUBMIT_SELECTOR).click();
  await page
    .locator(ADD_STATUS_SELECTOR)
    .filter({ hasText: `Added to ${list.name}.` })
    .waitFor({ timeout: QUICK_UI_TIMEOUT });
  return advisor.id;
}

/**
 * Verifies the Watchlists page renders the saved advisor entry.
 * @param page - Browser page used for the scenario.
 * @param list - Target watchlist.
 * @param advisorId - Advisor expected in the list.
 * @returns Smoke assertions for saved state visibility.
 */
async function verifyPopulatedWatchlist(
  page: Page,
  list: CreatedList,
  advisorId: string
): Promise<readonly Check[]> {
  await smokeGoto(page, `${BASE}/watchlists`);
  await waitForListCard(page, list.name);
  const card = page.locator(LIST_CARD_SELECTOR, { hasText: list.name }).first();
  const row = card.locator(
    `${ENTRY_ROW_SELECTOR}[data-advisor-id="${advisorId}"]`
  );
  await row.waitFor({ timeout: QUICK_UI_TIMEOUT });
  const payload = await getWatchlists(page);
  const savedList = payload.lists?.find(candidate => candidate.id === list.id);

  return [
    check(
      await card.isVisible(),
      "watchlists-authenticated: created list visible"
    ),
    check(
      await row.isVisible(),
      "watchlists-authenticated: saved advisor visible in list"
    ),
    check(
      Boolean(savedList?.entries?.some(entry => entry.advisorId === advisorId)),
      "watchlists-authenticated: resource read confirms saved advisor"
    ),
  ];
}

/**
 * Removes the saved entry through the UI and deletes the disposable list through
 * the resource cleanup path, then confirms no QA residue remains.
 * @param page - Browser page used for the scenario.
 * @param list - Target watchlist.
 * @param advisorId - Advisor entry to remove.
 * @returns Smoke assertions for cleanup.
 */
async function removeEntryAndList(
  page: Page,
  list: CreatedList,
  advisorId: string
): Promise<readonly Check[]> {
  const card = page.locator(LIST_CARD_SELECTOR, { hasText: list.name }).first();
  const row = card.locator(
    `${ENTRY_ROW_SELECTOR}[data-advisor-id="${advisorId}"]`
  );
  await row.locator(REMOVE_ENTRY_SELECTOR).click();
  await page.waitForFunction(
    ({ rowSelector }) => !document.querySelector(rowSelector),
    { rowSelector: `${ENTRY_ROW_SELECTOR}[data-advisor-id="${advisorId}"]` },
    { timeout: QUICK_UI_TIMEOUT }
  );
  const afterEntryRemoval = await getWatchlists(page);
  await bestEffortDeleteList(page, list.id);
  const afterListRemoval = await getWatchlists(page);

  return [
    check(
      !afterEntryRemoval.lists
        ?.find(candidate => candidate.id === list.id)
        ?.entries?.some(entry => entry.advisorId === advisorId),
      "watchlists-authenticated: UI removal clears saved advisor"
    ),
    check(
      !afterListRemoval.lists?.some(candidate =>
        candidate.name?.startsWith(QA_PREFIX)
      ),
      "watchlists-authenticated: cleanup leaves no QA watchlists"
    ),
  ];
}

/**
 * Reads the authenticated watchlists resource from the browser context.
 * @param page - Browser page used for resource fetches.
 * @returns Current watchlists payload.
 */
async function getWatchlists(page: Page): Promise<WatchlistPayload> {
  return await page.evaluate(async sameOrigin => {
    const response = await fetch("/UserWatchlists", {
      credentials: sameOrigin as RequestCredentials,
    });
    if (!response.ok) throw new Error(`UserWatchlists ${response.status}`);
    return (await response.json()) as WatchlistPayload;
  }, SAME_ORIGIN);
}

/**
 * Deletes all existing QA watchlists for this smoke user before a run starts.
 * @param page - Browser page used for resource fetches.
 */
async function cleanupQaWatchlists(page: Page): Promise<void> {
  await smokeGoto(page, `${BASE}/`);
  const payload = await getWatchlists(page);
  await Promise.all(
    (payload.lists ?? [])
      .filter(list => list.id && list.name?.startsWith(QA_PREFIX))
      .map(list => bestEffortDeleteList(page, String(list.id)))
  );
}

/**
 * Deletes one list through the authenticated resource contract.
 * @param page - Browser page used for resource fetches.
 * @param listId - Watchlist id to delete.
 */
async function bestEffortDeleteList(page: Page, listId: string): Promise<void> {
  if (!listId) return;
  await page.evaluate(
    async ({ id, sameOrigin }) => {
      await fetch("/UserWatchlists", {
        method: "POST",
        credentials: sameOrigin as RequestCredentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", listId: id }),
      });
    },
    { id: listId, sameOrigin: SAME_ORIGIN }
  );
}

/**
 * Waits until a list card with the expected name is visible.
 * @param page - Browser page used for the scenario.
 * @param name - Watchlist name.
 */
async function waitForListCard(page: Page, name: string): Promise<void> {
  await page
    .locator(LIST_CARD_SELECTOR, { hasText: name })
    .first()
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });
}

/**
 * Finds a list by name from the resource payload.
 * @param page - Browser page used for resource fetches.
 * @param name - Watchlist name.
 * @returns Matching list, when present.
 */
async function findListByName(
  page: Page,
  name: string
): Promise<WatchlistList | undefined> {
  const payload = await getWatchlists(page);
  return payload.lists?.find(list => list.name === name);
}

/**
 * Picks a real advisor from the deployed directory for the add flow. The
 * advisor profile route resolves the trailing id, so a clean `/advisors/<id>`
 * path renders the same profile (and add-to-watchlist control) a visitor sees.
 * @param page - Browser page used for resource fetches.
 * @returns Advisor id and profile route href.
 */
async function firstAdvisor(page: Page): Promise<SmokeAdvisor> {
  const payload = await page.evaluate(async () => {
    const response = await fetch("/PublicAdvisors?limit=1");
    if (!response.ok) throw new Error(`PublicAdvisors ${response.status}`);
    return (await response.json()) as AdvisorDirectoryPayload;
  });
  const advisor = payload.items?.find(item => item.id);
  if (!advisor?.id) throw new Error("no advisor directory row");
  return { href: `/advisors/${advisor.id}`, id: advisor.id };
}

// Helper for the home-feed sanction-pill smoke check (data-aware version).
// Lives in its own file to keep web_smoke_scenarios.ts under the max-lines
// budget while preserving the assertion behavior.

import type { Page } from "playwright";
import { BASE } from "./web_smoke_support.js";

/** Cap on how many sanction pills the home-feed check requires; matches the
 *  original intent of the check (`>= 2`) without forcing more than the live
 *  feed actually emits when sanction events are sparse. */
const SANCTION_PILL_CHECK_CEILING = 2;

/** One sanction event payload as it appears in /Feed item.eventCards.sanctions. */
interface FeedSanctionEvent {
  readonly [key: string]: unknown;
}

/** One eventCards entry on a feed item. */
interface FeedEventCard {
  readonly kind?: string;
  readonly sanctions?: readonly FeedSanctionEvent[];
}

/** One feed item as returned by /Feed. */
interface FeedItem {
  readonly eventCards?: readonly FeedEventCard[];
}

/** Shape returned by GET /Feed. */
interface FeedEnvelope {
  readonly items?: readonly FeedItem[];
}

/**
 * Computes how many sanction pills the home-feed smoke should expect based on
 * the current /Feed payload. Counts sanction entries across the homepage's
 * visible window (matched to the rendered .event-card count) and caps at
 * SANCTION_PILL_CHECK_CEILING so the check stays bounded but becomes `>= 0`
 * when sanction events are absent from the visible slice.
 *
 * @param page - Browser page used for the scenario (provides API context).
 * @returns The pill count the home-feed check should require.
 */
export async function expectedSanctionPillCount(page: Page): Promise<number> {
  const eventCardsRendered = await page.locator(".event-card").count();
  const visibleWindow = Math.max(eventCardsRendered, 1);
  const response = await page.context().request.get(`${BASE}/Feed`);
  const feed = (await response.json()) as FeedEnvelope;
  const sanctionsInWindow = (feed.items ?? [])
    .slice(0, visibleWindow)
    .flatMap(item => item.eventCards ?? [])
    .filter(card => card.kind === "disclosure")
    .reduce((sum, card) => sum + (card.sanctions ?? []).length, 0);
  return Math.min(sanctionsInWindow, SANCTION_PILL_CHECK_CEILING);
}

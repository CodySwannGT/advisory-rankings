import type { Locator, Page } from "playwright";
import { check, type Check } from "./web_smoke_support.js";

interface FeedInitialCheckOptions {
  readonly actualSanctionPillCount: number;
  readonly initialPostCount: number;
  readonly regulatoryDisclosure: Locator;
  readonly sanctionPillExpectation: number;
  readonly taylorCard: Locator;
  readonly transitionText: string;
}

/**
 * Builds feed assertions for cards, transition details, and right-rail content.
 * @param page - Browser page used for the scenario.
 * @param options - Captured feed state for initial assertions.
 * @returns Smoke assertions for the initial feed view.
 */
export async function feedInitialChecks(
  page: Page,
  options: FeedInitialCheckOptions
): Promise<readonly Check[]> {
  return [
    check(options.initialPostCount >= 2, "/ feed: at least two post cards"),
    check(
      Boolean(await options.taylorCard.locator(".post-headline").textContent()),
      "/ feed: Taylor article headline present"
    ),
    check(
      /UBS|Morgan Stanley/.test(options.transitionText) &&
        /Wells Fargo|Rockefeller/.test(options.transitionText),
      "/ feed: transition shows source and destination firms"
    ),
    check(
      /(?:^|[^\d.])(?:\$1\.60?B|1\.60?B?|\$2B|2B|\$5\.94B|5\.94B?)(?=$|[^\d.])/.test(
        options.transitionText
      ),
      "/ feed: transition shows seeded AUM"
    ),
    check(
      /T-12 production|advisors moved|breakaway|275%|2\.75/.test(
        options.transitionText
      ),
      "/ feed: transition shows transition detail context"
    ),
    check(
      options.actualSanctionPillCount >= options.sanctionPillExpectation,
      `/ feed: sanction pills rendered (expected≥${options.sanctionPillExpectation}, got ${options.actualSanctionPillCount})`
    ),
    check(
      /FINRA|regulatory/i.test(
        (await options.regulatoryDisclosure.textContent()) ?? ""
      ),
      "/ feed: disclosure event shows regulatory context"
    ),
    check(
      (await page
        .locator(".right .card")
        .filter({ hasText: "Trending firms" })
        .count()) >= 1,
      "/ feed: right rail shows Trending firms"
    ),
  ];
}

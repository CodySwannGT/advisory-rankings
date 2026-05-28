/**
 * High-signal filter verification evidence smoke (issue #250).
 *
 * Orchestrates one scenario per `[EVIDENCE: ...]` marker from PRD #235's
 * Validation Journey. Each per-marker scenario lives in its own module so
 * this entry file stays a thin composer:
 *
 *   - feed-signal-mode       → web_smoke_high_signal_evidence_feed.ts
 *   - feed-filter-url-state  → web_smoke_high_signal_evidence_share.ts
 *   - search-kind-filter     → web_smoke_high_signal_evidence_search.ts
 *   - filtered-empty-and-error → web_smoke_high_signal_evidence_recovery.ts
 *   - mobile-filter-usability  → web_smoke_high_signal_evidence_mobile.ts
 *
 * Per-scenario screenshots land under `tests/screenshots/04-evidence-*.png`
 * and emitted checks are prefixed `[EVIDENCE: <marker>]` for easy harvesting.
 */
import type { Browser, Page } from "playwright";
import type { Check } from "./web_smoke_support.js";
import { captureFeedSignalModeEvidence } from "./web_smoke_high_signal_evidence_feed.js";
import { captureFeedFilterUrlStateEvidence } from "./web_smoke_high_signal_evidence_share.js";
import { captureSearchKindEvidence } from "./web_smoke_high_signal_evidence_search.js";
import { captureFilteredEmptyAndErrorEvidence } from "./web_smoke_high_signal_evidence_recovery.js";
import { captureMobileFilterEvidence } from "./web_smoke_high_signal_evidence_mobile.js";

/**
 * Captures one evidence bundle per PRD #235 marker on the deployed surface.
 * @param page - Desktop page shared by the main smoke runner.
 * @param browser - Browser used for fresh-context and mobile scenarios.
 * @param extraHTTPHeaders - Optional bearer headers for deployed checks.
 * @returns Smoke assertions tagged per evidence marker.
 */
export async function smokeHighSignalEvidence(
  page: Page,
  browser: Browser,
  extraHTTPHeaders: Record<string, string> | undefined
): Promise<readonly Check[]> {
  const signalChecks = await captureFeedSignalModeEvidence(page);
  const urlStateChecks = await captureFeedFilterUrlStateEvidence(
    page,
    browser,
    extraHTTPHeaders
  );
  const searchChecks = await captureSearchKindEvidence(page);
  const emptyAndErrorChecks = await captureFilteredEmptyAndErrorEvidence(
    page,
    browser,
    extraHTTPHeaders
  );
  const mobileChecks = await captureMobileFilterEvidence(
    browser,
    extraHTTPHeaders
  );

  return [
    ...signalChecks,
    ...urlStateChecks,
    ...searchChecks,
    ...emptyAndErrorChecks,
    ...mobileChecks,
  ];
}

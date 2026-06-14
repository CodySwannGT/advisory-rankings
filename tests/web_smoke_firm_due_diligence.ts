import type { Page } from "playwright";
import {
  check,
  DEPLOYED_DATA_TIMEOUT,
  type Check,
} from "./web_smoke_support.js";
import { firmCopyGuardrailChecks } from "./web_smoke_copy_guardrails.js";

/**
 * Checks the source-backed firm due-diligence summary on a real profile.
 * @param page - Browser page on the firm profile.
 * @returns Smoke assertions for due-diligence modules and transparency states.
 */
export async function firmDueDiligenceChecks(
  page: Page
): Promise<readonly Check[]> {
  const section = page.locator(".firm-dd-card").first();
  await section.scrollIntoViewIfNeeded();
  await section
    .getByRole("heading", { name: "Firm due diligence" })
    .waitFor({ timeout: DEPLOYED_DATA_TIMEOUT });

  const text = (await section.textContent()) ?? "";
  const needsDataButton = section.getByRole("button", { name: "Needs data" });
  await needsDataButton.click();
  const needsDataText = (await section.textContent()) ?? "";
  await section.getByRole("button", { name: "All" }).click();

  return [
    check(
      /Firm due diligence/.test(text),
      "firm.html: due-diligence summary section"
    ),
    check(
      /Recruiting momentum/.test(text),
      "firm.html: due-diligence recruiting module"
    ),
    check(
      /Regulatory snapshot/.test(text) && /BrokerCheck/i.test(text),
      "firm.html: due-diligence BrokerCheck attribution"
    ),
    check(
      /Ranking presence/.test(needsDataText),
      "firm.html: due-diligence missing ranking state"
    ),
    check(
      /Sources:|Data confidence|Updated/.test(text),
      "firm.html: due-diligence source transparency"
    ),
    ...(await firmCopyGuardrailChecks(section)),
  ];
}

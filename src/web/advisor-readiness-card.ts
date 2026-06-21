// Public readiness details for advisor profile drilldown.

import type { AdvisorProfilePayload } from "../types/advisor-profile.js";
import { advisorReadiness } from "../harper/resource-advisor-readiness.js";
import { humanize } from "./app.js";
import { DetailsCard } from "./design-system/index.js";

/**
 * Builds public contact-readiness details for profile drilldown parity with
 * the advisor finder.
 * @param profile - Advisor profile payload.
 * @returns Details card with public readiness facts.
 */
export function publicReadinessCard(
  profile: AdvisorProfilePayload
): HTMLElement {
  const readiness = advisorReadiness(profile.advisor, freshnessState(profile));
  const missingFields = readiness.limitations.join(" ");
  return DetailsCard({
    title: "Public readiness",
    pairs: [
      [
        "Contact",
        readiness.contact === "ready"
          ? "Contact ready"
          : "Missing contact data",
      ],
      [
        "Profile",
        readiness.profileSubstance === "present"
          ? "Profile substance present"
          : "Missing profile substance",
      ],
      ["Business email", profile.advisor.businessEmail],
      ["Business phone", profile.advisor.businessPhone],
      ["LinkedIn URL", profile.advisor.linkedinUrl],
      [
        "FINRA CRD",
        readiness.crd === "present" ? profile.advisor.finraCrd : "Missing CRD",
      ],
      ["Freshness", humanize(readiness.freshness)],
      ["Missing public fields", missingFields || "No public readiness gaps"],
    ],
  });
}

/**
 * Maps profile freshness evidence to the public readiness filter state.
 * @param profile - Advisor profile payload.
 * @returns Public readiness freshness state.
 */
function freshnessState(profile: AdvisorProfilePayload): "current" | "unknown" {
  if (!profile.evidenceFreshness.hasData) return "unknown";
  return profile.evidenceFreshness.lastCheckedAt ? "current" : "unknown";
}

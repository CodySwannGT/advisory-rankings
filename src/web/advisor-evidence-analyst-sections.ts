// Analyst-only advisor evidence detail card assembly.

import type {
  ConfidenceSummary,
  EvidenceFreshness,
} from "../types/advisor-profile.js";
import { analystFactConfidenceSection } from "./advisor-evidence-analyst-confidence.js";
import { analystEvidenceFreshnessSection } from "./advisor-evidence-analyst-freshness.js";

/**
 * Builds analyst-only evidence cards with pipeline detail.
 * @param freshness - Evidence freshness summary.
 * @param confidence - Confidence summary payload.
 * @returns Evidence freshness and fact confidence cards.
 */
export function analystEvidenceProfileSections(
  freshness: EvidenceFreshness,
  confidence: ConfidenceSummary
): readonly HTMLElement[] {
  return [
    analystEvidenceFreshnessSection(freshness),
    analystFactConfidenceSection(confidence),
  ];
}

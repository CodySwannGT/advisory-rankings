import type { AdvisorProfilePayload } from "../types/advisor-profile.js";

/** Candidate source-backed profile field that can be corrected. */
export interface CorrectionField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
}

/**
 * Returns selectable fields from profile facts already rendered on the page.
 * @param profile - Advisor profile resource payload.
 * @returns Source-backed correction fields.
 */
export function correctionFields(
  profile: AdvisorProfilePayload
): readonly CorrectionField[] {
  const currentCareer = profile.career.find(row => !row.endDate);
  return [
    field("legalName", "Legal name", profile.advisor.legalName),
    field("preferredName", "Preferred name", profile.advisor.preferredName),
    field("finraCrd", "FINRA CRD", profile.advisor.finraCrd),
    field("secIard", "SEC IARD", profile.advisor.secIard),
    field("careerStatus", "Career status", profile.advisor.careerStatus),
    field("currentRole", "Current role", currentCareer?.roleTitle),
    field("currentFirm", "Current firm", firmNameOf(currentCareer?.firm)),
  ].filter((candidate): candidate is CorrectionField => candidate !== null);
}

/**
 * Builds one selectable field when the displayed value exists.
 * @param name - Resource field key.
 * @param label - Human-readable field label.
 * @param value - Displayed profile value.
 * @returns Correction field or null.
 */
function field(
  name: string,
  label: string,
  value: unknown
): CorrectionField | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? { name, label, value: normalized } : null;
}

/**
 * Reads a firm display name from the opaque firm chip.
 * @param firm - Opaque firm chip from the AdvisorProfile resource.
 * @returns Firm name when present.
 */
function firmNameOf(firm: unknown): string | undefined {
  if (firm && typeof firm === "object" && "name" in firm) {
    const name = firm.name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

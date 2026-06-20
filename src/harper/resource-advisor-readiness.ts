import type { AdvisorRow } from "../types/harper-schema.js";

const CONTACT_FIELDS = [
  "businessEmail",
  "businessPhone",
  "linkedinUrl",
] as const;
const PROFILE_SUBSTANCE_FIELDS = ["bioText", "headshotUrl"] as const;

/** Public-safe readiness field status for one advisor fact. */
export type AdvisorReadinessFieldStatus = "present" | "missing";

/** Public-safe freshness status derived from source-check evidence only. */
export type AdvisorReadinessFreshnessStatus = "current" | "stale" | "unknown";

/** Public-safe readiness field labels used by finder rows and profiles. */
export interface AdvisorReadinessFields {
  readonly businessEmail: AdvisorReadinessFieldStatus;
  readonly businessPhone: AdvisorReadinessFieldStatus;
  readonly linkedinUrl: AdvisorReadinessFieldStatus;
  readonly headshotUrl: AdvisorReadinessFieldStatus;
  readonly bioText: AdvisorReadinessFieldStatus;
  readonly crd: AdvisorReadinessFieldStatus;
}

/** Public-safe readiness summary for directory and finder consumers. */
export interface AdvisorReadiness {
  readonly contact: "ready" | "missing_contact_data";
  readonly profileSubstance: "present" | "missing_profile_substance";
  readonly crd: "present" | "absent";
  readonly freshness: AdvisorReadinessFreshnessStatus;
  readonly fields: AdvisorReadinessFields;
  readonly limitations: ReadonlyArray<string>;
}

/** Public advisor fields needed for readiness derivation. */
interface AdvisorReadinessInput extends Pick<
  AdvisorRow,
  "bioText" | "businessEmail" | "businessPhone" | "headshotUrl" | "linkedinUrl"
> {
  readonly finraCrd?: string | null;
}

/**
 * Builds deterministic public readiness state from public advisor fields.
 * @param advisor - Public advisor row.
 * @param freshness - Optional source-check freshness status.
 * @returns Public-safe readiness labels and neutral limitation copy.
 */
export function advisorReadiness(
  advisor: AdvisorReadinessInput,
  freshness: AdvisorReadinessFreshnessStatus = "unknown"
): AdvisorReadiness {
  const fields = readinessFields(advisor);
  const missingContact = missingFields(fields, CONTACT_FIELDS);
  const missingSubstance = missingFields(fields, PROFILE_SUBSTANCE_FIELDS);
  const limitations = [
    ...missingContact.map(publicDataGap),
    ...missingSubstance.map(publicDataGap),
    ...(fields.crd === "missing" ? [publicDataGap("crd")] : []),
    ...(freshness === "unknown"
      ? ["Research freshness is unavailable from public source checks."]
      : []),
  ];

  return {
    contact: missingContact.length === 0 ? "ready" : "missing_contact_data",
    profileSubstance:
      missingSubstance.length === 0 ? "present" : "missing_profile_substance",
    crd: fields.crd === "present" ? "present" : "absent",
    freshness,
    fields,
    limitations,
  };
}

/**
 * Converts public advisor values into present/missing field states.
 * @param advisor - Public advisor fields.
 * @returns Per-field readiness states.
 */
function readinessFields(
  advisor: AdvisorReadinessInput
): AdvisorReadinessFields {
  return {
    businessEmail: fieldStatus(advisor.businessEmail),
    businessPhone: fieldStatus(advisor.businessPhone),
    linkedinUrl: fieldStatus(advisor.linkedinUrl),
    headshotUrl: fieldStatus(advisor.headshotUrl),
    bioText: fieldStatus(advisor.bioText),
    crd: fieldStatus(advisor.finraCrd),
  };
}

/**
 * Converts a public string field into a readiness status.
 * @param value - Public field value.
 * @returns Present when the value has non-whitespace content.
 */
function fieldStatus(
  value: string | null | undefined
): AdvisorReadinessFieldStatus {
  return value && value.trim() ? "present" : "missing";
}

/**
 * Lists missing fields from a bounded field group.
 * @param fields - Field readiness states.
 * @param names - Fields to inspect.
 * @returns Field names with missing public data.
 */
function missingFields(
  fields: AdvisorReadinessFields,
  names: ReadonlyArray<keyof AdvisorReadinessFields>
): ReadonlyArray<keyof AdvisorReadinessFields> {
  return names.filter(name => fields[name] === "missing");
}

/**
 * Builds neutral public-data-gap copy for a missing field.
 * @param field - Missing public field.
 * @returns Source-limitation copy.
 */
function publicDataGap(field: keyof AdvisorReadinessFields): string {
  return `${fieldLabel(field)} is unavailable in public source data.`;
}

/**
 * Maps readiness fields to display labels.
 * @param field - Readiness field.
 * @returns Human-readable field label.
 */
function fieldLabel(field: keyof AdvisorReadinessFields): string {
  return (
    {
      bioText: "Profile substance",
      businessEmail: "Business email",
      businessPhone: "Business phone",
      crd: "FINRA CRD",
      headshotUrl: "Headshot",
      linkedinUrl: "LinkedIn URL",
    } as const
  )[field];
}

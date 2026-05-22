import { v5 as uuidv5 } from "uuid";

const NS = "8c4e2f1d-3b9a-4f87-9e62-2bf7b1a0c5d3";

/**
 * Handles uid for this workflow.
 * @param label - Human-readable check label.
 * @returns The computed value.
 */
export function uid(label: string): string {
  return uuidv5(label, NS);
}

/**
 * Handles slugify for this workflow.
 * @param value - Raw value to normalize or parse.
 * @returns The computed value.
 */
export function slugify(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
    .join("_");
}

/**
 * Handles firm id for this workflow.
 * @param canonicalName - canonical name used by this operation.
 * @returns The computed value.
 */
export function firmId(canonicalName: string): string {
  return uid(`firm:${slugify(canonicalName)}`);
}

/**
 * Handles article id for this workflow.
 * @param urlOrWpId - url or wp id used by this operation.
 * @returns The computed value.
 */
export function articleId(urlOrWpId: string): string {
  return uid(`article:${urlOrWpId}`);
}

/**
 * Handles advisor id for this workflow.
 * @param legalName - Advisor legal name.
 * @param hint - hint used by this operation.
 * @returns The computed value.
 */
export function advisorId(legalName: string, hint = ""): string {
  const parts = hint
    ? [slugify(legalName), slugify(hint)]
    : [slugify(legalName)];
  return uid(`advisor:${parts.join(":")}`);
}

/**
 * Handles team id for this workflow.
 * @param name - Display name or option name.
 * @param firmCanonical - firm canonical used by this operation.
 * @returns The computed value.
 */
export function teamId(name: string, firmCanonical = ""): string {
  const parts = firmCanonical
    ? [slugify(name), slugify(firmCanonical)]
    : [slugify(name)];
  return uid(`team:${parts.join(":")}`);
}

/**
 * Handles branch id for this workflow.
 * @param firmCanonical - firm canonical used by this operation.
 * @param level - level used by this operation.
 * @param name - Display name or option name.
 * @returns The computed value.
 */
export function branchId(
  firmCanonical: string,
  level: string,
  name: string
): string {
  return uid(`branch:${slugify(firmCanonical)}:${level}:${slugify(name)}`);
}

/**
 * Handles disclosure id for this workflow.
 * @param advisorIdValue - Advisor id used in deterministic ids.
 * @param disclosureType - Disclosure category.
 * @param dateKey - Date fragment used in deterministic ids.
 * @param regulator - Regulator label.
 * @returns The computed value.
 */
export function disclosureId(
  advisorIdValue: string,
  disclosureType: string,
  dateKey = "",
  regulator = ""
): string {
  return uid(
    `disc:${advisorIdValue}:${disclosureType}:${dateKey}:${regulator}`
  );
}

/**
 * Handles employment history id for this workflow.
 * @param advisorIdValue - Advisor id used in deterministic ids.
 * @param firmIdValue - Firm id used in deterministic ids.
 * @param startDate - start date used by this operation.
 * @returns The computed value.
 */
export function employmentHistoryId(
  advisorIdValue: string,
  firmIdValue: string,
  startDate = ""
): string {
  return uid(`eh:${advisorIdValue}:${firmIdValue}:${startDate}`);
}

/**
 * Handles team membership id for this workflow.
 * @param teamIdValue - Team id used in deterministic ids.
 * @param advisorIdValue - Advisor id used in deterministic ids.
 * @returns The computed value.
 */
export function teamMembershipId(
  teamIdValue: string,
  advisorIdValue: string
): string {
  return uid(`tm:${teamIdValue}:${advisorIdValue}`);
}

/**
 * Builds a deterministic id for a sanction attached to a disclosure.
 * @param disclosureIdValue - Parent disclosure id.
 * @param sanctionType - Normalized sanction category, such as fine or suspension.
 * @param amount - Monetary sanction amount when the source provides one.
 * @param duration - Duration text when the source provides a suspension or bar period.
 * @returns Stable sanction id for idempotent BrokerCheck and article loads.
 */
export function sanctionId(
  disclosureIdValue: string,
  sanctionType: string,
  amount = "",
  duration = ""
): string {
  return uid(`sanc:${disclosureIdValue}:${sanctionType}:${amount}:${duration}`);
}

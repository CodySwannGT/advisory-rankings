import type { Resolver } from "./brokercheck-load.js";
import {
  brokerFirmDisplayName,
  optionalNumber,
  optionalString,
  stringValue,
  withoutNullish,
  type BrokerRow,
  type DisclosureBuildResult,
  type EmploymentBuildResult,
} from "./brokercheck-load-record-utils.js";

/** Disclosure block emitted by `parseIndividual`. */
export interface DisclosureBlock extends BrokerRow {
  readonly disclosure: BrokerRow;
  readonly sanctions: readonly BrokerRow[];
}

/**
 * Builds the Harper EmploymentHistory row for a single BrokerCheck employment entry,
 * resolving the firm ID and stashing the source employment for downstream firm-row reuse.
 * @param employment - Parsed BrokerCheck employment record.
 * @param resolver - Shared resolver used to reuse canonical firm IDs.
 * @param advisorUuid - Canonical advisor ID for this BrokerCheck individual.
 * @param snapshotId - BrokerCheck snapshot ID linked to the row.
 * @returns Build result containing the row plus loader context.
 */
export const buildEmploymentRow = async (
  employment: BrokerRow,
  resolver: Resolver,
  advisorUuid: string,
  snapshotId: string
): Promise<EmploymentBuildResult> => {
  const firmName = stringValue(employment._firmName);
  const firmUuid = await resolver.firm(
    firmName ? [firmName] : [],
    stringValue(employment._firmFinraId)
  );
  return {
    firmId: firmUuid,
    sourceEmployment: employment,
    employmentRow: {
      id: resolver.employment(
        advisorUuid,
        firmUuid,
        stringValue(employment.startDate)
      ),
      advisorId: advisorUuid,
      firmId: firmUuid,
      startDate: employment.startDate,
      endDate: employment.endDate,
      sourceType: "brokercheck",
      sourceRef: snapshotId,
    },
  };
};

/**
 * Builds the Harper Disclosure and Sanction rows for a single BrokerCheck disclosure block.
 * @param block - Parsed BrokerCheck disclosure block with nested sanctions.
 * @param resolver - Shared resolver used to mint disclosure/sanction IDs.
 * @param advisorUuid - Canonical advisor ID for this BrokerCheck individual.
 * @param snapshotId - BrokerCheck snapshot ID linked to the rows.
 * @returns Build result containing the disclosure row and any sanction rows.
 */
export const buildDisclosureRows = async (
  block: DisclosureBlock,
  resolver: Resolver,
  advisorUuid: string,
  snapshotId: string
): Promise<DisclosureBuildResult> => {
  const disclosure = block.disclosure;
  const disclosureUuid = await resolver.disclosure(
    advisorUuid,
    stringValue(disclosure.disclosureType),
    stringValue(disclosure.dateInitiated),
    optionalString(disclosure.docketNumber),
    stringValue(disclosure.regulator)
  );
  return {
    disclosureRows: [
      {
        ...disclosure,
        id: disclosureUuid,
        advisorId: advisorUuid,
        sourceType: "brokercheck",
        sourceRef: snapshotId,
      },
    ],
    sanctionRows: block.sanctions.map(sanction => ({
      ...sanction,
      id: resolver.sanction(
        disclosureUuid,
        stringValue(sanction.sanctionType),
        optionalNumber(sanction.amount),
        optionalNumber(sanction.durationMonths)
      ),
      disclosureId: disclosureUuid,
    })),
  };
};

/**
 * Reduces a list of employment build results to the deduplicated set of Firm rows,
 * merging with any existing firm rows resolved earlier.
 * @param employmentResults - Build results from `buildEmploymentRow`.
 * @param resolver - Shared resolver carrying the cached Firm listing.
 * @param snapshotId - BrokerCheck snapshot ID used in auto-discovery notes.
 * @returns Deduplicated Firm rows for upsert.
 */
export const firmRowsFromEmployments = (
  employmentResults: ReadonlyArray<EmploymentBuildResult>,
  resolver: Resolver,
  snapshotId: string
): ReadonlyArray<BrokerRow> => {
  const listingById = Object.fromEntries(
    (resolver.firmListing ?? []).map(firm => [String(firm.id), firm])
  );
  return employmentResults
    .filter(
      (result, index, results) =>
        results.findIndex(candidate => candidate.firmId === result.firmId) ===
        index
    )
    .map(result => firmRowFromEmployment(result, listingById, snapshotId));
};

/**
 * Produces the Firm row payload for a single employment, merging with the cached listing.
 * @param result - Build result for one employment.
 * @param listingById - Map of existing Harper Firm rows keyed by ID.
 * @param snapshotId - BrokerCheck snapshot ID used in auto-discovery notes.
 * @returns Firm row payload ready for upsert.
 */
const firmRowFromEmployment = (
  result: EmploymentBuildResult,
  listingById: Readonly<Record<string, BrokerRow>>,
  snapshotId: string
): BrokerRow => {
  const employment = result.sourceEmployment;
  const name = brokerFirmDisplayName(stringValue(employment._firmName));
  const update = {
    id: result.firmId,
    name: name || null,
    finraCrd: employment._firmFinraId || null,
  };
  const existing = listingById[result.firmId];
  return existing
    ? {
        ...existing,
        ...withoutNullish(update),
        name: existing.name || update.name,
      }
    : {
        ...update,
        channel: employment._iaOnly ? "pure_ria" : "unknown",
        notes: `Auto-discovered via FINRA BrokerCheck (firmId=${stringValue(employment._firmFinraId)}, snapshot=${snapshotId})`,
      };
};

// @ts-nocheck
import { canonicalFirmName } from "./firm-identity.js";
import { uid } from "./ids.js";
import type { Resolver } from "./brokercheck-load.js";
import {
  baseSnapshotRow,
  brokerFirmDisplayName,
  firmResolverNames,
  individualDryRunCounts,
  licenseRow,
  optionalNumber,
  optionalString,
  stringValue,
  withoutNullish,
  writeIndividualRows,
} from "./brokercheck-load-record-utils.js";
export { hashContent } from "./brokercheck-load-record-utils.js";

/** Runtime row shape emitted by the BrokerCheck parser and written to Harper. */
interface BrokerRow {
  readonly [key: string]: unknown;
}

/**
 * Loads a parsed BrokerCheck individual into Harper rows.
 * @param parsedValue - Parsed individual payload from `parseIndividual`.
 * @param rawContent - Original BrokerCheck payload stored in the snapshot row.
 * @param opts - REST writer, resolver, and dry-run flag for this load.
 * @param opts.rest - Harper REST client used to persist rows.
 * @param opts.resolver - Shared resolver used to reuse canonical entity IDs.
 * @param opts.write - When false, returns counts without writing rows.
 * @returns Row counts by Harper table.
 */
export async function loadIndividual(
  parsedValue: unknown,
  rawContent: unknown,
  opts: BrokerRow
): Promise<Record<string, number>> {
  const parsed = parsedValue as BrokerRow;
  const crd = stringValue(parsed.advisor.finraCrd);
  if (!crd) throw new Error("parsed individual missing finraCrd");
  const rows = await buildIndividualRows(
    parsed,
    rawContent,
    crd,
    opts.resolver
  );
  return opts.write === false
    ? individualDryRunCounts(rows)
    : await writeIndividualRows(opts.rest, rows);
}

/**
 * Loads a parsed BrokerCheck firm profile into Harper rows.
 * @param parsedValue - Parsed firm payload from `parseFirm`.
 * @param rawContent - Original BrokerCheck payload stored in the snapshot row.
 * @param opts - REST writer, resolver, and dry-run flag for this load.
 * @param opts.rest - Harper REST client used to persist rows.
 * @param opts.resolver - Shared resolver used to reuse canonical firm IDs.
 * @param opts.write - When false, returns counts without writing rows.
 * @returns Row counts by Harper table.
 */
export async function loadFirm(
  parsedValue: unknown,
  rawContent: unknown,
  opts: BrokerRow
): Promise<Record<string, number>> {
  const parsed = parsedValue as BrokerRow;
  const crd = stringValue(parsed.firm.finraCrd);
  if (!crd) throw new Error("parsed firm missing finraCrd");
  const firmUuid = await opts.resolver.firm(
    firmResolverNames(parsed.firm),
    crd
  );
  const snapshotId = uid(`bcsnap:firm:${crd}`);
  const firmRow = brokerFirmRow(
    parsed.firm,
    opts.resolver,
    firmUuid,
    crd,
    snapshotId
  );
  const snapshotRow = firmSnapshotRow(
    parsed.summary ?? {},
    rawContent,
    firmUuid,
    crd,
    snapshotId
  );
  return opts.write === false
    ? { Firm: 1, BrokerCheckSnapshot: 1 }
    : {
        Firm: Number(await opts.rest.put("Firm", firmRow)),
        BrokerCheckSnapshot: Number(
          await opts.rest.put("BrokerCheckSnapshot", snapshotRow)
        ),
      };
}

const buildIndividualRows = async (
  parsed: BrokerRow,
  rawContent: unknown,
  crd: string,
  resolver: Resolver
): Promise<BrokerRow> => {
  const snapshotId = uid(`bcsnap:individual:${crd}`);
  const advisorUuid = await resolver.advisor(
    crd,
    stringValue(parsed.advisor.legalName),
    {
      firstEmployer: stringValue(parsed.employments.at(-1)?._firmName),
      firstName: stringValue(parsed.advisor.firstName),
      lastName: stringValue(parsed.advisor.lastName),
    }
  );
  const employmentResults = await Promise.all(
    parsed.employments.map(emp =>
      buildEmploymentRow(emp, resolver, advisorUuid, snapshotId)
    )
  );
  const disclosureResults = await Promise.all(
    parsed.disclosures.map(block =>
      buildDisclosureRows(block, resolver, advisorUuid, snapshotId)
    )
  );
  return {
    advisorRow: { ...parsed.advisor, id: advisorUuid },
    firmRows: firmRowsFromEmployments(employmentResults, resolver, snapshotId),
    employmentRows: employmentResults.map(result => result.employmentRow),
    disclosureRows: disclosureResults.flatMap(result => result.disclosureRows),
    sanctionRows: disclosureResults.flatMap(result => result.sanctionRows),
    licenseRows: parsed.licenses.map(license =>
      licenseRow(license, resolver, advisorUuid)
    ),
    snapshotRow: individualSnapshotRow(
      parsed.summary ?? {},
      rawContent,
      advisorUuid,
      crd,
      snapshotId
    ),
  };
};

const buildEmploymentRow = async (
  employment: BrokerRow,
  resolver: Resolver,
  advisorUuid: string,
  snapshotId: string
): Promise<BrokerRow> => {
  const firmUuid = await resolver.firm(
    stringValue(employment._firmName)
      ? [stringValue(employment._firmName)]
      : [],
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

const buildDisclosureRows = async (
  block: BrokerRow,
  resolver: Resolver,
  advisorUuid: string,
  snapshotId: string
): Promise<BrokerRow> => {
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

const firmRowsFromEmployments = (
  employmentResults: ReadonlyArray<BrokerRow>,
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

const firmRowFromEmployment = (
  result: BrokerRow,
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

const brokerFirmRow = (
  firm: BrokerRow,
  resolver: Resolver,
  firmUuid: string,
  crd: string,
  snapshotId: string
): BrokerRow => {
  const firmRow: BrokerRow = {
    ...firm,
    id: firmUuid,
    name: canonicalFirmName(
      stringValue(firm.name) || stringValue(firm.legalName)
    ),
  };
  const existing = (resolver.firmListing ?? []).find(
    row => row.id === firmUuid
  );
  return existing
    ? {
        ...existing,
        ...withoutNullish(firmRow),
        name: existing.name || firmRow.name,
      }
    : {
        ...firmRow,
        channel: firmRow.channel ?? "unknown",
        notes:
          firmRow.notes ??
          `Auto-discovered via FINRA BrokerCheck (firmId=${crd}, snapshot=${snapshotId})`,
      };
};

const individualSnapshotRow = (
  summary: BrokerRow,
  rawContent: unknown,
  advisorUuid: string,
  crd: string,
  snapshotId: string
): BrokerRow => ({
  ...baseSnapshotRow(summary, rawContent, crd, snapshotId),
  subjectKind: "individual",
  subjectAdvisorId: advisorUuid,
  disclosureCount: summary.disclosureCount ?? 0,
  employmentCount: summary.employmentCount ?? 0,
  examCount: summary.examCount ?? 0,
  registeredStateCount: summary.registeredStateCount ?? 0,
});

const firmSnapshotRow = (
  summary: BrokerRow,
  rawContent: unknown,
  firmUuid: string,
  crd: string,
  snapshotId: string
): BrokerRow => ({
  ...baseSnapshotRow(summary, rawContent, crd, snapshotId),
  subjectKind: "firm",
  subjectFirmId: firmUuid,
  disclosureCount:
    Number(summary.regulatoryDisclosureCount ?? 0) +
    Number(summary.arbitrationCount ?? 0) +
    Number(summary.civilCount ?? 0),
  employmentCount: 0,
  examCount: 0,
  registeredStateCount: summary.stateRegistrationCount ?? 0,
});

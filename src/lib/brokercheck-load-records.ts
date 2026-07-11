import {
  createRestAdvisorSearchIndexHandle,
  reindexAdvisorTokens,
} from "./advisor-search-index.js";
import { canonicalFirmName } from "./firm-identity.js";
import { uid } from "./ids.js";
import type { Resolver } from "./brokercheck-load.js";
import type { HarperREST } from "./brokercheck-rest.js";
import {
  baseSnapshotRow,
  firmResolverNames,
  individualDryRunCounts,
  licenseRow,
  stringValue,
  withoutNullish,
  writeIndividualRows,
  type BrokerRow,
  type IndividualRows,
} from "./brokercheck-load-record-utils.js";
import {
  buildDisclosureRows,
  buildEmploymentRow,
  firmRowsFromEmployments,
  type DisclosureBlock,
} from "./brokercheck-load-record-builders.js";
export { hashContent } from "./brokercheck-load-record-utils.js";

/** Options shared by `loadIndividual` and `loadFirm`. */
interface LoadOpts {
  readonly rest: HarperREST;
  readonly resolver: Resolver;
  readonly write?: boolean;
}

/** Subset of `parseIndividual` output consumed by the loader. */
interface ParsedIndividual extends BrokerRow {
  readonly advisor: BrokerRow;
  readonly employments: readonly BrokerRow[];
  readonly disclosures: readonly BrokerRow[];
  readonly licenses: readonly BrokerRow[];
  readonly summary?: BrokerRow;
}

/** Subset of `parseFirm` output consumed by the loader. */
interface ParsedFirm extends BrokerRow {
  readonly firm: BrokerRow;
  readonly summary?: BrokerRow;
}

/**
 * Single-cast adapter used to narrow `unknown` parser output to the
 * record-loader's consumer shape. This is the only `as` cast in the file:
 * downstream parsers are still `@ts-nocheck`'d, so the loader treats them
 * as `unknown` producers and validates required fields at runtime.
 * @param value - Parsed payload from `parseIndividual` or `parseFirm`.
 * @returns The value re-typed as `T` without runtime conversion.
 */
const narrowParsed = <T extends BrokerRow>(value: unknown): T => value as T;

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
  opts: LoadOpts
): Promise<Record<string, number>> {
  const parsed = narrowParsed<ParsedIndividual>(parsedValue);
  const crd = stringValue(parsed.advisor.finraCrd);
  if (!crd) throw new Error("parsed individual missing finraCrd");
  const rows = await buildIndividualRows(
    parsed,
    rawContent,
    crd,
    opts.resolver
  );
  if (opts.write === false) return individualDryRunCounts(rows);
  const written = await writeIndividualRows(opts.rest, rows);
  await reindexAdvisorTokens(createRestAdvisorSearchIndexHandle(opts.rest), [
    stringValue(rows.advisorRow.id),
  ]);
  return written;
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
  opts: LoadOpts
): Promise<Record<string, number>> {
  const parsed = narrowParsed<ParsedFirm>(parsedValue);
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
  parsed: ParsedIndividual,
  rawContent: unknown,
  crd: string,
  resolver: Resolver
): Promise<IndividualRows> => {
  const snapshotId = uid(`bcsnap:individual:${crd}`);
  const advisorUuid = await resolveParsedAdvisorUuid(parsed, resolver, crd);
  const employmentResults = await Promise.all(
    parsed.employments.map(emp =>
      buildEmploymentRow(emp, resolver, advisorUuid, snapshotId)
    )
  );
  const disclosureResults = await buildIndividualDisclosureRows(
    parsed,
    resolver,
    advisorUuid,
    snapshotId
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

const resolveParsedAdvisorUuid = async (
  parsed: ParsedIndividual,
  resolver: Resolver,
  crd: string
): Promise<string> => {
  const lastEmployment = parsed.employments.at(-1);
  return await resolver.advisor(crd, stringValue(parsed.advisor.legalName), {
    firstEmployer: stringValue(lastEmployment?._firmName),
    firstName: stringValue(parsed.advisor.firstName),
    lastName: stringValue(parsed.advisor.lastName),
  });
};

const buildIndividualDisclosureRows = async (
  parsed: ParsedIndividual,
  resolver: Resolver,
  advisorUuid: string,
  snapshotId: string
) =>
  Promise.all(
    parsed.disclosures.map(block =>
      buildDisclosureRows(
        narrowParsed<DisclosureBlock>(block),
        resolver,
        advisorUuid,
        snapshotId
      )
    )
  );

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

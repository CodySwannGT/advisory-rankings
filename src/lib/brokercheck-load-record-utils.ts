import { createHash } from "node:crypto";

import { canonicalFirmName } from "./firm-identity.js";
import type { HarperREST } from "./brokercheck-rest.js";

/**
 * Opaque row shape produced by the BrokerCheck parser and consumed by Harper
 * writers. Field-level typing is intentionally `unknown` so callers narrow at
 * the point of use; this mirrors the parser's runtime contract where keys vary
 * by record kind.
 */
interface BrokerRow {
  readonly [key: string]: unknown;
}

/**
 * Per-individual collection of rows ready to be persisted across Harper tables.
 */
interface IndividualRows {
  readonly firmRows: ReadonlyArray<BrokerRow>;
  readonly advisorRow: BrokerRow;
  readonly employmentRows: ReadonlyArray<BrokerRow>;
  readonly disclosureRows: ReadonlyArray<BrokerRow>;
  readonly sanctionRows: ReadonlyArray<BrokerRow>;
  readonly licenseRows: ReadonlyArray<BrokerRow>;
  readonly snapshotRow: BrokerRow;
}

/**
 * Minimum shape required from a BrokerCheck `Resolver` to mint license ids.
 * Declared structurally so callers can supply the full Resolver from
 * `brokercheck-load.ts` without a circular import.
 */
interface LicenseResolver {
  license(
    advisorUuid: string,
    licenseType: string,
    grantedDate: string
  ): string;
}

export const writeIndividualRows = async (
  rest: HarperREST,
  rows: IndividualRows
): Promise<Record<string, number>> => ({
  Firm: await putMany(rest, "Firm", rows.firmRows),
  Advisor: Number(await rest.put("Advisor", rows.advisorRow)),
  EmploymentHistory: await putMany(
    rest,
    "EmploymentHistory",
    rows.employmentRows
  ),
  Disclosure: await putMany(rest, "Disclosure", rows.disclosureRows),
  Sanction: await putMany(rest, "Sanction", rows.sanctionRows),
  License: await putMany(rest, "License", rows.licenseRows),
  BrokerCheckSnapshot: Number(
    await rest.put("BrokerCheckSnapshot", rows.snapshotRow)
  ),
});

export const individualDryRunCounts = (
  rows: IndividualRows
): Record<string, number> => ({
  Firm: rows.firmRows.length,
  Advisor: 1,
  EmploymentHistory: rows.employmentRows.length,
  Disclosure: rows.disclosureRows.length,
  Sanction: rows.sanctionRows.length,
  License: rows.licenseRows.length,
  BrokerCheckSnapshot: 1,
});

export const licenseRow = (
  license: BrokerRow,
  resolver: LicenseResolver,
  advisorUuid: string
): BrokerRow => ({
  id: resolver.license(
    advisorUuid,
    stringValue(license.licenseType),
    stringValue(license.grantedDate)
  ),
  advisorId: advisorUuid,
  licenseType: license.licenseType,
  grantedDate: license.grantedDate,
  status: "active",
});

export const firmResolverNames = (firm: BrokerRow): ReadonlyArray<string> =>
  [
    stringValue(firm._iaFirmName),
    stringValue(firm.name),
    stringValue(firm.legalName),
  ].filter(Boolean);

export const brokerFirmDisplayName = (rawName: string): string => {
  const titleName = rawName
    .toLowerCase()
    .replace(/\b\w/gu, char => char.toUpperCase())
    .replaceAll("Llc", "LLC")
    .replaceAll("Lp", "LP");
  return titleName ? canonicalFirmName(titleName) : "";
};

export const withoutNullish = (row: BrokerRow): BrokerRow =>
  Object.fromEntries(Object.entries(row).filter(([, value]) => value != null));

export const stringValue = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

export const optionalString = (value: unknown): string | undefined => {
  const text = stringValue(value);
  return text || undefined;
};

export const optionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const putMany = async (
  rest: HarperREST,
  table: string,
  rows: ReadonlyArray<BrokerRow>
): Promise<number> => {
  const results = await Promise.all(rows.map(row => rest.put(table, row)));
  return results.filter(Boolean).length;
};

/**
 * Hashes BrokerCheck JSON after sorting object keys for stable snapshot diffs.
 * @param content - Raw BrokerCheck payload.
 * @returns SHA-256 hash of the canonicalized JSON payload.
 */
export function hashContent(content: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortForHash(content)))
    .digest("hex");
}

export const baseSnapshotRow = (
  summary: BrokerRow,
  rawContent: unknown,
  crd: string,
  snapshotId: string
): BrokerRow => ({
  id: snapshotId,
  subjectCrd: crd,
  fetchedAt: new Date().toISOString(),
  bcScope: summary.bcScope ?? "",
  iaScope: summary.iaScope ?? "",
  rawHash: hashContent(rawContent),
  rawJson: JSON.stringify(rawContent),
});

const isPlainRecord = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sortForHash = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map(key => [key, sortForHash(value[key])])
    );
  }
  return value;
};

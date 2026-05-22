import { advisorId } from "../lib/ids.js";
import { canonicalFirmId, canonicalFirmName } from "../lib/firm-identity.js";

/** Extraction row after runtime object narrowing. */
export interface Row {
  readonly [key: string]: unknown;
}

/** Name-to-id lookup pair used while resolving cross-row references. */
export interface LookupPair {
  readonly name: string;
  readonly id: string;
}

export const firmSourceRows = (ex: Row): ReadonlyArray<Row> =>
  extractionRows(ex.firms);

export const firmPairsFor = (firm: Row): ReadonlyArray<LookupPair> => {
  const sourceName = firmSourceName(firm);
  const canonical = canonicalFirmName(sourceName);
  const id = canonicalFirmId(sourceName);
  return [
    { name: sourceName, id },
    { name: canonical, id },
  ];
};

export const firmSourceName = (firm: Row): string => {
  return stringValue(
    asRecord(firm.natural_key).canonical_name ?? asRecord(firm.fields).name
  );
};

export const advisorName = (advisor: Row): string =>
  stringValue(
    asRecord(advisor.natural_key).legal_name ??
      asRecord(advisor.fields).legalName
  );

export const advisorKey = (advisor: Row): string =>
  advisorId(
    advisorName(advisor),
    stringValue(
      asRecord(advisor.natural_key).first_employer ??
        asRecord(advisor.natural_key).career_start_year
    )
  );

export const advisorLookup = (
  pairs: ReadonlyArray<LookupPair>,
  name: string
): string => pairs.find(pair => pair.name === name)?.id ?? advisorId(name, "");

export const firmLookup = (
  pairs: ReadonlyArray<LookupPair>,
  name: string
): string =>
  pairs.find(pair => pair.name === name)?.id ?? canonicalFirmId(name);

export const extractionRows = (value: unknown): ReadonlyArray<Row> =>
  Array.isArray(value) ? value.map(asRecord) : [];

export const asRecord = (value: unknown): Row =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : {};

export const stringValue = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

export const uniqueById = (rows: ReadonlyArray<Row>): ReadonlyArray<Row> => [
  ...new Map(rows.map(row => [String(row.id), row])).values(),
];

export const mergeGroups = (
  ...groups: ReadonlyArray<Record<string, ReadonlyArray<Row>>>
) => {
  return groups.reduce<Record<string, ReadonlyArray<Row>>>((merged, group) => {
    return Object.fromEntries(
      [...new Set([...Object.keys(merged), ...Object.keys(group)])].map(
        table => [table, [...(merged[table] ?? []), ...(group[table] ?? [])]]
      )
    );
  }, {});
};

/**
 * Public-resource firm canonicalization: collapses curated alias duplicates
 * (e.g. "Morgan Stanley Wealth Management") into their canonical firm row
 * and rewrites foreign-key references across the loaded resource bundle.
 *
 * Typed against the raw rows-by-key shape produced upstream by the public
 * resource loader: each row is a `Readonly<Record<string, unknown>>` because
 * Harper hands back arbitrary column maps and the downstream
 * `narrowResourceTableRows` step is what enforces the per-table interfaces
 * from `src/types/harper-schema.ts`. Typing rows as `unknown`-valued maps
 * here keeps the canonicalizer honest about what it actually knows about
 * its inputs (id, name, plus configured foreign-key fields by name).
 */

/** Single row pulled from a Harper table read; values are field-keyed. */
type RawRow = Readonly<Record<string, unknown>>;

/**
 * Raw rows-by-key map shared with the public resource loader. Matches the
 * shape produced by `loadTableRows` in `resource-data.ts`: every key the
 * caller cares about is present and points to an array (possibly empty).
 *
 * The directory endpoint callers under `resource-directory-endpoints.ts`
 * cherry-pick only the keys they need; that file is still `@ts-nocheck`,
 * so its looser usage typechecks against this signature without the
 * canonicalizer having to advertise an optional-value contract here.
 */
type RawRowsByKey = Readonly<Record<string, readonly RawRow[]>>;

/** Field names on each table that carry firm IDs eligible for rewriting. */
type FirmReferenceFieldMap = Readonly<Record<string, readonly string[]>>;

const MORGAN_STANLEY_ID = "8e106b7e-efcc-5aed-8827-fd0ea645b6df";
const MORGAN_STANLEY_NAME = "Morgan Stanley";
const MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS =
  "Morgan Stanley Wealth Management";

const FIRM_REFERENCE_FIELDS: FirmReferenceFieldMap = {
  branches: ["firmId"],
  branchAssignments: ["firmId"],
  employments: ["firmId"],
  regApps: ["firmId"],
  teams: ["currentFirmId"],
  transitions: ["subjectFirmId", "fromFirmId", "toFirmId"],
  deals: ["firmId"],
  disclosures: ["firmIdAtTime"],
  mFirm: ["firmId"],
  bcSnaps: ["subjectFirmId"],
};

/**
 * Canonicalizes curated firm aliases for public resource payloads.
 * @param rows - Raw rows loaded from Harper tables for one public request.
 * @returns Rows with stale alias firm IDs resolved to their canonical firm IDs.
 */
export function canonicalizeFirmResourceRows(rows: RawRowsByKey): RawRowsByKey {
  const firms = rows.firms ?? [];
  const staleAliasRows = firms.filter(isMorganStanleyAliasFirm);
  const replacements = new Map<string, string>(
    staleAliasRows.map(firm => [String(firm.id), MORGAN_STANLEY_ID])
  );
  if (!staleAliasRows.length) {
    return { ...rows, firmAliases: aliasRows(rows.firmAliases) };
  }

  return rewriteFirmReferences(
    {
      ...rows,
      firms: canonicalFirmRows(firms, staleAliasRows),
      firmAliases: aliasRows(rows.firmAliases),
    },
    replacements
  );
}

/**
 * Checks whether a Firm row is a curated Morgan Stanley alias duplicate.
 * @param firm - Candidate Firm row from Harper.
 * @returns True when the row should render as Morgan Stanley.
 */
function isMorganStanleyAliasFirm(firm: RawRow): boolean {
  return (
    firm.id !== MORGAN_STANLEY_ID &&
    normalizeFirmAlias(firm.name) ===
      normalizeFirmAlias(MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS)
  );
}

/**
 * Builds the visible Firm list after folding stale alias rows into canonical.
 * @param firms - Current Firm table rows.
 * @param staleAliasRows - Alias rows that should not be publicly visible.
 * @returns Firm rows containing one canonical Morgan Stanley row.
 */
function canonicalFirmRows(
  firms: readonly RawRow[],
  staleAliasRows: readonly RawRow[]
): readonly RawRow[] {
  const canonical: RawRow =
    firms.find(firm => firm.id === MORGAN_STANLEY_ID) ??
    staleAliasRows.reduce(
      (best, firm) =>
        filledFieldCount(firm) > filledFieldCount(best) ? firm : best,
      staleAliasRows[0] as RawRow
    );
  const merged = staleAliasRows.reduce<RawRow>(
    (current, firm) => mergeFirmRows(current, firm),
    canonical
  );
  return [
    ...firms.filter(
      firm => firm.id !== MORGAN_STANLEY_ID && !isMorganStanleyAliasFirm(firm)
    ),
    {
      ...merged,
      id: MORGAN_STANLEY_ID,
      name: MORGAN_STANLEY_NAME,
    },
  ];
}

/**
 * Merges non-empty details from the alias row into the canonical row.
 * @param canonical - Current canonical Firm payload.
 * @param alias - Stale alias Firm payload.
 * @returns Canonical Firm payload with useful alias details retained.
 */
function mergeFirmRows(canonical: RawRow, alias: RawRow): RawRow {
  const base: RawRow =
    filledFieldCount(alias) > filledFieldCount(canonical) ? alias : canonical;
  const fallback: RawRow = base === alias ? canonical : alias;
  return {
    ...fallback,
    ...base,
    ...Object.fromEntries(
      Object.entries(fallback).filter(
        ([key, value]) => !hasValue(base[key]) && hasValue(value)
      )
    ),
  };
}

/**
 * Adds the curated alias lookup row used by route and search resolution.
 * @param existingAliases - FirmAlias rows already present in Harper.
 * @returns Alias rows containing the Morgan Stanley Wealth Management alias.
 */
function aliasRows(existingAliases: readonly RawRow[] = []): readonly RawRow[] {
  const curatedAlias: RawRow = {
    id: "68e35dd7-ed75-54a6-9ea2-417545e25f17",
    firmId: MORGAN_STANLEY_ID,
    alias: MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS,
    normalizedAlias: normalizeFirmAlias(MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS),
    sourceType: "curated_resource",
    sourceRef: "firm-aliases:v1",
    confidence: "approved",
  };
  return [
    ...existingAliases.filter(alias => alias.id !== curatedAlias.id),
    curatedAlias,
  ];
}

/**
 * Rewrites known firm foreign keys from stale alias IDs to canonical IDs.
 * @param rows - Public resource rows keyed by endpoint-friendly names.
 * @param replacements - Stale firm ID to canonical firm ID replacements.
 * @returns Public resource rows with rewritten firm references.
 */
function rewriteFirmReferences(
  rows: RawRowsByKey,
  replacements: ReadonlyMap<string, string>
): RawRowsByKey {
  return Object.fromEntries(
    Object.entries(rows).map(([key, value]) => [
      key,
      rewriteTableRows(value, FIRM_REFERENCE_FIELDS[key] ?? [], replacements),
    ])
  );
}

/**
 * Rewrites a table's configured firm reference fields.
 * @param tableRows - Rows for one loaded table.
 * @param fields - Field names that carry firm IDs.
 * @param replacements - Stale firm ID to canonical firm ID replacements.
 * @returns Rows with matching firm IDs rewritten.
 */
function rewriteTableRows(
  tableRows: readonly RawRow[],
  fields: readonly string[],
  replacements: ReadonlyMap<string, string>
): readonly RawRow[] {
  if (!fields.length) return tableRows;
  return tableRows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([field, value]) => [
        field,
        fields.includes(field) &&
        typeof value === "string" &&
        replacements.has(value)
          ? replacements.get(value)
          : value,
      ])
    )
  );
}

/**
 * Normalizes firm labels into the same lookup key used by importers.
 * @param value - Firm name or alias text.
 * @returns Case-folded firm alias key.
 */
function normalizeFirmAlias(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[.,]/g, " ")
    .replace(/\b(corp|corporation|inc|l\.?\s*l\.?\s*c|l\.?\s*p|llc|lp)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Counts useful populated fields on a firm-like row.
 * @param row - Row being compared for detail preservation.
 * @returns Number of non-empty values.
 */
function filledFieldCount(row: RawRow | undefined): number {
  return Object.values(row ?? {}).filter(hasValue).length;
}

/**
 * Determines whether a field value carries useful data.
 * @param value - Field value from a row.
 * @returns True when the value should be preserved.
 */
function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

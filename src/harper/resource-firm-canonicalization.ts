// @ts-nocheck
const MORGAN_STANLEY_ID = "8e106b7e-efcc-5aed-8827-fd0ea645b6df";
const MORGAN_STANLEY_NAME = "Morgan Stanley";
const MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS =
  "Morgan Stanley Wealth Management";

const FIRM_REFERENCE_FIELDS = {
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
export function canonicalizeFirmResourceRows(rows) {
  const staleAliasRows = (rows.firms ?? []).filter(isMorganStanleyAliasFirm);
  const replacements = new Map(
    staleAliasRows.map(firm => [String(firm.id), MORGAN_STANLEY_ID])
  );
  if (!staleAliasRows.length) {
    return { ...rows, firmAliases: aliasRows(rows.firmAliases) };
  }

  return rewriteFirmReferences(
    {
      ...rows,
      firms: canonicalFirmRows(rows.firms ?? [], staleAliasRows),
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
function isMorganStanleyAliasFirm(firm) {
  return (
    firm?.id !== MORGAN_STANLEY_ID &&
    normalizeFirmAlias(firm?.name) ===
      normalizeFirmAlias(MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS)
  );
}

/**
 * Builds the visible Firm list after folding stale alias rows into canonical.
 * @param firms - Current Firm table rows.
 * @param staleAliasRows - Alias rows that should not be publicly visible.
 * @returns Firm rows containing one canonical Morgan Stanley row.
 */
function canonicalFirmRows(firms, staleAliasRows) {
  const canonical =
    firms.find(firm => firm.id === MORGAN_STANLEY_ID) ??
    staleAliasRows.reduce(
      (best, firm) =>
        filledFieldCount(firm) > filledFieldCount(best) ? firm : best,
      staleAliasRows[0]
    );
  const merged = staleAliasRows.reduce(
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
function mergeFirmRows(canonical, alias) {
  const base =
    filledFieldCount(alias) > filledFieldCount(canonical) ? alias : canonical;
  const fallback = base === alias ? canonical : alias;
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
function aliasRows(existingAliases = []) {
  const curatedAlias = {
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
function rewriteFirmReferences(rows, replacements) {
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
function rewriteTableRows(tableRows, fields, replacements) {
  if (!Array.isArray(tableRows) || !fields.length) return tableRows;
  return tableRows.map(row =>
    Object.fromEntries(
      Object.entries(row).map(([field, value]) => [
        field,
        fields.includes(field) && replacements.has(value)
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
function normalizeFirmAlias(value) {
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
function filledFieldCount(row) {
  return Object.values(row ?? {}).filter(hasValue).length;
}

/**
 * Determines whether a field value carries useful data.
 * @param value - Field value from a row.
 * @returns True when the value should be preserved.
 */
function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

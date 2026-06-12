/**
 * Public-resource firm canonicalization: collapses curated alias duplicates
 * (e.g. "Morgan Stanley Wealth Management") into their canonical firm row
 * and rewrites foreign-key references across the loaded resource bundle.
 *
 * The implementation is typed against the raw rows-by-key shape produced
 * upstream by the public resource loader: each row is a
 * `Readonly<Record<string, unknown>>` because Harper hands back arbitrary
 * column maps and the downstream `narrowResourceTableRows` step is what
 * enforces the per-table interfaces from `src/types/harper-schema.ts`.
 * The public entry point is overloaded with named input/output shapes so
 * directory-endpoint callers see strongly-typed results without `as`
 * casts; see `canonicalizeFirmResourceRows` for the overload set.
 */

import type {
  EmploymentHistoryRow,
  FirmAliasRow,
  FirmRow,
  TeamRow,
} from "../types/harper-schema.js";
import type {
  CanonicalAdvisorRows,
  CanonicalFirmRows,
  CanonicalSearchRows,
  CanonicalTeamRows,
} from "./resource-directory-types.js";
import {
  publicTeamDisplayName,
  publicTeamIdentityKey,
} from "./resource-team-display.js";

/** Single row pulled from a Harper table read; values are field-keyed. */
type RawRow = Readonly<Record<string, unknown>>;

/** Input shape for the `PublicFirms` directory endpoint. */
export interface CanonicalFirmRowsInput {
  readonly firms: ReadonlyArray<FirmRow>;
  readonly firmAliases: ReadonlyArray<FirmAliasRow>;
}

/** Input shape for the `PublicAdvisors` directory endpoint. */
export interface CanonicalAdvisorRowsInput {
  readonly firms: ReadonlyArray<FirmRow>;
  readonly employments: ReadonlyArray<EmploymentHistoryRow>;
  readonly firmAliases: ReadonlyArray<FirmAliasRow>;
}

/** Input shape for the `PublicTeams` directory endpoint. */
export interface CanonicalTeamRowsInput {
  readonly teams: ReadonlyArray<TeamRow>;
  readonly firms: ReadonlyArray<FirmRow>;
  readonly firmAliases: ReadonlyArray<FirmAliasRow>;
}

/** Input shape for the global `Search` endpoint. */
export interface CanonicalSearchRowsInput {
  readonly firms: ReadonlyArray<FirmRow>;
  readonly teams: ReadonlyArray<TeamRow>;
  readonly employments: ReadonlyArray<EmploymentHistoryRow>;
  readonly firmAliases: ReadonlyArray<FirmAliasRow>;
}

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
 *
 * This is the loose-typed core used by `resource-data.ts`'s general
 * resource loader (which narrows the result downstream via
 * `narrowResourceTableRows`). Directory endpoints should call the typed
 * wrappers — `canonicalizeForFirmsDirectory`,
 * `canonicalizeForAdvisorsDirectory`, `canonicalizeForTeamsDirectory`,
 * `canonicalizeForSearch` — which input/output the named Canonical*Rows
 * types declared in `resource-directory-types.ts`.
 * @param rows - Raw rows loaded from Harper tables for one public request.
 * @returns Rows with stale alias firm IDs resolved to their canonical firm IDs.
 */
export function canonicalizeFirmResourceRows(rows: RawRowsByKey): RawRowsByKey {
  const rowsWithPublicTeamNames: RawRowsByKey = {
    ...rows,
    teams: publicTeamRows(rows.teams),
  };
  const firms = rowsWithPublicTeamNames.firms ?? [];
  const staleAliasRows = firms.filter(isMorganStanleyAliasFirm);
  const replacements = new Map<string, string>(
    staleAliasRows.map(firm => [String(firm.id), MORGAN_STANLEY_ID])
  );
  if (!staleAliasRows.length) {
    return {
      ...rowsWithPublicTeamNames,
      firmAliases: aliasRows(rowsWithPublicTeamNames.firmAliases),
    };
  }

  return rewriteFirmReferences(
    {
      ...rowsWithPublicTeamNames,
      firms: canonicalFirmRows(firms, staleAliasRows),
      firmAliases: aliasRows(rowsWithPublicTeamNames.firmAliases),
    },
    replacements
  );
}

/**
 * Typed entry point for `PublicFirms`. Returns canonicalized firm rows
 * plus the curated firm-alias overlay, narrowed back to the
 * directory-endpoint result interfaces via a per-key predicate so the
 * call site never carries a structural-to-named cast.
 * @param rows - Firm + firmAlias arrays the directory loader fetched.
 * @returns Canonicalized firm rows ready for the directory response.
 */
export function canonicalizeForFirmsDirectory(
  rows: CanonicalFirmRowsInput
): CanonicalFirmRows {
  const raw = canonicalizeFirmResourceRows(toRawByKey(rows));
  return {
    firms: narrowRowArray<FirmRow>(raw.firms),
  };
}

/**
 * Typed entry point for `PublicAdvisors`. Narrows the canonicalized
 * `firms` and `employments` arrays back to `FirmRow[]` /
 * `EmploymentHistoryRow[]` for the advisor directory.
 * @param rows - Firms + employments + firmAlias arrays the directory loader fetched.
 * @returns Canonicalized firm and employment rows for advisor pages.
 */
export function canonicalizeForAdvisorsDirectory(
  rows: CanonicalAdvisorRowsInput
): CanonicalAdvisorRows {
  const raw = canonicalizeFirmResourceRows(toRawByKey(rows));
  return {
    firms: narrowRowArray<FirmRow>(raw.firms),
    employments: narrowRowArray<EmploymentHistoryRow>(raw.employments),
  };
}

/**
 * Typed entry point for `PublicTeams`. Narrows the canonicalized
 * `teams` and `firms` arrays back to `TeamRow[]` / `FirmRow[]` for the
 * team directory.
 * @param rows - Teams + firms + firmAlias arrays the directory loader fetched.
 * @returns Canonicalized team and firm rows for team directory pages.
 */
export function canonicalizeForTeamsDirectory(
  rows: CanonicalTeamRowsInput
): CanonicalTeamRows {
  const raw = canonicalizeFirmResourceRows(toRawByKey(rows));
  return {
    teams: dedupePublicTeams(narrowRowArray<TeamRow>(raw.teams)),
    firms: narrowRowArray<FirmRow>(raw.firms),
  };
}

/**
 * Typed entry point for the global `Search` endpoint. Narrows the
 * canonicalized firms, teams, and employments arrays back to their
 * declared row types for ranked search.
 * @param rows - Firms + teams + employments + firmAlias arrays the loader fetched.
 * @returns Canonicalized cross-entity rows for ranked navbar search.
 */
export function canonicalizeForSearch(
  rows: CanonicalSearchRowsInput
): CanonicalSearchRows {
  const raw = canonicalizeFirmResourceRows(toRawByKey(rows));
  return {
    firms: narrowRowArray<FirmRow>(raw.firms),
    teams: narrowRowArray<TeamRow>(raw.teams),
    employments: narrowRowArray<EmploymentHistoryRow>(raw.employments),
  };
}

/**
 * Re-keys the caller's typed rows map into the loose `RawRowsByKey`
 * shape the canonicalizer implementation operates on. Per-row interfaces
 * from `harper-schema.ts` are structurally `Readonly<Record<string,
 * unknown>>`, but TS does not widen a named row into an index signature
 * automatically; this helper is the one place we cross that boundary,
 * via `Object.entries`/`fromEntries` so the row values flow through
 * `unknown` without `as` casts.
 * @param rows - Caller-supplied typed rows-by-key map.
 * @returns The same entries re-typed against the implementation's
 *   `RawRowsByKey` contract.
 */
function toRawByKey(rows: object): RawRowsByKey {
  const entries = Object.entries(rows).map(
    ([key, value]): readonly [string, readonly RawRow[]] => [
      key,
      asRawRowArray(value),
    ]
  );
  return Object.fromEntries(entries);
}

/**
 * Defensive narrowing for one rows-by-key entry. Non-array values are
 * coerced to an empty array — Harper-derived shapes always provide
 * arrays, but the contract makes the assumption explicit.
 * @param value - Value pulled from one rows-by-key entry.
 * @returns The same array typed as `readonly RawRow[]`, or `[]` for
 *   defensive non-array inputs.
 */
function asRawRowArray(value: unknown): readonly RawRow[] {
  if (!Array.isArray(value)) return [];
  const validated: readonly unknown[] = value;
  return validated.every(isRawRow) ? validated : [];
}

/**
 * Typed predicate: every non-null object satisfies the structural
 * `Readonly<Record<string, unknown>>` shape used inside this module.
 * @param value - Candidate row from a rows-by-key entry.
 * @returns True when the value is a non-null object.
 */
function isRawRow(value: unknown): value is RawRow {
  return typeof value === "object" && value !== null;
}

/**
 * Converts raw team rows to the public team-name contract.
 * @param rows - Raw `teams` array from a public-resource load.
 * @returns Rows with internal markers removed from public names.
 */
function publicTeamRows(
  rows: readonly RawRow[] | undefined
): readonly RawRow[] {
  return (rows ?? []).map(row => {
    const name = publicTeamDisplayName(row.name);
    return name === row.name ? row : { ...row, name };
  });
}

/**
 * Collapses public team-directory duplicates by cleaned name plus firm.
 * @param teams - Canonicalized and display-sanitized team rows.
 * @returns Stable list with one row per public team identity.
 */
function dedupePublicTeams(
  teams: ReadonlyArray<TeamRow>
): ReadonlyArray<TeamRow> {
  const sorted = [...teams].sort(
    (a, b) =>
      publicTeamIdentityKey(a).localeCompare(publicTeamIdentityKey(b)) ||
      a.id.localeCompare(b.id)
  );
  return sorted.filter(
    (team, index) =>
      index === 0 ||
      publicTeamIdentityKey(team) !== publicTeamIdentityKey(sorted[index - 1])
  );
}

/**
 * Re-narrows a `RawRow[]` back to the caller's declared row interface.
 * The canonicalizer preserves keys and per-field values verbatim except
 * for documented firm-ID rewrites that retain `string` typing, so the
 * Harper-enforced row shape is preserved by construction; this helper
 * mirrors the `isTypedRowArray` pattern in `resource-data.ts` so the
 * trust boundary stays grep-able and uniform across the public-resource
 * stack.
 * @param value - Canonicalized rows in the loose `RawRow[]` form.
 * @returns Same array re-typed as the consumer's declared row type.
 */
function narrowRowArray<T>(
  value: readonly RawRow[] | undefined
): ReadonlyArray<T> {
  if (!value) return [];
  const candidate: unknown = value;
  if (isTypedRowArray<T>(candidate)) return candidate;
  return [];
}

/**
 * Typed predicate adapter mirroring `isTypedRowArray` in
 * `resource-data.ts`. Validates the structural invariant downstream code
 * depends on — that the value is an array — and trusts the canonicalizer
 * for row contents.
 * @param value - Candidate rows pulled from the canonicalization output.
 * @returns True when the candidate is an array; narrows to `readonly T[]`.
 */
function isTypedRowArray<T>(value: unknown): value is readonly T[] {
  return Array.isArray(value);
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

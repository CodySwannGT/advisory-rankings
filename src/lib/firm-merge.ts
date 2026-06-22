import {
  canonicalFirmId,
  canonicalFirmName,
  curatedFirmAliasRows,
  firmAliasId,
  normalizeFirmAlias,
  resolveFirmIdentity,
} from "./firm-identity.js";
import { uid } from "./ids.js";

/**
 * Firm foreign-key location that must be rewritten when an alias row is merged.
 * @remarks This list is deliberately explicit so schema additions require a
 * conscious decision about whether they participate in firm canonicalization.
 */
interface FirmReferenceField {
  readonly table: string;
  readonly field: string;
}

/**
 * Duplicate-to-canonical id pair carried through the merge reducer.
 */
interface FirmReplacementPair {
  readonly from: string;
  readonly to: string;
}

/** All known firm-linked columns that need canonical Firm ids after a merge. */
export const FIRM_REFERENCE_FIELDS: ReadonlyArray<FirmReferenceField> = [
  { table: "Firm", field: "parentFirmId" },
  { table: "FirmSuccession", field: "predecessorFirmId" },
  { table: "FirmSuccession", field: "successorFirmId" },
  { table: "Branch", field: "firmId" },
  { table: "EmploymentHistory", field: "firmId" },
  { table: "RegistrationApplication", field: "firmId" },
  { table: "Team", field: "currentFirmId" },
  { table: "TransitionEvent", field: "subjectFirmId" },
  { table: "TransitionEvent", field: "fromFirmId" },
  { table: "TransitionEvent", field: "toFirmId" },
  { table: "RecruitingDealQuote", field: "firmId" },
  { table: "Disclosure", field: "firmIdAtTime" },
  { table: "RankingEntry", field: "subjectFirmId" },
  { table: "ArticleFirmMention", field: "firmId" },
  { table: "BrokerCheckSnapshot", field: "subjectFirmId" },
];

/**
 * Builds an idempotent merge plan for reviewed firm aliases.
 * @param inputRows - Current table snapshots keyed by Harper table name.
 * @returns Merged row snapshots, duplicate firm ids to delete, and report-only duplicate candidates.
 */
export function buildFirmMergePlan(
  inputRows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
) {
  const clonedRows = cloneRows(inputRows);
  const mergeState = curatedMergeState(clonedRows);
  const rowsWithAliases = {
    ...clonedRows,
    Firm: mergeState.firms,
    FirmAlias: mergeState.aliasRows,
    FirmMergeAudit: mergeState.auditRows,
  };
  const rewrittenRows = rewriteFirmReferences(
    rowsWithAliases,
    mergeState.replacementIds
  );

  return {
    rows: dedupeRows(rewrittenRows),
    deleteFirmIds: mergeState.mergedFirmIds,
    candidateGroups: findCandidateGroups(rewrittenRows.Firm ?? []),
  };
}

/**
 * Rewrites every configured firm foreign key from duplicate ids to canonical ids.
 * @param rows - Table snapshots to rewrite.
 * @param replacementIds - Mapping from merged duplicate Firm id to canonical Firm id.
 * @returns New table snapshots with matching firm foreign keys replaced.
 */
function rewriteFirmReferences(
  rows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >,
  replacementIds: ReadonlyMap<string, string>
) {
  const referenceLookup = new Map(
    FIRM_REFERENCE_FIELDS.map(({ table, field }) => [
      `${table}.${field}`,
      field,
    ])
  );
  return Object.fromEntries(
    Object.entries(rows).map(([table, tableRows]) => [
      table,
      (tableRows ?? []).map(row =>
        Object.fromEntries(
          Object.entries(row).map(([field, value]) => [
            field,
            referenceLookup.has(`${table}.${field}`) &&
            typeof value === "string" &&
            replacementIds.has(value)
              ? replacementIds.get(value)
              : value,
          ])
        )
      ),
    ])
  );
}

/**
 * Combines duplicate firm rows without dropping richer details from either side.
 * @param canonical - Existing or synthesized canonical Firm row.
 * @param alias - Duplicate Firm row being merged into the canonical row.
 * @param canonicalName - Reviewed display name for the surviving Firm row.
 * @returns Canonical Firm row with richer non-empty fields preserved.
 */
function mergeFirmRows(
  canonical: Readonly<Record<string, unknown>>,
  alias: Readonly<Record<string, unknown>>,
  canonicalName: string
) {
  const base =
    filledFieldCount(alias) > filledFieldCount(canonical) ? alias : canonical;
  const fallback = base === alias ? canonical : alias;
  const merged = {
    ...fallback,
    ...base,
    ...Object.fromEntries(
      Object.entries(fallback).filter(
        ([key, value]) => !hasValue(base[key]) && hasValue(value)
      )
    ),
  };
  return {
    ...merged,
    id: canonicalFirmId(canonicalName),
    name: canonicalFirmName(canonicalName),
  };
}

/**
 * Applies every curated alias rule to the current Firm and FirmAlias snapshots.
 * @param rows - Cloned source rows so merge planning never mutates caller-owned fixtures.
 * @returns Replacement ids, alias rows, audit rows, and the surviving firm rows.
 */
function curatedMergeState(
  rows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
) {
  const firms = rows.Firm ?? [];
  const initialState = initialMergeAccumulator(rows);

  const state = firms.reduce<ReturnType<typeof initialMergeAccumulator>>(
    applyCuratedMerge,
    initialState
  );

  const mergedIds = new Set(state.mergedFirmIds);
  return {
    firms: [...state.byId.values()].filter(
      row => !mergedIds.has(String(row.id))
    ),
    aliasRows: [...state.aliasRows.values()],
    auditRows: state.auditRows,
    replacementIds: new Map(
      state.replacementPairs.map(({ from, to }) => [from, to])
    ),
    mergedFirmIds: state.mergedFirmIds,
  };
}

/**
 * Applies one curated firm identity rule to the merge accumulator.
 * @param current - Current immutable merge accumulator.
 * @param firm - Source Firm row being evaluated.
 * @returns Updated accumulator when the firm is merged, otherwise current.
 */
function applyCuratedMerge(
  current: ReturnType<typeof initialMergeAccumulator>,
  firm: Readonly<Record<string, unknown>>
): ReturnType<typeof initialMergeAccumulator> {
  const name = String(firm.name ?? "");
  if (!name) return current;
  const identity = resolveFirmIdentity(name);
  const firmIdValue = String(firm.id);
  if (identity.canonicalId === firmIdValue) return current;
  if (identity.canonicalName === name) return current;

  const canonical = current.byId.get(identity.canonicalId) ?? {
    id: identity.canonicalId,
    name: identity.canonicalName,
    channel: firm.channel ?? "unknown",
  };
  const merged = mergeFirmRows(canonical, firm, identity.canonicalName);
  const alias = aliasRow(
    identity.canonicalId,
    name,
    "curated_merge",
    firmIdValue
  );
  return {
    byId: new Map([...current.byId, [identity.canonicalId, merged]]),
    aliasRows: new Map([
      ...current.aliasRows,
      [firmAliasId(identity.canonicalId, name), alias],
    ]),
    replacementPairs: [
      ...current.replacementPairs,
      { from: firmIdValue, to: identity.canonicalId },
    ],
    mergedFirmIds: [...current.mergedFirmIds, firmIdValue],
    auditRows: [
      ...current.auditRows,
      auditRow(firm, merged, identity.canonicalId),
    ],
  };
}

/**
 * Builds the typed reducer seed for curated firm merges.
 * @param rows - Table snapshots that provide current firms, aliases, and audits.
 * @returns Reducer accumulator with immutable replacement tracking.
 */
function initialMergeAccumulator(
  rows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
) {
  const replacementPairs = [] as ReadonlyArray<FirmReplacementPair>;
  const mergedFirmIds = [] as ReadonlyArray<string>;
  return {
    byId: new Map((rows.Firm ?? []).map(row => [String(row.id), row])),
    aliasRows: new Map(
      [...(rows.FirmAlias ?? []), ...curatedFirmAliasRows()].map(row => [
        String(row.id),
        row,
      ])
    ),
    replacementPairs,
    mergedFirmIds,
    auditRows: rows.FirmMergeAudit ?? [],
  };
}

/**
 * Creates the FirmAlias row that preserves a merged duplicate's source label.
 * @param firmIdValue - Canonical firm id that owns the alias.
 * @param alias - Source label being preserved after canonicalization.
 * @param sourceType - Provenance bucket for the alias row.
 * @param sourceRef - Source id or duplicate firm id that produced the alias.
 * @returns Idempotent FirmAlias row ready for seed or database upsert.
 */
function aliasRow(
  firmIdValue: string,
  alias: string,
  sourceType: string,
  sourceRef: string
) {
  return {
    id: firmAliasId(firmIdValue, alias),
    firmId: firmIdValue,
    alias,
    normalizedAlias: normalizeFirmAlias(alias),
    sourceType,
    sourceRef,
    confidence: "approved",
  };
}

/**
 * Captures the duplicate firm payload before the duplicate row is removed.
 * @param source - Duplicate Firm row that was folded into the canonical firm.
 * @param merged - Final canonical Firm row after field preservation.
 * @param canonicalId - Surviving canonical Firm id.
 * @returns Audit row that can reconstruct the removed duplicate's source data.
 */
function auditRow(
  source: Readonly<Record<string, unknown>>,
  merged: Readonly<Record<string, unknown>>,
  canonicalId: string
) {
  return {
    id: uid(`firm-merge:${source.id}:${canonicalId}`),
    oldFirmId: source.id,
    canonicalFirmId: canonicalId,
    oldName: source.name,
    canonicalName: merged.name,
    reason: "curated_alias",
    mergedPayload: JSON.stringify(source),
  };
}

/**
 * Clones row objects so merge planning never mutates seed fixtures or SQL results.
 * @param inputRows - Source table snapshots from seed data or Harper.
 * @returns Table snapshots with copied row objects.
 */
function cloneRows(
  inputRows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
) {
  return Object.fromEntries(
    Object.entries(inputRows).map(([table, tableRows]) => [
      table,
      (tableRows ?? []).map(row => ({ ...row })),
    ])
  );
}

/**
 * Keeps the last row for each id after alias rows and merge outputs are combined.
 * @param rows - Table snapshots that may contain repeated ids from upsert-style inputs.
 * @returns Table snapshots with one row per id.
 */
function dedupeRows(
  rows: Readonly<
    Record<string, ReadonlyArray<Readonly<Record<string, unknown>>> | undefined>
  >
) {
  return Object.fromEntries(
    Object.entries(rows).map(([table, tableRows]) => [
      table,
      [
        ...new Map(
          (tableRows ?? []).map(row => [String(row.id), row])
        ).values(),
      ],
    ])
  );
}

/**
 * Finds normalized-name collisions that need human review.
 * @param firms - Surviving Firm rows after curated merges are applied.
 * @returns Duplicate candidates grouped by normalized firm name.
 */
function findCandidateGroups(
  firms: ReadonlyArray<Readonly<Record<string, unknown>>>
) {
  const grouped = new Map(
    firms
      .filter(firm => String(firm.name ?? "").length > 0)
      .map(firm => {
        const key = normalizeFirmAlias(String(firm.name));
        return [
          key,
          firms.filter(
            candidate =>
              normalizeFirmAlias(String(candidate.name ?? "")) === key
          ),
        ] as const;
      })
  );
  return [...grouped.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([normalizedName, group]) => ({
      normalizedName,
      firms: group.map(firm => ({
        id: typeof firm.id === "string" ? firm.id : undefined,
        name: typeof firm.name === "string" ? firm.name : undefined,
      })),
    }));
}

/**
 * Scores how much useful data a firm row carries.
 * @param row - Firm row being compared during field preservation.
 * @returns Number of non-empty values on the row.
 */
function filledFieldCount(row: Readonly<Record<string, unknown>>): number {
  return Object.values(row).filter(hasValue).length;
}

/**
 * Treats blank strings and empty arrays as missing details during merge.
 * @param value - Candidate value from either the canonical or duplicate firm row.
 * @returns Whether the value should be preserved as useful firm data.
 */
function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

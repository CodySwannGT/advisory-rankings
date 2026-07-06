/**
 * Shared fetch helpers for the per-entity profile loaders
 * (`resource-advisor-profile-load.ts`, `resource-firm-profile-load.ts`,
 * `resource-team-profile-load.ts`, `resource-article-view-load.ts`).
 * Together they replace the request-wide `loadAll()` 34-table scan with
 * subject-scoped reads:
 *
 *   - Large entity/join tables (Advisor, EmploymentHistory, Disclosure,
 *     TransitionEvent, …) are read through indexed
 *     `search({conditions})` lookups on their declared `@indexed`
 *     foreign keys, or hydrated by primary key via `rowsByIds`.
 *   - The five article→mention join tables and `FieldAssertion` are
 *     read with a full `search({})` scan and filtered in memory. On the
 *     shared Fabric dev cluster, replicated rows reach the
 *     public-serving node but their secondary indexes do NOT reliably
 *     replicate, so indexed conditions against those tables silently
 *     return zero rows — see the module header of
 *     `resource-feed-page-load.ts` and `docs/fabric-runbook.md` §6.
 *     They are small article-derived tables (hundreds of rows); do not
 *     "optimize" them back to indexed `search({conditions})` lookups.
 */
import type { AdvisorRow, FirmRow } from "../types/harper-schema.js";

import {
  allRows,
  optionalAll,
  rowsByAttribute,
} from "./resource-directory-tables.js";
import { rowsByIds } from "./resource-directory-search-queries.js";
import { staleFirmIdReplacements } from "./resource-firm-canonicalization.js";

/**
 * Above this many distinct ids, hydrating rows one indexed point-lookup
 * at a time costs more than a single bounded scan of the one table
 * involved, so `advisorsByIdsBounded` switches strategies. Either path
 * stays a one-table read — the `loadAll()` problem this module replaces
 * was 34 tables per request, not one.
 */
const ID_HYDRATION_SCAN_THRESHOLD = 200;

/**
 * Dedupes and drops empty entries from a foreign-key id list.
 * @param values - Candidate ids gathered off related rows.
 * @returns Distinct non-empty ids in first-seen order.
 */
export function distinctIds(
  values: readonly (string | null | undefined)[]
): readonly string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

/**
 * Indexed single-attribute lookup that tolerates tables which are
 * absent during rolling deploys (mirrors `readRows` in
 * `resource-data.ts`, which returns an empty array for missing handles).
 * @param table - Harper table handle, possibly undefined.
 * @param attribute - Indexed attribute name to filter on.
 * @param value - Value the attribute must equal.
 * @returns Matching rows, or an empty array when the table is absent.
 */
export async function optionalRowsByAttribute<T>(
  table: unknown,
  attribute: string,
  value: string
): Promise<readonly T[]> {
  return table ? rowsByAttribute<T>(table, attribute, value) : [];
}

/**
 * Indexed lookup fanned out across several values of one attribute.
 * Mirrors the `rowsByIndexed` pattern in `resource-feed-page-load.ts`.
 * @param table - Harper table handle, possibly undefined.
 * @param attribute - Indexed attribute name to filter on.
 * @param values - Distinct values to fetch rows for.
 * @returns Matching rows across all values.
 */
export async function rowsByAttributeAcross<T>(
  table: unknown,
  attribute: string,
  values: readonly string[]
): Promise<readonly T[]> {
  if (!table || values.length === 0) return [];
  const fetched = await Promise.all(
    values.map(value => rowsByAttribute<T>(table, attribute, value))
  );
  return fetched.flat();
}

/**
 * Primary-key hydration that tolerates absent tables.
 * @param table - Harper table handle, possibly undefined.
 * @param ids - Distinct entity ids to load.
 * @returns Matching rows, or an empty array when the table is absent.
 */
export async function rowsByIdsOptional<T>(
  table: unknown,
  ids: readonly string[]
): Promise<readonly T[]> {
  return table ? rowsByIds<T>(table, ids) : [];
}

/**
 * Index-independent scan + in-memory filter for the tables whose
 * secondary indexes are not trusted on the Fabric serving node (the
 * article→mention join tables and `FieldAssertion`) — see the module
 * header for the replication rationale.
 * @param table - Harper table handle, possibly undefined.
 * @param predicate - Row filter applied after the scan.
 * @returns Matching rows, or an empty array when the table is absent.
 */
export async function scanRowsWhere<T>(
  table: unknown,
  predicate: (row: T) => boolean
): Promise<readonly T[]> {
  const rows = await optionalAll<T>(table);
  return rows.filter(predicate);
}

/**
 * Fetches the subject row candidates for one profile route. The common
 * case (an entity id in the URL) is a single indexed primary-key
 * lookup; only when that misses does the loader fall back to scanning
 * the one subject table so the legacy slug/name resolution in
 * `resource-routing.ts` (slugified-name comparison — not expressible as
 * a Harper condition) keeps working.
 * @param table - Harper table handle for the subject entity.
 * @param identifier - Route id or slug.
 * @returns Either the single row matched by id or the full table.
 */
export async function subjectCandidates<T>(
  table: unknown,
  identifier: string
): Promise<readonly T[]> {
  const direct = await rowsByIdsOptional<T>(table, [identifier]);
  if (direct.length > 0) return direct;
  return table ? allRows<T>(table) : [];
}

/**
 * Bounded Advisor hydration for firm rosters: per-id indexed lookups up
 * to {@link ID_HYDRATION_SCAN_THRESHOLD}, above which one bounded scan
 * of the single Advisor table is cheaper than thousands of point
 * lookups (large wirehouse rosters).
 * @param ids - Distinct advisor ids to hydrate.
 * @returns Advisor rows for the requested ids.
 */
export async function advisorsByIdsBounded(
  ids: readonly string[]
): Promise<readonly AdvisorRow[]> {
  if (ids.length === 0) return [];
  if (ids.length <= ID_HYDRATION_SCAN_THRESHOLD) {
    return rowsByIdsOptional<AdvisorRow>(tables.Advisor, ids);
  }
  const wanted = new Set(ids);
  const rows = await allRows<AdvisorRow>(tables.Advisor);
  return rows.filter(row => wanted.has(row.id));
}

/**
 * Hydrates firm rows by id and, when any fetched row is a stale curated
 * alias, also hydrates the canonical firm row it merges into so the
 * alias-merge canonicalization in `buildScopedResourceIndex` can fold
 * the alias exactly like `loadAll()` does with the full Firm table.
 * @param ids - Firm ids referenced by the subject's related rows.
 * @returns Firm rows plus any canonical merge targets.
 */
export async function firmsByIdsWithCanonical(
  ids: readonly (string | null | undefined)[]
): Promise<readonly FirmRow[]> {
  const firms = await rowsByIdsOptional<FirmRow>(tables.Firm, distinctIds(ids));
  const replacements = staleFirmIdReplacements(firms);
  const loaded = new Set(firms.map(firm => firm.id));
  const canonicalIds = distinctIds([...replacements.values()]).filter(
    id => !loaded.has(id)
  );
  const canonical = await rowsByIdsOptional<FirmRow>(tables.Firm, canonicalIds);
  return [...firms, ...canonical];
}

/** Minimal row shape `dedupeRowsById` reads through. */
interface IdentifiedRow {
  readonly id: string;
}

/**
 * Dedupes rows by primary key, keeping first occurrence. Used when the
 * same row can be reached through more than one indexed attribute
 * (e.g. a transition matching both `fromFirmId` and `toFirmId`).
 * @param rows - Rows possibly containing duplicates.
 * @returns Rows with one entry per id.
 */
export function dedupeRowsById<T extends IdentifiedRow>(
  rows: readonly T[]
): readonly T[] {
  return rows.filter(
    (row, index) => rows.findIndex(other => other.id === row.id) === index
  );
}

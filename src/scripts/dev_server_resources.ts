/**
 * Loader for the generated `harper-app/resources.js` module behind a
 * Harper-like `globalThis.tables` / `globalThis.Resource` shim.
 *
 * The shim's table objects do NOT implement the full `harperdb.Table`
 * surface — they expose just the single `search()` async-iterable the
 * generated resources call in production. We therefore install them via
 * the one documented `unknown`-typed adapter cast (`installTablesShim`),
 * the same single-adapter pattern called out in the @ts-nocheck-strip
 * playbook for producers whose runtime contract is wider than the
 * compile-time one we need.
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { loadTable } from "./dev_server_ops.js";
import { DEV_SERVER_TABLES } from "./dev_server_tables.js";

const TABLES: readonly string[] = [...DEV_SERVER_TABLES];

/** Minimal Harper-style condition supported by the local table shim. */
interface TableCondition {
  readonly attribute?: unknown;
  readonly comparator?: unknown;
  readonly value?: unknown;
}

/** Minimal Harper-style sort clause supported by the local table shim. */
interface TableSort {
  readonly attribute?: unknown;
  readonly descending?: unknown;
}

/** Minimal Harper-style search query supported by the local table shim. */
interface TableSearchQuery {
  readonly conditions?: unknown;
  readonly limit?: unknown;
  readonly offset?: unknown;
  readonly sort?: unknown;
}

/**
 * The minimal `tables.X` surface that generated resources call. The real
 * `harperdb.Table` interface is much wider; we expose the read and upsert
 * methods needed by local smoke flows.
 */
interface TableShim {
  readonly get: (id: string) => Promise<unknown | null>;
  readonly insert: (row: unknown) => Promise<void>;
  readonly put: (row: unknown) => Promise<void>;
  readonly search: (query?: TableSearchQuery) => AsyncIterable<unknown>;
}

/** Map of Harper table name → shim that satisfies `TableShim`. */
type TableShimMap = Readonly<Record<string, TableShim>>;

/**
 * Minimal stand-in for the generated resources' `Resource` superclass.
 * Production Harper exposes a much richer class; the offline dev loop
 * only needs a constructible base so `class Foo extends Resource {}`
 * survives the import.
 */
class DevResource {
  /** No-op constructor; the generated subclasses provide all behavior. */
  constructor() {
    // Intentionally empty.
  }

  /**
   * Returns no request context for local JSON resource calls.
   * @returns Null so detail-shell negotiation falls through to JSON payloads.
   */
  getContext(): null {
    return null;
  }
}

/**
 * Shape of the dynamically-imported `harper-app/resources.js` module. The
 * generated module re-exports one class per `@export` resource keyed by
 * name; entries are typed as `unknown` and narrowed at the call site.
 */
interface ResourcesModule {
  readonly [exportName: string]: unknown;
}

/**
 * Cached-state container for the memoised resources module. Wrapped in
 * an object so `Object.assign(state, { resources })` — the project's
 * functional/immutable-data-approved mutation pattern — can reset it
 * without rebinding a `const`.
 */
interface ResourceState {
  readonly resources: ResourcesModule | null;
  readonly tableRows: Readonly<Record<string, readonly unknown[]>> | null;
}

const resourceState: ResourceState = { resources: null, tableRows: null };

/**
 * Pulls every dev-server table into memory and wraps each in the
 * `tables.X.search()` async-iterable shape that resources.js consumes.
 * @returns Map of table-name → shim.
 */
async function loadTableShim(): Promise<TableShimMap> {
  const rows = await loadTableRows();
  return Object.fromEntries(
    TABLES.map(tableName => [tableName, tableShim(tableName, rows)] as const)
  );
}

/**
 * Loads and caches table rows for the dev-server process. This keeps POST
 * mutations visible to subsequent resource reads during one smoke run.
 * @returns Mutable table-row cache keyed by table name.
 */
async function loadTableRows(): Promise<Record<string, readonly unknown[]>> {
  if (resourceState.tableRows) {
    return resourceState.tableRows as Record<string, readonly unknown[]>;
  }
  const entries = await Promise.all(
    TABLES.map(
      async tableName => [tableName, await loadTable(tableName)] as const
    )
  );
  const tableRows = Object.fromEntries(entries);
  Object.assign(resourceState, { tableRows });
  return tableRows;
}

/**
 * Builds one mutable in-memory table facade.
 * @param tableName - Harper table name.
 * @param rowsByTable - Shared process-local row cache.
 * @returns Table shim used by generated resources.
 */
function tableShim(
  tableName: string,
  rowsByTable: Record<string, readonly unknown[]>
): TableShim {
  return {
    get: async (id: string) =>
      rowsFor(tableName, rowsByTable).find(row => rowId(row) === id) ?? null,
    insert: async (row: unknown) => {
      await upsertRow(tableName, row, rowsByTable);
    },
    put: async (row: unknown) => {
      await upsertRow(tableName, row, rowsByTable);
    },
    search: query =>
      (async function* () {
        for (const row of applySearch(rowsFor(tableName, rowsByTable), query)) {
          yield row;
        }
      })(),
  };
}

/**
 * Reads cached rows for one table.
 * @param tableName - Harper table name.
 * @param rowsByTable - Shared process-local row cache.
 * @returns Rows for the table.
 */
function rowsFor(
  tableName: string,
  rowsByTable: Record<string, readonly unknown[]>
): readonly unknown[] {
  return rowsByTable[tableName] ?? [];
}

/**
 * Upserts one row by `id` into the process-local cache.
 * @param tableName - Harper table name.
 * @param row - Row to persist.
 * @param rowsByTable - Shared process-local row cache.
 */
async function upsertRow(
  tableName: string,
  row: unknown,
  rowsByTable: Record<string, readonly unknown[]>
): Promise<void> {
  const id = rowId(row);
  const rows = rowsFor(tableName, rowsByTable);
  const index = rows.findIndex(candidate => rowId(candidate) === id);
  Object.assign(rowsByTable, {
    [tableName]:
      index === -1
        ? [...rows, row]
        : [...rows.slice(0, index), row, ...rows.slice(index + 1)],
  });
}

/**
 * Applies the subset of Harper search semantics the generated resources use.
 * @param rows - Candidate table rows.
 * @param query - Harper-style query object.
 * @returns Filtered, sorted, and paginated rows.
 */
function applySearch(
  rows: readonly unknown[],
  query: TableSearchQuery | undefined
): readonly unknown[] {
  const conditions = Array.isArray(query?.conditions)
    ? (query.conditions as readonly TableCondition[])
    : [];
  const filtered = rows.filter(row =>
    conditions.every(condition => matchesCondition(row, condition))
  );
  const sorted = applySort(filtered, query?.sort);
  const offset = numberValue(query?.offset) ?? 0;
  const limit = numberValue(query?.limit) ?? sorted.length;
  return sorted.slice(offset, offset + limit);
}

/**
 * Applies a Harper-style single-column sort.
 * @param rows - Rows to sort.
 * @param sort - Sort clause.
 * @returns Sorted rows.
 */
function applySort(
  rows: readonly unknown[],
  sort: unknown
): readonly unknown[] {
  if (!sort || typeof sort !== "object") return rows;
  const attribute = stringValue((sort as TableSort).attribute);
  if (!attribute) return rows;
  const direction = (sort as TableSort).descending ? -1 : 1;
  return [...rows].sort(
    (left, right) =>
      direction *
      compareValues(rowValue(left, attribute), rowValue(right, attribute))
  );
}

/**
 * Checks one Harper-style condition.
 * @param row - Candidate row.
 * @param condition - Condition to evaluate.
 * @returns Whether the row matches.
 */
function matchesCondition(row: unknown, condition: TableCondition): boolean {
  const attribute = stringValue(condition.attribute);
  if (!attribute) return true;
  const candidate = rowValue(row, attribute);
  const target = condition.value;
  const comparator = stringValue(condition.comparator) ?? "equals";
  const comparatorMatches = {
    greater_than: () => compareValues(candidate, target) > 0,
    greater_than_equal: () => compareValues(candidate, target) >= 0,
    ne: () => notEqual(candidate, target),
    not_equal: () => notEqual(candidate, target),
    starts_with: () =>
      typeof candidate === "string" &&
      candidate.startsWith(String(condition.value ?? "")),
  } satisfies Record<string, () => boolean>;
  return (
    comparatorMatches[comparator as keyof typeof comparatorMatches]?.() ??
    equal(candidate, target)
  );
}

/**
 * Checks Harper-style equality with null matching nullish values.
 * @param candidate - Row value to test.
 * @param target - Condition value to match.
 * @returns Whether the candidate equals the target.
 */
function equal(candidate: unknown, target: unknown): boolean {
  return target === null ? candidate == null : candidate === target;
}

/**
 * Checks Harper-style inequality with null excluding nullish values.
 * @param candidate - Row value to test.
 * @param target - Condition value to reject.
 * @returns Whether the candidate differs from the target.
 */
function notEqual(candidate: unknown, target: unknown): boolean {
  return target === null ? candidate != null : candidate !== target;
}

/**
 * Compares primitive-ish row values using Harper-like null ordering.
 * @param left - First value.
 * @param right - Second value.
 * @returns Sort order.
 */
function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : 1;
  }
  return String(left).localeCompare(String(right));
}

/**
 * Reads a field off an object row.
 * @param row - Candidate row.
 * @param attribute - Field name.
 * @returns Field value.
 */
function rowValue(row: unknown, attribute: string): unknown {
  return row && typeof row === "object"
    ? Reflect.get(row, attribute)
    : undefined;
}

/**
 * Reads a row id when present.
 * @param row - Candidate row.
 * @returns Row id string or undefined.
 */
function rowId(row: unknown): string | undefined {
  return stringValue(rowValue(row, "id"));
}

/**
 * Narrows a value to a string.
 * @param value - Candidate value.
 * @returns String or undefined.
 */
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Narrows a value to a finite number.
 * @param value - Candidate value.
 * @returns Number or undefined.
 */
function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Narrow view of `globalThis` exposing only the `tables` slot we install. */
interface GlobalWithTables {
  readonly tables: TableShimMap;
}

/**
 * Narrow view of `globalThis` exposing only the `Resource` slot we install.
 * Typed as the bare construct signature the shim actually needs (a
 * no-arg constructible base) rather than `typeof DevResource` — the latter
 * drags in the class's mutable static side and reads as `ReadonlyShallow`,
 * while the construct signature is a deep-readonly function-typed leaf.
 */
interface GlobalWithResource {
  readonly Resource: new () => DevResource;
}

/**
 * Installs the shim map onto `globalThis.tables`.
 *
 * This is the single documented `unknown` cast for this module: the shim
 * implements only the `search()` method the generated resources actually
 * call, so it intentionally does not satisfy the full `harperdb.Table`
 * interface from the ambient `globalThis.tables` typing.
 * @param shim - Table-shim map produced by `loadTableShim`.
 */
function installTablesShim(shim: TableShimMap): void {
  Object.assign(globalThis as unknown as GlobalWithTables, { tables: shim });
}

/**
 * Installs the `DevResource` stand-in onto `globalThis.Resource`.
 *
 * Same rationale as `installTablesShim`: the stand-in is a constructible
 * empty class, not a full Harper resource implementation. Assigning into
 * the ambient `globalThis.Resource` slot requires routing through
 * `unknown` exactly once, here.
 */
function installResourceShim(): void {
  Object.assign(globalThis as unknown as GlobalWithResource, {
    Resource: DevResource,
  });
}

/** Options for {@link loadResources}. */
interface LoadResourcesOptions {
  readonly loadTables?: boolean;
}

/**
 * Loads `harper-app/resources.js` with the Harper-like globals in place.
 * The module import is memoised; `clearResourcesCache` re-arms it for
 * hot-reload mode.
 * @param opts - Whether to populate the table-shim before importing.
 * @returns The imported resources module.
 */
export async function loadResources(
  opts: LoadResourcesOptions = { loadTables: true }
): Promise<ResourcesModule> {
  const shim = opts.loadTables ? await loadTableShim() : {};
  installTablesShim(shim);
  installResourceShim();
  if (!resourceState.resources) {
    const imported = (await import(
      pathToFileURL(resolve("harper-app/resources.js")).href
    )) as ResourcesModule;
    Object.assign(resourceState, { resources: imported });
  }
  return resourceState.resources as ResourcesModule;
}

/** Clears the memoised resources import so the next call re-imports. */
export function clearResourcesCache(): void {
  Object.assign(resourceState, { resources: null });
}

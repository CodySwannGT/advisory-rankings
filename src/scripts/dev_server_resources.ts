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

/**
 * The minimal `tables.X` surface that generated resources call. The real
 * `harperdb.Table` interface is much wider; we expose only `search()`
 * because that is the only method `harper-app/resources.js` reaches for.
 */
interface TableShim {
  readonly search: () => AsyncIterable<unknown>;
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
}

const resourceState: ResourceState = { resources: null };

/**
 * Pulls every dev-server table into memory and wraps each in the
 * `tables.X.search()` async-iterable shape that resources.js consumes.
 *
 * @returns Map of table-name → shim.
 */
async function loadTableShim(): Promise<TableShimMap> {
  const entries = await Promise.all(
    TABLES.map(async tableName => {
      const rows = await loadTable(tableName);
      const shim: TableShim = {
        search: () =>
          (async function* () {
            for (const row of rows) yield row;
          })(),
      };
      return [tableName, shim] as const;
    })
  );
  return Object.fromEntries(entries);
}

/** Narrow view of `globalThis` exposing only the `tables` slot we install. */
interface GlobalWithTables {
  readonly tables: TableShimMap;
}

/** Narrow view of `globalThis` exposing only the `Resource` slot we install. */
interface GlobalWithResource {
  readonly Resource: typeof DevResource;
}

/**
 * Installs the shim map onto `globalThis.tables`.
 *
 * This is the single documented `unknown` cast for this module: the shim
 * implements only the `search()` method the generated resources actually
 * call, so it intentionally does not satisfy the full `harperdb.Table`
 * interface from the ambient `globalThis.tables` typing.
 *
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
 *
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

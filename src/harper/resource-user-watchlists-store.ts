import type {
  UserWatchlistEntryRow,
  UserWatchlistRow,
} from "../types/harper-schema.js";

/**
 * Minimal duck-typed view of a Harper current-user record used to derive a stable identifier.
 */
interface UserShape {
  readonly id?: unknown;
  readonly email?: unknown;
  readonly username?: unknown;
}

/**
 * Resource-side surface exposing the Harper current-user accessor that watchlist endpoints depend on.
 */
export interface CurrentUserResource {
  readonly getCurrentUser?: () => unknown;
}

/**
 * Subset of the Harper table API the watchlist store relies on, abstracted so tests can stub it.
 */
export interface SearchableTable<Row> {
  readonly get?: (id: string) => Promise<Row | null | undefined>;
  readonly search: (
    query?: Readonly<Record<string, unknown>>
  ) => AsyncIterable<Row>;
  readonly put?: (row: Row) => Promise<unknown>;
  readonly insert?: (row: Row) => Promise<unknown>;
  readonly create?: (row: Row) => Promise<unknown>;
  readonly delete?: (id: string) => Promise<unknown>;
  readonly remove?: (id: string) => Promise<unknown>;
}

/**
 * Resolves the Harper-backed `UserWatchlist` table, throwing a 503 if Harper has not registered it.
 * @param candidate Resource-module static table binding, when Harper exposes one.
 * @returns The searchable `UserWatchlist` table.
 */
export function userListTable(
  candidate: unknown = tables.UserWatchlist
): SearchableTable<UserWatchlistRow> {
  return tableByName<UserWatchlistRow>("UserWatchlist", candidate);
}

/**
 * Resolves the Harper-backed `UserWatchlistEntry` table, throwing a 503 if Harper has not registered it.
 * @param candidate Resource-module static table binding, when Harper exposes one.
 * @returns The searchable `UserWatchlistEntry` table.
 */
export function userListEntryTable(
  candidate: unknown = tables.UserWatchlistEntry
): SearchableTable<UserWatchlistEntryRow> {
  return tableByName<UserWatchlistEntryRow>("UserWatchlistEntry", candidate);
}

/**
 * Resolves a Harper table by registered name, including nested Fabric database registries.
 * @param name Harper table name.
 * @param candidate Resource-module static table binding, when Harper exposes one.
 * @returns The searchable table.
 */
export function tableByName<Row>(
  name: string,
  candidate: unknown
): SearchableTable<Row> {
  return requiredTable<Row>(name, candidate ?? databaseTable(name));
}

/**
 * Materializes every row whose `attribute` equals `value` into an array, hiding Harper's async iterator from callers.
 * @param table Harper-backed table to query.
 * @param attribute Column name to filter on.
 * @param value Required value for `attribute` equality.
 * @returns Snapshot of all matching rows.
 */
export async function rowsFor<Row>(
  table: SearchableTable<Row>,
  attribute: string,
  value: string
): Promise<ReadonlyArray<Row>> {
  return await Array.fromAsync(
    table.search({ conditions: [{ attribute, value }] })
  );
}

/**
 * Upserts `row` via whichever write method the table exposes, throwing 503 if none is available.
 * @param table Target Harper-backed table.
 * @param row Row payload to persist.
 * @returns Resolves once the row is written.
 */
export async function writeRow<Row>(
  table: SearchableTable<Row>,
  row: Row
): Promise<void> {
  if (typeof table.put === "function") {
    await table.put(row);
    return;
  }
  if (typeof table.insert === "function") {
    await table.insert(row);
    return;
  }
  if (typeof table.create === "function") {
    await table.create(row);
    return;
  }
  throwStatus("User watchlist writes are unavailable", 503);
}

/**
 * Removes the row with the given id via whichever delete method the table exposes, throwing 503 if none is available.
 * @param table Target Harper-backed table.
 * @param id Primary key of the row to delete.
 * @returns Resolves once the row is removed.
 */
export async function deleteRow<Row>(
  table: SearchableTable<Row>,
  id: string
): Promise<void> {
  if (typeof table.delete === "function") {
    await table.delete(id);
    return;
  }
  if (typeof table.remove === "function") {
    await table.remove(id);
    return;
  }
  throwStatus("User watchlist deletes are unavailable", 503);
}

/**
 * Derives a stable string identifier for the active user, preferring id then email then username.
 * @param resource Harper resource exposing `getCurrentUser`.
 * @returns The identifier, or null if no usable value is present.
 */
export function currentUserId(resource: CurrentUserResource): string | null {
  const user = resource.getCurrentUser?.() as UserShape | null | undefined;
  const id = user?.id ?? user?.email ?? user?.username;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Roles allowed to perform analyst review actions on shared queue data. */
const ANALYST_ROLES = ["analyst", "super_user", "super", "admin"] as const;

/**
 * Reads the current Harper user object from a resource instance.
 * @param resource Harper resource exposing `getCurrentUser`.
 * @returns Current user object or null.
 */
export function currentUser(resource: CurrentUserResource): unknown {
  return resource.getCurrentUser?.() ?? null;
}

/**
 * Checks whether a signed-in user can perform analyst review actions.
 * @param user Current Harper user object.
 * @returns True when the user role is analyst or elevated.
 */
export function hasAnalystRole(user: unknown): boolean {
  return ANALYST_ROLES.includes(
    roleValue(user) as (typeof ANALYST_ROLES)[number]
  );
}

/**
 * Extracts a role string from Harper's flat or nested role shapes.
 * @param value Current user object.
 * @returns Role name or empty string.
 */
function roleValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const role = Reflect.get(value, "role");
  if (typeof role === "string") return role;
  if (role && typeof role === "object") {
    const nested = Reflect.get(role, "role");
    return typeof nested === "string" ? nested : "";
  }
  return "";
}

/**
 * Normalizes free-text input: trims whitespace and caps length to protect storage.
 * @param value Raw input value of unknown type.
 * @param max Maximum allowed length in characters.
 * @returns The sanitized string, or empty string if input was not a non-empty string.
 */
export function textValue(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : "";
}

/**
 * Parses unknown input as a strictly positive integer, used for pagination params.
 * @param value Raw input value.
 * @returns The parsed integer, or undefined if it is not a positive integer.
 */
export function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Builds a namespaced, user-scoped id for a new list using a random UUID for uniqueness.
 * @param prefix Resource-type prefix (e.g. `list`).
 * @param userId Owning user identifier.
 * @returns The fully-qualified id string.
 */
export function newId(prefix: string, userId: string): string {
  return `${prefix}:${encodeURIComponent(userId)}:${globalThis.crypto.randomUUID()}`;
}

/**
 * Builds a composite id for a list/advisor membership row so duplicates collapse naturally.
 * @param listId Parent list id.
 * @param advisorId Advisor id being added to the list.
 * @returns Composite entry id.
 */
export function entryId(listId: string, advisorId: string): string {
  return `${encodeURIComponent(listId)}:${encodeURIComponent(advisorId)}`;
}

/**
 * Throws an Error tagged with an HTTP `status` so Harper translates it into the matching response code.
 * @param message Human-readable error message.
 * @param status HTTP status code to attach.
 * @throws Always throws.
 */
export function throwStatus(message: string, status: number): never {
  const error = new Error(message);
  // Harper's thrown-error response writer reads `statusCode` (falling back to
  // 500); `status` is kept for returned-response symmetry and callers/tests.
  Object.assign(error, { status, statusCode: status });
  throw error;
}

/**
 * Guards that `candidate` matches the SearchableTable shape, throwing 503 with a contextual name otherwise.
 * @param name Table name for the error message.
 * @param candidate Possible table instance.
 * @returns The validated table.
 */
function requiredTable<Row>(
  name: string,
  candidate: unknown
): SearchableTable<Row> {
  if (isSearchableTable<Row>(candidate)) return candidate;
  throwStatus(`${name} table is unavailable`, 503);
}

/**
 * Falls back to scanning each registered Harper database for a table named `name` when `tables` is empty.
 * @param name Table name to look up.
 * @returns The first matching table candidate, or undefined.
 */
function databaseTable<Row>(name: string): SearchableTable<Row> | undefined {
  return nestedDatabaseTable<Row>(name, Object.values(databases), 0, []);
}

/**
 * Recursively searches Harper's database registry for a named table. Fabric
 * versions have exposed table handles at different nesting levels.
 * @param name Table name to find.
 * @param values Candidate registry values at the current nesting level.
 * @param depth Current search depth.
 * @param seen Objects already traversed.
 * @returns A matching searchable table, or undefined.
 */
function nestedDatabaseTable<Row>(
  name: string,
  values: readonly unknown[],
  depth: number,
  seen: readonly object[]
): SearchableTable<Row> | undefined {
  const objects = values.filter(isUnseenObject(seen));
  const direct = objects
    .map(value => Reflect.get(value, name))
    .find(isSearchableTable<Row>);
  if (direct) return direct;
  if (depth >= 4) return undefined;
  return nestedDatabaseTable<Row>(
    name,
    objects.flatMap(value => Object.values(value)),
    depth + 1,
    [...seen, ...objects]
  );
}

/**
 * Builds a predicate that keeps traversable objects not already visited.
 * @param seen Objects already traversed.
 * @returns Predicate for unknown registry values.
 */
function isUnseenObject(
  seen: readonly object[]
): (value: unknown) => value is object {
  return (value: unknown): value is object =>
    !!value && typeof value === "object" && !seen.includes(value);
}

/**
 * Type guard verifying that `value` exposes the minimum `search` function required by SearchableTable.
 *
 * Harper exposes table handles as class constructors, so `typeof tables.X` is
 * `"function"`, not `"object"`. A prior version of this guard rejected anything
 * that was not `"object"`, which meant a perfectly bound, searchable table was
 * always treated as "unavailable" on the authenticated path — the actual cause
 * of #999 (the table was bound the whole time; only this guard rejected it).
 * Accept both object- and function-typed handles that expose `search`.
 * @param value Candidate table handle (object or class constructor).
 * @returns True when `value` is a usable SearchableTable.
 */
function isSearchableTable<Row>(value: unknown): value is SearchableTable<Row> {
  if (
    !value ||
    (typeof value !== "object" && typeof value !== "function") ||
    !("search" in value)
  ) {
    return false;
  }
  return typeof Reflect.get(value, "search") === "function";
}

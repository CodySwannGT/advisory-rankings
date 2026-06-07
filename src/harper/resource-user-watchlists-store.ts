import type { UserListEntryRow, UserListRow } from "../types/harper-schema.js";

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
 * Resolves the Harper-backed `UserList` table, throwing a 503 if Harper has not registered it.
 * @param candidate Resource-module static table binding, when Harper exposes one.
 * @returns The searchable `UserList` table.
 */
export function userListTable(
  candidate: unknown = tables.UserList
): SearchableTable<UserListRow> {
  return requiredTable<UserListRow>(
    "UserList",
    candidate ?? databaseTable("UserList")
  );
}

/**
 * Resolves the Harper-backed `UserListEntry` table, throwing a 503 if Harper has not registered it.
 * @param candidate Resource-module static table binding, when Harper exposes one.
 * @returns The searchable `UserListEntry` table.
 */
export function userListEntryTable(
  candidate: unknown = tables.UserListEntry
): SearchableTable<UserListEntryRow> {
  return requiredTable<UserListEntryRow>(
    "UserListEntry",
    candidate ?? databaseTable("UserListEntry")
  );
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
  Object.assign(error, { status });
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
function databaseTable(name: string): unknown {
  for (const database of Object.values(databases)) {
    const candidate = Reflect.get(database, name);
    if (candidate) return candidate;
  }
  return undefined;
}

/**
 * Type guard verifying that `value` exposes the minimum `search` function required by SearchableTable.
 * @param value Candidate object.
 * @returns True when `value` is a usable SearchableTable.
 */
function isSearchableTable<Row>(value: unknown): value is SearchableTable<Row> {
  if (!value || typeof value !== "object" || !("search" in value)) {
    return false;
  }
  return typeof Reflect.get(value, "search") === "function";
}

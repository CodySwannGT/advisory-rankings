/* eslint-disable jsdoc/require-jsdoc -- Storage helpers are exercised through resource tests. */
import type { UserListEntryRow, UserListRow } from "../types/harper-schema.js";

interface UserShape {
  readonly id?: unknown;
  readonly email?: unknown;
  readonly username?: unknown;
}

export interface CurrentUserResource {
  readonly getCurrentUser?: () => unknown;
}

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

export function userListTable(): SearchableTable<UserListRow> {
  return requiredTable<UserListRow>(
    "UserList",
    tables.UserList ?? databaseTable("UserList")
  );
}

export function userListEntryTable(): SearchableTable<UserListEntryRow> {
  return requiredTable<UserListEntryRow>(
    "UserListEntry",
    tables.UserListEntry ?? databaseTable("UserListEntry")
  );
}

export async function rowsFor<Row>(
  table: SearchableTable<Row>,
  attribute: string,
  value: string
): Promise<ReadonlyArray<Row>> {
  return await Array.fromAsync(
    table.search({ conditions: [{ attribute, value }] })
  );
}

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

export function currentUserId(resource: CurrentUserResource): string | null {
  const user = resource.getCurrentUser?.() as UserShape | null | undefined;
  const id = user?.id ?? user?.email ?? user?.username;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function textValue(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : "";
}

export function positiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function newId(prefix: string, userId: string): string {
  return `${prefix}:${encodeURIComponent(userId)}:${globalThis.crypto.randomUUID()}`;
}

export function entryId(listId: string, advisorId: string): string {
  return `${encodeURIComponent(listId)}:${encodeURIComponent(advisorId)}`;
}

export function throwStatus(message: string, status: number): never {
  const error = new Error(message);
  Object.assign(error, { status });
  throw error;
}

function requiredTable<Row>(
  name: string,
  candidate: unknown
): SearchableTable<Row> {
  if (isSearchableTable<Row>(candidate)) return candidate;
  throwStatus(`${name} table is unavailable`, 503);
}

function databaseTable(name: string): unknown {
  for (const database of Object.values(databases)) {
    const candidate = Reflect.get(database, name);
    if (candidate) return candidate;
  }
  return undefined;
}

function isSearchableTable<Row>(value: unknown): value is SearchableTable<Row> {
  if (!value || typeof value !== "object" || !("search" in value)) {
    return false;
  }
  return typeof Reflect.get(value, "search") === "function";
}
/* eslint-enable jsdoc/require-jsdoc -- Storage helpers are exercised through resource tests. */

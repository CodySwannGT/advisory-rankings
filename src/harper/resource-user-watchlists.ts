/* eslint-disable jsdoc/require-jsdoc -- Resource helpers are covered by focused tests. */
import type { UserListEntryRow, UserListRow } from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";

import { normalizeId } from "./resource-routing.js";
import {
  currentUserId,
  deleteRow,
  entryId,
  newId,
  positiveInt,
  rowsFor,
  textValue,
  throwStatus,
  userListEntryTable,
  userListTable,
  writeRow,
} from "./resource-user-watchlists-store.js";

const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 2_000;
const ADVISOR_ID_REQUIRED = "advisor id required";

interface WatchlistBody {
  readonly action?: unknown;
  readonly listId?: unknown;
  readonly id?: unknown;
  readonly name?: unknown;
  readonly advisorId?: unknown;
  readonly rank?: unknown;
  readonly note?: unknown;
}

interface WatchlistEntryResponse {
  readonly id: string;
  readonly listId: string;
  readonly advisorId: string;
  readonly rank: number | null;
  readonly note: string;
}

interface WatchlistResponse {
  readonly id: string;
  readonly name: string;
  readonly entries: ReadonlyArray<WatchlistEntryResponse>;
}

interface WatchlistSavedResponse {
  readonly authenticated: true;
  readonly list: WatchlistResponse;
}

interface WatchlistDeletedResponse {
  readonly authenticated: true;
  readonly deleted: true;
  readonly listId: string;
}

interface WatchlistEntryDeletedResponse {
  readonly authenticated: true;
  readonly deleted: true;
  readonly entryId: string;
  readonly list: WatchlistResponse;
}

interface UserWatchlistsGetResponse {
  readonly authenticated: boolean;
  readonly lists: ReadonlyArray<WatchlistResponse>;
}

type WatchlistMutationResponse =
  | WatchlistSavedResponse
  | WatchlistDeletedResponse
  | WatchlistEntryDeletedResponse;

export class UserWatchlists extends Resource {
  allowRead(): boolean {
    return true;
  }

  allowCreate(): boolean {
    return true;
  }

  async get(target?: RouteTarget): Promise<UserWatchlistsGetResponse> {
    const userId = currentUserId(this);
    if (!userId) return { authenticated: false, lists: [] };
    const lists = await userLists(userId);
    const targetListId = normalizeId(target);
    const scopedLists = targetListId
      ? lists.filter(list => list.id === targetListId)
      : lists;
    return {
      authenticated: true,
      lists: await decorateLists(scopedLists),
    };
  }

  async post(...args: readonly unknown[]): Promise<WatchlistMutationResponse> {
    const body = findBody(args);
    const userId = currentUserId(this);
    if (!userId) throwStatus("Sign in required", 401);

    switch (String(body.action || "create")) {
      case "create":
        return { authenticated: true, list: await createList(userId, body) };
      case "rename":
        return { authenticated: true, list: await renameList(userId, body) };
      case "delete":
        return await deleteList(userId, body);
      case "addEntry":
        return { authenticated: true, list: await addEntry(userId, body) };
      case "updateEntry":
        return { authenticated: true, list: await updateEntry(userId, body) };
      case "deleteEntry":
        return await deleteEntry(userId, body);
      default:
        throwStatus("Unsupported watchlist action", 400);
    }
  }
}

async function createList(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const name = textValue(body.name, MAX_NAME_LENGTH);
  if (!name) throwStatus("watchlist name required", 400);
  const row: UserListRow = {
    id: newId("list", userId),
    userId,
    name,
  };
  await writeRow(userListTable(), row);
  return { id: row.id, name: row.name, entries: [] };
}

async function renameList(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const list = await requireOwnedList(userId, body.listId ?? body.id);
  const name = textValue(body.name, MAX_NAME_LENGTH);
  if (!name) throwStatus("watchlist name required", 400);
  await writeRow(userListTable(), { ...list, name });
  return await decorateList({ ...list, name });
}

async function deleteList(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistMutationResponse> {
  const list = await requireOwnedList(userId, body.listId ?? body.id);
  const entries = await listEntries(list.id);
  await Promise.all(
    entries.map(entry => deleteRow(userListEntryTable(), entry.id))
  );
  await deleteRow(userListTable(), list.id);
  return { authenticated: true, deleted: true, listId: list.id };
}

async function addEntry(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const list = await requireOwnedList(userId, body.listId);
  const advisorId = textValue(body.advisorId, 200);
  if (!advisorId) throwStatus(ADVISOR_ID_REQUIRED, 400);
  const row: UserListEntryRow = {
    id: entryId(list.id, advisorId),
    listId: list.id,
    advisorId,
    rank: positiveInt(body.rank),
    note: textValue(body.note, MAX_NOTE_LENGTH),
  };
  await writeRow(userListEntryTable(), row);
  return await decorateList(list);
}

async function updateEntry(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const list = await requireOwnedList(userId, body.listId);
  const advisorId = textValue(body.advisorId, 200);
  if (!advisorId) throwStatus(ADVISOR_ID_REQUIRED, 400);
  const existing = await requireEntry(list.id, advisorId);
  const row: UserListEntryRow = {
    ...existing,
    rank: positiveInt(body.rank),
    note: textValue(body.note, MAX_NOTE_LENGTH),
  };
  await writeRow(userListEntryTable(), row);
  return await decorateList(list);
}

async function deleteEntry(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistMutationResponse> {
  const list = await requireOwnedList(userId, body.listId);
  const advisorId = textValue(body.advisorId, 200);
  if (!advisorId) throwStatus(ADVISOR_ID_REQUIRED, 400);
  const entry = await requireEntry(list.id, advisorId);
  await deleteRow(userListEntryTable(), entry.id);
  return {
    authenticated: true,
    deleted: true,
    entryId: entry.id,
    list: await decorateList(list),
  };
}

async function decorateLists(
  lists: ReadonlyArray<UserListRow>
): Promise<ReadonlyArray<WatchlistResponse>> {
  return await Promise.all(
    [...lists]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(decorateList)
  );
}

async function decorateList(list: UserListRow): Promise<WatchlistResponse> {
  const entries = await listEntries(list.id);
  return {
    id: list.id,
    name: list.name,
    entries: entries
      .map(sanitizeEntry)
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
  };
}

function sanitizeEntry(row: UserListEntryRow): WatchlistEntryResponse {
  return {
    id: row.id,
    listId: row.listId,
    advisorId: row.advisorId,
    rank: row.rank ?? null,
    note: row.note ?? "",
  };
}

async function requireOwnedList(
  userId: string,
  rawListId: unknown
): Promise<UserListRow> {
  const listId = textValue(rawListId, 240);
  if (!listId) throwStatus("watchlist id required", 400);
  const row = await userListTable().get?.(listId);
  if (!row || row.userId !== userId) throwStatus("watchlist not found", 404);
  return row;
}

async function requireEntry(
  listId: string,
  advisorId: string
): Promise<UserListEntryRow> {
  const id = entryId(listId, advisorId);
  const row = await userListEntryTable().get?.(id);
  if (!row || row.listId !== listId || row.advisorId !== advisorId) {
    throwStatus("watchlist entry not found", 404);
  }
  return row;
}

async function userLists(userId: string): Promise<ReadonlyArray<UserListRow>> {
  return await rowsFor(userListTable(), "userId", userId);
}

async function listEntries(
  listId: string
): Promise<ReadonlyArray<UserListEntryRow>> {
  return await rowsFor(userListEntryTable(), "listId", listId);
}

function findBody(args: readonly unknown[]): WatchlistBody {
  return args.find(isBody) ?? {};
}

function isBody(value: unknown): value is WatchlistBody {
  return Boolean(value && typeof value === "object" && "action" in value);
}

/* eslint-enable jsdoc/require-jsdoc -- Resource helpers are covered by focused tests. */

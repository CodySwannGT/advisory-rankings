import type {
  UserWatchlistEntryRow,
  UserWatchlistRow,
} from "../types/harper-schema.js";
import type { RouteTarget } from "../types/harper-resource.js";

import { normalizeId } from "./resource-routing.js";
import { requireSameOrigin } from "./resource-request-origin.js";
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
/** Per-user cap on watchlists; list ids are random, so inserts are unbounded without it. */
const MAX_LISTS_PER_USER = 50;
const ADVISOR_ID_REQUIRED = "advisor id required";

/**
 * Shape of the JSON body accepted by the watchlist POST endpoint. All fields are
 * `unknown` because they originate from untrusted client input and are validated downstream.
 */
interface WatchlistBody {
  readonly action?: unknown;
  readonly listId?: unknown;
  readonly id?: unknown;
  readonly name?: unknown;
  readonly advisorId?: unknown;
  readonly rank?: unknown;
  readonly note?: unknown;
}

/**
 * Public representation of one advisor entry inside a user's watchlist.
 */
interface WatchlistEntryResponse {
  readonly id: string;
  readonly listId: string;
  readonly advisorId: string;
  readonly rank: number | null;
  readonly note: string;
}

/**
 * Public representation of one watchlist with its entries sorted by rank.
 */
interface WatchlistResponse {
  readonly id: string;
  readonly name: string;
  readonly entries: ReadonlyArray<WatchlistEntryResponse>;
}

/**
 * Response payload for create/rename/addEntry/updateEntry actions returning the surviving list.
 */
interface WatchlistSavedResponse {
  readonly authenticated: true;
  readonly list: WatchlistResponse;
}

/**
 * Response payload returned when an entire watchlist has been deleted.
 */
interface WatchlistDeletedResponse {
  readonly authenticated: true;
  readonly deleted: true;
  readonly listId: string;
}

/**
 * Response payload returned when a single entry has been removed from a watchlist.
 */
interface WatchlistEntryDeletedResponse {
  readonly authenticated: true;
  readonly deleted: true;
  readonly entryId: string;
  readonly list: WatchlistResponse;
}

/**
 * Response payload for the GET endpoint, signalling whether the request was authenticated.
 */
interface UserWatchlistsGetResponse {
  readonly authenticated: boolean;
  readonly lists: ReadonlyArray<WatchlistResponse>;
}

/**
 * Discriminated union covering every POST mutation response variant.
 */
type WatchlistMutationResponse =
  | WatchlistSavedResponse
  | WatchlistDeletedResponse
  | WatchlistEntryDeletedResponse;

/**
 * Harper resource exposing the per-user watchlist CRUD surface used by the AdvisorBook web UI.
 */
export class UserWatchlists extends Resource {
  /**
   * Permits read access so unauthenticated clients still receive a stable empty response.
   * @returns Always true.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Permits POST so create/update/delete actions reach the mutation handler before auth checks.
   * @returns Always true.
   */
  allowCreate(): boolean {
    return true;
  }

  /**
   * Returns the caller's watchlists, optionally filtered to a single list when a route id is present.
   * @param target Route target supplied by Harper, used to scope to one list.
   * @returns Authenticated flag plus the (possibly empty) list collection.
   */
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

  /**
   * Dispatches the watchlist mutation indicated by `body.action`, requiring authentication first.
   * @param args Harper invocation args; the request body is located via duck-typing.
   * @returns The response variant matching the executed action.
   */
  async post(...args: readonly unknown[]): Promise<WatchlistMutationResponse> {
    requireSameOrigin(this.getContext?.());
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

/**
 * Creates a new empty watchlist owned by `userId` and returns its public representation.
 * @param userId Authenticated user id.
 * @param body Request body containing the desired list name.
 * @returns The freshly created list with an empty entries array.
 */
async function createList(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const name = textValue(body.name, MAX_NAME_LENGTH);
  if (!name) throwStatus("watchlist name required", 400);
  const existing = await rowsFor(
    userListTable(tables.UserWatchlist),
    "userId",
    userId
  );
  if (existing.length >= MAX_LISTS_PER_USER) {
    throwStatus(`watchlist limit reached (${MAX_LISTS_PER_USER})`, 400);
  }
  const row: UserWatchlistRow = {
    id: newId("list", userId),
    userId,
    name,
  };
  await writeRow(userListTable(tables.UserWatchlist), row);
  return { id: row.id, name: row.name, entries: [] };
}

/**
 * Renames an existing watchlist that `userId` owns and returns its refreshed decorated form.
 * @param userId Authenticated user id used to enforce ownership.
 * @param body Request body containing the list id and new name.
 * @returns The renamed list with its entries.
 */
async function renameList(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const list = await requireOwnedList(userId, body.listId ?? body.id);
  const name = textValue(body.name, MAX_NAME_LENGTH);
  if (!name) throwStatus("watchlist name required", 400);
  await writeRow(userListTable(tables.UserWatchlist), {
    ...list,
    name,
  });
  return await decorateList({ ...list, name });
}

/**
 * Deletes a watchlist and every entry it contains after verifying ownership.
 * @param userId Authenticated user id used to enforce ownership.
 * @param body Request body containing the list id to delete.
 * @returns A deleted-list response carrying the removed list id.
 */
async function deleteList(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistMutationResponse> {
  const list = await requireOwnedList(userId, body.listId ?? body.id);
  const entries = await listEntries(list.id);
  await Promise.all(
    entries.map(entry =>
      deleteRow(userListEntryTable(tables.UserWatchlistEntry), entry.id)
    )
  );
  await deleteRow(userListTable(tables.UserWatchlist), list.id);
  return { authenticated: true, deleted: true, listId: list.id };
}

/**
 * Adds an advisor entry to an owned watchlist, upserting on the composite id so duplicates collapse.
 * @param userId Authenticated user id used to enforce ownership.
 * @param body Request body containing list id, advisor id, optional rank, and note.
 * @returns The list decorated with its updated entry set.
 */
async function addEntry(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const list = await requireOwnedList(userId, body.listId);
  const advisorId = textValue(body.advisorId, 200);
  if (!advisorId) throwStatus(ADVISOR_ID_REQUIRED, 400);
  const row: UserWatchlistEntryRow = {
    id: entryId(list.id, advisorId),
    listId: list.id,
    advisorId,
    rank: positiveInt(body.rank),
    note: textValue(body.note, MAX_NOTE_LENGTH),
  };
  await writeRow(userListEntryTable(tables.UserWatchlistEntry), row);
  return await decorateList(list);
}

/**
 * Updates an existing watchlist entry's rank and note while preserving its identity fields.
 * @param userId Authenticated user id used to enforce ownership.
 * @param body Request body containing list id, advisor id, optional rank, and note.
 * @returns The list decorated with its updated entry set.
 */
async function updateEntry(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistResponse> {
  const list = await requireOwnedList(userId, body.listId);
  const advisorId = textValue(body.advisorId, 200);
  if (!advisorId) throwStatus(ADVISOR_ID_REQUIRED, 400);
  const existing = await requireEntry(list.id, advisorId);
  const row: UserWatchlistEntryRow = {
    ...existing,
    rank: positiveInt(body.rank),
    note: textValue(body.note, MAX_NOTE_LENGTH),
  };
  await writeRow(userListEntryTable(tables.UserWatchlistEntry), row);
  return await decorateList(list);
}

/**
 * Removes one advisor entry from an owned watchlist.
 * @param userId Authenticated user id used to enforce ownership.
 * @param body Request body containing list id and advisor id.
 * @returns An entry-deleted response including the surviving list.
 */
async function deleteEntry(
  userId: string,
  body: WatchlistBody
): Promise<WatchlistMutationResponse> {
  const list = await requireOwnedList(userId, body.listId);
  const advisorId = textValue(body.advisorId, 200);
  if (!advisorId) throwStatus(ADVISOR_ID_REQUIRED, 400);
  const entry = await requireEntry(list.id, advisorId);
  await deleteRow(userListEntryTable(tables.UserWatchlistEntry), entry.id);
  return {
    authenticated: true,
    deleted: true,
    entryId: entry.id,
    list: await decorateList(list),
  };
}

/**
 * Decorates a collection of lists in parallel and returns them sorted alphabetically by name.
 * @param lists Raw list rows for the active user.
 * @returns Public list responses sorted by name.
 */
async function decorateLists(
  lists: ReadonlyArray<UserWatchlistRow>
): Promise<ReadonlyArray<WatchlistResponse>> {
  return await Promise.all(
    [...lists]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(decorateList)
  );
}

/**
 * Loads and sanitizes a list's entries, sorting them by rank for stable client display.
 * @param list The owning list row.
 * @returns The list response with its sorted, sanitized entries.
 */
async function decorateList(
  list: UserWatchlistRow
): Promise<WatchlistResponse> {
  const entries = await listEntries(list.id);
  return {
    id: list.id,
    name: list.name,
    entries: entries
      .map(sanitizeEntry)
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
  };
}

/**
 * Converts a stored entry row into its public response shape, normalizing nullable fields.
 * @param row The persisted entry row.
 * @returns The client-facing entry representation.
 */
function sanitizeEntry(row: UserWatchlistEntryRow): WatchlistEntryResponse {
  return {
    id: row.id,
    listId: row.listId,
    advisorId: row.advisorId,
    rank: row.rank ?? null,
    note: row.note ?? "",
  };
}

/**
 * Fetches a list by id and verifies the active user owns it, throwing 400/404 otherwise.
 * @param userId Authenticated user id required to match the list's owner.
 * @param rawListId Untrusted id from the request body.
 * @returns The owned list row.
 */
async function requireOwnedList(
  userId: string,
  rawListId: unknown
): Promise<UserWatchlistRow> {
  const listId = textValue(rawListId, 240);
  if (!listId) throwStatus("watchlist id required", 400);
  const row = await userListTable(tables.UserWatchlist).get?.(listId);
  if (!row || row.userId !== userId) throwStatus("watchlist not found", 404);
  return row;
}

/**
 * Fetches the entry identified by the (list, advisor) pair, throwing 404 if it is missing or mismatched.
 * @param listId Owning list id.
 * @param advisorId Advisor id within the list.
 * @returns The matching entry row.
 */
async function requireEntry(
  listId: string,
  advisorId: string
): Promise<UserWatchlistEntryRow> {
  const id = entryId(listId, advisorId);
  const row = await userListEntryTable(tables.UserWatchlistEntry).get?.(id);
  if (!row || row.listId !== listId || row.advisorId !== advisorId) {
    throwStatus("watchlist entry not found", 404);
  }
  return row;
}

/**
 * Loads every list row owned by the given user.
 * @param userId Authenticated user id.
 * @returns The user's list rows.
 */
async function userLists(
  userId: string
): Promise<ReadonlyArray<UserWatchlistRow>> {
  return await rowsFor(userListTable(tables.UserWatchlist), "userId", userId);
}

/**
 * Loads every entry row attached to the given list.
 * @param listId Owning list id.
 * @returns The list's entry rows.
 */
async function listEntries(
  listId: string
): Promise<ReadonlyArray<UserWatchlistEntryRow>> {
  return await rowsFor(
    userListEntryTable(tables.UserWatchlistEntry),
    "listId",
    listId
  );
}

/**
 * Locates the WatchlistBody amongst Harper's variadic invocation args, defaulting to an empty body.
 * @param args Harper-supplied invocation args.
 * @returns The detected body or an empty placeholder.
 */
function findBody(args: readonly unknown[]): WatchlistBody {
  return args.find(isBody) ?? {};
}

/**
 * Type guard verifying that `value` looks like a WatchlistBody (an object with an `action` field).
 * @param value Candidate value.
 * @returns True when `value` matches the expected body shape.
 */
function isBody(value: unknown): value is WatchlistBody {
  return Boolean(value && typeof value === "object" && "action" in value);
}

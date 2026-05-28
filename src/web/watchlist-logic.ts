// Pure, DOM-free logic for the signed-in watchlist management UI.
//
// This module is the testable core behind `src/web/watchlists.ts`. It owns:
//   • request-body construction for the `UserWatchlists` POST contract
//     (see src/harper/resource-user-watchlists.ts),
//   • rank reordering (explicit move-up / move-down with contiguous ranks),
//   • the auth-gating decision plus the safe sign-in guidance copy,
//   • narrowing the loose `/UserWatchlists` response into a view model.
//
// Keeping this here means the acceptance-criteria behaviors (persistence
// shape, reorder, anonymous gating) are verified by fast unit tests rather
// than only through the browser smoke pass.

import type { MeEnvelope } from "./app.js";

/** A single saved advisor entry on a watchlist, as the UI consumes it. */
export interface WatchlistEntryView {
  readonly id: string;
  readonly listId: string;
  readonly advisorId: string;
  readonly rank: number | null;
  readonly note: string;
}

/** A watchlist with its sorted entries. */
export interface WatchlistView {
  readonly id: string;
  readonly name: string;
  readonly entries: ReadonlyArray<WatchlistEntryView>;
}

/** Normalized `/UserWatchlists` GET view model. */
export interface WatchlistsView {
  readonly authenticated: boolean;
  readonly lists: ReadonlyArray<WatchlistView>;
}

/** Direction accepted by {@link reorderEntries}. */
export type MoveDirection = "up" | "down";

/** Safe sign-in guidance shown when an anonymous visitor hits an action. */
export interface SignInGuidance {
  readonly message: string;
  readonly label: string;
  readonly href: string;
}

/** POST body shapes accepted by the `UserWatchlists` resource. */
export interface CreateListBody {
  readonly action: "create";
  readonly name: string;
}
/**
 *
 */
export interface RenameListBody {
  readonly action: "rename";
  readonly listId: string;
  readonly name: string;
}
/**
 *
 */
export interface DeleteListBody {
  readonly action: "delete";
  readonly listId: string;
}
/**
 *
 */
export interface AddEntryBody {
  readonly action: "addEntry";
  readonly listId: string;
  readonly advisorId: string;
  readonly rank: number;
  readonly note: string;
}
/**
 *
 */
export interface UpdateEntryBody {
  readonly action: "updateEntry";
  readonly listId: string;
  readonly advisorId: string;
  readonly rank: number;
  readonly note: string;
}
/**
 *
 */
export interface DeleteEntryBody {
  readonly action: "deleteEntry";
  readonly listId: string;
  readonly advisorId: string;
}

/** Union of every POST body accepted by the `UserWatchlists` resource. */
export type WatchlistPostBody =
  | CreateListBody
  | RenameListBody
  | DeleteListBody
  | AddEntryBody
  | UpdateEntryBody
  | DeleteEntryBody;

const SIGN_IN_HREF = "/login.html";

/**
 * Builds a create-watchlist request body.
 * @param name - Raw user-entered list name.
 * @returns Create-list POST body with a trimmed name.
 */
export function createListBody(name: string): CreateListBody {
  return { action: "create", name: name.trim() };
}

/**
 * Builds a rename-watchlist request body.
 * @param listId - Target watchlist id.
 * @param name - Raw user-entered list name.
 * @returns Rename-list POST body with a trimmed name.
 */
export function renameListBody(listId: string, name: string): RenameListBody {
  return { action: "rename", listId, name: name.trim() };
}

/**
 * Builds a delete-watchlist request body.
 * @param listId - Target watchlist id.
 * @returns Delete-list POST body.
 */
export function deleteListBody(listId: string): DeleteListBody {
  return { action: "delete", listId };
}

/**
 * Builds an add-entry request body.
 * @param listId - Target watchlist id.
 * @param advisorId - Advisor to add.
 * @param rank - 1-based rank position.
 * @param note - Raw user-entered note.
 * @returns Add-entry POST body with a trimmed note.
 */
export function addEntryBody(
  listId: string,
  advisorId: string,
  rank: number,
  note: string
): AddEntryBody {
  return { action: "addEntry", listId, advisorId, rank, note: note.trim() };
}

/**
 * Builds an update-entry request body (rank and/or note edits).
 * @param listId - Target watchlist id.
 * @param advisorId - Advisor whose entry changes.
 * @param rank - 1-based rank position.
 * @param note - Raw user-entered note.
 * @returns Update-entry POST body with a trimmed note.
 */
export function updateEntryBody(
  listId: string,
  advisorId: string,
  rank: number,
  note: string
): UpdateEntryBody {
  return { action: "updateEntry", listId, advisorId, rank, note: note.trim() };
}

/**
 * Builds a delete-entry request body.
 * @param listId - Target watchlist id.
 * @param advisorId - Advisor whose entry is removed.
 * @returns Delete-entry POST body.
 */
export function deleteEntryBody(
  listId: string,
  advisorId: string
): DeleteEntryBody {
  return { action: "deleteEntry", listId, advisorId };
}

/**
 * Moves an entry one position up or down and reassigns contiguous 1-based
 * ranks. Out-of-bounds moves and unknown advisors are no-ops.
 * @param entries - Current ordered entries.
 * @param advisorId - Advisor to move.
 * @param direction - Whether to move the entry up or down.
 * @returns A new ordered, re-ranked entry list.
 */
export function reorderEntries(
  entries: ReadonlyArray<WatchlistEntryView>,
  advisorId: string,
  direction: MoveDirection
): ReadonlyArray<WatchlistEntryView> {
  const ordered = [...entries];
  const from = ordered.findIndex(entry => entry.advisorId === advisorId);
  if (from < 0) return reindex(ordered);
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ordered.length) return reindex(ordered);
  const swapped = ordered.map((entry, index) => {
    if (index === from) return ordered[to] as WatchlistEntryView;
    if (index === to) return ordered[from] as WatchlistEntryView;
    return entry;
  });
  return reindex(swapped);
}

/**
 * Reassigns contiguous 1-based ranks to entries in their current order.
 * @param entries - Ordered entries.
 * @returns Entries with sequential ranks.
 */
function reindex(
  entries: ReadonlyArray<WatchlistEntryView>
): ReadonlyArray<WatchlistEntryView> {
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * Computes the 1-based rank for a new entry appended to a list: one past the
 * current entry count. Used by the add-to-watchlist entry points so a freshly
 * added advisor lands at the bottom of the saved rank order.
 * @param entries - Current entries on the target watchlist.
 * @returns The next contiguous 1-based rank.
 */
export function nextRank(entries: ReadonlyArray<WatchlistEntryView>): number {
  return entries.length + 1;
}

/**
 * Decides whether watchlist mutations are allowed for the current session.
 * Only a confirmed authenticated session may mutate; an unavailable or
 * unauthenticated session is gated.
 * @param me - The cached `/Me` envelope, or null before it resolves.
 * @returns Whether mutation is permitted.
 */
export function canMutate(me: MeEnvelope | null): boolean {
  return Boolean(me && me.authenticated === true);
}

/**
 * Returns the safe sign-in path shown to anonymous visitors. The copy never
 * embeds any private list or advisor identifiers.
 * @returns Sign-in guidance message, link label, and href.
 */
export function signInGuidance(): SignInGuidance {
  return {
    message:
      "Sign in to create and manage private watchlists. Public advisor pages stay visible.",
    label: "Sign in",
    href: SIGN_IN_HREF,
  };
}

/** Loose entry shape seen on the wire before normalization. */
interface RawEntry {
  readonly id?: unknown;
  readonly listId?: unknown;
  readonly advisorId?: unknown;
  readonly rank?: unknown;
  readonly note?: unknown;
}

/** Loose list shape seen on the wire before normalization. */
interface RawList {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly entries?: unknown;
}

/**
 * Narrows the loose `/UserWatchlists` GET payload into a sorted view model.
 * Malformed payloads collapse to an empty, unauthenticated view so the page
 * fails closed rather than rendering partial private data.
 * @param payload - Raw resource response.
 * @returns Normalized watchlists view.
 */
export function normalizeWatchlistResponse(payload: unknown): WatchlistsView {
  if (!isRecord(payload) || !Array.isArray(payload.lists)) {
    return { authenticated: false, lists: [] };
  }
  return {
    authenticated: payload.authenticated === true,
    lists: payload.lists
      .filter(isRecord)
      .map(list => normalizeList(list as RawList)),
  };
}

/**
 * Normalizes a single raw list and its entries.
 * @param list - Raw list payload.
 * @returns Normalized watchlist view.
 */
function normalizeList(list: RawList): WatchlistView {
  const entries = Array.isArray(list.entries) ? list.entries : [];
  return {
    id: String(list.id ?? ""),
    name: String(list.name ?? ""),
    entries: entries
      .filter(isRecord)
      .map(entry => normalizeEntry(entry as RawEntry))
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
  };
}

/**
 * Normalizes a single raw entry.
 * @param entry - Raw entry payload.
 * @returns Normalized watchlist entry view.
 */
function normalizeEntry(entry: RawEntry): WatchlistEntryView {
  return {
    id: String(entry.id ?? ""),
    listId: String(entry.listId ?? ""),
    advisorId: String(entry.advisorId ?? ""),
    rank: typeof entry.rank === "number" ? entry.rank : null,
    note: typeof entry.note === "string" ? entry.note : "",
  };
}

/**
 * Type guard for plain record objects.
 * @param value - Unknown value.
 * @returns Whether the value is a non-null object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === "object";
}

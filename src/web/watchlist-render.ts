// DOM rendering and mutation wiring for the signed-in watchlist page.
//
// All non-DOM behavior lives in `watchlist-logic.ts`; this module turns the
// normalized view model into design-system DOM and wires the mutation calls
// back through the typed adapter surface in `watchlist-types.ts`.

import type { MeEnvelope } from "./app.js";
import {
  addEntryBody,
  canMutate,
  createListBody,
  deleteEntryBody,
  reorderEntries,
  signInGuidance,
  updateEntryBody,
  type WatchlistEntryView,
  type WatchlistPostBody,
  type WatchlistView,
} from "./watchlist-logic.js";
import {
  ButtonC,
  clearC,
  EmptyCardC,
  elC,
  postJsonC,
  SectionCardC,
  TextInputC,
} from "./watchlist-types.js";

/** Resource path for all watchlist mutations. */
const WATCHLISTS_PATH = "/UserWatchlists";

/** Render context shared by the page handlers. */
export interface WatchlistRenderContext {
  readonly center: HTMLElement;
  readonly me: MeEnvelope | null;
  readonly reload: () => void;
}

/**
 * Renders the signed-out gate with a safe sign-in path and no private data.
 * @param center - Main content column.
 */
export function renderSignedOut(center: HTMLElement): void {
  const guidance = signInGuidance();
  clearC(center);
  center.appendChild(
    SectionCardC({
      title: "Watchlists",
      body: elC(
        "div",
        { class: "watchlist-signed-out" },
        elC("p", { class: "watchlist-note" }, guidance.message),
        elC(
          "a",
          {
            class: "ab-btn ab-btn--primary watchlist-signin-link",
            href: guidance.href,
          },
          guidance.label
        )
      ),
    })
  );
}

/**
 * Renders an error notice without leaking private data.
 * @param center - Main content column.
 * @param message - Public-facing error message.
 */
export function renderError(center: HTMLElement, message: string): void {
  clearC(center);
  center.appendChild(
    EmptyCardC({ title: "Could not load watchlists", body: message })
  );
}

/**
 * Renders the signed-in watchlist manager: create form plus each list.
 * @param ctx - Render context.
 * @param lists - Normalized watchlists.
 */
export function renderWatchlists(
  ctx: WatchlistRenderContext,
  lists: ReadonlyArray<WatchlistView>
): void {
  clearC(ctx.center);
  ctx.center.appendChild(createListCard(ctx));
  if (lists.length === 0) {
    ctx.center.appendChild(
      EmptyCardC({
        title: "No watchlists yet",
        body: "Create a watchlist above, then add advisors from any profile.",
      })
    );
    return;
  }
  for (const list of lists) ctx.center.appendChild(listCard(ctx, list));
}

/**
 * Builds the create-watchlist form card.
 * @param ctx - Render context.
 * @returns Create-watchlist card.
 */
function createListCard(ctx: WatchlistRenderContext): HTMLElement {
  const name = TextInputC({ name: "name", placeholder: "New watchlist name" });
  const status = elC("span", { class: "watchlist-status" });
  const form = elC(
    "form",
    {
      class: "watchlist-create-form",
      onSubmit: (event: Event) => {
        event.preventDefault();
        void mutate(
          ctx,
          createListBody(name.value),
          status,
          "Watchlist name required"
        );
      },
    },
    name,
    ButtonC({
      variant: "primary",
      type: "submit",
      children: "Create watchlist",
    }),
    status
  );
  return SectionCardC({ title: "Create a watchlist", body: form });
}

/**
 * Builds a single watchlist card with its ranked entries.
 * @param ctx - Render context.
 * @param list - Normalized watchlist.
 * @returns Watchlist card.
 */
function listCard(
  ctx: WatchlistRenderContext,
  list: WatchlistView
): HTMLElement {
  const rows =
    list.entries.length === 0
      ? [
          elC(
            "p",
            { class: "watchlist-note" },
            "No advisors yet. Add one from an advisor profile."
          ),
        ]
      : list.entries.map(entry => entryRow(ctx, list, entry));
  return SectionCardC({
    title: list.name,
    attrs: { class: "watchlist-card", "data-list-id": list.id },
    body: elC("div", { class: "watchlist-entries" }, ...rows),
  });
}

/**
 * Builds one advisor entry row with reorder, note, and remove controls.
 * @param ctx - Render context.
 * @param list - Owning watchlist.
 * @param entry - Entry to render.
 * @returns Entry row element.
 */
function entryRow(
  ctx: WatchlistRenderContext,
  list: WatchlistView,
  entry: WatchlistEntryView
): HTMLElement {
  const note = TextInputC({
    name: "note",
    value: entry.note,
    placeholder: "Add a note",
  });
  const status = elC("span", { class: "watchlist-status" });
  return elC(
    "div",
    { class: "watchlist-firm-row", "data-advisor-id": entry.advisorId },
    elC("span", { class: "watchlist-rank" }, String(entry.rank ?? "")),
    elC(
      "a",
      {
        class: "watchlist-advisor-link",
        href: `/advisor.html?id=${encodeURIComponent(entry.advisorId)}`,
      },
      entry.advisorId
    ),
    note,
    moveButton(ctx, list, entry, "up", "↑", "Move up"),
    moveButton(ctx, list, entry, "down", "↓", "Move down"),
    ButtonC({
      variant: "neutral",
      type: "button",
      children: "Save note",
      attrs: { class: "watchlist-save-note" },
      onClick: () =>
        void mutate(
          ctx,
          updateEntryBody(
            list.id,
            entry.advisorId,
            entry.rank ?? 1,
            note.value
          ),
          status,
          "Could not save note"
        ),
    }),
    ButtonC({
      variant: "danger",
      type: "button",
      children: "Remove",
      attrs: { class: "watchlist-remove-button" },
      onClick: () =>
        void mutate(
          ctx,
          deleteEntryBody(list.id, entry.advisorId),
          status,
          "Could not remove advisor"
        ),
    }),
    status
  );
}

/**
 * Builds a reorder button that persists the new contiguous ranks.
 * @param ctx - Render context.
 * @param list - Owning watchlist.
 * @param entry - Entry being moved.
 * @param direction - Move direction.
 * @param glyph - Button glyph.
 * @param label - Accessible label.
 * @returns Reorder button.
 */
function moveButton(
  ctx: WatchlistRenderContext,
  list: WatchlistView,
  entry: WatchlistEntryView,
  direction: "up" | "down",
  glyph: string,
  label: string
): HTMLButtonElement {
  return ButtonC({
    variant: "neutral",
    type: "button",
    children: glyph,
    attrs: {
      class: `watchlist-move watchlist-move--${direction}`,
      "aria-label": label,
    },
    onClick: () => void persistReorder(ctx, list, entry.advisorId, direction),
  });
}

/**
 * Recomputes ranks for a move and persists every changed entry.
 * @param ctx - Render context.
 * @param list - Owning watchlist.
 * @param advisorId - Advisor being moved.
 * @param direction - Move direction.
 */
async function persistReorder(
  ctx: WatchlistRenderContext,
  list: WatchlistView,
  advisorId: string,
  direction: "up" | "down"
): Promise<void> {
  if (!canMutate(ctx.me)) {
    renderSignedOut(ctx.center);
    return;
  }
  const reordered = reorderEntries(list.entries, advisorId, direction);
  // Detect changes by comparing each entry's new rank to the rank it held
  // before the move (keyed by advisor), not positionally: after re-indexing
  // the rank numbers stay 1..n, so a positional compare never sees a change.
  const changed = reordered.filter(entry => {
    const previous = list.entries.find(
      candidate => candidate.advisorId === entry.advisorId
    );
    return previous?.rank !== entry.rank;
  });
  await Promise.all(
    changed.map(entry =>
      postJsonC(
        WATCHLISTS_PATH,
        updateEntryBody(list.id, entry.advisorId, entry.rank ?? 1, entry.note)
      )
    )
  );
  ctx.reload();
}

/**
 * Adds an advisor to a list (used by both the page and external entry points).
 * @param listId - Target watchlist id.
 * @param advisorId - Advisor to add.
 * @param rank - 1-based rank for the new entry.
 * @returns The resource response.
 */
export function addAdvisorToList(
  listId: string,
  advisorId: string,
  rank: number
): Promise<unknown> {
  return postJsonC(
    "/UserWatchlists",
    addEntryBody(listId, advisorId, rank, "")
  );
}

/**
 * Posts a mutation, gating anonymous attempts and surfacing status text.
 * @param ctx - Render context.
 * @param body - Mutation body.
 * @param status - Status element to update.
 * @param failure - Public-facing failure message.
 */
async function mutate(
  ctx: WatchlistRenderContext,
  body: WatchlistPostBody,
  status: HTMLElement,
  failure: string
): Promise<void> {
  if (!canMutate(ctx.me)) {
    renderSignedOut(ctx.center);
    return;
  }
  status.replaceChildren("Saving…");
  try {
    await postJsonC(WATCHLISTS_PATH, body);
    ctx.reload();
  } catch {
    status.replaceChildren(failure);
  }
}

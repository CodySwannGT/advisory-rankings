import { el, clear, type DomChild } from "./dom.js";
import { entityPath } from "../urls.js";
import { formatInlineLabel } from "./format-label.js";
import { withTimeout } from "./with-timeout.js";

export { formatInlineLabel } from "./format-label.js";

const HIDDEN_ATTR = "hidden";
const EXPANDED_ATTR = "aria-expanded";

/** Entity kinds the global search dropdown can route to. */
type SearchKind = "firm" | "advisor" | "team";

/** One result row returned by the `/Search` backend adapter. */
interface SearchItem {
  readonly kind: SearchKind;
  readonly id: string;
  readonly name: string;
  readonly sub?: string | null;
}

/** Per-kind result counts the backend returns alongside the items list. */
interface SearchCounts {
  readonly total: number;
}

/** Envelope shape produced by the `/Search` adapter. */
interface SearchResponse {
  readonly items?: readonly SearchItem[];
  readonly counts?: SearchCounts | null;
}

/** Caller-supplied function that resolves `/Search` matches for a query. */
export type SearchAdapter = (
  query: string
) => Promise<SearchResponse> | SearchResponse;

/** Stable DOM nodes that the search organism mutates between renders. */
interface SearchView {
  readonly input: HTMLInputElement;
  readonly dropdown: HTMLElement;
  readonly wrap: HTMLElement;
}

/**
 * Field type schema for the search state. Used as a phantom-typed lookup
 * table so the class methods stay strongly typed even though values are
 * stored in a single `Map`. Mirrors the
 * `organisms-pagination.ts::PaginationFields` pattern.
 */
interface SearchFields {
  readonly activeIndex: number;
  readonly lastResults: readonly SearchItem[];
  readonly debounceTimer: ReturnType<typeof setTimeout> | null;
  readonly inflight: number;
}

/**
 * Strongly-typed container for per-instance search state. Backed by a
 * single Map (whose ref is `readonly` so `functional/prefer-readonly-type`
 * is satisfied); every read/write routes through typed methods so the
 * surrounding code stays type-safe without `any`.
 */
class SearchState {
  /**
   * Internal field store. The Map ref is readonly so
   * `functional/prefer-readonly-type` is satisfied; method-scoped
   * mutations of the map are allowed by `functional/immutable-data`'s
   * `ignoreClasses: true` configuration.
   */
  readonly #fields = new Map<
    keyof SearchFields,
    SearchFields[keyof SearchFields]
  >([
    ["activeIndex", -1],
    ["lastResults", []],
    ["debounceTimer", null],
    ["inflight", 0],
  ]);

  /**
   * Reads a typed field from the store.
   * @param key - Field name.
   * @returns Current value, typed by field.
   */
  get<K extends keyof SearchFields>(key: K): SearchFields[K] {
    // Single typed adapter at the Map.get boundary. The Map's value union
    // collapses every field shape; this cast restores the per-key type.
    return this.#fields.get(key) as SearchFields[K];
  }

  /**
   * Writes a typed field to the store.
   * @param key - Field name.
   * @param value - New value, typed by field.
   */
  set<K extends keyof SearchFields>(key: K, value: SearchFields[K]): void {
    this.#fields.set(key, value);
  }

  /**
   * Increments and returns the next request generation. Centralizes the
   * write so callers do not need read-modify-write of `inflight`.
   * @returns The new generation number.
   */
  nextRequestId(): number {
    const next = this.get("inflight") + 1;
    this.set("inflight", next);
    return next;
  }

  /**
   * Checks whether a response still belongs to the latest request.
   * @param requestId - Request generation captured before awaiting.
   * @returns True when the response should update the dropdown.
   */
  isCurrentRequest(requestId: number): boolean {
    return requestId === this.get("inflight");
  }
}

/** Bundle of view + state + adapter passed to every helper. */
interface SearchContext {
  readonly view: SearchView;
  readonly state: SearchState;
  readonly search?: SearchAdapter;
}

/** Options accepted by {@link GlobalSearch}. */
export interface GlobalSearchOptions {
  readonly search?: SearchAdapter;
}

/**
 * Header search box with debounced live suggestions and keyboard navigation.
 * @param root0 - Search adapter injected by the page shell.
 * @param root0.search - Function that resolves `/Search`-style matches.
 * @returns Label-wrapped combobox and dropdown nodes.
 */
export function GlobalSearch({
  search,
}: GlobalSearchOptions = {}): HTMLElement {
  const view = createSearchView();
  const state = new SearchState();
  const context: SearchContext = { view, state, search };

  view.input.addEventListener("input", () => handleSearchInput(context));
  view.input.addEventListener("focus", () => {
    if (state.get("lastResults").length) showDropdown(view);
  });
  view.input.addEventListener("keydown", event =>
    handleSearchKey(event, context)
  );
  document.addEventListener("pointerdown", event => {
    const target = event.target;
    if (target instanceof Node && !view.wrap.contains(target))
      hideDropdown(context);
  });

  return view.wrap;
}

/**
 * Creates the combobox DOM once so only result rows change during typing.
 * @returns Named DOM nodes for the search organism.
 */
function createSearchView(): SearchView {
  const input = el("input", {
    type: "search",
    placeholder: "Search advisors, firms, teams",
    id: "global-search",
    autocomplete: "off",
    role: "combobox",
    "aria-label": "Search advisors, firms, teams",
    "aria-autocomplete": "list",
    [EXPANDED_ATTR]: "false",
    "aria-controls": "global-search-results",
  });
  if (!(input instanceof HTMLInputElement))
    throw new TypeError("Expected HTMLInputElement for global search combobox");
  const dropdown = el("div", {
    class: "gs-dropdown",
    id: "global-search-results",
    role: "listbox",
    [HIDDEN_ATTR]: "",
  });
  return {
    input,
    dropdown,
    wrap: el("label", { class: "search gs-wrap" }, input, dropdown),
  };
}

/**
 * Opens the dropdown and updates combobox accessibility state together.
 * @param view - Search DOM nodes.
 */
function showDropdown(view: SearchView): void {
  view.dropdown.removeAttribute(HIDDEN_ATTR);
  view.input.setAttribute(EXPANDED_ATTR, "true");
}

/**
 * Hides the dropdown and resets keyboard selection.
 * @param context - Shared search view and state.
 */
function hideDropdown(context: SearchContext): void {
  context.view.dropdown.setAttribute(HIDDEN_ATTR, "");
  context.view.input.setAttribute(EXPANDED_ATTR, "false");
  context.state.set("activeIndex", -1);
  context.view.dropdown
    .querySelectorAll(".gs-item-active")
    .forEach(row => row.classList.remove("gs-item-active"));
}

/**
 * Highlights the matching substring without building unsafe HTML.
 * @param name - Search result display name.
 * @param query - Normalized query entered by the visitor.
 * @returns Text and mark nodes suitable for `el(...children)`.
 */
function highlight(name: string, query: string): DomChild {
  if (!query) return name;
  const index = name.toLowerCase().indexOf(query);
  return index < 0
    ? name
    : [
        name.slice(0, index),
        el("mark", {}, name.slice(index, index + query.length)),
        name.slice(index + query.length),
      ];
}

/**
 * Builds the canonical route for a search result item.
 * @param item - Firm, advisor, or team search result.
 * @returns URL path for the result.
 */
function hrefFor(item: SearchItem): string {
  return entityPath(item.kind, item);
}

/**
 * Renders returned matches into the dropdown.
 * @param context - Shared search view and state.
 * @param query - Normalized query that produced these results.
 * @param items - Ranked search result items.
 * @param counts - Per-kind result counts from the backend.
 */
function renderItems(
  context: SearchContext,
  query: string,
  items: readonly SearchItem[],
  counts: SearchCounts | null | undefined
): void {
  const { dropdown } = context.view;
  clear(dropdown);
  context.state.set("lastResults", items);
  context.state.set("activeIndex", -1);
  if (!items.length) {
    dropdown.appendChild(
      el("div", { class: "gs-empty" }, `No matches for "${query}".`)
    );
    return;
  }
  items
    .map((item, index) => resultRow(item, index, query, context))
    .forEach(row => dropdown.appendChild(row));
  if (counts && counts.total > items.length)
    dropdown.appendChild(moreRow(items.length, counts.total));
}

/**
 * Creates one selectable dropdown row.
 * @param item - Search result item.
 * @param index - Result index used for keyboard activation.
 * @param query - Normalized query for highlighting.
 * @param context - Shared search view and state.
 * @returns Anchor row for the dropdown.
 */
function resultRow(
  item: SearchItem,
  index: number,
  query: string,
  context: SearchContext
): HTMLElement {
  const sub = formatInlineLabel(item.sub);
  const row = el(
    "a",
    {
      class: "gs-item",
      role: "option",
      href: hrefFor(item),
      "data-idx": String(index),
    },
    el("span", { class: `gs-kind gs-kind-${item.kind}` }, item.kind),
    el("span", { class: "gs-name" }, ...arrify(highlight(item.name, query))),
    sub ? el("span", { class: "gs-sub" }, sub) : null
  );
  row.addEventListener("mousemove", () => setActive(context, index));
  return row;
}

/**
 * Shows the count hint when the backend found more rows than the dropdown displays.
 * @param visibleCount - Number of rendered rows.
 * @param totalCount - Total matching rows across all kinds.
 * @returns Count hint row.
 */
function moreRow(visibleCount: number, totalCount: number): HTMLElement {
  return el(
    "div",
    { class: "gs-more" },
    `Showing ${visibleCount} of ${totalCount} matches — keep typing to narrow.`
  );
}

/**
 * Renders the transient loading row while a request is in flight.
 * @param view - Search DOM nodes.
 * @param query - Normalized query being requested.
 */
function renderSearching(view: SearchView, query: string): void {
  clear(view.dropdown);
  view.dropdown.appendChild(
    el("div", { class: "gs-empty" }, `Searching for "${query}"…`)
  );
  showDropdown(view);
}

/**
 * Moves the keyboard highlight while keeping the selected row visible.
 * @param context - Shared search view and state.
 * @param index - Desired row index, allowed to wrap.
 */
function setActive(context: SearchContext, index: number): void {
  const rows = context.view.dropdown.querySelectorAll(".gs-item");
  if (!rows.length) {
    context.state.set("activeIndex", -1);
    return;
  }
  const activeIndex = ((index % rows.length) + rows.length) % rows.length;
  context.state.set("activeIndex", activeIndex);
  rows.forEach((row, rowIndex) =>
    row.classList.toggle("gs-item-active", rowIndex === activeIndex)
  );
  rows[activeIndex]?.scrollIntoView({ block: "nearest" });
}

/**
 * Runs a debounced search and drops stale responses from slower requests.
 * @param context - Shared search view, state, and API adapter.
 * @param query - Normalized query entered by the visitor.
 * @returns Resolves after current results or an error row render.
 */
async function runSearch(context: SearchContext, query: string): Promise<void> {
  if (!context.search) return;
  const requestId = context.state.nextRequestId();
  renderSearching(context.view, query);
  try {
    const response = await withTimeout(
      Promise.resolve(context.search(query)),
      8000,
      "Search is taking too long. Try again."
    );
    if (!context.state.isCurrentRequest(requestId)) return;
    renderItems(
      context,
      query,
      response?.items ?? [],
      response?.counts ?? null
    );
    showDropdown(context.view);
  } catch (error) {
    if (context.state.isCurrentRequest(requestId))
      renderSearchError(context.view, error);
  }
}

/**
 * Shows a recoverable search error inside the dropdown.
 * @param view - Search DOM nodes.
 * @param error - Error thrown by the search adapter or timeout.
 */
function renderSearchError(view: SearchView, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown error";
  clear(view.dropdown);
  view.dropdown.appendChild(
    el("div", { class: "gs-empty" }, `Search failed: ${message}`)
  );
  showDropdown(view);
}

/**
 * Debounces typed input before running the backend search.
 * @param context - Shared search view, state, and API adapter.
 */
function handleSearchInput(context: SearchContext): void {
  const query = context.view.input.value.trim().toLowerCase();
  const previousTimer = context.state.get("debounceTimer");
  if (previousTimer) clearTimeout(previousTimer);
  if (query.length < 2) {
    hideDropdown(context);
    clear(context.view.dropdown);
    return;
  }
  context.state.set(
    "debounceTimer",
    setTimeout(() => runSearch(context, query), 180)
  );
}

/**
 * Handles keyboard navigation for the open search dropdown.
 * @param event - Keyboard event from the combobox input.
 * @param context - Shared search view, state, and API adapter.
 */
function handleSearchKey(event: KeyboardEvent, context: SearchContext): void {
  const actions: Readonly<Record<string, () => void>> = {
    ArrowDown: () => moveSelection(event, context, 1),
    ArrowUp: () => moveSelection(event, context, -1),
    Enter: () => followSelection(event, context),
    Escape: () => closeFromKeyboard(context),
  };
  actions[event.key]?.();
}

/**
 * Moves highlighted search result up or down.
 * @param event - Keyboard event that requested movement.
 * @param context - Shared search view and state.
 * @param delta - Direction of movement, positive or negative.
 */
function moveSelection(
  event: KeyboardEvent,
  context: SearchContext,
  delta: number
): void {
  const results = context.state.get("lastResults");
  const activeIndex = context.state.get("activeIndex");
  event.preventDefault();
  if (context.view.dropdown.hasAttribute(HIDDEN_ATTR) && results.length)
    showDropdown(context.view);
  setActive(
    context,
    activeIndex < 0 && delta < 0 ? results.length - 1 : activeIndex + delta
  );
}

/**
 * Navigates to the highlighted result, falling back to the first row.
 * @param event - Keyboard event that requested navigation.
 * @param context - Shared search view and state.
 */
function followSelection(event: KeyboardEvent, context: SearchContext): void {
  const results = context.state.get("lastResults");
  const activeIndex = context.state.get("activeIndex");
  const target = activeIndex >= 0 ? results[activeIndex] : results[0];
  if (!target) return;
  event.preventDefault();
  window.location.href = hrefFor(target);
}

/**
 * Closes the dropdown and removes focus after Escape.
 * @param context - Shared search view and state.
 */
function closeFromKeyboard(context: SearchContext): void {
  hideDropdown(context);
  context.view.input.blur();
}

/**
 * Normalizes one value into an array of DOM children.
 * @param value - Text, node, array, or nullish child value.
 * @returns Array suitable for spreading into `el`.
 */
function arrify(value: DomChild): readonly DomChild[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

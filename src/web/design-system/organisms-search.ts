import { el } from "./dom.js";
import { entityPath } from "../urls.js";
import { withTimeout } from "./async-timeout.js";
import {
  SEARCH_KINDS,
  type SearchKind,
  normalizeSearchKind,
} from "./search-kinds.js";
import {
  HIDDEN_ATTR,
  EXPANDED_ATTR,
  type SearchItem,
  type SearchCounts,
  type SearchView,
  showDropdown,
  hideDropdown,
  setActive,
  renderItems,
  renderSearching,
  renderSearchError,
  syncKindControls,
} from "./organisms-search-dom.js";
import { SearchState } from "./organisms-search-state.js";

export { formatInlineLabel } from "./search-labels.js";

/** Envelope shape produced by the `/Search` adapter. */
interface SearchResponse {
  readonly items?: readonly SearchItem[];
  readonly counts?: SearchCounts | null;
}

/** Caller-supplied function that resolves `/Search` matches for a query. */
export type SearchAdapter = (
  query: string,
  kind: SearchKind
) => Promise<SearchResponse> | SearchResponse;

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
  view.kindButtons.forEach(button => {
    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", () =>
      handleKindChange(context, button.dataset.kind || "all")
    );
  });
  document.addEventListener(
    "pointerdown",
    event => handleDocumentPointerDown(event, context),
    { capture: true }
  );

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
  const kindButtons = SEARCH_KINDS.map(([kind, label]) =>
    el(
      "button",
      {
        type: "button",
        class: `gs-kind-toggle${kind === "all" ? " gs-kind-toggle-active" : ""}`,
        dataset: { kind },
        "aria-pressed": kind === "all" ? "true" : "false",
      },
      label
    )
  );
  const controls = el(
    "div",
    { class: "gs-kind-controls", role: "group", "aria-label": "Search kind" },
    ...kindButtons
  );
  return {
    controls,
    input,
    dropdown,
    kindButtons,
    wrap: el("div", { class: "search gs-wrap" }, input, controls, dropdown),
  };
}

/**
 * Collapses the dropdown, routing the state update through context.
 * @param context - Shared search view and state.
 */
function collapseDropdown(context: SearchContext): void {
  hideDropdown(context.view, idx => context.state.set("activeIndex", idx));
}

/**
 * Collapses search for outside page interaction, including result rows that
 * are visually masking a form control below the dropdown.
 * @param event - Pointer event from the document capture phase.
 * @param context - Shared search view and state.
 */
function handleDocumentPointerDown(
  event: PointerEvent,
  context: SearchContext
): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (!context.view.wrap.contains(target)) {
    collapseDropdown(context);
    return;
  }
  if (!(target instanceof HTMLElement) || !target.closest(".gs-item")) return;
  const underlying = underlyingElementAtPoint(context, event);
  if (!isPageControl(underlying, context.view.wrap)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  collapseDropdown(context);
  underlying.focus();
  underlying.click();
}

/**
 * Hit-tests the page with the dropdown temporarily hidden.
 * @param context - Shared search view and state.
 * @param event - Pointer event carrying viewport coordinates.
 * @returns The element under the pointer without the dropdown surface.
 */
function underlyingElementAtPoint(
  context: SearchContext,
  event: PointerEvent
): HTMLElement | null {
  const element = hitTestWithoutDropdown(context.view.dropdown, event);
  return element instanceof HTMLElement ? element : null;
}

/**
 * Hides the dropdown only for the duration of the viewport hit test.
 * @param dropdown - Search results surface to temporarily remove.
 * @param event - Pointer event carrying viewport coordinates.
 * @returns The element below the dropdown at the pointer coordinates.
 */
function hitTestWithoutDropdown(
  dropdown: HTMLElement,
  event: PointerEvent
): Element | null {
  const wasHidden = dropdown.hasAttribute(HIDDEN_ATTR);
  dropdown.setAttribute(HIDDEN_ATTR, "");
  try {
    return document.elementFromPoint(event.clientX, event.clientY);
  } finally {
    if (!wasHidden) dropdown.removeAttribute(HIDDEN_ATTR);
  }
}

/**
 * Detects underlying page controls that should receive an outside click.
 * @param element - Element found below the search dropdown.
 * @param searchWrap - Search root to exclude internal controls.
 * @returns True when the element is a reachable non-search control.
 */
function isPageControl(
  element: HTMLElement | null,
  searchWrap: HTMLElement
): element is HTMLElement {
  const control = element?.closest("button,input,select,textarea");
  return control instanceof HTMLElement && !searchWrap.contains(control);
}

/**
 * Reads the active search kind from state with a defensive fallback.
 * @param context - Shared search view and state.
 * @returns Active search kind.
 */
function currentKind(context: SearchContext): SearchKind {
  return normalizeSearchKind(context.state.get("kind"));
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
  const kind = currentKind(context);
  renderSearching(context.view, query);
  try {
    const response = await withTimeout(
      Promise.resolve(context.search(query, kind)),
      8000,
      "Search is taking too long. Try again."
    );
    if (!context.state.isCurrentRequest(requestId)) return;
    const items = response?.items ?? [];
    context.state.set("lastResults", items);
    renderItems(
      context.view,
      query,
      items,
      response?.counts ?? null,
      kind,
      idx => context.state.set("activeIndex", idx)
    );
    showDropdown(context.view);
  } catch (error) {
    if (context.state.isCurrentRequest(requestId))
      renderSearchError(context.view, error);
  }
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
    collapseDropdown(context);
    return;
  }
  context.state.set(
    "debounceTimer",
    setTimeout(() => runSearch(context, query), 180)
  );
}

/**
 * Switches search kind mode while preserving the current query and keyboard UX.
 * @param context - Shared search view, state, and API adapter.
 * @param kind - Requested kind filter.
 */
function handleKindChange(context: SearchContext, kind: string): void {
  const nextKind = normalizeSearchKind(kind);
  const query = context.view.input.value.trim().toLowerCase();
  const previousTimer = context.state.get("debounceTimer");
  if (nextKind === currentKind(context)) return;
  context.state.set("kind", nextKind);
  syncKindControls(context.view, nextKind);
  if (query.length < 2) {
    collapseDropdown(context);
    return;
  }
  if (previousTimer) clearTimeout(previousTimer);
  runSearch(context, query);
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
    context.view,
    results,
    activeIndex < 0 && delta < 0 ? results.length - 1 : activeIndex + delta,
    idx => context.state.set("activeIndex", idx)
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
  window.location.href = entityPath(target.kind, target);
}

/**
 * Closes the dropdown and removes focus after Escape.
 * @param context - Shared search view and state.
 */
function closeFromKeyboard(context: SearchContext): void {
  collapseDropdown(context);
  context.view.input.blur();
}

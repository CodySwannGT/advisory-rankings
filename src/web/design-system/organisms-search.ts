// @ts-nocheck
import { el, clear } from "./dom.js";
import { entityPath } from "../urls.js";
import { withTimeout } from "./async-timeout.js";
import {
  SEARCH_KINDS,
  normalizeSearchKind,
  searchCountHint,
} from "./search-kinds.js";
import { formatInlineLabel } from "./search-labels.js";
export { formatInlineLabel } from "./search-labels.js";
const HIDDEN_ATTR = "hidden";
const EXPANDED_ATTR = "aria-expanded";

/**
 * Header search box with debounced live suggestions and keyboard navigation.
 * @param root0 - Search adapter injected by the page shell.
 * @param root0.search - Function that resolves `/Search`-style matches.
 * @returns Label-wrapped combobox and dropdown nodes.
 */
export function GlobalSearch({ search } = {}) {
  const view = createSearchView();
  const state = new Map([
    ["activeIndex", -1],
    ["lastResults", []],
    ["debounceTimer", null],
    ["inflight", 0],
    ["kind", "all"],
  ]);
  const context = { view, state, search };

  view.input.addEventListener("input", () => handleSearchInput(context));
  view.input.addEventListener("focus", () => {
    if (state.get("lastResults").length) showDropdown(view);
  });
  view.input.addEventListener("keydown", event =>
    handleSearchKey(event, context)
  );
  view.kindButtons.forEach(button => {
    button.addEventListener("click", () =>
      handleKindChange(context, button.dataset.kind || "all")
    );
  });
  document.addEventListener("pointerdown", event => {
    if (!view.wrap.contains(event.target)) hideDropdown(context);
  });

  return view.wrap;
}
/**
 * Creates the combobox DOM once so only result rows change during typing.
 * @returns Named DOM nodes for the search organism.
 */
function createSearchView() {
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
 * Opens the dropdown and updates combobox accessibility state together.
 * @param view - Search DOM nodes.
 */
function showDropdown(view) {
  view.dropdown.removeAttribute(HIDDEN_ATTR);
  view.input.setAttribute(EXPANDED_ATTR, "true");
}

/**
 * Hides the dropdown and resets keyboard selection.
 * @param context - Shared search view and state.
 */
function hideDropdown(context) {
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
function highlight(name, query) {
  if (!query) return name;
  const lower = String(name).toLowerCase();
  const index = lower.indexOf(query);
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
function hrefFor(item) {
  return entityPath(item.kind, item);
}

/**
 * Renders returned matches into the dropdown.
 * @param context - Shared search view and state.
 * @param query - Normalized query that produced these results.
 * @param items - Ranked search result items.
 * @param counts - Per-kind result counts from the backend.
 */
function renderItems(context, query, items, counts) {
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
  if (counts)
    dropdown.appendChild(moreRow(items.length, counts, currentKind(context)));
}

/**
 * Creates one selectable dropdown row.
 * @param item - Search result item.
 * @param index - Result index used for keyboard activation.
 * @param query - Normalized query for highlighting.
 * @param context - Shared search view and state.
 * @returns Anchor row for the dropdown.
 */
function resultRow(item, index, query, context) {
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
 * @param counts - Per-kind result counts from the backend.
 * @param kind - Active search kind filter.
 * @returns Count hint row.
 */
function moreRow(visibleCount, counts, kind) {
  const totalCount = counts.total || 0;
  return el(
    "div",
    { class: "gs-more" },
    searchCountHint(visibleCount, totalCount, kind)
  );
}

/**
 * Renders the transient loading row while a request is in flight.
 * @param view - Search DOM nodes.
 * @param query - Normalized query being requested.
 */
function renderSearching(view, query) {
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
function setActive(context, index) {
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
async function runSearch(context, query) {
  if (!context.search) return;
  const requestId = nextRequestId(context.state);
  const kind = currentKind(context);
  renderSearching(context.view, query);
  try {
    const response = await withTimeout(
      context.search(query, kind),
      8000,
      "Search is taking too long. Try again."
    );
    if (!isCurrentRequest(context.state, requestId)) return;
    renderItems(
      context,
      query,
      (response && response.items) || [],
      response && response.counts
    );
    showDropdown(context.view);
  } catch (error) {
    if (isCurrentRequest(context.state, requestId))
      renderSearchError(context.view, error);
  }
}

/**
 * Increments the request generation used to ignore stale responses.
 * @param state - Shared search state map.
 * @returns Current request generation.
 */
function nextRequestId(state) {
  const requestId = state.get("inflight") + 1;
  state.set("inflight", requestId);
  return requestId;
}

/**
 * Checks whether a response still belongs to the latest request.
 * @param state - Shared search state map.
 * @param requestId - Request generation captured before awaiting.
 * @returns True when the response should update the dropdown.
 */
function isCurrentRequest(state, requestId) {
  return requestId === state.get("inflight");
}

/**
 * Shows a recoverable search error inside the dropdown.
 * @param view - Search DOM nodes.
 * @param error - Error thrown by the search adapter or timeout.
 */
function renderSearchError(view, error) {
  clear(view.dropdown);
  view.dropdown.appendChild(
    el(
      "div",
      { class: "gs-empty" },
      `Search failed: ${error && error.message ? error.message : "unknown error"}`
    )
  );
  showDropdown(view);
}

/**
 * Debounces typed input before running the backend search.
 * @param context - Shared search view, state, and API adapter.
 */
function handleSearchInput(context) {
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
 * Switches search kind mode while preserving the current query and keyboard UX.
 * @param context - Shared search view, state, and API adapter.
 * @param kind - Requested kind filter.
 */
function handleKindChange(context, kind) {
  const nextKind = normalizeSearchKind(kind);
  const query = context.view.input.value.trim().toLowerCase();
  const previousTimer = context.state.get("debounceTimer");
  if (nextKind === currentKind(context)) return;
  context.state.set("kind", nextKind);
  syncKindControls(context.view, nextKind);
  if (query.length < 2) {
    hideDropdown(context);
    clear(context.view.dropdown);
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
function handleSearchKey(event, context) {
  const actions = {
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
function moveSelection(event, context, delta) {
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
function followSelection(event, context) {
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
function closeFromKeyboard(context) {
  hideDropdown(context);
  context.view.input.blur();
}

/**
 * Normalizes one value into an array of DOM children.
 * @param value - Text, node, array, or nullish child value.
 * @returns Array suitable for spreading into `el`.
 */
function arrify(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Reads the active search kind from state with a defensive fallback.
 * @param context - Shared search view and state.
 * @returns Active search kind.
 */
function currentKind(context) {
  return normalizeSearchKind(context.state.get("kind"));
}

/**
 * Updates segmented control state for the active search kind.
 * @param view - Search DOM nodes.
 * @param kind - Active search kind.
 */
function syncKindControls(view, kind) {
  view.kindButtons.forEach(button => {
    const active = button.dataset.kind === kind;
    button.classList.toggle("gs-kind-toggle-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

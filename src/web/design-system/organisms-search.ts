// @ts-nocheck
import { el, clear } from "./dom.js";
import { entityPath } from "../urls.js";

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
  ]);
  const context = { view, state, search };

  view.input.addEventListener("input", () => handleSearchInput(context));
  view.input.addEventListener("focus", () => {
    if (state.get("lastResults").length) showDropdown(view);
  });
  view.input.addEventListener("keydown", event =>
    handleSearchKey(event, context)
  );
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
 * @param totalCount - Total matching rows across all kinds.
 * @returns Count hint row.
 */
function moreRow(visibleCount, totalCount) {
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
  renderSearching(context.view, query);
  try {
    const response = await withTimeout(
      context.search(query),
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
 * Converts machine labels into compact human-readable labels for search rows.
 * @param value - Raw value from a search result or article category.
 * @returns Display label, or null for empty placeholder values.
 */
export function formatInlineLabel(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (
    !text ||
    ["unknown", "n/a", "na", "none", "null", "undefined"].includes(
      text.toLowerCase()
    )
  )
    return null;
  return text
    .replace(/_+/g, " ")
    .toLowerCase()
    .split(" ")
    .map(formatWord)
    .join(" ");
}

/**
 * Preserves finance acronyms while title-casing ordinary words.
 * @param word - Lowercase token from a machine label.
 * @returns Display token.
 */
function formatWord(word) {
  return (
    { uhnw: "UHNW", ria: "RIA", bd: "BD", finra: "FINRA", sec: "SEC" }[word] ??
    word.charAt(0).toUpperCase() + word.slice(1)
  );
}

/**
 * Rejects slow UI data requests with caller-provided copy.
 * @param promise - In-flight async operation.
 * @param ms - Timeout in milliseconds.
 * @param message - Error message used when the timeout wins.
 * @returns The original promise value when it resolves in time.
 */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

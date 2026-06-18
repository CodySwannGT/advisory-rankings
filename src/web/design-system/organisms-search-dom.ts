import { el, clear, type DomChild } from "./dom.js";
import { entityPath } from "../urls.js";
import { type SearchKind, searchCountHint } from "./search-kinds.js";
import { formatInlineLabel } from "./search-labels.js";

/** Hidden-attribute string used to show/hide the dropdown. */
export const HIDDEN_ATTR = "hidden";

/** Aria-expanded attribute toggled on the combobox input. */
export const EXPANDED_ATTR = "aria-expanded";

/** Entity kind for individual search result items (excludes the "all" filter). */
export type SearchItemKind = Exclude<SearchKind, "all">;

/** One result row returned by the `/Search` backend adapter. */
export interface SearchItem {
  readonly kind: SearchItemKind;
  readonly id: string;
  readonly name: string;
  readonly sub?: string | null;
}

/** Per-kind result counts the backend returns alongside the items list. */
export interface SearchCounts {
  readonly total: number;
}

/** Stable DOM nodes that the search organism mutates between renders. */
export interface SearchView {
  readonly input: HTMLInputElement;
  readonly dropdown: HTMLElement;
  readonly wrap: HTMLElement;
  readonly controls: HTMLElement;
  readonly kindButtons: readonly HTMLElement[];
}

/**
 * Opens the dropdown and updates combobox accessibility state together.
 * @param view - Search DOM nodes.
 */
export function showDropdown(view: SearchView): void {
  view.dropdown.removeAttribute(HIDDEN_ATTR);
  view.input.setAttribute(EXPANDED_ATTR, "true");
}

/**
 * Hides the dropdown and resets keyboard selection.
 * @param view - Search DOM nodes.
 * @param setActiveIndex - Callback to update the activeIndex in state.
 */
export function hideDropdown(
  view: SearchView,
  setActiveIndex: (idx: number) => void
): void {
  view.dropdown.setAttribute(HIDDEN_ATTR, "");
  view.input.setAttribute(EXPANDED_ATTR, "false");
  setActiveIndex(-1);
  view.dropdown
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
 * Moves the keyboard highlight while keeping the selected row visible.
 * @param view - Search DOM nodes.
 * @param items - Currently displayed search result items.
 * @param index - Desired row index, allowed to wrap.
 * @param setActiveIndex - Callback to update the activeIndex in state.
 */
export function setActive(
  view: SearchView,
  items: readonly SearchItem[],
  index: number,
  setActiveIndex: (idx: number) => void
): void {
  const rows = view.dropdown.querySelectorAll(".gs-item");
  if (!rows.length) {
    setActiveIndex(-1);
    return;
  }
  const activeIndex = ((index % rows.length) + rows.length) % rows.length;
  setActiveIndex(activeIndex);
  rows.forEach((row, rowIndex) =>
    row.classList.toggle("gs-item-active", rowIndex === activeIndex)
  );
  rows[activeIndex]?.scrollIntoView({ block: "nearest" });
}

/**
 * Normalizes one value into an array of DOM children.
 * @param value - Text, node, array, or nullish child value.
 * @returns Array suitable for spreading into `el`.
 */
export function arrify(value: DomChild): readonly DomChild[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Creates one selectable dropdown row.
 * @param item - Search result item.
 * @param index - Result index used for keyboard activation.
 * @param query - Normalized query for highlighting.
 * @param view - Search DOM nodes.
 * @param items - All current result items (for mousemove activation).
 * @param setActiveIndex - Callback to update the activeIndex in state.
 * @returns Anchor row for the dropdown.
 */
export function resultRow(
  item: SearchItem,
  index: number,
  query: string,
  view: SearchView,
  items: readonly SearchItem[],
  setActiveIndex: (idx: number) => void
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
  row.addEventListener("mousemove", () =>
    setActive(view, items, index, setActiveIndex)
  );
  return row;
}

/**
 * Shows the count hint when the backend found more rows than the dropdown displays.
 * @param visibleCount - Number of rendered rows.
 * @param counts - Per-kind result counts from the backend.
 * @param kind - Active search kind filter.
 * @returns Count hint row.
 */
export function moreRow(
  visibleCount: number,
  counts: SearchCounts,
  kind: SearchKind
): HTMLElement {
  const totalCount = counts.total || 0;
  return el(
    "div",
    { class: "gs-more" },
    searchCountHint(visibleCount, totalCount, kind)
  );
}

/**
 * Renders returned matches into the dropdown.
 * @param view - Search DOM nodes.
 * @param query - Normalized query that produced these results.
 * @param items - Ranked search result items.
 * @param counts - Per-kind result counts from the backend.
 * @param kind - Active search kind filter.
 * @param setActiveIndex - Callback to update the activeIndex in state.
 */
export function renderItems(
  view: SearchView,
  query: string,
  items: readonly SearchItem[],
  counts: SearchCounts | null | undefined,
  kind: SearchKind,
  setActiveIndex: (idx: number) => void
): void {
  const { dropdown } = view;
  clear(dropdown);
  appendSearchHeading(dropdown);
  if (!items.length) {
    dropdown.appendChild(
      el("div", { class: "gs-empty" }, `No matches for "${query}".`)
    );
    return;
  }
  items
    .map((item, index) =>
      resultRow(item, index, query, view, items, setActiveIndex)
    )
    .forEach(row => dropdown.appendChild(row));
  if (counts) dropdown.appendChild(moreRow(items.length, counts, kind));
}

/**
 * Renders the transient loading row while a request is in flight.
 * @param view - Search DOM nodes.
 * @param query - Normalized query being requested.
 */
export function renderSearching(view: SearchView, query: string): void {
  clear(view.dropdown);
  appendSearchHeading(view.dropdown);
  view.dropdown.appendChild(
    el("div", { class: "gs-empty" }, `Searching for "${query}"…`)
  );
  showDropdown(view);
}

/**
 * Shows a recoverable search error inside the dropdown.
 * @param view - Search DOM nodes.
 * @param error - Error thrown by the search adapter or timeout.
 */
export function renderSearchError(view: SearchView, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown error";
  clear(view.dropdown);
  appendSearchHeading(view.dropdown);
  view.dropdown.appendChild(
    el("div", { class: "gs-empty" }, `Search failed: ${message}`)
  );
  showDropdown(view);
}

/**
 * Updates segmented control state for the active search kind.
 * @param view - Search DOM nodes.
 * @param kind - Active search kind.
 */
export function syncKindControls(view: SearchView, kind: SearchKind): void {
  view.kindButtons.forEach(button => {
    const active = button.dataset["kind"] === kind;
    button.classList.toggle("gs-kind-toggle-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

/**
 * Labels the navbar result surface so page-local filters below it are not read
 * as part of the same search state.
 * @param dropdown - Search dropdown receiving transient rows.
 */
function appendSearchHeading(dropdown: HTMLElement): void {
  dropdown.appendChild(
    el("div", { class: "gs-heading" }, "Global search results")
  );
}

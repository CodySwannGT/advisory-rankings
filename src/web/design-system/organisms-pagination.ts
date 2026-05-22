// @ts-nocheck
import { el } from "./dom.js";
import { EmptyText, Button } from "./atoms.js";

/**
 * Cursor-paginated list with automatic viewport loading and a button fallback.
 * @param root0 - Pagination callbacks and empty-state copy.
 * @param root0.fetchPage - Function that returns `{ items, nextCursor, total? }`.
 * @param root0.renderRow - Renderer for each returned item.
 * @param root0.empty - Text shown when the first page is empty.
 * @param root0.onTotal - Optional callback for first-page total counts.
 * @returns A single DOM node ready to place inside a section body.
 */
export function Paginated({ fetchPage, renderRow, empty, onTotal } = {}) {
  const view = createPaginationView();
  const state = new Map([
    ["cursor", null],
    ["loading", false],
    ["done", false],
    ["firstPage", true],
  ]);
  const loadNext = () =>
    loadNextPage({ view, state, fetchPage, renderRow, empty, onTotal });

  view.loadMoreBtn.addEventListener("click", loadNext);
  observeSentinel(view.sentinel, loadNext);
  loadNext();
  return view.wrap;
}

/**
 * Creates stable DOM nodes so pagination can update content without rebuilding.
 * @returns Named pagination nodes.
 */
function createPaginationView() {
  const list = el("div", { class: "entity-list" });
  const status = el("div", {
    class: "paginated-status",
    "aria-live": "polite",
  });
  const loadMoreBtn = Button({
    variant: "neutral",
    attrs: { class: "paginated-load-more", type: "button" },
    children: "Load more",
  });
  const sentinel = el("div", {
    class: "paginated-sentinel",
    "aria-hidden": "true",
  });
  return {
    list,
    status,
    loadMoreBtn,
    sentinel,
    wrap: el(
      "div",
      { class: "paginated" },
      list,
      status,
      loadMoreBtn,
      sentinel
    ),
  };
}

/**
 * Loads the next cursor page and updates the shared view state.
 * @param root0 - Runtime dependencies for this page request.
 * @param root0.view - DOM nodes owned by the paginated organism.
 * @param root0.state - Mutable map storing cursor and loading flags.
 * @param root0.fetchPage - Page loader supplied by the caller.
 * @param root0.renderRow - Row renderer supplied by the caller.
 * @param root0.empty - First-page empty-state copy.
 * @param root0.onTotal - Optional callback for first-page total counts.
 * @returns A promise that settles after the page has rendered.
 */
async function loadNextPage({
  view,
  state,
  fetchPage,
  renderRow,
  empty,
  onTotal,
}) {
  if (state.get("loading") || state.get("done")) return;
  state.set("loading", true);
  setLoading(view, state.get("firstPage"));
  try {
    const response = await requestPage(fetchPage, state.get("cursor"));
    const items = (response && response.items) || [];
    if (state.get("firstPage"))
      handleFirstPage({ view, state, items, empty, onTotal, response });
    if (state.get("done")) return;
    items.forEach(item => view.list.appendChild(renderRow(item)));
    finishPage(view, state, response?.nextCursor || null);
  } catch (error) {
    view.status.replaceChildren(
      `Couldn't load more: ${error.message || error}`
    );
  } finally {
    state.set("loading", false);
    if (!state.get("done")) setReady(view);
  }
}

/**
 * Wraps page loading with the same timeout used by live search.
 * @param fetchPage - Caller-provided page loader.
 * @param cursor - Cursor for the next page, or null for the first page.
 * @returns Page response from the caller.
 */
function requestPage(fetchPage, cursor) {
  return withTimeout(
    fetchPage(cursor),
    12000,
    "This section is taking too long to load. Try again."
  );
}

/**
 * Handles first-page total reporting and empty-state rendering.
 * @param root0 - First-page context.
 * @param root0.view - Pagination DOM nodes.
 * @param root0.state - Pagination state map.
 * @param root0.items - Items returned by the first request.
 * @param root0.empty - Empty-state copy supplied by the caller.
 * @param root0.onTotal - Optional total-count callback.
 * @param root0.response - Raw page response from the caller.
 */
function handleFirstPage({ view, state, items, empty, onTotal, response }) {
  state.set("firstPage", false);
  if (typeof onTotal === "function" && typeof response?.total === "number") {
    onTotal(response.total);
  }
  if (!items.length) {
    view.list.replaceWith(
      empty != null ? EmptyText({ children: empty }) : el("div")
    );
    completePagination(view, state);
  }
}

/**
 * Stores the next cursor and removes controls when pagination is complete.
 * @param view - Pagination DOM nodes.
 * @param state - Pagination state map.
 * @param nextCursor - Cursor returned by the backend, or null at the end.
 */
function finishPage(view, state, nextCursor) {
  state.set("cursor", nextCursor);
  nextCursor ? view.status.replaceChildren() : completePagination(view, state);
}

/**
 * Removes load controls once there are no more pages.
 * @param view - Pagination DOM nodes.
 * @param state - Pagination state map.
 */
function completePagination(view, state) {
  state.set("done", true);
  view.sentinel.remove();
  view.loadMoreBtn.remove();
  view.status.replaceChildren();
}

/**
 * Shows loading copy without mutating DOM text properties directly.
 * @param view - Pagination DOM nodes.
 * @param firstPage - Whether this is the initial request.
 */
function setLoading(view, firstPage) {
  view.loadMoreBtn.toggleAttribute("disabled", true);
  view.loadMoreBtn.replaceChildren(firstPage ? "Loading…" : "Loading more…");
  view.status.replaceChildren("Loading…");
}

/**
 * Restores the manual load button after a recoverable request.
 * @param view - Pagination DOM nodes.
 */
function setReady(view) {
  view.loadMoreBtn.toggleAttribute("disabled", false);
  view.loadMoreBtn.replaceChildren("Load more");
}

/**
 * Observes the sentinel when IntersectionObserver is available.
 * @param sentinel - Element placed after the list.
 * @param loadNext - Function that requests the next page.
 */
function observeSentinel(sentinel, loadNext) {
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    entries => {
      entries.filter(entry => entry.isIntersecting).forEach(loadNext);
    },
    { rootMargin: "600px" }
  );
  queueMicrotask(() => observer.observe(sentinel));
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

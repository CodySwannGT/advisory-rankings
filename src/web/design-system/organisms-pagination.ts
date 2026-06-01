import { el } from "./dom.js";
import { EmptyText, Button } from "./atoms.js";

/**
 * Shape returned by {@link PaginatedOptions.fetchPage}. `items` holds the
 * rows the caller wants rendered on this page, `nextCursor` is the cursor
 * used to request the next page (null when paging is complete), and
 * `total` is an optional row count reported for the first page only.
 */
export interface PaginatedPage<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor?: string | null;
  readonly total?: number;
}

/**
 * Options accepted by {@link Paginated}.
 */
export interface PaginatedOptions<TItem> {
  readonly fetchPage: (
    cursor: string | null
  ) => Promise<PaginatedPage<TItem>> | PaginatedPage<TItem>;
  readonly renderRow: (item: TItem) => Node;
  readonly empty?: string | null;
  readonly firstPageLoadingLabel?: string;
  readonly onTotal?: (total: number) => void;
}

/**
 * Mutable DOM nodes owned by a single pagination instance.
 */
interface PaginationView {
  readonly list: HTMLElement;
  readonly status: HTMLElement;
  readonly loadMoreBtn: HTMLElement;
  readonly sentinel: HTMLElement;
  readonly wrap: HTMLElement;
}

/**
 * Mutable pagination state. The fields evolve between page requests so
 * the values are kept in a small class — `functional/immutable-data`
 * permits field mutation inside class methods, which preserves the
 * project's immutability discipline at every other call site while
 * giving each field a strict static type (the previous `@ts-nocheck`
 * version used an untyped `Map<string, unknown>`).
 */
/**
 * Field type schema for the pagination state. Used as a phantom-typed
 * lookup table so the class methods stay strongly typed even though
 * values are stored in a single `Map`.
 */
interface PaginationFields {
  readonly cursor: string | null;
  readonly loading: boolean;
  readonly done: boolean;
  readonly firstPage: boolean;
}

/**
 * Strongly-typed container for the per-instance pagination state. The
 * predecessor `@ts-nocheck` implementation used a `Map<string, unknown>`
 * destructured ad-hoc at each call site; this class keeps the same
 * Map-backed storage (so `functional/immutable-data` / `prefer-readonly`
 * are satisfied) but routes every read and write through typed methods.
 */
class PaginationState {
  /**
   * Internal field store. The Map ref is readonly so
   * `functional/prefer-readonly-type` is satisfied; method-scoped
   * mutations of the map are allowed by `functional/immutable-data`'s
   * `ignoreClasses: true` configuration.
   */
  readonly #fields = new Map<
    keyof PaginationFields,
    PaginationFields[keyof PaginationFields]
  >([
    ["cursor", null],
    ["loading", false],
    ["done", false],
    ["firstPage", true],
  ]);

  /**
   * Reads a typed field from the store.
   * @param key - Field name.
   * @returns Current value, typed by field.
   */
  get<K extends keyof PaginationFields>(key: K): PaginationFields[K] {
    return this.#fields.get(key) as PaginationFields[K];
  }

  /**
   * Writes a typed field to the store.
   * @param key - Field name.
   * @param value - New value, typed by field.
   */
  set<K extends keyof PaginationFields>(
    key: K,
    value: PaginationFields[K]
  ): void {
    this.#fields.set(key, value);
  }
}

/**
 * Cursor-paginated list with automatic viewport loading and a button fallback.
 * @param options - Pagination callbacks and empty-state copy.
 * @param options.fetchPage - Function that returns `{ items, nextCursor, total? }`.
 * @param options.renderRow - Renderer for each returned item.
 * @param options.empty - Text shown when the first page is empty.
 * @param options.firstPageLoadingLabel - Route-specific first-page loading copy.
 * @param options.onTotal - Optional callback for first-page total counts.
 * @returns A single DOM node ready to place inside a section body.
 */
export function Paginated<TItem>(
  options: PaginatedOptions<TItem>
): HTMLElement {
  const { fetchPage, renderRow, empty, firstPageLoadingLabel, onTotal } =
    options;
  const view = createPaginationView();
  const state = new PaginationState();
  const loadNext = (): Promise<void> =>
    loadNextPage({
      view,
      state,
      fetchPage,
      renderRow,
      empty,
      firstPageLoadingLabel,
      onTotal,
    });

  view.loadMoreBtn.addEventListener("click", () => {
    void loadNext();
  });
  observeSentinel(view.sentinel, loadNext);
  void loadNext();
  return view.wrap;
}

/**
 * Creates stable DOM nodes so pagination can update content without rebuilding.
 * @returns Named pagination nodes.
 */
function createPaginationView(): PaginationView {
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
 * Runtime dependencies for {@link loadNextPage}.
 */
interface LoadNextPageArgs<TItem> {
  readonly view: PaginationView;
  readonly state: PaginationState;
  readonly fetchPage: PaginatedOptions<TItem>["fetchPage"];
  readonly renderRow: PaginatedOptions<TItem>["renderRow"];
  readonly empty: PaginatedOptions<TItem>["empty"];
  readonly firstPageLoadingLabel: PaginatedOptions<TItem>["firstPageLoadingLabel"];
  readonly onTotal: PaginatedOptions<TItem>["onTotal"];
}

/**
 * Loads the next cursor page and updates the shared view state.
 * @param args - Runtime dependencies for this page request.
 * @returns A promise that settles after the page has rendered.
 */
async function loadNextPage<TItem>(
  args: LoadNextPageArgs<TItem>
): Promise<void> {
  const {
    view,
    state,
    fetchPage,
    renderRow,
    empty,
    firstPageLoadingLabel,
    onTotal,
  } = args;
  if (state.get("loading") || state.get("done")) return;
  state.set("loading", true);
  setLoading(view, state.get("firstPage"), firstPageLoadingLabel);
  try {
    const response = await requestPage(fetchPage, state.get("cursor"));
    const items = response.items ?? [];
    if (state.get("firstPage"))
      handleFirstPage({ view, state, items, empty, onTotal, response });
    if (state.get("done")) return;
    items.forEach(item => view.list.appendChild(renderRow(item)));
    finishPage(view, state, response.nextCursor ?? null);
  } catch (error) {
    view.status.replaceChildren(`Couldn't load more: ${describeError(error)}`);
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
function requestPage<TItem>(
  fetchPage: PaginatedOptions<TItem>["fetchPage"],
  cursor: string | null
): Promise<PaginatedPage<TItem>> {
  return withTimeout(
    Promise.resolve(fetchPage(cursor)),
    12000,
    "This section is taking too long to load. Try again."
  );
}

/**
 * Arguments for {@link handleFirstPage}.
 */
interface HandleFirstPageArgs<TItem> {
  readonly view: PaginationView;
  readonly state: PaginationState;
  readonly items: readonly TItem[];
  readonly empty: PaginatedOptions<TItem>["empty"];
  readonly onTotal: PaginatedOptions<TItem>["onTotal"];
  readonly response: PaginatedPage<TItem>;
}

/**
 * Handles first-page total reporting and empty-state rendering.
 * @param args - First-page context.
 */
function handleFirstPage<TItem>(args: HandleFirstPageArgs<TItem>): void {
  const { view, state, items, empty, onTotal, response } = args;
  state.set("firstPage", false);
  if (typeof onTotal === "function" && typeof response.total === "number") {
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
 * @param state - Pagination state.
 * @param nextCursor - Cursor returned by the backend, or null at the end.
 */
function finishPage(
  view: PaginationView,
  state: PaginationState,
  nextCursor: string | null
): void {
  state.set("cursor", nextCursor);
  if (nextCursor) {
    view.status.replaceChildren();
  } else {
    completePagination(view, state);
  }
}

/**
 * Removes load controls once there are no more pages.
 * @param view - Pagination DOM nodes.
 * @param state - Pagination state.
 */
function completePagination(
  view: PaginationView,
  state: PaginationState
): void {
  state.set("done", true);
  view.sentinel.remove();
  view.loadMoreBtn.remove();
  view.status.replaceChildren();
}

/**
 * Shows loading copy without mutating DOM text properties directly.
 * @param view - Pagination DOM nodes.
 * @param firstPage - Whether this is the initial request.
 * @param firstPageLoadingLabel - Optional route-specific initial loading copy.
 */
function setLoading(
  view: PaginationView,
  firstPage: boolean,
  firstPageLoadingLabel?: string
): void {
  const loadingLabel =
    firstPage && firstPageLoadingLabel ? firstPageLoadingLabel : "Loading…";
  view.loadMoreBtn.toggleAttribute("disabled", true);
  view.loadMoreBtn.replaceChildren(firstPage ? loadingLabel : "Loading more…");
  view.status.replaceChildren(loadingLabel);
}

/**
 * Restores the manual load button after a recoverable request.
 * @param view - Pagination DOM nodes.
 */
function setReady(view: PaginationView): void {
  view.loadMoreBtn.toggleAttribute("disabled", false);
  view.loadMoreBtn.replaceChildren("Load more");
}

/**
 * Observes the sentinel when IntersectionObserver is available.
 * @param sentinel - Element placed after the list.
 * @param loadNext - Function that requests the next page.
 */
function observeSentinel(
  sentinel: HTMLElement,
  loadNext: () => Promise<void>
): void {
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    entries => {
      entries
        .filter(entry => entry.isIntersecting)
        .forEach(() => {
          void loadNext();
        });
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
function withTimeout<TValue>(
  promise: Promise<TValue>,
  ms: number,
  message: string
): Promise<TValue> {
  return new Promise<TValue>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(
          error instanceof Error ? error : new Error(describeError(error))
        );
      }
    );
  });
}

/**
 * Produces a human-readable description of an unknown caught value so the
 * inline status row never renders `[object Object]`.
 * @param error - Value caught from a rejected promise.
 * @returns Best-effort message string.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error == null) return "Unknown error";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

import { type SearchKind } from "./search-kinds.js";
import { type SearchItem } from "./organisms-search-dom.js";

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
  readonly kind: SearchKind;
}

/**
 * Strongly-typed container for per-instance search state. Backed by a
 * single Map (whose ref is `readonly` so `functional/prefer-readonly-type`
 * is satisfied); every read/write routes through typed methods so the
 * surrounding code stays type-safe without `any`.
 */
export class SearchState {
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
    ["kind", "all"],
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

// Public Recruiting Market Map page.
// Consumes the source-backed /RecruitingMarket resource and renders filters,
// firm momentum, market activity, recent moves, and transparent empty states.

import { refreshMe, logout, search } from "./app.js";
import {
  apiC,
  clearC,
  elC,
  EmptyCardC,
  marketCardC,
  momentumCardC,
  MountThreeColumnPage,
  recentMovesCardC,
  SectionCardC,
  SkeletonCardC,
  sourceCardC,
  summaryCardC,
  topMarketsCardC,
  watchlistCardC,
  type RecruitingMarketResponse,
  type ThreeColumnLayout,
} from "./recruiting-types.js";
import { buildRecruitingResourceQuery } from "./recruiting-query.js";
import { recruitingSummaryStatGrid } from "./recruiting-summary-stats.js";
import { showDelayedRouteLoadingFeedback } from "./route-loading.js";

const DEFAULT_LIMIT = 30;
const FIRM_SUGGESTIONS_ID = "recruiting-firm-suggestions";
const FIRM_INPUT_SELECTOR = 'input[name="firm"]';
const WATCHLIST_ADD_BUTTON_SELECTOR = ".watchlist-add-button";
const WATCHLIST_FIRMS_SELECTOR = "[data-watchlist-firms]";
const WATCHLIST_REMOVE_BUTTON_SELECTOR = ".watchlist-remove-button";
const WATCHLIST_ROW_SELECTOR = ".watchlist-firm-row";

/** Input attribute bag accepted by `labelInput`. */
type InputAttrs = Readonly<Record<string, string | number | boolean>>;

MountThreeColumnPage({
  active: "recruiting",
  refreshMe,
  logout,
  search,
  pageTitle: "Recruiting Market Map",
  build({ center, right }: ThreeColumnLayout): void {
    center.append(SkeletonCardC(), SkeletonCardC());
    loadRecruiting(center, right);
  },
});

/**
 * Loads and renders the recruiting market page for the current query string.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadRecruiting(center: HTMLElement, right: HTMLElement): void {
  const stopLoadingFeedback = showDelayedRouteLoadingFeedback({
    container: center,
    title: "Loading recruiting activity",
    body: "Still fetching market activity and recent moves. Retry if this takes longer than expected.",
    onRetry: () => loadRecruiting(center, right),
  });
  apiC(`/RecruitingMarket${resourceQuery()}`)
    .then((data: unknown) => {
      stopLoadingFeedback();
      clearC(center);
      clearC(right);
      renderRecruiting(data as RecruitingMarketResponse, center, right);
    })
    .catch((error: unknown) => {
      stopLoadingFeedback();
      clearC(center);
      center.appendChild(
        EmptyCardC({
          title: "Could not load recruiting market",
          body: errorMessage(error),
        })
      );
    });
}

/**
 * Extracts a printable message from an unknown error value.
 * @param error - Caught error from the resource fetch.
 * @returns Human-readable error string.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Builds a normalized resource query from supported URL filters.
 * @returns Query string for /RecruitingMarket.
 */
function resourceQuery(): string {
  return buildRecruitingResourceQuery(location.search, DEFAULT_LIMIT);
}

/**
 * Renders the full page from the resource payload.
 * @param data - RecruitingMarket response.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderRecruiting(
  data: RecruitingMarketResponse,
  center: HTMLElement,
  right: HTMLElement
): void {
  center.appendChild(headerCard(data));
  center.appendChild(filterCard(data));
  if (data.watchlist) {
    const watchlist = watchlistCardC(data.watchlist);
    if (watchlist) center.appendChild(watchlist);
  }
  if (data.emptyState) {
    center.appendChild(
      EmptyCardC({
        title: "No matching recruiting moves",
        body: data.emptyState,
      })
    );
  } else {
    center.appendChild(momentumCardC(data.firmMomentum));
    center.appendChild(marketCardC(data.marketActivity));
    center.appendChild(recentMovesCardC(data.recentMoves));
  }
  right.appendChild(summaryCardC(data));
  right.appendChild(topMarketsCardC(data.marketActivity));
  right.appendChild(sourceCardC(data));
}

/**
 * Builds the page header and summary stats.
 * @param data - RecruitingMarket response.
 * @returns Header card.
 */
function headerCard(data: RecruitingMarketResponse): HTMLElement {
  return SectionCardC({
    title: "Recruiting Market Map",
    attrs: { class: "recruiting-header" },
    body: [
      elC(
        "p",
        { class: "recruiting-lede" },
        "Public advisor-team move activity grouped by firm, market, source status, and known AUM."
      ),
      recruitingSummaryStatGrid(data),
    ],
  });
}

/**
 * Renders the GET-driven filters.
 * @param data - RecruitingMarket response.
 * @returns Filter form card.
 */
function filterCard(data: RecruitingMarketResponse): HTMLElement {
  const firmSuggestions = data.firmMomentum
    .map(row => row.firm.short || row.firm.name || "")
    .filter((name): name is string => name.length > 0);
  const form = elC(
    "form",
    {
      class: "recruiting-filters recruiting-watchlist-form",
      method: "get",
      action: "/recruiting",
    },
    watchlistFirmControls(watchlistFirmQueries(data)),
    firmSuggestions.length ? firmDatalist(firmSuggestions) : null,
    labelInput("State", "state", data.filters.state || "", {
      placeholder: "NY",
      maxlength: 2,
    }),
    labelInput("Year", "year", data.filters.year || "", {
      placeholder: "2026",
      inputmode: "numeric",
      pattern: "\\d{4}",
    }),
    directionSelect(data.filters.direction),
    elC("button", { class: "filter-button", type: "submit" }, "Apply")
  );
  wireWatchlistControls(form);
  return SectionCardC({
    title: "Filters",
    body: form,
  });
}

/**
 * Returns firm query values for the editable watchlist rows.
 * @param data - RecruitingMarket response.
 * @returns Selected firm query values.
 */
function watchlistFirmQueries(
  data: RecruitingMarketResponse
): readonly string[] {
  const queries = data.filters.watchlistFirmQueries || [];
  if (queries.length) return queries;
  return data.filters.firmQuery ? [data.filters.firmQuery] : [""];
}

/**
 * Builds editable repeated firm controls.
 * @param queries - Current selected firm query values.
 * @returns Watchlist controls.
 */
function watchlistFirmControls(queries: readonly string[]): HTMLElement {
  return elC(
    "div",
    { class: "watchlist-firms", "data-watchlist-firms": "" },
    ...queries.map((value, index) => firmInputRow(value, index)),
    elC(
      "button",
      {
        "aria-label": "Add firm",
        class: "watchlist-add-button",
        title: "Add firm",
        type: "button",
      },
      "Add firm"
    )
  );
}

/**
 * Creates one repeated firm input row.
 * @param value - Current firm query value.
 * @param index - Zero-based row index.
 * @returns Firm input row.
 */
function firmInputRow(value: string, index: number): HTMLElement {
  return elC(
    "div",
    { class: "watchlist-firm-row" },
    labelInput(
      "Watched firm",
      "firm",
      value,
      {
        "aria-label": `Firm ${index + 1}`,
        autocomplete: "organization",
        list: FIRM_SUGGESTIONS_ID,
        placeholder: "Type a firm name",
      },
      "Choose an exact firm result from the suggestions."
    ),
    elC(
      "button",
      {
        "aria-label": `Remove firm ${index + 1}`,
        class: "watchlist-remove-button",
        title: "Remove firm",
        type: "button",
      },
      "Remove"
    )
  );
}

/**
 * Creates firm suggestions for the repeated firm filter inputs.
 * @param names - Firm names from the current market payload.
 * @returns Datalist shared by every firm input.
 */
function firmDatalist(names: readonly string[]): HTMLElement {
  return elC(
    "datalist",
    { id: FIRM_SUGGESTIONS_ID },
    ...[...new Set(names)].map(name => elC("option", { value: name }))
  );
}

/**
 * Enables add/remove controls for repeated firm inputs.
 * @param form - Recruiting filter form.
 */
function wireWatchlistControls(form: HTMLElement): void {
  form.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const group = form.querySelector<HTMLElement>(WATCHLIST_FIRMS_SELECTOR);
    if (!group) return;
    if (target.closest(WATCHLIST_ADD_BUTTON_SELECTOR)) {
      const addButton = group.querySelector<HTMLElement>(
        WATCHLIST_ADD_BUTTON_SELECTOR
      );
      group.insertBefore(
        firmInputRow("", group.querySelectorAll(FIRM_INPUT_SELECTOR).length),
        addButton
      );
    }
    if (target.closest(WATCHLIST_REMOVE_BUTTON_SELECTOR)) {
      target.closest(WATCHLIST_ROW_SELECTOR)?.remove();
      resetFirmRows(group);
    }
  });
}

/**
 * Rebuilds repeated firm rows so labels stay stable after removal.
 * @param group - Firm control group.
 */
function resetFirmRows(group: HTMLElement): void {
  const inputs = [
    ...group.querySelectorAll<HTMLInputElement>(FIRM_INPUT_SELECTOR),
  ];
  const values = inputs.map(input => input.value);
  const addButton = group.querySelector<HTMLElement>(
    WATCHLIST_ADD_BUTTON_SELECTOR
  );
  const rows = (values.length ? values : [""]).map((value, index) =>
    firmInputRow(value, index)
  );
  group.replaceChildren(...rows, ...(addButton ? [addButton] : []));
}

/**
 * Creates a compact label + input control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param value - Current query value.
 * @param attrs - Additional input attributes.
 * @param help - Optional helper copy rendered below the input.
 * @returns Field wrapper.
 */
function labelInput(
  label: string,
  name: string,
  value: string,
  attrs: InputAttrs = {},
  help?: string
): HTMLElement {
  return elC(
    "label",
    { class: "filter-field" },
    elC("span", {}, label),
    elC("input", { name, value, ...attrs }),
    help ? elC("span", { class: "filter-field-help" }, help) : null
  );
}

/**
 * Creates the direction select control.
 * @param current - Current selected value.
 * @returns Select wrapper.
 */
function directionSelect(current: string): HTMLElement {
  const options: readonly (readonly [string, string])[] = [
    ["net", "Net"],
    ["inbound", "Inbound"],
    ["outbound", "Outbound"],
  ];
  return elC(
    "label",
    { class: "filter-field" },
    elC("span", {}, "Direction"),
    elC(
      "select",
      { name: "direction" },
      ...options.map(([value, label]) =>
        elC("option", { value, selected: value === current }, label)
      )
    )
  );
}

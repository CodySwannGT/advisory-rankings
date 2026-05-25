// @ts-nocheck
// Public Recruiting Market Map page.
// Consumes the source-backed /RecruitingMarket resource and renders filters,
// firm momentum, market activity, recent moves, and transparent empty states.

import {
  api,
  refreshMe,
  logout,
  search,
  fmtMoney,
  getQueryParam,
} from "./app.js";
import {
  mountThreeColumnPage,
  clear,
  el,
  EmptyCard,
  SectionCard,
  SkeletonCard,
} from "./design-system/index.js";
import {
  fmtNumber,
  marketCard,
  momentumCard,
  recentMovesCard,
  sourceCard,
  summaryCard,
  topMarketsCard,
} from "./recruiting-sections.js";

const FILTER_FIELDS = ["firm", "state", "year", "direction"];
const DEFAULT_LIMIT = 30;

mountThreeColumnPage({
  active: "recruiting",
  refreshMe,
  logout,
  search,
  build({ center, right }) {
    center.append(SkeletonCard(), SkeletonCard());
    loadRecruiting(center, right);
  },
});

/**
 * Loads and renders the recruiting market page for the current query string.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadRecruiting(center, right) {
  api(`/RecruitingMarket${resourceQuery()}`)
    .then(data => {
      clear(center);
      clear(right);
      renderRecruiting(data, center, right);
    })
    .catch(error => {
      clear(center);
      center.appendChild(
        EmptyCard({
          title: "Could not load recruiting market",
          body: String(error.message || error),
        })
      );
    });
}

/**
 * Builds a normalized resource query from supported URL filters.
 * @returns Query string for /RecruitingMarket.
 */
function resourceQuery() {
  const params = new URLSearchParams();
  for (const field of FILTER_FIELDS) {
    const value = getQueryParam(field);
    if (value) params.set(field, value);
  }
  params.set("limit", String(DEFAULT_LIMIT));
  return params.size ? `?${params}` : "";
}

/**
 * Renders the full page from the resource payload.
 * @param data - RecruitingMarket response.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderRecruiting(data, center, right) {
  center.appendChild(headerCard(data));
  center.appendChild(filterCard(data));
  if (data.emptyState) {
    center.appendChild(
      EmptyCard({
        title: "No matching recruiting moves",
        body: data.emptyState,
      })
    );
  } else {
    center.appendChild(momentumCard(data.firmMomentum));
    center.appendChild(marketCard(data.marketActivity));
    center.appendChild(recentMovesCard(data.recentMoves));
  }
  right.appendChild(summaryCard(data));
  right.appendChild(topMarketsCard(data.marketActivity));
  right.appendChild(sourceCard(data));
}

/**
 * Builds the page header and summary stats.
 * @param data - RecruitingMarket response.
 * @returns Header card.
 */
function headerCard(data) {
  return SectionCard({
    title: "Recruiting Market Map",
    attrs: { class: "recruiting-header" },
    body: [
      el(
        "p",
        { class: "recruiting-lede" },
        "Public advisor-team move activity grouped by firm, market, source status, and known AUM."
      ),
      statGrid([
        ["Moves", fmtNumber(data.summary.count)],
        ["Known AUM", fmtMoney(data.summary.knownAum)],
        ["Unknown AUM", fmtNumber(data.summary.unknownAumCount)],
        ["Missing T12", fmtNumber(data.summary.missingT12Count)],
      ]),
    ],
  });
}

/**
 * Renders the GET-driven filters.
 * @param data - RecruitingMarket response.
 * @returns Filter form card.
 */
function filterCard(data) {
  return SectionCard({
    title: "Filters",
    body: el(
      "form",
      { class: "recruiting-filters", method: "get", action: "/recruiting" },
      labelInput("Firm", "firm", data.filters.firmQuery || ""),
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
      el("button", { class: "filter-button", type: "submit" }, "Apply")
    ),
  });
}

/**
 * Creates a compact label + input control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param value - Current query value.
 * @param attrs - Additional input attributes.
 * @returns Field wrapper.
 */
function labelInput(label, name, value, attrs = {}) {
  return el(
    "label",
    { class: "filter-field" },
    el("span", {}, label),
    el("input", { name, value, ...attrs })
  );
}

/**
 * Creates the direction select control.
 * @param current - Current selected value.
 * @returns Select wrapper.
 */
function directionSelect(current) {
  const options = [
    ["net", "Net"],
    ["inbound", "Inbound"],
    ["outbound", "Outbound"],
  ];
  return el(
    "label",
    { class: "filter-field" },
    el("span", {}, "Direction"),
    el(
      "select",
      { name: "direction" },
      ...options.map(([value, label]) =>
        el("option", { value, selected: value === current }, label)
      )
    )
  );
}

/**
 * Creates a stable summary stat grid.
 * @param pairs - Label/value pairs.
 * @returns Stat grid node.
 */
function statGrid(pairs) {
  return el(
    "div",
    { class: "recruiting-stat-grid" },
    ...pairs.map(([label, value]) =>
      el(
        "div",
        { class: "recruiting-stat" },
        el("span", { class: "recruiting-stat-label" }, label),
        el("strong", {}, value)
      )
    )
  );
}

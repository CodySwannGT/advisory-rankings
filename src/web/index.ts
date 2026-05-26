// @ts-nocheck
// Home feed page — list of FeedPostCards plus left/right rail rollups.
//
// All UI components come from the design system. Page-level glue:
// fetch /Feed → render the three rails. See docs/design-system.md
// before adding any new visual element here.

import {
  api,
  refreshMe,
  logout,
  search,
  fmts,
  fmtMoney,
  humanize,
  initials,
  entityPath,
  getQueryParam,
} from "./app.js";
import {
  mountThreeColumnPage,
  clear,
  Button,
  SkeletonCard,
  EmptyCard,
  FeedPostCard,
  BrowseCard,
  RollupCard,
  SectionCard,
  EntityList,
  EntityRow,
  Heading,
  el,
  Avatar,
} from "./design-system/index.js";

const FEED_MODE_PARAM = "mode";
const FEED_CATEGORY_PARAM = "category";
const DEFAULT_FEED_MODE = "all";
const FEED_MODES = [
  ["all", "All posts"],
  ["event", "Event-backed"],
  ["moves", "Recruiting moves"],
  ["compliance", "Compliance disclosures"],
];

mountThreeColumnPage({
  active: "home",
  refreshMe,
  logout,
  search,
  build({ left, center, right }) {
    // Skeleton until /Feed resolves.
    center.append(SkeletonCard(), SkeletonCard());

    api("/Feed")
      .then(({ items }) => {
        renderFeed({ left, center, right }, items || []);
      })
      .catch(err => {
        clear(center);
        center.appendChild(
          EmptyCard({
            title: "Could not load feed",
            body: String(err.message || err),
          })
        );
      });
  },
});

/**
 * Renders the feed and re-renders it when browser history restores filter state.
 * @param layout - Page columns used by the feed.
 * @param items - Full feed payload.
 */
function renderFeed(layout, items) {
  const categories = feedCategories(items);
  const renderCurrentState = () => {
    const filters = readFeedFilters(categories);
    const filteredItems = filterFeedItems(items, filters);

    renderCenter(layout.center, filteredItems, {
      categories,
      count: filteredItems.length,
      filters,
      total: items.length,
      onChange: nextFilters => {
        writeFeedFilters(nextFilters);
        renderCurrentState();
      },
    });
    renderLeft(layout.left, filteredItems);
    renderRight(layout.right, filteredItems);
  };

  renderCurrentState();
  window.addEventListener("popstate", renderCurrentState);
}

/**
 * Renders center into the page.
 * @param root - DOM root node.
 * @param items - Items to render.
 * @param state - Current filter state and callbacks.
 */
function renderCenter(root, items, state) {
  clear(root);
  root.appendChild(feedFilterCard(state));
  if (!items.length) {
    const empty = state.filters.active
      ? filterEmptyState(state.filters)
      : {
          title: "No articles yet",
          body: "Once the ingest crawler runs, articles appear here.",
        };
    root.appendChild(
      EmptyCard({
        title: empty.title,
        body: empty.body,
      })
    );
    return;
  }
  for (const item of items) root.appendChild(FeedPostCard(item, fmts));
}

/**
 * Builds the GET-style feed filter controls.
 * @param state - Filter state, category facets, and change callback.
 * @returns Filter card.
 */
function feedFilterCard(state) {
  const modeSelect = selectField("Mode", FEED_MODE_PARAM, state.filters.mode, [
    ...FEED_MODES,
  ]);
  const categorySelect = selectField(
    "Category",
    FEED_CATEGORY_PARAM,
    state.filters.category,
    [
      ["", "All categories"],
      ...state.categories.map(value => [value, categoryLabel(value)]),
    ]
  );
  const form = el(
    "form",
    {
      class: "feed-filters",
      method: "get",
      action: "/",
      onSubmit: event => {
        event.preventDefault();
        state.onChange(readFormFilters(form));
      },
    },
    modeSelect,
    categorySelect,
    el("button", { class: "filter-button", type: "submit" }, "Apply"),
    Button({
      variant: "neutral",
      onClick: () => state.onChange({ mode: DEFAULT_FEED_MODE, category: "" }),
      children: "Clear",
      attrs: {
        class: "feed-filter-clear",
        disabled: state.filters.active ? undefined : true,
      },
    })
  );
  form.addEventListener("change", () => state.onChange(readFormFilters(form)));

  return SectionCard({
    title: "Feed filters",
    attrs: { class: "feed-filter-card" },
    body: [
      form,
      el(
        "div",
        { class: "feed-filter-summary", "aria-live": "polite" },
        feedSummaryText(state)
      ),
    ],
  });
}

/**
 * Creates a compact label + select control.
 * @param label - Visible label.
 * @param name - Query parameter name.
 * @param current - Current selected value.
 * @param options - Value/label option pairs.
 * @returns Field wrapper.
 */
function selectField(label, name, current, options) {
  return el(
    "label",
    { class: "filter-field" },
    el("span", {}, label),
    el(
      "select",
      { name },
      ...options.map(([value, optionLabel]) =>
        el(
          "option",
          { value, selected: String(value) === String(current || "") },
          optionLabel
        )
      )
    )
  );
}

/**
 * Reads filter values from the filter form.
 * @param form - Feed filter form.
 * @returns Normalized feed filter state.
 */
function readFormFilters(form) {
  const data = new FormData(form);
  return normalizeFeedFilters({
    mode: data.get(FEED_MODE_PARAM),
    category: data.get(FEED_CATEGORY_PARAM),
  });
}

/**
 * Reads and validates feed filters from the current URL.
 * @param categories - Available feed categories.
 * @returns Current filter state.
 */
function readFeedFilters(categories) {
  const filters = normalizeFeedFilters({
    mode: getQueryParam(FEED_MODE_PARAM),
    category: getQueryParam(FEED_CATEGORY_PARAM),
  });
  const category =
    filters.category && categories.includes(filters.category)
      ? filters.category
      : "";
  return {
    ...filters,
    category,
    active: filters.mode !== DEFAULT_FEED_MODE || Boolean(category),
  };
}

/**
 * Normalizes arbitrary filter values into supported values.
 * @param filters - Raw URL or form filter values.
 * @returns Normalized filters.
 */
function normalizeFeedFilters(filters) {
  const mode = FEED_MODES.some(([value]) => value === filters.mode)
    ? String(filters.mode)
    : DEFAULT_FEED_MODE;
  return {
    mode,
    category: String(filters.category || "").trim(),
  };
}

/**
 * Writes feed filters into the browser URL without reloading the page.
 * @param filters - Next feed filter state.
 */
function writeFeedFilters(filters) {
  const nextFilters = normalizeFeedFilters(filters);
  const params = new URLSearchParams(location.search);
  if (nextFilters.mode === DEFAULT_FEED_MODE) {
    params.delete(FEED_MODE_PARAM);
  } else {
    params.set(FEED_MODE_PARAM, nextFilters.mode);
  }
  if (nextFilters.category) {
    params.set(FEED_CATEGORY_PARAM, nextFilters.category);
  } else {
    params.delete(FEED_CATEGORY_PARAM);
  }
  const query = params.size ? `?${params}` : "";
  history.pushState(null, "", `${location.pathname}${query}${location.hash}`);
}

/**
 * Applies signal and category filters to feed items.
 * @param items - Full feed payload.
 * @param filters - Active filter state.
 * @returns Filtered feed payload.
 */
function filterFeedItems(items, filters) {
  return items.filter(
    item => modeMatches(item, filters.mode) && categoryMatches(item, filters)
  );
}

/**
 * Checks whether an item matches the active feed signal mode.
 * @param item - Feed item.
 * @param mode - Active signal mode.
 * @returns Whether the item should be shown.
 */
function modeMatches(item, mode) {
  const events = item.eventCards || [];
  if (mode === "event") return events.length > 0;
  if (mode === "moves")
    return events.some(event => event.kind === "transition");
  if (mode === "compliance")
    return events.some(event => event.kind === "disclosure");
  return true;
}

/**
 * Checks whether an item matches the active article category.
 * @param item - Feed item.
 * @param filters - Active filter state.
 * @returns Whether the item should be shown.
 */
function categoryMatches(item, filters) {
  return (
    !filters.category ||
    String(item.article?.category || "") === filters.category
  );
}

/**
 * Extracts sorted article categories for the filter select.
 * @param items - Full feed payload.
 * @returns Unique category values.
 */
function feedCategories(items) {
  return [...new Set(items.map(item => item.article?.category).filter(Boolean))]
    .map(String)
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
}

/**
 * Builds the result-count copy for the current filters.
 * @param state - Current filter state.
 * @returns Human-readable result summary.
 */
function feedSummaryText(state) {
  const modeLabel = modeLabelFor(state.filters.mode).toLowerCase();
  const scope = state.filters.category
    ? `${modeLabel} in ${categoryLabel(state.filters.category)}`
    : modeLabel;
  return `Showing ${state.count ?? "filtered"} of ${state.total} ${scope}.`;
}

/**
 * Builds empty-state copy for a zero-result filter combination.
 * @param filters - Active filter state.
 * @returns Empty-state title and body.
 */
function filterEmptyState(filters) {
  const parts = [
    modeLabelFor(filters.mode).toLowerCase(),
    filters.category ? categoryLabel(filters.category) : "",
  ].filter(Boolean);
  const description = parts.length ? parts.join(" / ") : "these filters";
  return {
    title: "No feed posts match these filters",
    body: `No ${description} posts are available in the current feed. Try another mode or category.`,
  };
}

/**
 * Returns a display label for the feed mode.
 * @param mode - Feed signal mode.
 * @returns Visible label.
 */
function modeLabelFor(mode) {
  return FEED_MODES.find(([value]) => value === mode)?.[1] || "All posts";
}

/**
 * Humanizes feed category values without hiding placeholder-like source values.
 * @param value - Raw article category.
 * @returns Visible category label.
 */
function categoryLabel(value) {
  return (
    humanize(value) ||
    String(value || "uncategorized")
      .replace(/_+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase())
  );
}

/**
 * Renders left into the page.
 * @param root - DOM root node.
 * @param items - Items to render.
 */
function renderLeft(root, items) {
  const browseCard = BrowseCard({
    items: [
      { label: "Home", icon: "🏠", href: "/" },
      { label: "Firms", icon: "🏢", href: "/firms" },
      { label: "Advisors", icon: "👤", href: "/advisors" },
      { label: "Teams", icon: "🤝", href: "/teams" },
      { label: "Compliance", icon: "⚖️", href: "/regulatory.html" },
    ],
  });
  const recentTransitions = items
    .flatMap(i => (i.eventCards || []).filter(c => c.kind === "transition"))
    .slice(0, 4);
  const transitionsCard = RollupCard({
    title: "Recent transitions",
    rows: recentTransitions,
    renderRow: t => ({
      name: transitionSubjectName(t.subject),
      sub: el(
        "div",
        { class: "sub" },
        t.fromFirm?.short || "?",
        " → ",
        t.toFirm?.short || "?",
        t.aumMoved ? ` · ${fmtMoney(t.aumMoved)}` : ""
      ),
    }),
  });

  clear(root);
  root.appendChild(browseCard);
  root.appendChild(transitionsCard);
}

/**
 * Returns a readable label for a transition subject.
 * @param subject - Transition subject from the feed resource.
 * @returns Subject display name, falling back to a generic move label.
 */
function transitionSubjectName(subject) {
  if (!subject) return "Move";
  if (typeof subject === "string") return subject;
  return subject.name || subject.id || "Move";
}

/**
 * Renders right-rail trend and compliance summaries.
 * @param root - DOM root node.
 * @param items - Items to render.
 */
function renderRight(root, items) {
  // Trending firms = firms most often mentioned across the feed.
  const topFirms = trendingFirms(items);
  const firmCard = SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Trending firms",
      }),
      EntityList({
        rows: topFirms.map(({ firm, count }) =>
          EntityRow({
            avatar: Avatar({
              initials: initials(firm.name),
              imageUrl: firm.logoUrl,
              alt: firm.name,
            }),
            name: firm.short || firm.name,
            sub: [humanize(firm.channel), firm.hq].filter(Boolean).join(" · "),
            tail: `${count} mention${count === 1 ? "" : "s"}`,
            href: entityPath("firm", firm),
          })
        ),
      }),
    ],
  });
  // Recent disclosures — flagged in red.
  const recentDisc = items
    .flatMap(i => (i.eventCards || []).filter(c => c.kind === "disclosure"))
    .slice(0, 4);
  const complianceCard = recentDisc.length
    ? SectionCard({
        body: [
          Heading({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: "Recent compliance events",
          }),
          EntityList({
            rows: recentDisc.map(d =>
              EntityRow({
                avatar: "⚠",
                name: d.advisor?.name || "Disclosure",
                sub: [humanize(d.regulator), humanize(d.disclosureType)]
                  .filter(Boolean)
                  .join(" · "),
                href: d.advisor ? entityPath("advisor", d.advisor) : "#",
              })
            ),
          }),
        ],
      })
    : null;

  clear(root);
  root.appendChild(firmCard);
  if (complianceCard) root.appendChild(complianceCard);
}

/**
 * Counts firm mentions across feed items and returns the most frequent firms.
 * @param items - Feed items with firm mention arrays.
 * @returns Top firm/count pairs for the right rail.
 */
function trendingFirms(items) {
  return items
    .flatMap(item => item.firms)
    .reduce((hits, firm) => {
      const existing = hits.find(hit => hit.firm.id === firm.id);
      if (existing) {
        return hits.map(hit =>
          hit.firm.id === firm.id
            ? { firm: hit.firm, count: hit.count + 1 }
            : hit
        );
      }
      return [...hits, { firm, count: 1 }];
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

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
} from "./app.js";
import {
  mountThreeColumnPage,
  clear,
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
import {
  feedCategories,
  feedFilterCard,
  filterEmptyState,
  filterFeedItems,
  readFeedFilters,
  writeFeedFilters,
} from "./feed-filters.js";

mountThreeColumnPage({
  active: "home",
  refreshMe,
  logout,
  search,
  pageTitle: "AdvisorBook feed",
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
 * Renders left into the page.
 * @param root - DOM root node.
 * @param items - Items to render.
 */
function renderLeft(root, items) {
  const browseCard = BrowseCard({
    items: [
      { label: "Home", icon: "🏠", href: "/" },
      { label: "Firms", icon: "🏢", href: "/firms" },
      { label: "Recruiting", icon: "↔", href: "/recruiting" },
      { label: "Rankings", icon: "#", href: "/rankings" },
      { label: "Advisors", icon: "👤", href: "/advisors" },
      { label: "Teams", icon: "🤝", href: "/teams" },
      { label: "Compliance", icon: "⚖️", href: "/regulatory" },
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

// Home feed page — list of FeedPostCards plus left/right rail rollups.
//
// All UI components come from the design system. Page-level glue:
// fetch /Feed → render the three rails. See docs/design-system.md
// before adding any new visual element here.

import type {
  FeedItem,
  FeedEventCard,
  TransitionEventCard,
  DisclosureEventCard,
  TransitionSubject,
} from "../harper/resource-feed-types.js";
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
import { clear, el } from "./design-system/index.js";
import { addToWatchlistControl } from "./add-to-watchlist.js";
import {
  feedCategories,
  feedFilterCard,
  filterEmptyState,
  filterFeedItems,
  readFeedFilters,
  writeFeedFilters,
} from "./feed-filters.js";
import {
  AvatarC,
  AsyncStateNoticeC,
  BrowseCardC,
  ButtonC,
  EmptyCardC,
  EntityListC,
  EntityRowC,
  FeedPostCardC,
  HeadingC,
  MountThreeColumnPage,
  RollupCardC,
  SectionCardC,
  SkeletonCardC,
} from "./index-types.js";
import type {
  FeedFilterValues,
  FeedRenderState,
  ThreeColumnLayout,
  TrendingFirmRow,
} from "./index-types.js";

const FEED_PAGE_SIZE = 20;

/** Feed payload returned by the `/Feed` resource. */
interface FeedPayload {
  readonly items?: readonly FeedItem[];
}

MountThreeColumnPage({
  active: "home",
  refreshMe,
  logout,
  search,
  pageTitle: "AdvisorBook feed",
  build({ left, center, right }: ThreeColumnLayout): void {
    const loadFeed = (): void => {
      clear(left);
      clear(center);
      clear(right);
      center.append(SkeletonCardC(), SkeletonCardC());

      (api as unknown as (path: string) => Promise<FeedPayload>)("/Feed")
        .then((payload: FeedPayload) => {
          renderFeed({ left, center, right }, payload.items ?? []);
        })
        .catch((err: unknown) => {
          console.error("Feed route failed to load", err);
          clear(center);
          center.appendChild(
            AsyncStateNoticeC({
              kind: "error",
              title: "Could not load feed",
              body: "Try again shortly.",
              actionLabel: "Retry",
              onAction: loadFeed,
            })
          );
        });
    };

    loadFeed();
  },
});

/**
 * Renders the feed and re-renders it when browser history restores filter state.
 * @param layout - Page columns used by the feed.
 * @param items - Full feed payload.
 */
function renderFeed(
  layout: ThreeColumnLayout,
  items: readonly FeedItem[]
): void {
  const categories = feedCategories(items);
  const renderCurrentState = (visibleLimit: number = FEED_PAGE_SIZE): void => {
    const filters = readFeedFilters(categories);
    const filteredItems = filterFeedItems(items, filters);
    const visibleItems = filteredItems.slice(0, visibleLimit);

    renderCenter(layout.center, visibleItems, {
      categories,
      count: visibleItems.length,
      filters,
      hasMore: visibleItems.length < filteredItems.length,
      total: filteredItems.length,
      onChange: (nextFilters: FeedFilterValues) => {
        writeFeedFilters(nextFilters);
        renderCurrentState(FEED_PAGE_SIZE);
      },
      onLoadMore: () => {
        renderCurrentState(visibleLimit + FEED_PAGE_SIZE);
      },
    });
    renderLeft(layout.left, visibleItems);
    renderRight(layout.right, visibleItems);
  };

  renderCurrentState();
  window.addEventListener("popstate", () => renderCurrentState());
}

/**
 * Renders center into the page.
 * @param root - DOM root node.
 * @param items - Items to render.
 * @param state - Current filter state and callbacks.
 */
function renderCenter(
  root: HTMLElement,
  items: readonly FeedItem[],
  state: FeedRenderState
): void {
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
      EmptyCardC({
        title: empty.title,
        body: empty.body,
      })
    );
    return;
  }
  for (const item of items) root.appendChild(FeedPostCardC(item, fmts));
  if (state.hasMore) {
    root.appendChild(
      ButtonC({
        variant: "neutral",
        onClick: state.onLoadMore,
        children: "Load more posts",
        attrs: { class: "feed-load-more" },
      })
    );
  }
}

/**
 * Renders left into the page.
 * @param root - DOM root node.
 * @param items - Items to render.
 */
function renderLeft(root: HTMLElement, items: readonly FeedItem[]): void {
  const browseCard = BrowseCardC({
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
    .flatMap(i => i.eventCards.filter(isTransitionCard))
    .slice(0, 4);
  const transitionsCard = RollupCardC({
    title: "Recent transitions",
    rows: recentTransitions,
    renderRow: (t: TransitionEventCard) => ({
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
function transitionSubjectName(subject: TransitionSubject | null): string {
  if (!subject) return "Move";
  return subject.name || subject.id || "Move";
}

/**
 * Renders right-rail trend and compliance summaries.
 * @param root - DOM root node.
 * @param items - Items to render.
 */
function renderRight(root: HTMLElement, items: readonly FeedItem[]): void {
  // Trending firms = firms most often mentioned across the feed.
  const topFirms = trendingFirms(items);
  const firmCard = SectionCardC({
    body: [
      HeadingC({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Trending firms",
      }),
      EntityListC({
        rows: topFirms.map(({ firm, count }) =>
          EntityRowC({
            avatar: AvatarC({
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
    .flatMap(i => i.eventCards.filter(isDisclosureCard))
    .slice(0, 4);
  const complianceCard = recentDisc.length
    ? SectionCardC({
        body: [
          HeadingC({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: "Recent compliance events",
          }),
          EntityListC({
            rows: recentDisc.map(disclosureDiscoveryRow),
          }),
        ],
      })
    : null;

  clear(root);
  root.appendChild(firmCard);
  if (complianceCard) root.appendChild(complianceCard);
}

/**
 * Builds a compliance-event discovery row: the advisor EntityRow plus, when a
 * real advisor is attached, the compact add-to-watchlist control beside it.
 * The control is a sibling of the row's link (not nested inside the anchor) so
 * the row stays a valid navigable link and the button stays independently
 * clickable.
 * @param d - Disclosure event card from the feed.
 * @returns Discovery row element for the right-rail compliance list.
 */
function disclosureDiscoveryRow(d: DisclosureEventCard): HTMLElement {
  const row = EntityRowC({
    avatar: "⚠",
    name: d.advisor?.name || "Disclosure",
    sub: [humanize(d.regulator), humanize(d.disclosureType)]
      .filter(Boolean)
      .join(" · "),
    href: d.advisor ? entityPath("advisor", d.advisor) : "#",
  });
  if (!d.advisor?.id) return row;
  return el(
    "div",
    { class: "discovery-row" },
    row,
    addToWatchlistControl(d.advisor.id)
  );
}

/**
 * Counts firm mentions across feed items and returns the most frequent firms.
 * @param items - Feed items with firm mention arrays.
 * @returns Top firm/count pairs for the right rail.
 */
function trendingFirms(items: readonly FeedItem[]): readonly TrendingFirmRow[] {
  return items
    .flatMap(item => item.firms)
    .reduce<readonly TrendingFirmRow[]>((hits, firm) => {
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
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/**
 * Narrows a feed event card to the transition variant.
 * @param card - Either kind of feed event card.
 * @returns Whether the card is a transition card.
 */
function isTransitionCard(card: FeedEventCard): card is TransitionEventCard {
  return card.kind === "transition";
}

/**
 * Narrows a feed event card to the disclosure variant.
 * @param card - Either kind of feed event card.
 * @returns Whether the card is a disclosure card.
 */
function isDisclosureCard(card: FeedEventCard): card is DisclosureEventCard {
  return card.kind === "disclosure";
}

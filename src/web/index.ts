import type {
  FeedItem,
  TransitionEventCard,
  DisclosureEventCard,
  TransitionSubject,
} from "../harper/resource-feed-types.js";
import {
  api,
  getCurrentUser,
  refreshMe,
  logout,
  search,
  fmtMoney,
  humanize,
  initials,
  entityPath,
} from "./app.js";
import { clear, el } from "./design-system/index.js";
import { addToWatchlistControl } from "./add-to-watchlist.js";
import { runDelayedRouteRequest } from "./route-loading.js";
import {
  feedCategories,
  filterFeedItems,
  readFeedFilters,
  writeFeedFilters,
} from "./feed-filters.js";
import { isDisclosureCard, isTransitionCard } from "./feed-event-guards.js";
import {
  feedApiPath,
  feedCursorFrom,
  fetchNextFeedPage,
  installFeedPopstateReload,
} from "./feed-route-utils.js";
import type { FeedCursor, FeedPayload } from "./feed-route-utils.js";
import { renderCenter } from "./feed-center.js";
import {
  AvatarC,
  AsyncStateNoticeC,
  BrowseCardC,
  EntityListC,
  EntityRowC,
  HeadingC,
  MountThreeColumnPage,
  RollupCardC,
  SectionCardC,
  SkeletonCardC,
} from "./index-types.js";
import { primaryBrowseItems } from "./design-system/index.js";
import type {
  FeedFilterValues,
  ThreeColumnLayout,
  TrendingFirmRow,
} from "./index-types.js";

const FEED_PAGE_SIZE = 20;

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
      runDelayedRouteRequest({
        container: center,
        title: "Loading feed",
        body: "Still fetching AdvisorBook activity. Retry if this takes longer than expected.",
        onRetry: loadFeed,
        request: () =>
          (api as unknown as (path: string) => Promise<FeedPayload>)(
            feedApiPath()
          ),
        onSuccess: (payload: FeedPayload) => {
          renderFeed(
            { left, center, right },
            payload.items ?? [],
            feedCursorFrom(payload),
            loadFeed
          );
        },
        onError: (err: unknown) => {
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
        },
      });
    };

    loadFeed();
  },
});

/**
 * Renders the feed and re-renders it when browser history restores filter
 * state. "Load more" reveals loaded items first, then fetches the next server
 * page via cursor when exhausted (else the feed caps at the first page).
 * @param layout - Page columns used by the feed.
 * @param items - First page of feed items already loaded.
 * @param page - Server pagination cursor for subsequent pages.
 * @param reloadFeed - Reloads the feed resource for the current URL mode.
 */
function renderFeed(
  layout: ThreeColumnLayout,
  items: readonly FeedItem[],
  page: FeedCursor,
  reloadFeed: () => void
): void {
  const renderCurrentState = (
    loadedItems: readonly FeedItem[],
    cursor: FeedCursor,
    visibleLimit: number = FEED_PAGE_SIZE
  ): void => {
    const categories = feedCategories(loadedItems);
    const filters = readFeedFilters(categories);
    const filteredItems = filterFeedItems(loadedItems, filters);
    const visibleItems = filteredItems.slice(0, visibleLimit);
    const moreLoadedToReveal = visibleItems.length < filteredItems.length;

    renderCenter(layout.center, visibleItems, {
      categories,
      count: visibleItems.length,
      filters,
      hasMore: moreLoadedToReveal || cursor.hasMore,
      total: filteredItems.length,
      onChange: (nextFilters: FeedFilterValues) => {
        writeFeedFilters(nextFilters);
        reloadFeed();
      },
      onLoadMore: () => {
        const nextLimit = visibleLimit + FEED_PAGE_SIZE;
        if (moreLoadedToReveal || !cursor.hasMore || !cursor.cursor) {
          renderCurrentState(loadedItems, cursor, nextLimit);
          return;
        }
        fetchNextFeedPage(
          cursor.cursor,
          (more, next) =>
            renderCurrentState([...loadedItems, ...more], next, nextLimit),
          (error: unknown) => {
            // Keep the loaded set and "Load more" control so the user can
            // retry a transient page fetch instead of dead-ending the feed.
            console.error("Feed: load-more page fetch failed", error);
            renderCurrentState(loadedItems, cursor, visibleLimit);
          }
        );
      },
    });
    renderLeft(layout.left, visibleItems);
    renderRight(layout.right, visibleItems);
  };

  renderCurrentState(items, page);
  installFeedPopstateReload(reloadFeed);
}

/**
 * Renders left into the page.
 * @param root - DOM root node.
 * @param items - Items to render.
 */
function renderLeft(root: HTMLElement, items: readonly FeedItem[]): void {
  const browseCard = BrowseCardC({
    items: primaryBrowseItems(getCurrentUser()),
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

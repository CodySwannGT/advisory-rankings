import type {
  DisclosureEventCard,
  FeedEventCard,
  FeedItem,
  TransitionEventCard,
} from "../harper/resource-feed-types.js";

/**
 * Narrows a feed event card to the transition variant.
 * @param card - Either kind of feed event card.
 * @returns Whether the card is a transition card.
 */
export function isTransitionCard(
  card: FeedEventCard
): card is TransitionEventCard {
  return card.kind === "transition";
}

/**
 * Narrows a feed event card to the disclosure variant.
 * @param card - Either kind of feed event card.
 * @returns Whether the card is a disclosure card.
 */
export function isDisclosureCard(
  card: FeedEventCard
): card is DisclosureEventCard {
  return card.kind === "disclosure";
}

/**
 * Finds the most recent disclosure event cards for feed sidebars.
 * @param items - Feed items.
 * @returns Disclosure cards in feed order.
 */
export function recentDisclosures(
  items: readonly FeedItem[]
): readonly DisclosureEventCard[] {
  return items.flatMap(i => i.eventCards.filter(isDisclosureCard)).slice(0, 4);
}

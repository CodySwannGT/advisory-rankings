import type {
  DisclosureEventCard,
  FeedEventCard,
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

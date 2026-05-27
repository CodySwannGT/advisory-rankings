import { advisorChip, firmChip, teamChip } from "./resource-feed-chips.js";
import {
  disclosureSummary,
  transitionSummary,
} from "./resource-feed-events.js";
import type { ArticleRow } from "../types/harper-schema.js";
import type {
  ArticlePayload,
  ArticleStub,
  AdvisorChip,
  DisclosureEventCard,
  FeedDb,
  FeedEventCard,
  FeedItem,
  FirmChip,
  SummarizeArticleDb,
  TeamChip,
  TransitionEventCard,
} from "./resource-feed-types.js";

export { advisorChip, firmChip, teamChip } from "./resource-feed-chips.js";
export { disclosureRow, transitionRow } from "./resource-feed-events.js";
export type {
  AdvisorChip,
  AdvisorChipDb,
  ArticlePayload,
  ArticleStub,
  DisclosureAdvisorRef,
  DisclosureEventCard,
  DisclosureRowDb,
  DisclosureRowPayload,
  FeedDb,
  FeedEventCard,
  FeedItem,
  FirmChip,
  FirmRef,
  SummarizeArticleDb,
  TeamChip,
  TeamChipDb,
  TransitionDealSlice,
  TransitionEventCard,
  TransitionRow,
  TransitionRowDb,
  TransitionSubject,
} from "./resource-feed-types.js";

/**
 * Builds article feed event cards from transition or disclosure mentions.
 * @param article - Article whose event mentions should be expanded.
 * @param db - Preloaded mention tables and entity lookup maps.
 * @returns Transition or disclosure cards in mention order.
 */
export function summarizeArticle(
  article: ArticleRow,
  db: SummarizeArticleDb
): readonly FeedEventCard[] {
  const transitionIds = db.mTE
    .filter(mention => mention.articleId === article.id)
    .map(mention => mention.transitionEventId);
  if (transitionIds.length) {
    return transitionIds
      .map(id => transitionSummary(db.byTransition.get(id), db))
      .filter(isTransitionCard);
  }
  const disclosureIds = db.mDisc
    .filter(mention => mention.articleId === article.id)
    .map(mention => mention.disclosureId);
  if (disclosureIds.length) {
    return disclosureIds
      .map(id => disclosureSummary(db.byDisclosure.get(id), db))
      .filter(isDisclosureCard);
  }
  return [];
}

/**
 * Derives a short feed preview when an article row has no explicit dek.
 * @param article - Article row that may contain dek or body text.
 * @param eventCards - Expanded event cards used as a fallback summary.
 * @returns Short display text for feed cards.
 */
export function deriveDek(
  article: ArticleRow,
  eventCards: readonly FeedEventCard[] | null | undefined
): string {
  if (article.dek) return article.dek;
  if (article.bodyText) return `${dekSnippet(article.bodyText)}…`;
  const card = (eventCards ?? [])[0];
  if (card?.kind === "transition") return transitionDek(card);
  if (card?.kind === "disclosure") {
    return `${card.advisor?.name ?? "Advisor"}: ${card.regulator ?? "regulatory"} ${card.disclosureType ?? "matter"}.`;
  }
  return "";
}

/**
 * Builds the full feed-card payload for a single article.
 * @param article - Article row being rendered into the feed.
 * @param db - Preloaded tables and indexes for mentions and event cards.
 * @returns Feed payload consumed by the public web UI.
 */
export function feedItem(article: ArticleRow, db: FeedDb): FeedItem {
  const eventCards = summarizeArticle(article, db);
  return {
    article: articlePayload(article, eventCards),
    eventCards,
    advisors: entityMentions(db.mAdv, article.id, "advisorId")
      .map(id => advisorChip(db.byAdvisor.get(id), db))
      .filter(isAdvisorChip),
    firms: entityMentions(db.mFirm, article.id, "firmId")
      .map(id => firmChip(db.byFirm.get(id)))
      .filter(isFirmChip),
    teams: entityMentions(db.mTeam, article.id, "teamId")
      .map(id => teamChip(db.byTeam.get(id), db))
      .filter(isTeamChip),
  };
}

/**
 * Converts an article row to the compact profile coverage shape.
 * @param article - Article row linked from a profile page.
 * @returns Minimal article data for coverage lists.
 */
export function articleStub(article: ArticleRow): ArticleStub {
  return {
    id: article.id,
    headline: article.headline,
    publishedDate: article.publishedDate,
    category: article.category,
    url: article.url,
  };
}

/**
 * Shapes article metadata consistently for feed and detail resources.
 * @param article - Source article row.
 * @param eventCards - Event cards used to derive fallback dek text.
 * @returns Serializable article metadata.
 */
function articlePayload(
  article: ArticleRow,
  eventCards: readonly FeedEventCard[]
): ArticlePayload {
  return {
    id: article.id,
    headline: article.headline,
    dek: deriveDek(article, eventCards),
    url: article.url,
    slug: article.slug,
    publishedDate: article.publishedDate,
    modifiedDate: article.modifiedDate,
    authors: article.authors ?? [],
    category: article.category,
  };
}

/**
 * Extracts entity IDs from a specific article mention table.
 * @param mentions - Mention rows for one entity kind.
 * @param articleId - Article id whose mentions should be selected.
 * @param field - Foreign-key field containing the mentioned entity id.
 * @returns Entity IDs in stored mention order.
 */
function entityMentions<M extends ArticleMention, K extends keyof M>(
  mentions: readonly M[],
  articleId: string,
  field: K
): readonly M[K][] {
  return mentions
    .filter(mention => mention.articleId === articleId)
    .map(mention => mention[field]);
}

/** Minimal mention shape `entityMentions` accepts. */
interface ArticleMention {
  readonly articleId: string;
}

/**
 * Truncates body text on a word boundary for feed previews.
 * @param text - Article body text that may be longer than the card allows.
 * @returns Display snippet without cutting the last visible word mid-token.
 */
function dekSnippet(text: string): string {
  const snippet = String(text).slice(0, 240);
  const lastSpace = snippet.lastIndexOf(" ");
  return lastSpace > 180 ? snippet.slice(0, lastSpace) : snippet;
}

/**
 * Produces fallback move-summary copy when no article summary exists.
 * @param card - Transition event card already enriched with firms and AUM.
 * @returns Human-readable one-line transition summary.
 */
function transitionDek(card: TransitionEventCard): string {
  const aum = card.aumMoved
    ? ` ($${(card.aumMoved / 1e9).toFixed(2)}B AUM)`
    : "";
  return `${transitionSubjectLabel(card.subject)} moves from ${card.fromFirm?.short ?? "?"} to ${card.toFirm?.short ?? "?"}${aum}.`;
}

/**
 * Converts enriched transition subjects into the human-readable dek label.
 * @param subject - Transition subject payload, legacy string, or missing value.
 * @returns Display label for fallback article summary text.
 */
function transitionSubjectLabel(
  subject: TransitionEventCard["subject"] | string | null | undefined
): string {
  if (!subject) return "Team";
  if (typeof subject === "string") return subject;
  return subject.name || subject.kind || subject.id || "Team";
}

/**
 * Type predicate that retains non-null transition event cards after a filter.
 * @param card - Candidate card or null result from `transitionSummary`.
 * @returns True when the card was populated.
 */
function isTransitionCard(
  card: TransitionEventCard | null
): card is TransitionEventCard {
  return card !== null;
}

/**
 * Type predicate that retains non-null disclosure event cards after a filter.
 * @param card - Candidate card or null result from `disclosureSummary`.
 * @returns True when the card was populated.
 */
function isDisclosureCard(
  card: DisclosureEventCard | null
): card is DisclosureEventCard {
  return card !== null;
}

/**
 * Type predicate that retains non-null advisor chips after a filter.
 * @param chip - Candidate chip or null result from `advisorChip`.
 * @returns True when the chip was populated.
 */
function isAdvisorChip(chip: AdvisorChip | null): chip is AdvisorChip {
  return chip !== null;
}

/**
 * Type predicate that retains non-null firm chips after a filter.
 * @param chip - Candidate chip or null result from `firmChip`.
 * @returns True when the chip was populated.
 */
function isFirmChip(chip: FirmChip | null): chip is FirmChip {
  return chip !== null;
}

/**
 * Type predicate that retains non-null team chips after a filter.
 * @param chip - Candidate chip or null result from `teamChip`.
 * @returns True when the chip was populated.
 */
function isTeamChip(chip: TeamChip | null): chip is TeamChip {
  return chip !== null;
}
